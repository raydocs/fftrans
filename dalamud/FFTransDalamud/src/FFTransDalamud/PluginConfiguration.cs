using Dalamud.Configuration;
using FFTransDalamud.Core.Translation;

namespace FFTransDalamud;

[Serializable]
public sealed class PluginConfiguration : IPluginConfiguration
{
    public int Version { get; set; } = 1;

    public bool Enabled { get; set; } = true;

    public DisplayMode DisplayMode { get; set; } = DisplayMode.OriginalThenTranslation;

    public bool AutoFontSize { get; set; } = true;

    public int MinimumFontSize { get; set; } = 11;

    public float ReconnectDelaySeconds { get; set; } = 3f;

    public void Normalize()
    {
        if (!Enum.IsDefined(DisplayMode))
            DisplayMode = DisplayMode.OriginalThenTranslation;

        MinimumFontSize = Math.Clamp(MinimumFontSize, 8, 20);
        ReconnectDelaySeconds = Math.Clamp(ReconnectDelaySeconds, 1f, 30f);
    }

    public void Save() => Plugin.PluginInterface.SavePluginConfig(this);
}
