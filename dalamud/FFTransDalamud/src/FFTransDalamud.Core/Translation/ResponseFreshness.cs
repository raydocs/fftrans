using FFTransDalamud.Core.Protocol;

namespace FFTransDalamud.Core.Translation;

public static class ResponseFreshness
{
    public static bool IsCurrent(
        TranslationMessage response,
        string? pendingRequestId,
        string? pendingSourceHash,
        string currentOriginal)
    {
        ArgumentNullException.ThrowIfNull(response);
        ArgumentNullException.ThrowIfNull(currentOriginal);

        if (string.IsNullOrEmpty(pendingRequestId) || string.IsNullOrEmpty(pendingSourceHash))
            return false;

        return string.Equals(response.RequestId, pendingRequestId, StringComparison.Ordinal) &&
               string.Equals(response.SourceHash, pendingSourceHash, StringComparison.Ordinal) &&
               string.Equals(SourceHash.Compute(currentOriginal), pendingSourceHash, StringComparison.Ordinal);
    }
}

