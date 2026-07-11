using System.Text.Json.Serialization;

namespace FFTransDalamud.Core.Protocol;

public static class ProtocolMessageTypes
{
    public const string Hello = "hello";
    public const string HelloOk = "hello.ok";
    public const string Error = "error";
    public const string Translate = "translate";
    public const string Translation = "translation";
}

public sealed record HelloMessage
{
    [JsonPropertyOrder(0)]
    [JsonPropertyName("type")]
    public string Type { get; init; } = ProtocolMessageTypes.Hello;

    [JsonPropertyOrder(1)]
    [JsonPropertyName("protocolVersion")]
    public required int ProtocolVersion { get; init; }

    [JsonPropertyOrder(2)]
    [JsonPropertyName("authToken")]
    public required string AuthToken { get; init; }

    [JsonPropertyOrder(3)]
    [JsonPropertyName("client")]
    public string Client { get; init; } = "FFTransDalamud";

    [JsonPropertyOrder(4)]
    [JsonPropertyName("clientVersion")]
    public required string ClientVersion { get; init; }
}

public sealed record TranslateMessage
{
    [JsonPropertyOrder(0)]
    [JsonPropertyName("type")]
    public string Type { get; init; } = ProtocolMessageTypes.Translate;

    [JsonPropertyOrder(1)]
    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

    [JsonPropertyOrder(2)]
    [JsonPropertyName("sourceHash")]
    public required string SourceHash { get; init; }

    [JsonPropertyOrder(3)]
    [JsonPropertyName("text")]
    public required string Text { get; init; }

    [JsonPropertyOrder(4)]
    [JsonPropertyName("speaker")]
    public string Speaker { get; init; } = string.Empty;

    [JsonPropertyOrder(5)]
    [JsonPropertyName("surface")]
    public string Surface { get; init; } = "Talk";

    [JsonPropertyOrder(6)]
    [JsonPropertyName("sentAt")]
    public long SentAt { get; init; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}

public sealed record TranslationMessage
{
    [JsonPropertyOrder(0)]
    [JsonPropertyName("type")]
    public string Type { get; init; } = ProtocolMessageTypes.Translation;

    [JsonPropertyOrder(1)]
    [JsonPropertyName("success")]
    public bool Success { get; init; }

    [JsonPropertyOrder(2)]
    [JsonPropertyName("requestId")]
    public required string RequestId { get; init; }

    [JsonPropertyOrder(3)]
    [JsonPropertyName("sourceHash")]
    public required string SourceHash { get; init; }

    [JsonPropertyOrder(4)]
    [JsonPropertyName("translation")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Translation { get; init; }

    [JsonPropertyOrder(5)]
    [JsonPropertyName("engine")]
    public string Engine { get; init; } = "unknown";

    [JsonPropertyOrder(6)]
    [JsonPropertyName("latencyMs")]
    public long LatencyMs { get; init; }

    [JsonPropertyOrder(7)]
    [JsonPropertyName("errorCode")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorCode { get; init; }

    [JsonPropertyOrder(8)]
    [JsonPropertyName("errorMessage")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ErrorMessage { get; init; }
}

public sealed record HelloOkMessage
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = ProtocolMessageTypes.HelloOk;

    [JsonPropertyName("protocolVersion")]
    public int ProtocolVersion { get; init; }
}

public sealed record ProtocolErrorMessage
{
    [JsonPropertyName("type")]
    public string Type { get; init; } = ProtocolMessageTypes.Error;

    [JsonPropertyName("errorCode")]
    public string ErrorCode { get; init; } = "UNKNOWN";

    [JsonPropertyName("errorMessage")]
    public string ErrorMessage { get; init; } = "The bridge rejected the request.";
}
