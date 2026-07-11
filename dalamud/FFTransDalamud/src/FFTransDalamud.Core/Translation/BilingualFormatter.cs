namespace FFTransDalamud.Core.Translation;

public static class BilingualFormatter
{
    public static string Format(string original, string? translation, DisplayMode mode)
    {
        ArgumentNullException.ThrowIfNull(original);

        if (string.IsNullOrWhiteSpace(translation))
            return original;

        return mode switch
        {
            DisplayMode.OriginalThenTranslation => $"{original}\n{translation}",
            DisplayMode.TranslationOnly => translation,
            DisplayMode.TranslationThenOriginal => $"{translation}\n{original}",
            _ => $"{original}\n{translation}",
        };
    }
}

