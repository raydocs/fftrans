# Optimize: ElevenLabs per-gender preview controls and voice catalog path

**Metric:** settings preview coverage for configured ElevenLabs voice selectors (# preview buttons wired / # voice selectors) plus voice catalog capability status
**Stop criterion:** 3/3 ElevenLabs voice selectors have working preview controls, settings/release verification passes, and ElevenReader voice expansion path is verified/documented
**Scope:** ElevenLabs settings UI (`src/html/config.html`, `src/html/config.js`), TTS preview IPC reuse, settings verification scripts; no runtime TTS routing changes unless required for preview correctness

## Runs

| # | Change | Preview coverage | Voice catalog status | Notes |
|---|---|---:|---|---|
| baseline | Current settings after gender routing implementation | 1/3 wired preview controls | Static curated list has 112 `<option>` entries; dynamic Reader voice refresh path exists via `/reader/voices` | Baseline script: default preview present, female/male preview buttons absent; `elevenlabs-tts.js` has Reader voices endpoint |
| 1 | Added female/male NPC preview buttons and shared selector-driven preview helper | 3/3 wired preview controls | Authenticated refresh uses ElevenReader `https://api.elevenlabs.io/v1/reader/voices`; bundled extension supplies auth/session material only, not a separate voice inventory | Dynamic refresh continues to rebuild/preserve default/female/male select values via shared select list helpers; runtime NPC routing unchanged |
