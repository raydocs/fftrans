# Optimize: MSQ gender-aware ElevenLabs voice routing

**Metric:** wiki-derived MSQ quest-giver gender coverage (% unique quest givers with male/female) and local voice lookup p95 (ms)
**Stop criterion:** ≥90% wiki gender coverage for MSQ quest givers, local lookup p95 < 1ms, existing tests pass, oracle satisfied
**Scope:** ElevenLabs NPC auto-play path (`src/module/system/dialog-module.js`, `src/module/system/tts-service.js`, `src/module/translator/elevenlabs-tts.js`), config defaults/UI as needed, local gender profile data derived from ConsoleGamesWiki MSQ pages

## Runs

| # | Change | Coverage | Lookup p95 | Notes |
|---|---|---:|---:|---|
| baseline | Current app: one global ElevenLabs voice; measurement script scraped linked ConsoleGamesWiki MSQ collection pages only | 0% runtime voice switching; source data 259/287 unique quest givers (90.24%) | 0.000584ms local Map lookup | `node prompt-exports/analyze-msq-gender-coverage.js`; source pages include Main Scenario collection links discovered from `Main_Scenario_Quests`; current runtime does not use speaker gender |
| 1 | Local ConsoleGamesWiki-derived MSQ speaker gender lookup routes covered NPC ElevenLabs auto-play to configured female/male voice IDs | source data 259/287 unique quest givers (90.24%); covered NPC runtime routes by gender | 0.000542ms runtime lookup | Unknown/uncovered/non-NPC cases fall back to `api.elevenlabs.voiceId`; routing can be disabled with `genderVoiceRoutingEnabled` |
