namespace FFTransDalamud.Core.Translation;

public static class FontSizePolicy
{
    public static byte Resolve(
        string renderedText,
        byte originalFontSize,
        bool autoFontSize,
        int configuredMinimum)
    {
        ArgumentNullException.ThrowIfNull(renderedText);

        var original = originalFontSize == 0 ? (byte)14 : originalFontSize;
        if (!autoFontSize)
            return original;

        var lineCount = 1 + renderedText.Count(character => character == '\n');
        var pressure = renderedText.Length + Math.Max(0, lineCount - 3) * 36;
        var target = pressure switch
        {
            >= 420 => 10,
            >= 300 => 11,
            >= 220 => 12,
            >= 140 => 13,
            _ => original,
        };

        var minimum = Math.Min(original, Math.Clamp(configuredMinimum, 8, 20));
        return (byte)Math.Clamp(Math.Min(original, target), minimum, original);
    }
}
