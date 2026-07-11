using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Text;
using System.Threading.Channels;
using FFTransDalamud.Core.Protocol;

namespace FFTransDalamud.Bridge;

internal enum BridgeConnectionState
{
    Stopped,
    WaitingForConfiguration,
    Connecting,
    Connected,
    Reconnecting,
}

internal readonly record struct BridgeStatus(
    BridgeConnectionState State,
    string Detail,
    DateTimeOffset ChangedAt);

internal sealed class BridgeClient : IDisposable
{
    private const int ConnectTimeoutMilliseconds = 2_000;
    private const int HandshakeTimeoutMilliseconds = 3_000;
    private const int MaximumMessageCharacters = 64 * 1024;

    private static readonly UTF8Encoding Utf8NoBom = new(false, true);

    private readonly Action<string> logWarning;
    private readonly string clientVersion;
    private readonly Func<TimeSpan> retryDelayProvider;
    private readonly string discoveryConfigPath;
    private readonly Channel<TranslateMessage> outgoing;
    private readonly ConcurrentQueue<TranslationMessage> incoming = new();
    private readonly CancellationTokenSource shutdown = new();
    private readonly SemaphoreSlim retrySignal = new(0, 1);
    private readonly object stateGate = new();
    private readonly object pipeGate = new();

    private BridgeStatus status = new(
        BridgeConnectionState.Stopped,
        "尚未启动",
        DateTimeOffset.UtcNow);
    private NamedPipeClientStream? activePipe;
    private Task? runTask;
    private int started;
    private int connected;
    private int disposed;
    private string? lastLoggedFailure;

    public BridgeClient(
        Action<string> logWarning,
        string clientVersion,
        Func<TimeSpan> retryDelayProvider,
        string? discoveryConfigPath = null)
    {
        this.logWarning = logWarning;
        this.clientVersion = clientVersion;
        this.retryDelayProvider = retryDelayProvider;
        this.discoveryConfigPath = discoveryConfigPath ?? DefaultDiscoveryConfigPath;
        outgoing = Channel.CreateBounded<TranslateMessage>(new BoundedChannelOptions(16)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
            AllowSynchronousContinuations = false,
        });
    }

    public static string DefaultDiscoveryConfigPath => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
        "Tataru Assistant",
        "config",
        "dalamud-bridge.json");

    public string DiscoveryConfigPath => discoveryConfigPath;

    public bool IsConnected => Volatile.Read(ref connected) != 0;

    public BridgeStatus Status
    {
        get
        {
            lock (stateGate)
                return status;
        }
    }

    public void Start()
    {
        ObjectDisposedException.ThrowIf(Volatile.Read(ref disposed) != 0, this);

        if (Interlocked.Exchange(ref started, 1) != 0)
            return;

        runTask = Task.Run(() => RunAsync(shutdown.Token));
    }

    public bool TryQueue(TranslateMessage message)
    {
        ArgumentNullException.ThrowIfNull(message);

        return IsConnected && outgoing.Writer.TryWrite(message);
    }

    public bool TryDequeue(out TranslationMessage? message) => incoming.TryDequeue(out message);

    public void RequestReconnect()
    {
        if (Volatile.Read(ref disposed) != 0)
            return;

        NamedPipeClientStream? pipe;
        lock (pipeGate)
            pipe = activePipe;

        try
        {
            pipe?.Dispose();
        }
        catch (ObjectDisposedException)
        {
            // A concurrent disconnect already disposed it.
        }

        SignalRetry();
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0)
            return;

        outgoing.Writer.TryComplete();
        shutdown.Cancel();
        SignalRetry();

        lock (pipeGate)
        {
            try
            {
                activePipe?.Dispose();
            }
            catch (ObjectDisposedException)
            {
                // Already disconnected.
            }

            activePipe = null;
        }

        try
        {
            runTask?.Wait(TimeSpan.FromMilliseconds(750));
        }
        catch (AggregateException exception) when (
            exception.InnerExceptions.All(inner => inner is OperationCanceledException))
        {
            // Expected during shutdown.
        }

        Volatile.Write(ref connected, 0);
        SetStatus(BridgeConnectionState.Stopped, "已停止");
    }

    private async Task RunAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            BridgeConnectionState retryState;
            string retryDetail;

            try
            {
                await ConnectAndRunAsync(cancellationToken).ConfigureAwait(false);
                retryState = BridgeConnectionState.Reconnecting;
                retryDetail = "连接已关闭";
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception) when (
                exception is FileNotFoundException or DirectoryNotFoundException)
            {
                retryState = BridgeConnectionState.WaitingForConfiguration;
                retryDetail = "等待 Tataru Assistant 创建桥接配置";
            }
            catch (Exception exception)
            {
                retryState = BridgeConnectionState.Reconnecting;
                retryDetail = FriendlyFailure(exception);
                LogFailureOnce(exception);
            }
            finally
            {
                Volatile.Write(ref connected, 0);
                DisposeActivePipe();
                DiscardQueuedRequests();
            }

            if (cancellationToken.IsCancellationRequested)
                break;

            SetStatus(retryState, retryDetail);
            await WaitForRetryAsync(cancellationToken).ConfigureAwait(false);
        }

        Volatile.Write(ref connected, 0);
        SetStatus(BridgeConnectionState.Stopped, "已停止");
    }

    private async Task ConnectAndRunAsync(CancellationToken cancellationToken)
    {
        SetStatus(BridgeConnectionState.WaitingForConfiguration, "读取桥接配置");
        var config = await ReadDiscoveryConfigAsync(discoveryConfigPath, cancellationToken).ConfigureAwait(false);
        var validationError = config.GetValidationError();
        if (validationError is not null)
            throw new InvalidDataException(validationError);

        var pipeName = NormalizePipeName(config.PipeName);
        SetStatus(BridgeConnectionState.Connecting, "连接本地命名管道");

        var pipe = new NamedPipeClientStream(
            ".",
            pipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous | PipeOptions.WriteThrough);
        SetActivePipe(pipe);

        await pipe.ConnectAsync(ConnectTimeoutMilliseconds, cancellationToken).ConfigureAwait(false);

        using var reader = new StreamReader(
            pipe,
            Utf8NoBom,
            detectEncodingFromByteOrderMarks: false,
            bufferSize: 4096,
            leaveOpen: true);
        using var writer = new StreamWriter(
            pipe,
            Utf8NoBom,
            bufferSize: 4096,
            leaveOpen: true)
        {
            NewLine = "\n",
        };

        var hello = new HelloMessage
        {
            ProtocolVersion = config.ProtocolVersion,
            AuthToken = config.AuthToken,
            ClientVersion = clientVersion,
        };
        await WriteJsonLineAsync(writer, ProtocolJson.Serialize(hello), cancellationToken).ConfigureAwait(false);

        using (var handshakeCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken))
        {
            handshakeCancellation.CancelAfter(HandshakeTimeoutMilliseconds);
            var handshakeLine = await reader.ReadLineAsync(handshakeCancellation.Token).ConfigureAwait(false);
            if (handshakeLine is null)
                throw new EndOfStreamException("The FFTrans bridge closed before authentication completed.");
            if (handshakeLine.Length > MaximumMessageCharacters)
                throw new InvalidDataException("The FFTrans bridge sent an oversized handshake response.");

            if (ProtocolJson.TryDeserializeError(handshakeLine, out var protocolError) && protocolError is not null)
            {
                throw new InvalidDataException(
                    $"Bridge authentication failed ({protocolError.ErrorCode}): {protocolError.ErrorMessage}");
            }

            if (!ProtocolJson.TryDeserializeHelloOk(handshakeLine, out var helloOk) || helloOk is null)
                throw new InvalidDataException("The FFTrans bridge returned an invalid authentication response.");
            if (helloOk.ProtocolVersion != config.ProtocolVersion)
                throw new InvalidDataException("The FFTrans bridge protocol version changed during authentication.");
        }

        lastLoggedFailure = null;
        Volatile.Write(ref connected, 1);
        SetStatus(BridgeConnectionState.Connected, "已连接");

        using var connectionCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var readTask = ReadLoopAsync(reader, connectionCancellation.Token);
        var writeTask = WriteLoopAsync(writer, connectionCancellation.Token);
        var completed = await Task.WhenAny(readTask, writeTask).ConfigureAwait(false);

        Exception? failure = null;
        try
        {
            await completed.ConfigureAwait(false);
        }
        catch (Exception exception)
        {
            failure = exception;
        }
        finally
        {
            connectionCancellation.Cancel();
            await ObserveCancellationAsync(readTask).ConfigureAwait(false);
            await ObserveCancellationAsync(writeTask).ConfigureAwait(false);
        }

        if (failure is OperationCanceledException && cancellationToken.IsCancellationRequested)
            throw new OperationCanceledException(cancellationToken);

        throw new IOException("The FFTrans bridge connection ended.", failure);
    }

    private async Task ReadLoopAsync(StreamReader reader, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            if (line is null)
                throw new EndOfStreamException("The FFTrans bridge closed the pipe.");

            if (line.Length > MaximumMessageCharacters)
                throw new InvalidDataException("The FFTrans bridge sent an oversized message.");

            if (ProtocolJson.TryDeserializeTranslation(line, out var response) && response is not null)
                incoming.Enqueue(response);
        }
    }

    private async Task WriteLoopAsync(StreamWriter writer, CancellationToken cancellationToken)
    {
        await foreach (var request in outgoing.Reader.ReadAllAsync(cancellationToken).ConfigureAwait(false))
        {
            await WriteJsonLineAsync(writer, ProtocolJson.Serialize(request), cancellationToken).ConfigureAwait(false);
        }
    }

    private static async Task WriteJsonLineAsync(
        StreamWriter writer,
        string json,
        CancellationToken cancellationToken)
    {
        await writer.WriteLineAsync(json.AsMemory(), cancellationToken).ConfigureAwait(false);
        await writer.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    private static async Task<BridgeDiscoveryConfig> ReadDiscoveryConfigAsync(
        string path,
        CancellationToken cancellationToken)
    {
        await using var stream = new FileStream(
            path,
            FileMode.Open,
            FileAccess.Read,
            FileShare.ReadWrite | FileShare.Delete,
            bufferSize: 4096,
            FileOptions.Asynchronous | FileOptions.SequentialScan);
        using var reader = new StreamReader(
            stream,
            Utf8NoBom,
            detectEncodingFromByteOrderMarks: true,
            bufferSize: 4096,
            leaveOpen: false);
        var json = await reader.ReadToEndAsync(cancellationToken).ConfigureAwait(false);
        return ProtocolJson.DeserializeDiscoveryConfig(json);
    }

    private async Task WaitForRetryAsync(CancellationToken cancellationToken)
    {
        var delay = retryDelayProvider();
        if (delay < TimeSpan.FromSeconds(1))
            delay = TimeSpan.FromSeconds(1);
        if (delay > TimeSpan.FromSeconds(30))
            delay = TimeSpan.FromSeconds(30);

        await retrySignal.WaitAsync(delay, cancellationToken).ConfigureAwait(false);
    }

    private static string NormalizePipeName(string configuredName)
    {
        const string windowsPrefix = @"\\.\pipe\";
        var trimmed = configuredName.Trim();
        return trimmed.StartsWith(windowsPrefix, StringComparison.OrdinalIgnoreCase)
            ? trimmed[windowsPrefix.Length..]
            : trimmed;
    }

    private static async Task ObserveCancellationAsync(Task task)
    {
        try
        {
            await task.ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // The sibling read/write loop ended first.
        }
        catch
        {
            // The first failure is reported by ConnectAndRunAsync.
        }
    }

    private static string FriendlyFailure(Exception exception) => exception switch
    {
        InvalidDataException => $"桥接配置或消息无效：{exception.Message}",
        System.Text.Json.JsonException => "桥接配置不是有效 JSON",
        TimeoutException => "连接超时",
        IOException => "连接不可用，等待重试",
        _ => $"连接失败：{exception.GetType().Name}",
    };

    private void LogFailureOnce(Exception exception)
    {
        var signature = $"{exception.GetType().FullName}:{exception.Message}";
        if (string.Equals(lastLoggedFailure, signature, StringComparison.Ordinal))
            return;

        lastLoggedFailure = signature;
        logWarning($"FFTrans bridge unavailable: {exception.GetType().Name}: {exception.Message}");
    }

    private void SetStatus(BridgeConnectionState state, string detail)
    {
        lock (stateGate)
            status = new BridgeStatus(state, detail, DateTimeOffset.UtcNow);
    }

    private void SetActivePipe(NamedPipeClientStream pipe)
    {
        lock (pipeGate)
        {
            activePipe?.Dispose();
            activePipe = pipe;
        }
    }

    private void DisposeActivePipe()
    {
        lock (pipeGate)
        {
            try
            {
                activePipe?.Dispose();
            }
            catch (ObjectDisposedException)
            {
                // A manual reconnect already disposed it.
            }

            activePipe = null;
        }
    }

    private void DiscardQueuedRequests()
    {
        while (outgoing.Reader.TryRead(out _))
        {
        }
    }

    private void SignalRetry()
    {
        if (retrySignal.CurrentCount != 0)
            return;

        try
        {
            retrySignal.Release();
        }
        catch (SemaphoreFullException)
        {
            // Another caller already requested a retry.
        }
    }
}
