## Final Prompt
<taskname="Gender preview controls"/>
<task>Propose and implement exactly one next optimization for ElevenLabs settings: add per-gender preview buttons for the female/male NPC voice selectors, and verify/document whether ElevenReader can expose more voices for those selectors. Keep this as one attributable iteration only. Do not implement runtime routing changes unless strictly required for preview correctness.</task>

<architecture>- Settings UI is driven by `src/html/config.html` and `src/html/config.js`.
- ElevenLabs preview synthesis path already exists through `IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE` in `src/module/ipc/tts-ipc.js`, delegating to `elevenlabs-tts.synthesizeSpeech(...)`.
- ElevenLabs voice catalog refresh in `config.js` uses `GET_TTS_VOICES` and populates all Three selects (default/female/male) via shared helpers.
- Reader voice fetch is implemented in `src/module/translator/elevenlabs-tts.js` against `https://api.elevenlabs.io/v1/reader/voices`.
- Auth/session for voice refresh depends on extension bridge + token validation (`src/module/system/elevenlabs-extension-bridge.js`, extension docs/code under `extension/elevenreader-bearer`).
- Verification contracts are in `scripts/verify-settings-ui-regression.js` and `scripts/verify-elevenlabs-release.js`.</architecture>

<selected_context>
prompt-exports/optimize-elevenlabs-gender-preview-runs.md: Baseline and stop criterion; current preview coverage is 1/3.
src/html/config.html: ElevenLabs default preview button exists; female/male voice selectors exist but no dedicated preview buttons yet.
src/html/config.js: Existing default preview handler, auth gating, voice-refresh flow, and config mapping for `femaleVoiceId`/`maleVoiceId`.
src/module/ipc/tts-ipc.js: `PREVIEW_ELEVENLABS_VOICE` IPC handler and unified voice-list IPC path.
src/module/translator/elevenlabs-tts.js: Reader voices endpoint (`/reader/voices`) and voice-ID based synthesis/cache key behavior.
src/module/system/config-module.js: persisted ElevenLabs config shape and defaults including gender voice fields.
src/constants/index.js: IPC channel definitions consumed by settings and IPC module.
src/module/system/elevenlabs-extension-bridge.js: primary auth import/validation path used by settings voice refresh.
extension/elevenreader-bearer/README.md: documented pairing/import capabilities (tokens/session data).
extension/elevenreader-bearer/background.js: extension capture scope for ElevenReader auth-related data.
scripts/verify-settings-ui-regression.js: UI contract checks to update if new preview controls are added.
scripts/verify-elevenlabs-release.js: release asset contract for ElevenLabs-related files.
package.json: canonical scripts for test/verification commands.
</selected_context>

<relationships>- `config.html` button/select IDs -> `config.js` event handlers and `collectElevenLabsFormConfig()`.
- `config.js` preview click -> `ipcRenderer.invoke(PREVIEW_ELEVENLABS_VOICE, { text, config })` -> `tts-ipc.js` -> `elevenlabs-tts.synthesizeSpeech`.
- `config.js` refresh voices -> `GET_TTS_VOICES` -> `tts-ipc.js` dispatcher -> `elevenlabs-tts.getVoices` (`/reader/voices`) -> repopulate default/female/male selects.
- Auth usability state in settings is informed by `GET_ELEVENLABS_AUTH_STATUS`/bridge checks; unavailable auth disables preview/refresh actions.
- Verification scripts enforce UI wiring and release packaging constraints.
</relationships>

<edit_scope>- Primary files to edit: `src/html/config.html`, `src/html/config.js`.
- Verification/contract updates likely: `scripts/verify-settings-ui-regression.js`.
- Documentation update for voice expansion verification result: update run artifact in `prompt-exports/optimize-elevenlabs-gender-preview-runs.md` (or equivalent run note file used in this repo).
</edit_scope>

<expected_metric_movement>- Preview coverage metric should move from 1/3 to 3/3 wired controls (default + female + male selectors).
- Voice catalog status should be explicitly verified/documented as either:
  - dynamic expansion works through authenticated Reader `/reader/voices`, or
  - constrained by current ElevenReader/auth surface with documented limitation and fallback.
</expected_metric_movement>

<risks>- UI state drift: new preview buttons may not follow existing auth gating/disabled behavior.
- Event-handler duplication risk: copy/paste preview logic can diverge; shared helper may be safer while staying in single-iteration scope.
- Wrong voice preview risk: female/male preview could accidentally reuse default select if IDs/config are not passed correctly.
- Verification mismatch: regression script may fail until new control IDs/handler expectations are included.
- Voice expansion interpretation risk: extension captures auth/session artifacts, not necessarily additional voice inventory sources beyond Reader API.
</risks>

<verification>- `npm test`
- `npm run verify:settings-ui`
- `npm run verify:elevenlabs-release`
- Task-specific validation:
  - In settings, confirm all three preview controls trigger synthesis for their respective selected voice IDs.
  - Confirm auth-disabled state blocks all Three preview controls consistently.
  - Refresh voices and verify default/female/male selects all repopulate and preserve/restores selection behavior.
  - Record evidence on whether additional voices are exposed through current Reader endpoint/auth path.
</verification>

<ambiguities>None identified in integration points. Remaining decision is implementation style: independent female/male handlers vs a shared preview helper, as long as this remains one attributable change and keeps current behavior intact.</ambiguities>

## Selection
- Files: 14 total (14 full)
- Total tokens: 88751 (Auto view)
- Token breakdown: full 88751

### Files
### Selected Files
/Users/ruirui/Downloads/GitHub/fftrans/
├── extension/
│   └── elevenreader-bearer/
│       ├── README.md — 413 tokens (full)
│       └── background.js — 6,397 tokens (full)
├── prompt-exports/
│   └── optimize-elevenlabs-gender-preview-runs.md — 278 tokens (full)
├── scripts/
│   ├── verify-elevenlabs-release.js — 448 tokens (full)
│   └── verify-settings-ui-regression.js — 2,164 tokens (full)
├── src/
│   ├── constants/
│   │   └── index.js — 2,062 tokens (full)
│   ├── html/
│   │   ├── config.html — 25,867 tokens (full)
│   │   └── config.js — 26,209 tokens (full)
│   └── module/
│       ├── ipc/
│       │   └── tts-ipc.js — 5,550 tokens (full)
│       ├── system/
│       │   ├── config-module.js — 4,281 tokens (full)
│       │   └── elevenlabs-extension-bridge.js — 7,386 tokens (full)
│       └── translator/
│           └── elevenlabs-tts.js — 5,681 tokens (full)
├── CLAUDE.md — 954 tokens (full)
└── package.json — 1,061 tokens (full)


---

## Generated Plan

## Chat Send ✅
- **Chat**: `gender-preview-controls-8B4D98` | **Mode**: plan

### Response
## 1. **Summary**

Implement one targeted ElevenLabs settings optimization: add dedicated preview buttons for the female and male NPC voice selectors, wire all three ElevenLabs preview controls through one shared preview helper, and document that dynamic voice expansion already depends on authenticated ElevenReader `/reader/voices` rather than the Chromium extension exposing its own voice catalog. No runtime NPC gender routing changes are required because preview correctness only depends on passing the selected voice ID into the existing `PREVIEW_ELEVENLABS_VOICE` IPC path.

## 2. **Current-state analysis**

- `src/html/config.html`
  - The default ElevenLabs voice selector `select-elevenlabs-voice-id` already has `btn-preview-elevenlabs-voice`.
  - Female and male selectors exist:
    - `select-elevenlabs-female-voice-id`
    - `select-elevenlabs-male-voice-id`
  - They currently have no preview buttons, so preview coverage is `1/3`.

- `src/html/config.js`
  - `ELEVENLABS_VOICE_SELECT_IDS` already tracks all three selectors.
  - `initializeElevenLabsGenderVoiceSelects()` clones the default curated options into female/male selectors.
  - `loadElevenLabsVoices()` refreshes all three selectors from `GET_TTS_VOICES` and preserves current selections.
  - The existing default preview handler:
    - reads `select-elevenlabs-voice-id`
    - builds `collectElevenLabsFormConfig()`
    - overrides `config.voiceId`
    - invokes `IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE`
  - `updateElevenLabsActionAvailability()` currently disables only the default preview button and refresh button when auth is not usable.

- `src/module/ipc/tts-ipc.js`
  - `PREVIEW_ELEVENLABS_VOICE` already accepts `{ text, config }`.
  - It delegates to `elevenLabsTTS.synthesizeSpeech(...)`.
  - No IPC change is needed.

- `src/module/translator/elevenlabs-tts.js`
  - `getVoices()` already calls `https://api.elevenlabs.io/v1/reader/voices`.
  - Voice expansion capability is already present through authenticated Reader API access.
  - The extension bridge supplies auth/session material; it does not enumerate voices itself.

This is best solved by a targeted UI/renderer change plus regression-script/documentation updates. A broader refactor is unnecessary because preview synthesis, voice refresh, auth validation, and persistence already exist.

## 3. **Design**

### A. Settings HTML: add female/male preview controls

Modify the female and male NPC voice rows in `src/html/config.html`.

Add one button next to each selector:

- `btn-preview-elevenlabs-female-voice`
- `btn-preview-elevenlabs-male-voice`

Use the same visual pattern as the default button:

```html
<!-- illustrative shape only -->
<select id="select-elevenlabs-female-voice-id"></select>
<button id="btn-preview-elevenlabs-female-voice">试听</button>
```

Also update each row’s control wrapper from:

```html
<div class="setting-control">
```

to:

```html
<div class="setting-control setting-control-group">
```

for layout consistency.

### B. Settings JS: replace single preview handler with shared preview wiring

In `src/html/config.js`, add a renderer-local control mapping near `ELEVENLABS_VOICE_SELECT_IDS`:

```js
// illustrative shape
ELEVENLABS_PREVIEW_CONTROLS = [
  { selectId: 'select-elevenlabs-voice-id', buttonId: 'btn-preview-elevenlabs-voice', roleLabel: '' },
  { selectId: 'select-elevenlabs-female-voice-id', buttonId: 'btn-preview-elevenlabs-female-voice', roleLabel: 'female NPC voice' },
  { selectId: 'select-elevenlabs-male-voice-id', buttonId: 'btn-preview-elevenlabs-male-voice', roleLabel: 'male NPC voice' },
]
```

Add shared helpers:

- `getElevenLabsPreviewButtons()`
  - Returns existing preview button elements from the mapping.

- `setElevenLabsPreviewBusy(isBusy)`
  - Disables/enables all three preview buttons during generation/playback.
  - After clearing busy state, call `updateElevenLabsActionAvailability()` so auth gating is restored.

- `previewElevenLabsVoiceBySelect(control)`
  - Inputs: `{ selectId, buttonId, roleLabel }`
  - Reads the selected voice ID from the mapped selector.
  - Uses `collectElevenLabsFormConfig()`.
  - Validates with `validateElevenLabsFormConfig()`.
  - Invokes existing IPC:

```js
ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE, {
  text: previewText,
  config: {
    ...previewConfig,
    voiceId: selectedVoice,
  },
})
```

  - Must pass the mapped selector’s `selectedVoice`; do not rely on `previewConfig.voiceId`, because that always reflects the default selector.
  - Plays `result.data.audioUrl` with `new Audio(...)`.
  - Restores button text and busy state on success, playback error, synthesis error, and no-audio result.

- `bindElevenLabsPreviewButtons()`
  - Iterates `ELEVENLABS_PREVIEW_CONTROLS`.
  - Assigns each button click to `previewElevenLabsVoiceBySelect(control)`.

In `setButton()`:

- Remove the hardcoded `btn-preview-elevenlabs-voice` handler.
- Call `bindElevenLabsPreviewButtons()` in its place.
- Keep the existing `updateElevenLabsActionAvailability()` call after bindings.

### C. Auth-disabled behavior

Update `updateElevenLabsActionAvailability()`:

- Instead of only handling `btn-preview-elevenlabs-voice`, loop over all mapped preview buttons.
- For every preview button:
  - `disabled = !authUsable`
  - `title = unavailableTitle` when disabled
  - `title = ''` when enabled

Keep existing behavior for:

- `btn-refresh-elevenlabs-voices`
- `btn-test-current-tts-engine` when ElevenLabs is selected

This ensures all three preview controls are blocked consistently until auth is usable.

### D. Voice catalog documentation

Update `prompt-exports/optimize-elevenlabs-gender-preview-runs.md` with one new run row:

- Preview coverage: `3/3 wired controls`
- Voice catalog status:
  - Dynamic expansion works through authenticated Reader `/reader/voices`.
  - The current Chromium extension exposes auth/session artifacts only.
  - It does not provide a separate voice inventory surface.
  - Static curated options remain the fallback before auth or if `/reader/voices` returns no voices.

No runtime routing change is needed.

## 4. **File-by-file impact**

### `src/html/config.html`

**Change**

- Add `btn-preview-elevenlabs-female-voice` beside `select-elevenlabs-female-voice-id`.
- Add `btn-preview-elevenlabs-male-voice` beside `select-elevenlabs-male-voice-id`.
- Add `setting-control-group` to the female/male selector control wrappers.

**Why**

- Moves ElevenLabs preview coverage from `1/3` to `3/3`.

**Dependencies**

- Requires `config.js` preview binding update.

---

### `src/html/config.js`

**Change**

- Add `ELEVENLABS_PREVIEW_CONTROLS`.
- Add shared preview helper functions.
- Replace the single default preview click handler with `bindElevenLabsPreviewButtons()`.
- Update `updateElevenLabsActionAvailability()` to gate all three preview buttons.

**Why**

- Avoids copy/paste preview handlers.
- Ensures female/male preview uses the selected female/male voice ID.
- Keeps auth-disabled behavior consistent.

**Dependencies**

- Depends on new button IDs in `config.html`.

---

### `scripts/verify-settings-ui-regression.js`

**Change**

Add regression checks for:

- New HTML button IDs:
  - `btn-preview-elevenlabs-female-voice`
  - `btn-preview-elevenlabs-male-voice`
- All three preview controls are represented in the renderer mapping.
- The shared preview helper invokes `IPC_CHANNELS.PREVIEW_ELEVENLABS_VOICE`.
- The preview path overrides `voiceId` from the mapped selector.
- `updateElevenLabsActionAvailability()` references the shared preview-control mapping or otherwise gates all three preview buttons.

**Why**

- Prevents future regressions back to `1/3` preview coverage.

**Dependencies**

- Should be updated atomically with `config.html` and `config.js`.

---

### `prompt-exports/optimize-elevenlabs-gender-preview-runs.md`

**Change**

Add one run entry documenting:

- `3/3` preview coverage.
- Voice expansion path verified as Reader `/reader/voices`.
- Extension provides auth/session capture, not voice catalog enumeration.

**Why**

- Satisfies the task-specific documentation requirement.

**Dependencies**

- Should be updated after confirming the implementation path.

---

### `src/module/ipc/tts-ipc.js`

**Change**

- No change.

**Why**

- Existing `PREVIEW_ELEVENLABS_VOICE` already supports arbitrary `config.voiceId`.

---

### `src/module/translator/elevenlabs-tts.js`

**Change**

- No change.

**Why**

- Existing synthesis and Reader voice-list paths are sufficient.

## 5. **Risks and migration**

No persistence schema or migration is required.

Main risks:

- **Wrong voice ID previewed:** avoid by always overriding `config.voiceId` from the mapped selector.
- **Auth state drift:** avoid by routing all preview buttons through `updateElevenLabsActionAvailability()`.
- **Handler duplication:** avoid by using one shared preview helper.
- **Voice expansion overclaim:** document that more voices are account/auth dependent and exposed only through Reader `/reader/voices`.

## 6. **Implementation order**

1. **Update `config.html`**
   - Add female/male preview buttons.
   - Adjust control wrappers.

2. **Update `config.js`**
   - Add preview-control mapping.
   - Add shared preview helper.
   - Replace the default-only handler.
   - Update auth gating for all preview buttons.

3. **Update `verify-settings-ui-regression.js`**
   - Add assertions for preview button presence and renderer wiring.

4. **Update optimization run artifact**
   - Add one row to `prompt-exports/optimize-elevenlabs-gender-preview-runs.md`.

5. **Run verification**
   - `npm test`
   - `npm run verify:settings-ui`
   - `npm run verify:elevenlabs-release`

6. **Manual task validation**
   - Confirm default, female, and male preview buttons synthesize using their own selected voice IDs.
   - Confirm all three preview buttons are disabled when ElevenLabs auth is not usable.
   - Refresh ElevenLabs voices and confirm all three selectors repopulate and preserve selections.


> 💡 Continue this plan conversation with ask_oracle(chat_id: "gender-preview-controls-8B4D98", new_chat: false)