## Final Prompt
<taskname="MSQ gender routing"/>
<task>Propose and implement exactly one next optimization for MSQ gender-aware ElevenLabs auto-play: add runtime speaker-gender voice routing using measured ConsoleGamesWiki-derived data. When NPC speaker name is known, switch between configured female/male ElevenLabs voices; when unknown/not covered/non-NPC, fall back to existing default voice behavior. Keep this as one attributable iteration only.</task>

<architecture>
- Dialog ingestion and autoplay trigger:
  - `src/module/fix/fix-entry.js` builds `dialogData` (`name`, `code`, `audioText`) and calls `dialogModule.updateDialog`.
  - `src/module/system/dialog-module.js` enqueues autoplay in `saveDialog` for NPC channels and currently calls `ttsService.getConfiguredAudioUrlProgressiveWithFallback(dialogData.audioText, dialogData.translation.from, { config, ... })` without speaker metadata.
- TTS dispatch:
  - `src/module/system/tts-service.js` routes by `indexWindow.ttsEngine`; ElevenLabs path delegates to `elevenlabs-tts` with optional config override.
- ElevenLabs synthesis and config usage:
  - `src/module/translator/elevenlabs-tts.js` reads voice from `config.voiceId` during synthesis and cache-key generation.
- Config persistence/UI:
  - `src/module/system/config-module.js` defines/persists defaults under `api.elevenlabs`.
  - `src/html/config.html` contains curated recommended female/male voice options in the ElevenLabs voice select.
  - `src/html/config.js` maps form controls to saved config via `getOptionList`/save/load flow.
- IPC/constants:
  - `src/module/ipc/tts-ipc.js` and `src/constants/index.js` provide TTS config/test channels (context for compatibility).
- Measurement artifacts:
  - `prompt-exports/analyze-msq-gender-coverage.js` produces `lookupMap` and report.
  - `prompt-exports/msq-gender-coverage.json` includes 259/287 (90.24%) male/female quest-giver coverage baseline data.
  - `prompt-exports/optimize-msq-gender-voice-runs.md` defines metric and stop criteria.
</architecture>

<selected_context>
prompt-exports/optimize-msq-gender-voice-runs.md: Baseline run and stop criterion (>=90% coverage, lookup p95 <1ms, tests pass).
prompt-exports/analyze-msq-gender-coverage.js: Coverage computation logic and `lookupMap` construction pattern.
prompt-exports/msq-gender-coverage.json: Concrete source dataset; includes totals and `resolved` entries with `name`+`gender`.
src/module/fix/fix-entry.js: Upstream source of `dialogData.name/code/audioText` used before autoplay.
src/module/system/dialog-module.js: Autoplay integration point; has NPC gate and currently lacks speaker-aware TTS options.
src/module/system/tts-service.js: Engine dispatcher; supports option/config pass-through.
src/module/translator/elevenlabs-tts.js: Effective voice selection point (`voiceId` use) and cache key behavior.
src/module/system/config-module.js: Default/persisted ElevenLabs fields; place to add gender-specific voice IDs and fallback semantics.
src/html/config.html: Existing recommended female/male voice options (currently one selected `voiceId`).
src/html/config.js: Config load/save mappings; place to expose/persist new gender voice fields.
src/module/ipc/tts-ipc.js: TTS config/test handlers to keep preview/test behavior compatible after config shape changes.
src/constants/index.js: Shared constants and channel references.
package.json: Canonical test/lint/verify commands.
scripts/verify-elevenlabs-release.js: Release file contract check.
scripts/verify-settings-ui-regression.js: Settings UI contract check.
</selected_context>

<relationships>
- `fix-entry.addTask/entry` -> constructs `dialogData` -> `dialog-module.updateDialog/saveDialog`.
- `dialog-module.saveDialog` NPC branch -> `enqueueDialogPlayback` -> `tts-service.getConfiguredAudioUrlProgressiveWithFallback`.
- `tts-service` (engine=elevenlabs) -> `elevenlabs-tts.getAudioUrlProgressive` -> `synthesizeSpeech` uses `config.voiceId`.
- `config.html` controls + `config.js` option mapping -> `config-module` persisted `api.elevenlabs` values consumed by runtime TTS path.
- Coverage report (`msq-gender-coverage.json`) can be transformed into a runtime name->gender lookup used before ElevenLabs call.
</relationships>

<task_constraints>
- One change only: runtime gender-aware ElevenLabs routing backed by measured wiki dataset, with fallback to existing default voice.
- Do not broaden into multi-feature refactors.
- Target outcome: move runtime switching from 0% toward measured coverage while preserving existing behavior for unknown names.
</task_constraints>

<risks>
- Name normalization mismatch (punctuation/case/diacritics/aliases) may reduce effective runtime hit-rate below source 90.24%.
- Cache fragmentation risk if gender switching changes effective voice keys per line; verify expected behavior.
- UI/config migration risk when adding new fields; must preserve existing single `voiceId` fallback and backward compatibility.
- Non-NPC and uncovered-NPC lines must remain on default voice to avoid regressions.
</risks>

<verification>
- Coverage/data sanity:
  - `node prompt-exports/analyze-msq-gender-coverage.js`
- Required project checks:
  - `npm test`
  - `npm run verify:elevenlabs-release`
  - `npm run verify:settings-ui`
- Runtime validation to add in this iteration:
  - Log/assert chosen voice path for representative NPC names with male/female/unknown cases and confirm fallback behavior.
  - Measure local lookup latency (Map/object) and report p95 < 1ms.
</verification>

<ambiguities>
- None on integration point: runtime has speaker name available in `dialogData`, and autoplay call site is in `dialog-module`.
- Design choice left to implementer: where to store runtime lookup artifact (generated compact map file vs deriving from selected JSON at build/dev time), as long as lookup is local and fast.
</ambiguities>

## Selection
- Files: 16 total (16 full)
- Total tokens: 103179 (Auto view)
- Token breakdown: full 103179

### Files
### Selected Files
/Users/ruirui/Downloads/GitHub/fftrans/
├── prompt-exports/
│   ├── analyze-msq-gender-coverage.js — 2,345 tokens (full)
│   ├── msq-gender-coverage.json — 22,173 tokens (full)
│   └── optimize-msq-gender-voice-runs.md — 285 tokens (full)
├── scripts/
│   ├── verify-elevenlabs-release.js — 436 tokens (full)
│   └── verify-settings-ui-regression.js — 1,742 tokens (full)
├── src/
│   ├── constants/
│   │   └── index.js — 2,062 tokens (full)
│   ├── html/
│   │   ├── config.html — 25,464 tokens (full)
│   │   └── config.js — 25,797 tokens (full)
│   └── module/
│       ├── fix/
│       │   └── fix-entry.js — 1,626 tokens (full)
│       ├── ipc/
│       │   └── tts-ipc.js — 5,550 tokens (full)
│       ├── system/
│       │   ├── config-module.js — 4,248 tokens (full)
│       │   ├── dialog-module.js — 1,995 tokens (full)
│       │   └── tts-service.js — 1,760 tokens (full)
│       └── translator/
│           └── elevenlabs-tts.js — 5,681 tokens (full)
├── CLAUDE.md — 954 tokens (full)
└── package.json — 1,061 tokens (full)


---

## Generated Plan

## Chat Send ✅
- **Chat**: `msq-gender-routing-BB200B` | **Mode**: plan

### Response
## Summary

Add one targeted optimization: route ElevenLabs NPC auto-play through a local ConsoleGamesWiki-derived `speaker name → gender` lookup, overriding only the effective ElevenLabs `voiceId` for covered male/female NPC speakers. Unknown speakers, uncovered names, non-NPC channels, non-ElevenLabs engines, and failed lookups must preserve the current default voice behavior. This should be implemented as a localized runtime routing layer in the existing TTS dispatch path, plus additive ElevenLabs config/UI fields for female and male voice IDs.

## Current-state analysis

- `src/module/fix/fix-entry.js`
  - Owns dialog ingestion/translation flow.
  - Produces `dialogData` with `name`, `code`, `audioText`, `translation`.
  - Calls `dialogModule.updateDialog(dialogData)`.
  - It already preserves the original speaker name in `dialogData.name`; translated speaker name is separate as `dialogData.translatedName`.

- `src/module/system/dialog-module.js`
  - Owns dialog display, log persistence, and NPC auto-play trigger.
  - `saveDialog(dialogData)` auto-plays only first-time saved NPC lines:
    ```js
    !cachedLog[item.id] && npcChannel.includes(dialogData.code) && dialogData.audioText !== ''
    ```
  - Auto-play enters `enqueueDialogPlayback(dialogData, config)`, which calls:
    ```js
    ttsService.getConfiguredAudioUrlProgressiveWithFallback(
      dialogData.audioText,
      dialogData.translation.from,
      { config, onError }
    )
    ```
  - Blocking issue: no speaker metadata is passed into TTS, so TTS cannot select a voice by NPC identity.

- `src/module/system/tts-service.js`
  - Owns engine selection from `config.indexWindow.ttsEngine`.
  - Dispatches ElevenLabs through `elevenLabsTTS.getAudioUrlProgressive(...)`.
  - Existing options/config pass-through is the best extension point because it can apply an effective ElevenLabs config override without mutating persisted config.

- `src/module/translator/elevenlabs-tts.js`
  - Uses `config.voiceId` for synthesis.
  - Cache key already includes `voiceId`, so male/female routing naturally avoids cache collisions.
  - No synthesis changes are required if `tts-service` supplies an effective config with the routed `voiceId`.

- `src/module/system/config-module.js`
  - `defaultConfig.api.elevenlabs` is the correct ownership location for new persisted ElevenLabs routing fields.
  - Existing `normalizeConfigShape()` automatically adds missing default fields to old configs.

- `src/html/config.html` and `src/html/config.js`
  - Existing ElevenLabs voice select contains curated female/male choices.
  - `config.js:getOptionList()` is the authoritative renderer config save/load mapping.
  - New female/male voice controls should reuse the existing voice option list rather than duplicating large HTML option groups.

- Measurement artifacts
  - `prompt-exports/msq-gender-coverage.json` has 259/287 covered MSQ quest givers, 90.24%.
  - `prompt-exports/analyze-msq-gender-coverage.js` already demonstrates local `Map` lookup p95 below 1ms.
  - These should become a checked-in compact runtime lookup artifact, not a network lookup.

## Design

### 1. Runtime speaker gender lookup

Add a new local module:

**File:** `src/module/system/msq-speaker-gender.js`  
**Kind:** CommonJS module/service.

Responsibilities:

- Load a checked-in compact JSON artifact once.
- Build in-memory lookup maps.
- Normalize speaker names consistently.
- Return only `male`, `female`, or `null`.

Data artifact:

**File:** `src/data/text/cache/msq-speaker-gender.json`

Shape:

```js
{
  schemaVersion: 1,
  source: {
    report: "prompt-exports/msq-gender-coverage.json",
    coveragePercent: 90.24,
    genderCovered: 259,
    uniqueQuestGivers: 287
  },
  gendersByName: {
    "Alphinaud": "male",
    "Alisaie": "female"
  }
}
```

Generation rule:

- Source is `prompt-exports/msq-gender-coverage.json`.
- Include every `characters[]` entry whose `gender` is exactly `male` or `female`.
- Do not include `unresolved[]`.
- Preserve display names as JSON keys for auditability.

Lookup behavior:

```js
lookupSpeakerGender(name) -> {
  gender: "male" | "female",
  matchedName: string,
  matchType: "exact" | "loose"
} | null
```

Normalization:

- Exact key:
  - `String(name)`
  - `normalize('NFKC')`
  - lowercase
  - normalize curly apostrophes to `'`
  - collapse whitespace
  - trim
- Loose key:
  - same as exact key
  - remove punctuation/symbols
  - collapse whitespace
  - trim

Lookup order:

1. exact normalized map
2. loose normalized map
3. `null`

Failure behavior:

- If the JSON file is missing, invalid, or has an unexpected schema, log one warning and return `null` for all lookups.
- Never throw from lookup during TTS playback.

### 2. ElevenLabs config additions

Modify `defaultConfig.api.elevenlabs` in `src/module/system/config-module.js` additively:

```js
genderVoiceRoutingEnabled: true,
femaleVoiceId: "EXAVITQu4vr4xnSDxMaL",
maleVoiceId: "nPczCjzI2devNBz1zQrb"
```

Semantics:

- `voiceId` remains the default/fallback voice.
- `femaleVoiceId` is used only for covered female NPC speakers.
- `maleVoiceId` is used only for covered male NPC speakers.
- If routing is disabled, missing voice ID, unknown speaker, uncovered speaker, or non-NPC, use `voiceId`.

Migration:

- Existing configs automatically receive defaults via `normalizeConfigShape()`.
- No destructive migration is needed.
- Old code reading new config should ignore the extra fields.

### 3. TTS routing flow

Modify `src/module/system/dialog-module.js` only to pass speaker metadata into TTS:

```js
speaker: {
  name: dialogData.name,
  code: dialogData.code,
  isNpc: npcChannel.includes(dialogData.code)
}
```

Do not move the NPC gate; `saveDialog()` should remain the autoplay ownership point.

Modify `src/module/system/tts-service.js` to apply routing only when all conditions match:

- configured engine is `elevenlabs`
- `options.speaker.isNpc === true`
- `config.api.elevenlabs.genderVoiceRoutingEnabled !== false`
- speaker gender lookup returns `male` or `female`
- corresponding configured voice ID is non-empty

Effective config pseudocode:

```js
if (engine !== "elevenlabs") return originalOptions;
if (!speaker?.isNpc) return originalOptions;

match = msqSpeakerGender.lookupSpeakerGender(speaker.name);
if (!match) return originalOptions;

baseElevenLabsConfig = config.api.elevenlabs;
voiceId = match.gender === "female"
  ? baseElevenLabsConfig.femaleVoiceId
  : baseElevenLabsConfig.maleVoiceId;

if (!voiceId) return originalOptions;

return {
  ...options,
  configOverride: {
    ...baseElevenLabsConfig,
    voiceId
  },
  routingMeta: {
    source: "msq-speaker-gender",
    speakerName: speaker.name,
    gender: match.gender,
    voiceId
  }
};
```

Important constraints:

- Do not mutate `config`.
- Do not change `elevenlabs-tts.js` voice selection; it should continue consuming `config.voiceId`.
- Existing Google fallback remains unchanged if ElevenLabs synthesis fails.
- Cache fragmentation is expected and correct because `elevenlabs-tts.js` cache key already includes `voiceId`.

Optional validation logging:

- Add a gated debug log only when `process.env.FFTRANS_TTS_ROUTING_DEBUG === '1'`.
- Log selected route for covered speakers and fallback reason for unknown/uncovered speakers.
- Do not emit logs by default during normal gameplay.

### 4. Settings UI

Modify `src/html/config.html` inside the ElevenLabs section near the existing voice select:

Add:

- Routing enable switch:
  - `id="checkbox-elevenlabs-gender-voice-routing"`
- Female NPC voice select:
  - `id="select-elevenlabs-female-voice-id"`
- Male NPC voice select:
  - `id="select-elevenlabs-male-voice-id"`

Do not duplicate the long static option groups manually.

Modify `src/html/config.js`:

- Add an initializer before `readConfig()`:
  ```js
  initializeElevenLabsGenderVoiceSelects()
  ```
- It should clone options from `select-elevenlabs-voice-id` into the female/male selects before `readOptions(config)` runs.
- Update dynamic voice refresh so `loadElevenLabsVoices()` rebuilds all three ElevenLabs voice selects while preserving each current value.
- Add `getOptionList()` mappings:
  ```js
  ['checkbox-elevenlabs-gender-voice-routing', 'checked']
    -> ['api', 'elevenlabs', 'genderVoiceRoutingEnabled']

  ['select-elevenlabs-female-voice-id', 'value']
    -> ['api', 'elevenlabs', 'femaleVoiceId']

  ['select-elevenlabs-male-voice-id', 'value']
    -> ['api', 'elevenlabs', 'maleVoiceId']
  ```

Preview/test compatibility:

- Existing ElevenLabs preview button continues previewing `select-elevenlabs-voice-id`.
- Unified TTS test continues testing the default ElevenLabs voice.
- Do not add per-gender preview buttons in this iteration.

### 5. Measurement and reproducibility

Modify `prompt-exports/analyze-msq-gender-coverage.js` additively:

- Add optional CLI flag:
  ```bash
  --runtime-output src/data/text/cache/msq-speaker-gender.json
  ```
- When present, write the compact runtime artifact from the same resolved `characters` data.
- Keep the existing default report behavior unchanged.

Update `prompt-exports/optimize-msq-gender-voice-runs.md` with exactly one new run row:

- Change: runtime speaker-gender ElevenLabs voice routing.
- Coverage: 90.24% source coverage unless regenerated data changes.
- Lookup p95: measured local lookup p95 after implementation.
- Notes: unknown/uncovered/non-NPC fallback to default voice.

## File-by-file impact

### `src/data/text/cache/msq-speaker-gender.json`

- Add compact runtime lookup artifact.
- Derived from `prompt-exports/msq-gender-coverage.json`.
- Required for local offline routing.

Depends on:

- Optional generator changes in `prompt-exports/analyze-msq-gender-coverage.js`.

### `src/module/system/msq-speaker-gender.js`

- Add new lookup module.
- Owns JSON loading, normalization, exact/loose maps, and safe lookup API.

Depends on:

- `src/data/text/cache/msq-speaker-gender.json`.

### `src/module/system/config-module.js`

- Add default fields under `api.elevenlabs`:
  - `genderVoiceRoutingEnabled`
  - `femaleVoiceId`
  - `maleVoiceId`

Depends on:

- UI controls and TTS routing consuming the same field names.

### `src/module/system/dialog-module.js`

- Pass speaker metadata into `ttsService.getConfiguredAudioUrlProgressiveWithFallback(...)`.
- Keep existing NPC autoplay gate unchanged.

Depends on:

- `tts-service` accepting `options.speaker`.

### `src/module/system/tts-service.js`

- Require `msq-speaker-gender`.
- Add ElevenLabs-only routing helper.
- Apply effective `configOverride` before calling ElevenLabs progressive synthesis.
- Preserve fallback behavior for all non-matching cases.

Depends on:

- Config defaults.
- Runtime lookup module.
- Speaker metadata from `dialog-module`.

### `src/html/config.html`

- Add routing enable checkbox and female/male voice selects in ElevenLabs settings.
- Do not duplicate option groups; empty selects are populated by `config.js`.

Depends on:

- `config.js` initializer and save/load mappings.

### `src/html/config.js`

- Populate female/male selects from the existing ElevenLabs voice select before `readConfig()`.
- Save/load new config fields in `getOptionList()`.
- Update ElevenLabs dynamic voice refresh to preserve/rebuild all three voice selects.

Depends on:

- New HTML element IDs.
- Config default fields.

### `prompt-exports/analyze-msq-gender-coverage.js`

- Add optional runtime artifact output.
- Reuse existing resolved `characters` data.

Depends on:

- Runtime artifact schema.

### `prompt-exports/optimize-msq-gender-voice-runs.md`

- Add one run row for this iteration.

Depends on:

- Implemented lookup p95 measurement.

### `scripts/verify-elevenlabs-release.js`

- Add `src/data/text/cache/msq-speaker-gender.json` to required release files so packaged builds include the runtime lookup.

### `scripts/verify-settings-ui-regression.js`

- Add assertions that:
  - new HTML IDs exist
  - new controls are mapped in `getOptionList()`
  - advanced disclosure behavior remains unchanged

## Risks and migration

- **Name mismatch risk:** mitigated with exact and loose normalization.
- **Config migration risk:** additive defaults only; old configs receive new fields automatically.
- **Cache fragmentation:** expected because voice ID is part of the cache key.
- **Behavior change:** covered NPCs on ElevenLabs now use gender voices by default; unknown/uncovered/non-NPC behavior remains unchanged.
- **Rollback:** older builds should ignore the new config fields; no schema downgrade needed.

## Implementation order

1. Add `src/data/text/cache/msq-speaker-gender.json` from current coverage report.
2. Add `src/module/system/msq-speaker-gender.js` and validate lookup locally with representative names:
   - `Alphinaud -> male`
   - `Alisaie -> female`
   - unknown name -> `null`
3. Add config defaults in `config-module.js`.
4. Add UI controls in `config.html`.
5. Add `config.js` option cloning, save/load mappings, and dynamic voice-list preservation.
6. Pass speaker metadata from `dialog-module.js`.
7. Apply ElevenLabs-only effective config override in `tts-service.js`.
8. Add optional runtime artifact generation to `analyze-msq-gender-coverage.js`.
9. Update verification scripts and optimization run log.
10. Run:
    ```bash
    node prompt-exports/analyze-msq-gender-coverage.js
    npm test
    npm run verify:elevenlabs-release
    npm run verify:settings-ui
    ```
11. Runtime-check with `FFTRANS_TTS_ROUTING_DEBUG=1`:
    - covered male NPC routes to `maleVoiceId`
    - covered female NPC routes to `femaleVoiceId`
    - uncovered NPC falls back to `voiceId`
    - non-NPC never routes by gender


> 💡 Continue this plan conversation with ask_oracle(chat_id: "msq-gender-routing-BB200B", new_chat: false)