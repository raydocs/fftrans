# Optimize: UI/UX design quality

**Metric:** Oracle-audited actionable P1/P2 UI/UX issue count in scoped Electron UI files.
**Stop criterion:** 0 remaining actionable P1/P2 UI/UX issues, or oracle says remaining ideas are subjective/diminishing returns.
**Scope:** `src/html/index.html`, `src/html/css/index.css`, `src/html/config.html`, `src/html/config.js`, `src/html/css/config.css`, `src/html/css/app.css`, `src/html/css/enhancements.css`, `src/html/css/theme.css`.

## Baseline issue list

1. P1 — `index.css`: overlay controls can be keyboard-focusable while visually hidden.
2. P1 — `config.html`/`config.js`: many settings controls lack programmatic label association.
3. P2 — `config.css`: visibility toggle hit targets are only 20×20px.
4. P2 — `enhancements.css`: global `[title]` rule changes interactive cursor to `help`.
5. P2 — `config.html`/`config.js`: `href="#"` action links can trigger default hash navigation.
6. P2 — `index.html`/`config.html`: decorative SVG icons not consistently hidden from assistive tech.
7. P2 — `enhancements.css`: select option styling hardcodes dark colors.

## Runs

| # | Change | Remaining P1/P2 Issues | Readiness | Notes |
|---|---|---:|---:|---|
| baseline | Current UI after prior cleanup | 7 | 8/10 | Oracle baseline: 2 P1 + 5 P2 actionable issues. |
| 1 | Focus-aware overlay auto-hide in `index.css` resolves P1 #1 | 6 | 8/10 | Header/footer auto-hide now exempts the focused container via `:focus-within`; remaining baseline issues #2-#7. |
| 2 | Programmatic config control label hydration resolves P1 #2 | 5 | 8/10 | Visible settings inputs/selects/textareas now preserve explicit names and receive deterministic `aria-labelledby` from nearest setting, nested, or dynamic channel labels; remaining baseline issues #3-#7. |
| 3 | Visibility toggle hit targets in `config.css` resolve P2 #3 | 4 | 8/10 | `.btn-visibility` is now a 2.75rem square while the icon remains 1.25rem and centered; remaining baseline issues #4-#7. |
| 4 | Scoped titled-element help cursor in `enhancements.css` resolves P2 #4 | 3 | 8/10 | `[title]` help cursor now excludes native controls, ARIA button/link roles, focusable elements, and editable content; remaining baseline issues #5-#7. |
| 5 | Idempotent config hash-action link guard in `config.js` resolves P2 #5 | 2 | 8/10 | `a[href="#"]` actions now prevent default hash navigation without replacing handlers or stopping propagation; remaining baseline issues #6-#7. |
| 6 | Decorative SVG hiding in `index.html`/`config.html` resolves P2 #6 | 1 | 8/10 | Inline decorative SVGs now use `aria-hidden="true"`/`focusable="false"` and about icon anchors are named by existing labels; remaining baseline issue #7. |
| 7 | Theme-aware select option styling in `enhancements.css` resolves P2 #7 | 0 | 9/10 | Native select option/optgroup colors now use existing theme tokens with safe fallbacks, with a light-theme optgroup text override; baseline P1/P2 list is resolved pending final oracle stop confirmation. |
