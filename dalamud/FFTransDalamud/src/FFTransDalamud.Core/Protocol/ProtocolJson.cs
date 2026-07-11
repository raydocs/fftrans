using System.Text.Json;
using System.Text.Json.Serialization;

namespace FFTransDalamud.Core.Protocol;

public static class ProtocolJson
{
    public static JsonSerializerOptions Options { get; } = new()
    {
        PropertyNameCaseInsensitive = false,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Skip,
    };

    public static string Serialize(HelloMessage message) => JsonSerializer.Serialize(message, Options);

    public static string Serialize(TranslateMessage message) => JsonSerializer.Serialize(message, Options);

    public static BridgeDiscoveryConfig DeserializeDiscoveryConfig(string json) =>
        JsonSerializer.Deserialize<BridgeDiscoveryConfig>(json, Options)
        ?? throw new JsonException("Bridge discovery configuration is empty.");

    public static bool TryDeserializeHelloOk(string json, out HelloOkMessage? message)
    {
        message = null;

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!HasMessageType(document.RootElement, ProtocolMessageTypes.HelloOk))
                return false;

            var parsed = document.RootElement.Deserialize<HelloOkMessage>(Options);
            if (parsed is null || parsed.ProtocolVersion <= 0)
                return false;

            message = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool TryDeserializeError(string json, out ProtocolErrorMessage? message)
    {
        message = null;

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!HasMessageType(document.RootElement, ProtocolMessageTypes.Error))
                return false;

            var parsed = document.RootElement.Deserialize<ProtocolErrorMessage>(Options);
            if (parsed is null || string.IsNullOrWhiteSpace(parsed.ErrorCode))
                return false;

            message = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static bool TryDeserializeTranslation(string json, out TranslationMessage? message)
    {
        message = null;

        try
        {
            using var document = JsonDocument.Parse(json);
            if (!HasMessageType(document.RootElement, ProtocolMessageTypes.Translation))
                return false;

            var parsed = document.RootElement.Deserialize<TranslationMessage>(Options);
            if (parsed is null ||
                string.IsNullOrWhiteSpace(parsed.RequestId) ||
                string.IsNullOrWhiteSpace(parsed.SourceHash) ||
                (parsed.Success && string.IsNullOrWhiteSpace(parsed.Translation)) ||
                (!parsed.Success && string.IsNullOrWhiteSpace(parsed.ErrorCode)))
            {
                return false;
            }

            message = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool HasMessageType(JsonElement root, string expectedType) =>
        root.ValueKind == JsonValueKind.Object &&
        root.TryGetProperty("type", out var typeElement) &&
        string.Equals(typeElement.GetString(), expectedType, StringComparison.Ordinal);
}
