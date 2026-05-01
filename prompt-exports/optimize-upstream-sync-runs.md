# Optimize: Upstream sync and Gemini glossary support

**Metric:** Gemini translation request preparation overhead (median/p95 ms), payload size, and feature coverage for glossary/name-preservation behavior.
**Stop criterion:** Apply upstream compatibility updates; integrate Gemini glossary only if benchmark overhead is negligible and local fork behavior is preserved.
**Scope:** upstream data/signature deltas, package dependency deltas, Gemini prompt/payload logic, validation scripts.

## Runs

| # | Change | Median | p95 | Notes |
|---|---|---|---|---|
| baseline | local Gemini prompt-only request preparation | 0.006235 ms/op | 0.006379 ms/op | `node scripts/benchmark-gemini-glossary.js --samples=200 --batch=1000`; payload 878 bytes; benchmark imports production prompt/glossary functions |
| glossary | upstream-style Gemini `{text, glossary}` request preparation | 0.008811 ms/op | 0.009328 ms/op | payload 2186 bytes; overhead +0.002576 median / +0.002949 p95 ms/op, +1308 bytes |

## 2026-05-01 upstream-sync iteration

- Decision: integrate Gemini glossary support because request-prep overhead is ~0.0026 ms/op in the production-function support benchmark and behavior improves terminology control.
- Integration constraints: kept local Gemini streaming, proxy agents/config, safe response extraction, and local name-preservation prompt rules. Also forwarded glossary tables through normal translation, streaming Gemini, and the multi-line batcher path.
- Data strategy: signatures copied from upstream; `other.json` and `system.json` merged by key so upstream changed/new entries are included while local-only fork rows remain. `DOCUMENT END` remains the final row.
- Dependency strategy: updated low-risk shared runtime dependencies (`@google-cloud/vision`, `axios`) and lockfile via `npm install`; skipped upstream package metadata/removals and major dev-tool/Electron upgrades for this measured pass.
- Validation: targeted `node --check` + ESLint for touched JS passed; `npm test` passed; `git diff --check` passed; touched JSON/package files parse successfully. Independent rerun after the multi-line batcher table-forwarding fix and glossary row filtering fix also passed, including a direct glossary filter check.
