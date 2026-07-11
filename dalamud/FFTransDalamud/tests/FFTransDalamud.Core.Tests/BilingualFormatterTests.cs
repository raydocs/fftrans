using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Core.Tests;

public sealed class BilingualFormatterTests
{
    [Theory]
    [InlineData(DisplayMode.OriginalThenTranslation, "English\n中文")]
    [InlineData(DisplayMode.TranslationOnly, "中文")]
    [InlineData(DisplayMode.TranslationThenOriginal, "中文\nEnglish")]
    public void Format_ImplementsAllDisplayModes(DisplayMode mode, string expected)
    {
        Assert.Equal(expected, BilingualFormatter.Format("English", "中文", mode));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Format_LeavesOriginalUntilTranslationExists(string? translation)
    {
        Assert.Equal(
            "English",
            BilingualFormatter.Format("English", translation, DisplayMode.TranslationOnly));
    }
}

