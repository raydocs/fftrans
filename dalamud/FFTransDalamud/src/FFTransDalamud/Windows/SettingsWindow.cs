using System.Numerics;
using Dalamud.Bindings.ImGui;
using Dalamud.Interface.Windowing;
using FFTransDalamud.Bridge;
using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Windows;

internal sealed class SettingsWindow : Window, IDisposable
{
    private static readonly (DisplayMode Mode, string Label)[] DisplayModes =
    [
        (DisplayMode.OriginalThenTranslation, "英文原文 / 中文译文"),
        (DisplayMode.TranslationOnly, "仅中文译文"),
        (DisplayMode.TranslationThenOriginal, "中文译文 / 英文原文"),
    ];

    private readonly Plugin plugin;
    private readonly BridgeClient bridge;

    public SettingsWindow(Plugin plugin, BridgeClient bridge)
        : base("FFTrans 设置###FFTransSettings")
    {
        this.plugin = plugin;
        this.bridge = bridge;
        Size = new Vector2(440, 285);
        SizeCondition = ImGuiCond.FirstUseEver;
        Flags = ImGuiWindowFlags.NoCollapse;
    }

    public void Dispose()
    {
    }

    public override void Draw()
    {
        var status = bridge.Status;
        ImGui.TextUnformatted($"连接：{StatusLabel(status.State)}");
        ImGui.SameLine();
        ImGui.TextDisabled(status.Detail);

        if (ImGui.Button("立即重连"))
            plugin.RetryConnection();

        ImGui.Separator();

        var configuration = plugin.Configuration;
        var enabled = configuration.Enabled;
        if (ImGui.Checkbox("启用原生 Talk 翻译", ref enabled))
        {
            configuration.Enabled = enabled;
            configuration.Save();
        }

        var selectedLabel = DisplayModes.First(item => item.Mode == configuration.DisplayMode).Label;
        if (ImGui.BeginCombo("显示模式", selectedLabel))
        {
            foreach (var (mode, label) in DisplayModes)
            {
                var selected = configuration.DisplayMode == mode;
                if (ImGui.Selectable(label, selected))
                {
                    configuration.DisplayMode = mode;
                    configuration.Save();
                }

                if (selected)
                    ImGui.SetItemDefaultFocus();
            }

            ImGui.EndCombo();
        }

        var autoFontSize = configuration.AutoFontSize;
        if (ImGui.Checkbox("自动缩小字号", ref autoFontSize))
        {
            configuration.AutoFontSize = autoFontSize;
            configuration.Save();
        }

        var minimumFontSize = configuration.MinimumFontSize;
        if (ImGui.SliderInt("最小字号", ref minimumFontSize, 8, 20))
        {
            configuration.MinimumFontSize = minimumFontSize;
            configuration.Save();
        }

        var retrySeconds = configuration.ReconnectDelaySeconds;
        if (ImGui.SliderFloat("重试间隔（秒）", ref retrySeconds, 1f, 30f, "%.0f"))
        {
            configuration.ReconnectDelaySeconds = retrySeconds;
            configuration.Save();
        }

        ImGui.Separator();
        ImGui.TextWrapped($"桥接配置：{bridge.DiscoveryConfigPath}");
    }

    private static string StatusLabel(BridgeConnectionState state) => state switch
    {
        BridgeConnectionState.Stopped => "已停止",
        BridgeConnectionState.WaitingForConfiguration => "等待主程序",
        BridgeConnectionState.Connecting => "连接中",
        BridgeConnectionState.Connected => "已连接",
        BridgeConnectionState.Reconnecting => "等待重试",
        _ => "未知",
    };
}
