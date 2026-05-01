# Optimize: Upstream sync and Gemini glossary support

**Metric:** Gemini translation request preparation overhead (median/p95 ms), payload size, and feature coverage for glossary/name-preservation behavior.
**Stop criterion:** Apply upstream compatibility updates; integrate Gemini glossary only if benchmark overhead is negligible and local fork behavior is preserved.
**Scope:** upstream data/signature deltas, package dependency deltas, Gemini prompt/payload logic, validation scripts.

## Runs

| # | Change | Median | p95 | Notes |
|---|---|---|---|---|
| baseline | local Gemini prompt-only request preparation | pending | pending | benchmark to be added/run before integration |
