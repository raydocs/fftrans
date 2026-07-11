using FFTransDalamud.Core.Protocol;
using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Core.Tests;

public sealed class ResponseFreshnessTests
{
    private const string Original = "The rains have ceased.";

    [Fact]
    public void MatchingRequestHashAndCurrentOriginal_IsAccepted()
    {
        var hash = SourceHash.Compute(Original);
        var response = Response("request-current", hash);

        Assert.True(ResponseFreshness.IsCurrent(response, "request-current", hash, Original));
    }

    [Fact]
    public void StaleRequestId_IsRejectedEvenWhenTextRepeats()
    {
        var hash = SourceHash.Compute(Original);
        var response = Response("request-old", hash);

        Assert.False(ResponseFreshness.IsCurrent(response, "request-new", hash, Original));
    }

    [Fact]
    public void MismatchedResponseHash_IsRejected()
    {
        var hash = SourceHash.Compute(Original);
        var response = Response("request-current", SourceHash.Compute("another line"));

        Assert.False(ResponseFreshness.IsCurrent(response, "request-current", hash, Original));
    }

    [Fact]
    public void ChangedCurrentOriginal_IsRejected()
    {
        var hash = SourceHash.Compute(Original);
        var response = Response("request-current", hash);

        Assert.False(ResponseFreshness.IsCurrent(response, "request-current", hash, "The next sentence."));
    }

    private static TranslationMessage Response(string requestId, string sourceHash) => new()
    {
        Success = true,
        RequestId = requestId,
        SourceHash = sourceHash,
        Translation = "雨停了。",
    };
}
