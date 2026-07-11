using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Core.Tests;

public sealed class SourceHashTests
{
    [Theory]
    [InlineData("", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")]
    [InlineData("abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")]
    public void Compute_UsesLowercaseSha256OfUtf8(string source, string expected)
    {
        Assert.Equal(expected, SourceHash.Compute(source));
    }

    [Fact]
    public void Compute_IsSensitiveToUnicodeContent()
    {
        Assert.Equal(SourceHash.Compute("你好"), SourceHash.Compute("你好"));
        Assert.NotEqual(SourceHash.Compute("你好"), SourceHash.Compute("您好"));
    }
}

