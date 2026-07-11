using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using FFTransDalamud.Bridge;
using FFTransDalamud.Core.Protocol;
using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Core.Tests;

public sealed class BridgeClientIntegrationTests
{
    private static readonly UTF8Encoding Utf8NoBom = new(false, true);

    [Fact]
    public async Task Client_WaitsQuietlyUntilDiscoveryFileExists()
    {
        var tempDirectory = CreateTempDirectory();
        var descriptorPath = Path.Combine(tempDirectory, "missing", "dalamud-bridge.json");
        var warnings = new List<string>();
        using var client = new BridgeClient(
            warnings.Add,
            "0.1.0-test",
            () => TimeSpan.FromSeconds(1),
            descriptorPath);

        try
        {
            client.Start();
            await WaitUntilAsync(
                () =>
                    client.Status.State == BridgeConnectionState.WaitingForConfiguration &&
                    client.Status.Detail.Contains("等待 Tataru", StringComparison.Ordinal),
                "discovery-file wait state");

            Assert.False(client.IsConnected);
            Assert.Empty(warnings);
        }
        finally
        {
            client.Dispose();
            Directory.Delete(tempDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task Client_AuthenticatesAndRoundTripsUnicodeOverNamedPipe()
    {
        var tempDirectory = CreateTempDirectory();
        var pipeName = $"fftrans-csharp-{Guid.NewGuid():N}";
        var descriptorPath = Path.Combine(tempDirectory, "dalamud-bridge.json");
        var token = new string('a', 64);
        await WriteDescriptorAsync(descriptorPath, pipeName, token);

        await using var server = CreateServer(pipeName);
        var serverTask = RunSuccessfulServerAsync(server, token);
        var warnings = new List<string>();
        using var client = new BridgeClient(
            warnings.Add,
            "0.1.0-test",
            () => TimeSpan.FromSeconds(1),
            descriptorPath);

        try
        {
            client.Start();
            await WaitUntilAsync(() => client.IsConnected, "client authentication");

            const string original = "The rains have ceased. 世界";
            var hash = SourceHash.Compute(original);
            var request = new TranslateMessage
            {
                RequestId = "csharp-roundtrip-1",
                SourceHash = hash,
                Text = original,
                Speaker = "G'raha Tia",
                Surface = "Talk",
                SentAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };

            Assert.True(client.TryQueue(request));
            TranslationMessage? response = null;
            await WaitUntilAsync(
                () => client.TryDequeue(out response),
                "translation response");

            Assert.NotNull(response);
            Assert.True(response.Success);
            Assert.Equal(request.RequestId, response.RequestId);
            Assert.Equal(hash, response.SourceHash);
            Assert.Equal("雨已经停了。世界", response.Translation);
            Assert.Equal("MockEngine", response.Engine);
            Assert.Empty(warnings);
        }
        finally
        {
            client.Dispose();
            await serverTask.WaitAsync(
                TimeSpan.FromSeconds(3),
                TestContext.Current.CancellationToken);
            Directory.Delete(tempDirectory, recursive: true);
        }
    }

    [Fact]
    public async Task Client_DoesNotBecomeConnectedBeforeHelloOk()
    {
        var tempDirectory = CreateTempDirectory();
        var pipeName = $"fftrans-csharp-reject-{Guid.NewGuid():N}";
        var descriptorPath = Path.Combine(tempDirectory, "dalamud-bridge.json");
        var token = new string('b', 64);
        await WriteDescriptorAsync(descriptorPath, pipeName, token);

        await using var server = CreateServer(pipeName);
        var serverTask = RunRejectedServerAsync(server);
        var warnings = new List<string>();
        using var client = new BridgeClient(
            warnings.Add,
            "0.1.0-test",
            () => TimeSpan.FromSeconds(1),
            descriptorPath);

        try
        {
            client.Start();
            await WaitUntilAsync(
                () => client.Status.State == BridgeConnectionState.Reconnecting,
                "authentication rejection");

            Assert.False(client.IsConnected);
            Assert.Contains(warnings, warning => warning.Contains("AUTH_FAILED", StringComparison.Ordinal));
        }
        finally
        {
            client.Dispose();
            await serverTask.WaitAsync(
                TimeSpan.FromSeconds(3),
                TestContext.Current.CancellationToken);
            Directory.Delete(tempDirectory, recursive: true);
        }
    }

    private static NamedPipeServerStream CreateServer(string pipeName) => new(
        pipeName,
        PipeDirection.InOut,
        maxNumberOfServerInstances: 1,
        PipeTransmissionMode.Byte,
        PipeOptions.Asynchronous);

    private static async Task RunSuccessfulServerAsync(NamedPipeServerStream server, string expectedToken)
    {
        await server.WaitForConnectionAsync();
        using var reader = new StreamReader(server, Utf8NoBom, false, 4096, leaveOpen: true);
        using var writer = new StreamWriter(server, Utf8NoBom, 4096, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        };

        var helloLine = await reader.ReadLineAsync();
        Assert.NotNull(helloLine);
        using (var hello = JsonDocument.Parse(helloLine))
        {
            Assert.Equal("hello", hello.RootElement.GetProperty("type").GetString());
            Assert.Equal(expectedToken, hello.RootElement.GetProperty("authToken").GetString());
        }

        await writer.WriteLineAsync("{\"type\":\"hello.ok\",\"protocolVersion\":1}");

        var requestLine = await reader.ReadLineAsync();
        Assert.NotNull(requestLine);
        using var request = JsonDocument.Parse(requestLine);
        var requestId = request.RootElement.GetProperty("requestId").GetString();
        var sourceHash = request.RootElement.GetProperty("sourceHash").GetString();
        Assert.Equal("Talk", request.RootElement.GetProperty("surface").GetString());
        Assert.Equal("The rains have ceased. 世界", request.RootElement.GetProperty("text").GetString());

        await writer.WriteLineAsync(JsonSerializer.Serialize(new
        {
            type = "translation",
            success = true,
            requestId,
            sourceHash,
            translation = "雨已经停了。世界",
            engine = "MockEngine",
            latencyMs = 12,
        }));

        await reader.ReadLineAsync();
    }

    private static async Task RunRejectedServerAsync(NamedPipeServerStream server)
    {
        await server.WaitForConnectionAsync();
        using var reader = new StreamReader(server, Utf8NoBom, false, 4096, leaveOpen: true);
        using var writer = new StreamWriter(server, Utf8NoBom, 4096, leaveOpen: true)
        {
            AutoFlush = true,
            NewLine = "\n",
        };

        Assert.NotNull(await reader.ReadLineAsync());
        await writer.WriteLineAsync(
            "{\"type\":\"error\",\"errorCode\":\"AUTH_FAILED\",\"errorMessage\":\"Authentication failed.\"}");
    }

    private static async Task WriteDescriptorAsync(string path, string pipeName, string token)
    {
        var json = JsonSerializer.Serialize(new
        {
            protocolVersion = 1,
            transport = "named-pipe",
            pipeName,
            authToken = token,
        });
        await File.WriteAllTextAsync(path, json, Utf8NoBom);
    }

    private static string CreateTempDirectory()
    {
        var path = Path.Combine(Path.GetTempPath(), $"fftrans-dalamud-csharp-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private static async Task WaitUntilAsync(Func<bool> condition, string description)
    {
        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (DateTime.UtcNow < deadline)
        {
            if (condition())
                return;

            await Task.Delay(20);
        }

        throw new TimeoutException($"Timed out waiting for {description}.");
    }
}
