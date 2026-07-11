using Dalamud.Game.Addon.Lifecycle;
using Dalamud.Game.Addon.Lifecycle.AddonArgTypes;
using Dalamud.Memory;
using Dalamud.Plugin.Services;
using FFXIVClientStructs.FFXIV.Component.GUI;
using FFTransDalamud.Bridge;
using FFTransDalamud.Core.Protocol;
using FFTransDalamud.Core.Translation;

namespace FFTransDalamud.Talk;

internal sealed unsafe class TalkTranslationController : IDisposable
{
    private const string TalkAddonName = "Talk";
    private const uint NameNodeId = 2;
    private const uint TextNodeId = 3;
    private const uint ParentNodeId = 10;
    private const int MaximumAttemptsPerVisibleLine = 2;

    private static readonly TimeSpan RequestTimeout = TimeSpan.FromSeconds(15);
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);

    private readonly IAddonLifecycle addonLifecycle;
    private readonly IGameGui gameGui;
    private readonly BridgeClient bridge;
    private readonly PluginConfiguration configuration;
    private readonly IPluginLog log;

    private string currentSpeaker = string.Empty;
    private string currentOriginal = string.Empty;
    private string currentSourceHash = string.Empty;
    private string renderedText = string.Empty;
    private string? resolvedTranslation;
    private string? pendingRequestId;
    private string? pendingSourceHash;
    private string? pendingSpeaker;
    private DateTimeOffset pendingStartedAt;
    private DateTimeOffset nextQueueAt;
    private int attemptsForCurrentLine;
    private long requestSequence;

    private bool layoutCaptured;
    private bool layoutDirty;
    private TextFlags originalTextFlags;
    private byte originalFontSize;
    private ushort originalWidth;
    private ushort originalHeight;
    private bool disposed;

    public TalkTranslationController(
        IAddonLifecycle addonLifecycle,
        IGameGui gameGui,
        BridgeClient bridge,
        PluginConfiguration configuration,
        IPluginLog log)
    {
        this.addonLifecycle = addonLifecycle;
        this.gameGui = gameGui;
        this.bridge = bridge;
        this.configuration = configuration;
        this.log = log;

        addonLifecycle.RegisterListener(AddonEvent.PostUpdate, TalkAddonName, OnPostUpdate);
        addonLifecycle.RegisterListener(AddonEvent.PreDraw, TalkAddonName, OnPreDraw);
        addonLifecycle.RegisterListener(AddonEvent.PreHide, TalkAddonName, OnReset);
        addonLifecycle.RegisterListener(AddonEvent.PreFinalize, TalkAddonName, OnReset);
    }

    public void Dispose()
    {
        if (disposed)
            return;

        disposed = true;
        addonLifecycle.UnregisterListener(AddonEvent.PostUpdate, TalkAddonName, OnPostUpdate);
        addonLifecycle.UnregisterListener(AddonEvent.PreDraw, TalkAddonName, OnPreDraw);
        addonLifecycle.UnregisterListener(AddonEvent.PreHide, TalkAddonName, OnReset);
        addonLifecycle.UnregisterListener(AddonEvent.PreFinalize, TalkAddonName, OnReset);

        try
        {
            var addon = gameGui.GetAddonByName<AtkUnitBase>(TalkAddonName);
            if (addon != null)
                RestoreOriginalAndClear(addon);
        }
        catch (Exception exception)
        {
            log.Warning($"Could not restore Talk while unloading FFTrans: {exception.Message}");
            ClearDialogueState();
        }
    }

    private void OnPostUpdate(AddonEvent eventType, AddonArgs args)
    {
        var addon = (AtkUnitBase*)args.Addon.Address;
        if (addon == null || !addon->IsVisible)
            return;

        DrainResponses();
        ObserveCurrentLine(addon);
        MaybeQueueTranslation();
    }

    private void OnPreDraw(AddonEvent eventType, AddonArgs args)
    {
        var addon = (AtkUnitBase*)args.Addon.Address;
        if (addon == null || !addon->IsVisible)
            return;

        DrainResponses();
        ObserveCurrentLine(addon);
        MaybeQueueTranslation();

        var textNode = addon->GetTextNodeById(TextNodeId);
        if (textNode == null)
            return;

        if (!configuration.Enabled)
        {
            RestoreOriginal(textNode);
            return;
        }

        if (string.IsNullOrWhiteSpace(resolvedTranslation))
            return;

        ApplyBilingualText(addon, textNode);
    }

    private void OnReset(AddonEvent eventType, AddonArgs args)
    {
        var addon = (AtkUnitBase*)args.Addon.Address;
        if (addon != null)
            RestoreOriginalAndClear(addon);
        else
            ClearDialogueState();
    }

    private void ObserveCurrentLine(AtkUnitBase* addon)
    {
        var nameNode = addon->GetTextNodeById(NameNodeId);
        var textNode = addon->GetTextNodeById(TextNodeId);
        if (textNode == null || textNode->NodeText.IsEmpty)
            return;

        var visibleName = ReadNodeText(nameNode);
        var visibleText = ReadNodeText(textNode);
        if (string.IsNullOrWhiteSpace(visibleText))
            return;

        // The speaker node can briefly change independently of the dialogue text,
        // and Talk's typewriter can resume after SetText and append more source text.
        // Neither our exact replacement nor that replacement with a native suffix
        // is a new line; PreDraw will restore the intended replacement below.
        var showingOurReplacement =
            !string.IsNullOrEmpty(renderedText) &&
            visibleText.StartsWith(renderedText, StringComparison.Ordinal);
        if (showingOurReplacement)
            return;

        var sourceChanged =
            string.IsNullOrEmpty(currentOriginal) ||
            !string.Equals(visibleText, currentOriginal, StringComparison.Ordinal) ||
            !string.Equals(visibleName, currentSpeaker, StringComparison.Ordinal);
        if (!sourceChanged)
            return;

        RestoreLayout(textNode);
        ResetRequestState();

        currentSpeaker = visibleName;
        currentOriginal = visibleText;
        currentSourceHash = SourceHash.Compute(visibleText);
        CaptureLayout(textNode);
    }

    private void MaybeQueueTranslation()
    {
        if (!configuration.Enabled || string.IsNullOrWhiteSpace(currentOriginal) || resolvedTranslation is not null)
            return;

        var now = DateTimeOffset.UtcNow;
        if (pendingRequestId is not null)
        {
            var elapsed = now - pendingStartedAt;
            if (bridge.IsConnected && elapsed < RequestTimeout)
                return;
            if (!bridge.IsConnected && elapsed < TimeSpan.FromSeconds(1))
                return;

            pendingRequestId = null;
            pendingSourceHash = null;
            pendingSpeaker = null;
        }

        if (attemptsForCurrentLine >= MaximumAttemptsPerVisibleLine || now < nextQueueAt)
            return;

        if (!bridge.IsConnected)
        {
            nextQueueAt = now.AddSeconds(1);
            return;
        }

        var sequence = Interlocked.Increment(ref requestSequence);
        var requestId = $"talk-{sequence:x}-{currentSourceHash[..16]}-{Guid.NewGuid():N}";
        var request = new TranslateMessage
        {
            RequestId = requestId,
            SourceHash = currentSourceHash,
            Text = currentOriginal,
            Speaker = currentSpeaker,
            Surface = TalkAddonName,
            SentAt = now.ToUnixTimeMilliseconds(),
        };

        if (!bridge.TryQueue(request))
        {
            nextQueueAt = now.AddSeconds(1);
            return;
        }

        attemptsForCurrentLine += 1;
        pendingRequestId = requestId;
        pendingSourceHash = currentSourceHash;
        pendingSpeaker = currentSpeaker;
        pendingStartedAt = now;
    }

    private void DrainResponses()
    {
        while (bridge.TryDequeue(out var response) && response is not null)
        {
            var isCurrent =
                ResponseFreshness.IsCurrent(
                    response,
                    pendingRequestId,
                    pendingSourceHash,
                    currentOriginal) &&
                string.Equals(pendingSpeaker, currentSpeaker, StringComparison.Ordinal);
            if (!isCurrent)
                continue;

            pendingRequestId = null;
            pendingSourceHash = null;
            pendingSpeaker = null;

            if (response.Success && !string.IsNullOrWhiteSpace(response.Translation))
            {
                resolvedTranslation = response.Translation.Trim();
                continue;
            }

            nextQueueAt = DateTimeOffset.UtcNow + RetryDelay;
            log.Warning(
                $"FFTrans translation failed for the visible Talk line: " +
                $"{response.ErrorCode ?? "UNKNOWN"} ({response.LatencyMs} ms)");
        }
    }

    private void ApplyBilingualText(AtkUnitBase* addon, AtkTextNode* textNode)
    {
        var replacement = BilingualFormatter.Format(
            currentOriginal,
            resolvedTranslation,
            configuration.DisplayMode);
        var parentNode = addon->GetNodeById(ParentNodeId);
        if (parentNode == null)
            return;

        CaptureLayout(textNode);
        var desiredFlags =
            (originalTextFlags & ~TextFlags.Ellipsis) |
            TextFlags.WordWrap |
            TextFlags.MultiLine |
            TextFlags.AutoAdjustNodeSize;
        var desiredFontSize = FontSizePolicy.Resolve(
            replacement,
            originalFontSize,
            configuration.AutoFontSize,
            configuration.MinimumFontSize);
        var desiredWidth = parentNode->GetWidth();
        var textChanged = !string.Equals(ReadNodeText(textNode), replacement, StringComparison.Ordinal);
        var layoutChanged =
            textNode->TextFlags != desiredFlags ||
            textNode->FontSize != desiredFontSize ||
            textNode->GetWidth() != desiredWidth;
        if (!textChanged && !layoutChanged)
        {
            renderedText = replacement;
            layoutDirty = true;
            return;
        }

        textNode->TextFlags = desiredFlags;
        textNode->FontSize = desiredFontSize;
        textNode->SetWidth(desiredWidth);
        if (textChanged)
            textNode->SetText(replacement);
        textNode->ResizeNodeForCurrentText();

        renderedText = replacement;
        layoutDirty = true;
    }

    private void CaptureLayout(AtkTextNode* textNode)
    {
        if (layoutCaptured || textNode == null)
            return;

        originalTextFlags = textNode->TextFlags;
        originalFontSize = textNode->FontSize;
        originalWidth = textNode->GetWidth();
        originalHeight = textNode->GetHeight();
        layoutCaptured = true;
    }

    private void RestoreOriginal(AtkTextNode* textNode)
    {
        if (textNode == null || !layoutDirty)
            return;

        if (!string.IsNullOrEmpty(currentOriginal) &&
            !string.Equals(ReadNodeText(textNode), currentOriginal, StringComparison.Ordinal))
        {
            textNode->SetText(currentOriginal);
        }

        RestoreLayout(textNode);
        renderedText = string.Empty;
        layoutDirty = false;
    }

    private void RestoreLayout(AtkTextNode* textNode)
    {
        if (textNode == null || !layoutCaptured)
            return;

        textNode->TextFlags = originalTextFlags;
        textNode->FontSize = originalFontSize;
        textNode->SetWidth(originalWidth);
        textNode->SetHeight(originalHeight);
        layoutCaptured = false;
        layoutDirty = false;
    }

    private void RestoreOriginalAndClear(AtkUnitBase* addon)
    {
        var textNode = addon->GetTextNodeById(TextNodeId);
        if (textNode != null)
            RestoreOriginal(textNode);

        ClearDialogueState();
    }

    private void ResetRequestState()
    {
        renderedText = string.Empty;
        resolvedTranslation = null;
        pendingRequestId = null;
        pendingSourceHash = null;
        pendingSpeaker = null;
        pendingStartedAt = default;
        nextQueueAt = DateTimeOffset.MinValue;
        attemptsForCurrentLine = 0;
    }

    private void ClearDialogueState()
    {
        currentSpeaker = string.Empty;
        currentOriginal = string.Empty;
        currentSourceHash = string.Empty;
        ResetRequestState();
        layoutCaptured = false;
        layoutDirty = false;
    }

    private static string ReadNodeText(AtkTextNode* textNode)
    {
        if (textNode == null || textNode->NodeText.IsEmpty)
            return string.Empty;

        return MemoryHelper.ReadSeStringAsString(
            out _,
            (nint)textNode->NodeText.StringPtr.Value);
    }
}
