using System.Text.Json;
using FFTransDalamud.Bridge;
using FFTransDalamud.Core.Protocol;
using FFTransDalamud.Core.Translation;

if (args.Length < 2)
{
    Console.Error.WriteLine("Usage: FFTransDalamud.BridgeProbe <descriptor-path> <text> [speaker]");
    return 2;
}

var descriptorPath = Path.GetFullPath(args[0]);
var text = args[1];
var speaker = args.Length >= 3 ? args[2] : "Bridge Probe";
var warnings = new List<string>();

using var client = new BridgeClient(
    warnings.Add,
    "bridge-probe-1",
    () => TimeSpan.FromSeconds(1),
    descriptorPath);
client.Start();

var connectDeadline = DateTime.UtcNow.AddSeconds(8);
while (!client.IsConnected && DateTime.UtcNow < connectDeadline)
    await Task.Delay(20);

if (!client.IsConnected)
{
    Console.Error.WriteLine(JsonSerializer.Serialize(new
    {
        success = false,
        stage = "connect",
        status = client.Status.State.ToString(),
        detail = client.Status.Detail,
        warnings,
    }));
    return 3;
}

var hash = SourceHash.Compute(text);
var requestId = $"probe-{Guid.NewGuid():N}";
var request = new TranslateMessage
{
    RequestId = requestId,
    SourceHash = hash,
    Text = text,
    Speaker = speaker,
    Surface = "Talk",
    SentAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
};

if (!client.TryQueue(request))
{
    Console.Error.WriteLine("Bridge queue rejected the probe request.");
    return 4;
}

TranslationMessage? response = null;
var responseDeadline = DateTime.UtcNow.AddSeconds(15);
while (DateTime.UtcNow < responseDeadline)
{
    if (client.TryDequeue(out response))
        break;
    await Task.Delay(20);
}

if (response is null)
{
    Console.Error.WriteLine("Timed out waiting for the bridge response.");
    return 5;
}

var validIdentity =
    string.Equals(response.RequestId, requestId, StringComparison.Ordinal) &&
    string.Equals(response.SourceHash, hash, StringComparison.Ordinal);
Console.WriteLine(JsonSerializer.Serialize(new
{
    success = response.Success && validIdentity,
    requestId = response.RequestId,
    sourceHash = response.SourceHash,
    translation = response.Translation,
    engine = response.Engine,
    latencyMs = response.LatencyMs,
    errorCode = response.ErrorCode,
    errorMessage = response.ErrorMessage,
    validIdentity,
    warningCount = warnings.Count,
}));

return response.Success && validIdentity ? 0 : 6;
