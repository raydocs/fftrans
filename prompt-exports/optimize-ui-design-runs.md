# Optimize: UI design review cleanup

**Metric:** Remaining review-flagged objective UI issues in scoped UI files (count). Count includes stale overdesign patterns and non-semantic image controls flagged by the review.
**Stop criterion:** 0 remaining objective issues, or oracle says remaining improvements are subjective/diminishing returns.
**Scope:** `src/html/config.html`, `src/html/config.js`, `src/html/css/config.css`, `src/html/css/app.css`, `src/html/css/enhancements.css`, `src/html/css/index.css`, `src/html/index.html`.

## Measurement commands

- Overdesign/stale-pattern count: search scoped files for `translateY(-2px)`, `scale(1.05)`, `hr::after`, `background-clip`, `-webkit-text-fill-color`, `drop-shadow(0 6px`, invalid `</footer class`, and config-header `<img id="img-button-*">`.
- Opaque-page blur count: search scoped CSS for `backdrop-filter: blur(`. The one remaining `index.css` match is allowed because the transparent overlay button blur is intentional.
- Non-semantic visibility control count: search `src/html/config.html` for literal `<img class="btn-visibility"`.

## Runs

| # | Change | Remaining Issues | Notes |
|---|---|---:|---|
| baseline | Current post-review cleanup state | 10 | Static search: 0 stale overdesign/config-header issues, 1 allowed overlay blur, 10 `<img class="btn-visibility">` controls remaining in `config.html`. |
| 1 | Semantic visibility toggle buttons | 0 | Replaced visibility image controls with native button controls containing decorative icons. Static search for literal `<img class="btn-visibility"` in `src/html/config.html`: 0. |
