using System.Security.Cryptography;
using System.Text;

namespace FFTransDalamud.Core.Translation;

public static class SourceHash
{
    public static string Compute(string source)
    {
        ArgumentNullException.ThrowIfNull(source);

        var bytes = Encoding.UTF8.GetBytes(source);
        return Convert.ToHexStringLower(SHA256.HashData(bytes));
    }
}

