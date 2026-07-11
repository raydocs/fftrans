using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace FFTransDalamud.Core.Protocol;

public sealed record BridgeDiscoveryConfig
{
    private static readonly Regex PipeNamePattern = new(
        "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$",
        RegexOptions.CultureInvariant | RegexOptions.NonBacktracking);

    private static readonly Regex AuthTokenPattern = new(
        "^[a-fA-F0-9]{64}$",
        RegexOptions.CultureInvariant | RegexOptions.NonBacktracking);

    [JsonPropertyName("protocolVersion")]
    public int ProtocolVersion { get; init; }

    [JsonPropertyName("transport")]
    public string Transport { get; init; } = string.Empty;

    [JsonPropertyName("pipeName")]
    public string PipeName { get; init; } = string.Empty;

    [JsonPropertyName("authToken")]
    public string AuthToken { get; init; } = string.Empty;

    [JsonIgnore]
    public bool IsNamedPipeTransport =>
        string.Equals(Transport, "named-pipe", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(Transport, "namedPipe", StringComparison.OrdinalIgnoreCase);

    public string? GetValidationError()
    {
        if (ProtocolVersion != 1)
            return "protocolVersion must be 1.";

        if (!IsNamedPipeTransport)
            return "transport must be named-pipe.";

        if (!PipeNamePattern.IsMatch(PipeName))
            return "pipeName is invalid.";

        if (!AuthTokenPattern.IsMatch(AuthToken))
            return "authToken must be a 64-character hexadecimal token.";

        return null;
    }
}
