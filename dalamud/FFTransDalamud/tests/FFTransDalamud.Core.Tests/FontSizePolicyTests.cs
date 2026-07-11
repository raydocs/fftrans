using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Core.Tests;

public sealed class FontSizePolicyTests
{
    [Fact]
    public void AutoSizing_PreservesShortTextSize()
    {
        Assert.Equal((byte)14, FontSizePolicy.Resolve("Short text\n短译文", 14, true, 10));
    }

    [Fact]
    public void AutoSizing_ShrinksLongTextWithoutCrossingMinimum()
    {
        var text = new string('x', 500);

        Assert.Equal((byte)11, FontSizePolicy.Resolve(text, 14, true, 11));
        Assert.Equal((byte)10, FontSizePolicy.Resolve(text, 14, true, 8));
    }

    [Fact]
    public void DisabledAutoSizing_PreservesOriginalSize()
    {
        Assert.Equal((byte)16, FontSizePolicy.Resolve(new string('x', 500), 16, false, 8));
    }
}
