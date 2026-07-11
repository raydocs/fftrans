using Dalamud.Game.Command;
using Dalamud.Interface.Windowing;
using Dalamud.IoC;
using Dalamud.Plugin;
using Dalamud.Plugin.Services;
using FFTransDalamud.Bridge;
using FFTransDalamud.Talk;
using FFTransDalamud.Windows;

namespace FFTransDalamud;

public sealed class Plugin : IDalamudPlugin
{
    private const string CommandName = "/fftrans";

    [PluginService]
    internal static IDalamudPluginInterface PluginInterface { get; private set; } = null!;

    [PluginService]
    internal static ICommandManager CommandManager { get; private set; } = null!;

    [PluginService]
    internal static IAddonLifecycle AddonLifecycle { get; private set; } = null!;

    [PluginService]
    internal static IGameGui GameGui { get; private set; } = null!;

    [PluginService]
    internal static IPluginLog Log { get; private set; } = null!;

    private readonly WindowSystem windowSystem = new("FFTransDalamud");
    private readonly SettingsWindow settingsWindow;
    private readonly BridgeClient bridgeClient;
    private readonly TalkTranslationController talkController;
    private bool disposed;

    public PluginConfiguration Configuration { get; }

    public Plugin()
    {
        Configuration = PluginInterface.GetPluginConfig() as PluginConfiguration ?? new PluginConfiguration();
        Configuration.Normalize();

        var clientVersion = typeof(Plugin).Assembly.GetName().Version?.ToString(3) ?? "0.1.0";
        bridgeClient = new BridgeClient(
            message => Log.Warning(message),
            clientVersion,
            () => TimeSpan.FromSeconds(Configuration.ReconnectDelaySeconds));
        talkController = new TalkTranslationController(
            AddonLifecycle,
            GameGui,
            bridgeClient,
            Configuration,
            Log);
        settingsWindow = new SettingsWindow(this, bridgeClient);
        windowSystem.AddWindow(settingsWindow);

        CommandManager.AddHandler(CommandName, new CommandInfo(OnCommand)
        {
            HelpMessage = "打开 FFTrans 设置；可用参数：on、off、retry",
        });
        PluginInterface.UiBuilder.Draw += windowSystem.Draw;
        PluginInterface.UiBuilder.OpenConfigUi += ToggleSettings;
        PluginInterface.UiBuilder.OpenMainUi += ToggleSettings;

        bridgeClient.Start();
        Log.Information("FFTrans Dalamud plugin loaded.");
    }

    public void Dispose()
    {
        if (disposed)
            return;

        disposed = true;
        PluginInterface.UiBuilder.Draw -= windowSystem.Draw;
        PluginInterface.UiBuilder.OpenConfigUi -= ToggleSettings;
        PluginInterface.UiBuilder.OpenMainUi -= ToggleSettings;
        CommandManager.RemoveHandler(CommandName);

        windowSystem.RemoveAllWindows();
        settingsWindow.Dispose();
        talkController.Dispose();
        bridgeClient.Dispose();
    }

    internal void ToggleSettings() => settingsWindow.Toggle();

    internal void RetryConnection() => bridgeClient.RequestReconnect();

    private void OnCommand(string command, string arguments)
    {
        switch (arguments.Trim().ToLowerInvariant())
        {
            case "on":
                Configuration.Enabled = true;
                Configuration.Save();
                break;
            case "off":
                Configuration.Enabled = false;
                Configuration.Save();
                break;
            case "retry":
                RetryConnection();
                break;
            default:
                ToggleSettings();
                break;
        }
    }
}
