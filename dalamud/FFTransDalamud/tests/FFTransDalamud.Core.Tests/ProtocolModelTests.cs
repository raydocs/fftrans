using System.Text.Json;
using FFTransDalamud.Core.Protocol;

namespace FFTransDalamud.Core.Tests;

public sealed class ProtocolModelTests
{
    [Fact]
    public void DiscoveryConfig_UsesFixedFieldNames()
    {
        const string json = """
            {
              "protocolVersion": 1,
              "transport": "named-pipe",
              "pipeName": "fftrans-test",
              "authToken": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            }
            """;

        var config = ProtocolJson.DeserializeDiscoveryConfig(json);

        Assert.Equal(1, config.ProtocolVersion);
        Assert.True(config.IsNamedPipeTransport);
        Assert.Equal("fftrans-test", config.PipeName);
        Assert.Equal(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            config.AuthToken);
        Assert.Null(config.GetValidationError());
    }

    [Theory]
    [InlineData(2, "named-pipe", "fftrans-test", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")]
    [InlineData(1, "tcp", "fftrans-test", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")]
    [InlineData(1, "named-pipe", "bad pipe name", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")]
    [InlineData(1, "named-pipe", "fftrans-test", "too-short")]
    public void DiscoveryConfig_RejectsUnsupportedOrUnsafeValues(
        int protocolVersion,
        string transport,
        string pipeName,
        string token)
    {
        var config = new BridgeDiscoveryConfig
        {
            ProtocolVersion = protocolVersion,
            Transport = transport,
            PipeName = pipeName,
            AuthToken = token,
        };

        Assert.NotNull(config.GetValidationError());
    }

    [Fact]
    public void Hello_SerializesExpectedProtocolFields()
    {
        var json = ProtocolJson.Serialize(new HelloMessage
        {
            ProtocolVersion = 1,
            AuthToken = "token",
            ClientVersion = "0.1.0",
        });

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        Assert.Equal("hello", root.GetProperty("type").GetString());
        Assert.Equal(1, root.GetProperty("protocolVersion").GetInt32());
        Assert.Equal("token", root.GetProperty("authToken").GetString());
        Assert.Equal("FFTransDalamud", root.GetProperty("client").GetString());
        Assert.Equal("0.1.0", root.GetProperty("clientVersion").GetString());
    }

    [Fact]
    public void TranslateAndTranslation_RoundTripExpectedFields()
    {
        var requestJson = ProtocolJson.Serialize(new TranslateMessage
        {
            RequestId = "request-1",
            SourceHash = "abc123",
            Text = "Hello",
            Speaker = "Alphinaud",
            Surface = "Talk",
            SentAt = 123456789,
        });

        using (var document = JsonDocument.Parse(requestJson))
        {
            var root = document.RootElement;
            Assert.Equal("translate", root.GetProperty("type").GetString());
            Assert.Equal("request-1", root.GetProperty("requestId").GetString());
            Assert.Equal("abc123", root.GetProperty("sourceHash").GetString());
            Assert.Equal("Hello", root.GetProperty("text").GetString());
            Assert.Equal("Alphinaud", root.GetProperty("speaker").GetString());
            Assert.Equal("Talk", root.GetProperty("surface").GetString());
            Assert.Equal(123456789, root.GetProperty("sentAt").GetInt64());
        }

        const string responseJson =
            "{\"type\":\"translation\",\"success\":true,\"requestId\":\"request-1\",\"sourceHash\":\"abc123\",\"translation\":\"你好\",\"engine\":\"Mock\",\"latencyMs\":42}";

        Assert.True(ProtocolJson.TryDeserializeTranslation(responseJson, out var response));
        Assert.NotNull(response);
        Assert.Equal("request-1", response.RequestId);
        Assert.Equal("abc123", response.SourceHash);
        Assert.Equal("你好", response.Translation);
        Assert.True(response.Success);
        Assert.Equal("Mock", response.Engine);
        Assert.Equal(42, response.LatencyMs);
        Assert.Null(response.ErrorCode);
        Assert.Null(response.ErrorMessage);
    }

    [Fact]
    public void HandshakeAndProtocolErrors_AreParsedStrictly()
    {
        Assert.True(
            ProtocolJson.TryDeserializeHelloOk(
                "{\"type\":\"hello.ok\",\"protocolVersion\":1}",
                out var hello));
        Assert.Equal(1, hello?.ProtocolVersion);

        Assert.True(
            ProtocolJson.TryDeserializeError(
                "{\"type\":\"error\",\"errorCode\":\"AUTH_FAILED\",\"errorMessage\":\"Authentication failed.\"}",
                out var error));
        Assert.Equal("AUTH_FAILED", error?.ErrorCode);
    }

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"type\":\"hello\"}")]
    [InlineData("{\"type\":\"translation\",\"requestId\":\"x\"}")]
    [InlineData("{\"type\":\"translation\",\"success\":true,\"requestId\":\"x\",\"sourceHash\":\"h\",\"translation\":\"\"}")]
    [InlineData("{\"type\":\"translation\",\"success\":false,\"requestId\":\"x\",\"sourceHash\":\"h\"}")]
    [InlineData("not-json")]
    public void InvalidTranslation_IsRejected(string json)
    {
        Assert.False(ProtocolJson.TryDeserializeTranslation(json, out _));
    }
}
