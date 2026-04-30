# Settings UI acceptance checklist — 2026-04-25

## Scope
- Target: `src/html/config.html` settings window
- Validation method: live Electron interaction via `agent-browser` against the running app (`npm start -- --remote-debugging-port=9222`)
- Focus: page-by-page interaction checks after the settings UI optimization pass

## Overall result
- Status: **Pass with notes**
- Summary:
  - Core navigation, conditional rendering, save-state feedback, and page structure all behaved as expected.
  - No additional blocking UI issue was found during this acceptance pass.
  - Service-backed checks are now partially exercised: ElevenLabs positive path passed, empty-config negative paths failed gracefully, and the external-open IPC guards behaved correctly.

## Environment notes
- `npm run lint`: **passed**
- `npm test`: **passed**
- Repository fix completed during this round:
  - restored `src/data/text/readme/elevenlabs-token-helper.html`
  - `scripts/verify-elevenlabs-release.js` now passes again

---

## 1. Appearance
**Result:** Pass

### Checked
- [x] Appearance tab is reachable and renders correctly
- [x] App language selector exists on Appearance
- [x] Theme selector exists on Appearance
- [x] App language / theme no longer appear on System
- [x] Changing a field marks Save as dirty
- [x] Saving clears dirty state
- [x] Saving shows non-blocking feedback

### Evidence
- DOM check:
  - `appearanceHasLanguage: true`
  - `appearanceHasTheme: true`
  - `systemHasLanguage: false`
  - `systemHasTheme: false`
- Save flow:
  - before save: `dirtyBeforeSave: true`
  - after save: `dirtyAfterSave: false`
  - toast: `toastCount: 1`, `lastToastText: "Settings saved"`

### Notes
- The migrated information architecture is behaving correctly.

---

## 2. Translation
**Result:** Pass

### Checked
- [x] Translation tab is reachable
- [x] Main switches render correctly
- [x] Primary / alternate engine selectors render
- [x] Language selectors render
- [x] Channel toggles and text inputs render in the expected long-form list

### Evidence
- Interactive snapshot showed:
  - auto-change / fix / skip switches
  - engine and alternate engine selectors
  - source / target selectors
  - per-channel switch + textbox rows

### Notes
- This page remains dense, but no functional regression was observed in this pass.
- Channel-level editing was visually present; exhaustive per-channel persistence checks were not run one by one.

---

## 3. Speech
**Result:** Pass

### Checked
- [x] Speech tab is reachable
- [x] TTS engine selector renders
- [x] Only the active engine section is shown
- [x] ElevenLabs section renders when selected
- [x] Google TTS helper empty-state renders when selected
- [x] Switching engines updates visible content correctly

### Evidence
- Visible section checks:
  - Google → `["section-tts-google"]`
  - Speechify → `["section-tts-speechify"]`
  - MiMo → `["section-tts-mimo"]`
  - ElevenLabs → `["section-tts-elevenlabs"]`
- Google helper state:
  - `googleReadyVisible: true`
  - `googleHelperTitle: "No extra setup required"`

### Notes
- Conditional rendering is working and removes the previous full-page overload.
- Additional runtime checks completed in this round:
  - IPC-level `test-current-tts-engine` passed for ElevenLabs
  - UI-level ElevenLabs “测试连接” produced success toast: `✅ ElevenLabs 测试成功！`
  - UI-level Speechify empty-config path failed gracefully: `❌ 配置无效请先填写 Speechify Bearer Token`
  - IPC-level empty-config checks also failed cleanly for Speechify and MiMo

---

## 4. API
**Result:** Pass

### Checked
- [x] API tab is reachable
- [x] Primary API sections render
- [x] More-engines accordion is interactive
- [x] Configured-count label appears in the accordion trigger

### Evidence
- Accordion state check:
  - before expand: `countText: "0 configured"`, `hidden: true`, `expanded: "false"`
  - after expand: `hidden: false`, `expanded: "true"`
- Snapshot showed test links, API key inputs, model fields, and provider-specific controls.

### Notes
- Positive API-provider connection tests remain blocked by environment because no API keys are configured for Gemini / OpenRouter / GPT / Kimi / NVIDIA / custom LLM in the active config.
- Negative-path coverage was exercised:
  - UI-level Gemini “测试链接” failed gracefully and reset link text to `Test Connection`
  - IPC-level `test-ai-translation` for Gemini returned `Gemini API Key 未设置`

---

## 5. AI
**Result:** Pass

### Checked
- [x] AI tab is reachable
- [x] Conversation history switch renders
- [x] Numeric controls render
- [x] Streaming switch renders
- [x] Prompt preset selector and prompt textarea render

### Evidence
- Interactive snapshot showed the expected controls for AI history, streaming, preset selection, and custom prompt editing.

### Notes
- No regression found in layout or discoverability.

---

## 6. System
**Result:** Pass

### Checked
- [x] System tab is reachable
- [x] Shortcut / auto-update / SSL switches render
- [x] Maintenance action buttons render
- [x] Proxy controls render
- [x] Language/theme are not present here anymore

### Evidence
- DOM check:
  - `languageInSystem: false`
  - `themeInSystem: false`
- Snapshot showed maintenance actions and proxy fields as expected.

### Notes
- Information architecture is now clearer than the previous mixed placement.

---

## 7. About
**Result:** Pass

### Checked
- [x] About tab is reachable
- [x] Row-level interactive items render
- [x] Row items expose click targets
- [x] Row items are keyboard-focusable buttons

### Evidence
- Row target check:
  - `rowTargets: ["a-readme", "a-github"]`
  - `keyboardButtons: true`
- Snapshot showed both User Guide and GitHub rows.

### Notes
- External-open handlers were exercised at IPC level:
  - valid `https://github.com/raydocs/fftrans` open request succeeded
  - invalid `http://example.com` request was correctly blocked with `Only HTTPS or Chrome extension URLs are allowed`
  - valid absolute local readme path succeeded
  - invalid relative path was correctly blocked with `Only absolute local paths are allowed`

---

## Cross-page interaction checks
**Result:** Pass

### Checked
- [x] Tab keyboard navigation works
- [x] Save dirty-state feedback works
- [x] Save success feedback is non-blocking

### Evidence
- Keyboard nav:
  - focusing the active tab and pressing `ArrowRight` selected `tab-translation`
- Save feedback:
  - dirty state toggled correctly
  - save success toast displayed `"Settings saved"`

---

## Service-backed and negative-path checks added in this round
**Result:** Pass with environment notes

### Checked
- [x] `OPEN_EXTERNAL_URL` accepts allowed HTTPS URLs
- [x] `OPEN_EXTERNAL_URL` rejects disallowed protocols
- [x] `OPEN_PATH` accepts valid absolute local paths
- [x] `OPEN_PATH` rejects relative paths
- [x] ElevenLabs current-engine test passes with the active saved auth
- [x] Google TTS returns the expected informational no-test-needed result
- [x] Speechify / MiMo empty-config tests fail cleanly
- [x] Gemini empty-config test fails cleanly
- [x] Restored release asset unblocks `npm test`

### Evidence
- IPC results:
  - `validOpenExternal.success: true`
  - `invalidOpenExternal.message: "Only HTTPS or Chrome extension URLs are allowed"`
  - `validOpenPath.success: true`
  - `invalidOpenPath.message: "Only absolute local paths are allowed"`
  - `googleTtsTest.message: "Google TTS 无需测试"`
  - `elevenlabsTtsTest.message: "ElevenLabs 测试成功"`
  - `speechifyNegative.message: "缺少 Speechify Bearer Token"`
  - `mimoNegative.message: "缺少 MiMo API Key"`
  - `geminiNegative.message: "Gemini API Key 未设置"`
- UI-level results:
  - ElevenLabs test toast: `✅ ElevenLabs 测试成功！`
  - Speechify negative toast: `❌ 配置无效请先填写 Speechify Bearer Token`
  - Gemini negative toast: `测试失败Gemini API Key 未设置`
- Release verification:
  - restored `src/data/text/readme/elevenlabs-token-helper.html`
  - `npm test` completed with `ElevenLabs release assets verified.`

### Notes
- The active local config contains a saved ElevenLabs refresh token, so ElevenLabs positive-path testing was possible.
- No API-provider keys were configured locally, so API positive-path tests remain environment-blocked rather than UI-blocked.

---

## Not fully covered in this round
- External URL opening success for About links
- API provider connection-test success paths
- Real voice playback success paths for each TTS provider
- Full persistence verification for every individual Translation channel row
- Negative-path validation for invalid credentials or network errors

## Conclusion
This settings UI pass is in a good state for the validated interactions. The main structural goals from the design review are reflected in the live window behavior:
- clearer tab semantics
- better Appearance/System information architecture
- conditional Speech sections
- visible dirty/save feedback
- improved About-row accessibility

The remaining work, if needed, is no longer structural polish. It is service-integration verification and edge-case interaction coverage.