# FFTrans UI Design Review — Full-Stack Visual & Interaction Audit

**Date**: 2026-04-29  
**Scope**: Overlay window (`index.html/css`) + Settings window (`config.html/css`) + Shared styles (`app.css`, `variables.css`, `theme.css`, `enhancements.css`)  
**Focus**: Visual design quality, CSS architecture, overlay readability, overdesign reduction, accessibility, actionable tweaks  
**Prior work**: Builds on the 2026-04-24 settings-only review and 2026-04-25 acceptance checklist — both are implemented and passing.

---

## Executive Summary

FFTrans has a competent, well-structured UI built on Bootstrap 5 dark-theme + vanilla JS. The 2026-04-24 refactor landed real improvements (conditional TTS sections, dirty-save indicator, tab ARIA, info-arch migration). What remains is **visual refinement** — the styling has accumulated several layers of "AI-generated design" flourishes (gradient everything, glow shadows, decorative pseudo-elements) that compete with readability instead of supporting it. The overlay window, which users stare at for hours during gameplay, needs the most restraint.

### Top 3 Takeaways
1. **Reduce the gradient/glow budget drastically** — the warm coral palette is good, but it's applied to *everything* (scrollbars, buttons, badges, headings, dividers, switches). Pick 2-3 places where accent color earns its keep and remove the rest.
2. **Consolidate the duplicated CSS variable systems** — `variables.css`, `index.css :root`, and `theme.css :root` define overlapping tokens; unify into one canonical source.
3. **The overlay toolbar buttons are too small and too animated for a gaming overlay** — increase touch targets to 36px minimum and remove the translateY/scale hover transforms that cause visual jitter over gameplay.

---

## 1. Overlay Window (index.html + index.css)

### 1.1 What Works
- Transparent body with auto-hiding header/footer is correct for a game overlay
- Dialog slide-in animation is subtle and effective
- Click-through hint toast is well-designed
- SVG icons are crisp and inline (no external image loads)

### 1.2 Problems

#### A. Button chrome is overdesigned for its context

The `.btn-icon` has **7 visual effects stacked**:
1. Semi-transparent background with backdrop-filter blur
2. Border with opacity
3. Box-shadow
4. Pseudo-element with gradient fill on hover
5. `translateY(-2px) scale(1.05)` on hover
6. Icon drop-shadow filter
7. `scale(0.95)` on active

For a toolbar button in a game overlay, this is far too much. During gameplay, the user glances at the toolbar for <1 second. The hover animation actually makes the buttons *harder* to hit because they visually shift position.

**Recommendation**: Strip to essentials:
```css
.btn-icon {
  background: rgba(30, 30, 30, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.7);
  width: 2rem;       /* was 1.8rem — below 32px minimum */
  height: 2rem;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.btn-icon:hover {
  background: rgba(255, 154, 118, 0.25);
  color: #fff;
}

.btn-icon:active {
  background: rgba(255, 154, 118, 0.4);
}

/* Remove the ::before pseudo-element entirely */
```
This drops from 7 effects to 2 (background tint + color brightening). The hover is still warm but doesn't distract from the game.

#### B. Button size is below accessibility minimums

Current `--button-size: 1.8rem` = ~29px at default font-size. WCAG 2.2 SC 2.5.8 (Target Size Enhanced) requires **44×44px**; the pragmatic minimum for desktop is **32px**. At 1.8rem the buttons are hard to hit, especially in a game overlay where cursor speed is high.

**Fix**: `--button-size: 2rem` (32px) minimum. Consider `2.25rem` (36px).

#### C. Dialog text has excessive filter effects

```css
#div-dialog p, #div-dialog span {
  filter: drop-shadow(0 2px 8px var(--color-text-shadow));
}
```

`drop-shadow` on every text span is GPU-expensive and adds visual noise. For translation text that the user reads continuously, plain text with good contrast is better. If text needs to stand out against the game background, use a text-shadow with a tight dark blur, not a filter.

**Fix**:
```css
#div-dialog p, #div-dialog span {
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  /* remove filter: drop-shadow entirely */
}
```

#### D. Dialog card hover animation is distracting

```css
#div-dialog div:hover {
  transform: translateY(-2px);
}
```

Translation bubbles lifting on hover serves no purpose — the user isn't interacting with them while reading. This creates visual jitter when the mouse passes over the overlay area.

**Fix**: Remove the `transform` on hover. Keep the border-color change if desired.

#### E. Scrollbar styling inconsistency

`app.css` applies a gradient scrollbar (`linear-gradient(180deg, #ff9a76, #ff6b6b)`) globally, but `index.css` overrides it with a subtle white scrollbar for `#div-dialog`. The global gradient scrollbar bleeds into other windows that don't override it.

**Fix**: Remove the global gradient scrollbar from `app.css`. Let each page style its own scrollbar (index already does; config already does).

### 1.3 Priority Fixes for Overlay

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1 | Simplify `.btn-icon` to background-only hover, remove `::before`, remove `translateY`/`scale` | `index.css` | 15 min |
| 2 | Increase `--button-size` to `2rem` | `index.css` | 5 min |
| 3 | Replace `filter: drop-shadow` with `text-shadow` on dialog text | `index.css` | 5 min |
| 4 | Remove dialog hover `transform` | `index.css` | 2 min |
| 5 | Remove global gradient scrollbar from `app.css` | `app.css` | 5 min |

---

## 2. Settings Window (config.html + config.css)

### 2.1 What Works (post-2024-04-24 refactor)
- Tab navigation with proper ARIA roles ✅
- Conditional TTS engine rendering ✅
- Dirty-save indicator on the save button ✅
- Setting-item card layout is clean and consistent
- Toast system replaces many `alert()` calls
- Light/dark theme toggle works across both windows

### 2.2 Remaining Visual Issues

#### A. Heading gradient text is generic "AI design"

```css
/* enhancements.css */
h1, h2, h3, h4, h5, h6 {
  background: linear-gradient(135deg, #ff9a76, #ff6b6b);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
```

Every heading in the app has a coral-to-red gradient fill. This is the single most "AI-generated design" tell in the codebase. It's visually noisy, makes headings harder to read (especially at small sizes), and doesn't serve the information hierarchy — all headings look the same.

**Recommendation**: Use solid color for headings. Reserve gradient for the app title or one hero element at most.
```css
h1, h2, h3, h4, h5, h6 {
  color: var(--text-primary);
  font-weight: 600;
  /* Remove gradient entirely */
}

/* If you want warmth on the main title only: */
.settings-title {
  color: #ff9a76;
}
```

#### B. The `<hr>` diamond decoration is excessive

```css
hr::after {
  content: '';
  width: 6px; height: 6px;
  background: linear-gradient(135deg, #ff9a76, #ff6b6b);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(255, 107, 107, 0.5);
}
```

A glowing diamond on every horizontal rule adds no information and clashes with the otherwise restrained card-based layout.

**Fix**: Remove `hr::after` entirely. Keep the gradient fade on `hr` itself — it's actually nice.

#### C. Too many backdrop-filter: blur() calls

`backdrop-filter: blur(10px)` appears on:
- `.form-select`, `.form-control`
- `textarea.form-control`
- `input.form-control[type="text"]`
- `.btn`
- `.notification`
- `#div-custom-table`
- `header, footer` (app.css — currently set to `none`, good)

Backdrop blur is expensive and has no visual effect on an opaque settings page (`bg-primary: #1a1a1a`). It only matters on the transparent overlay window.

**Fix**: Remove `backdrop-filter: blur(10px)` from all config-page elements. It only makes sense on the overlay window's buttons.

#### D. Settings cards have subtle hover but no focus indicator

`.settings-section:hover` changes border-color, but there's no `:focus-within` equivalent. Keyboard users tabbing through settings get the global `*:focus-visible` outline but no section-level highlight.

**Fix**: Add `.settings-section:focus-within { border-color: var(--border-color); }` to match hover behavior.

#### E. Form controls have hardcoded colors in enhancements.css that ignore theme tokens

```css
/* enhancements.css */
textarea.form-control {
  background: rgba(30, 30, 30, 0.5);  /* hardcoded dark */
  color: #ffffff;                       /* hardcoded white */
}
```

These don't respond to the light theme at all. The `config.css` properly uses `var(--form-bg)` and `var(--text-primary)`, but `enhancements.css` loads *after* and overrides them with hardcoded dark values.

**Fix**: Either remove the duplicate declarations from `enhancements.css` (since `config.css` already handles them correctly), or convert them to use theme tokens.

### 2.3 Priority Fixes for Settings

| # | Change | Files | Effort |
|---|--------|-------|--------|
| 1 | Remove gradient text from all headings; use solid `var(--text-primary)` | `enhancements.css` | 5 min |
| 2 | Remove `hr::after` diamond decoration | `enhancements.css` | 2 min |
| 3 | Remove `backdrop-filter` from form controls and buttons | `enhancements.css`, `config.css` | 10 min |
| 4 | Add `:focus-within` to `.settings-section` | `config.css` | 2 min |
| 5 | Fix hardcoded colors in `enhancements.css` to use theme tokens | `enhancements.css` | 15 min |

---

## 3. CSS Architecture & Token Consistency

### 3.1 Three competing `:root` blocks

| File | What it defines | Consumed by |
|------|----------------|-------------|
| `variables.css` | Spacing, colors, gradients, effects, transitions, radii, sizes | Loaded by config.html only |
| `index.css` | Same tokens as `variables.css`, plus index-specific ones | Overlay window |
| `theme.css` | `--bg-*`, `--text-*`, `--border-*`, `--form-*`, `--shadow-*`, `--scrollbar-*` + light theme overrides | config.html, other windows |

**Problem**: `variables.css` and `index.css` define the *exact same* custom properties (e.g., `--color-bg-transparent`, `--spacing-xs`). `theme.css` defines a *parallel* set of properties for the same concepts with different names (e.g., `--bg-primary` vs `--color-bg-dark`). This means:
- The same semantic meaning has 2 different variable names across the codebase
- Adding a new theme requires updating both `theme.css` and `variables.css`
- `index.html` doesn't load `theme.css` at all, so it can't respond to theme changes (though for a transparent overlay this is acceptable)

**Recommendation**:
1. **Merge `variables.css` into `theme.css`** as the canonical token file. All spacing, radii, and transition tokens go into `:root`; color tokens go into the theme blocks.
2. **Delete `variables.css`**.
3. **Rename `index.css` local `:root` tokens** to use the canonical names from `theme.css` where possible, and keep overlay-specific tokens clearly prefixed (e.g., `--overlay-button-size`).

### 3.2 Duplicate `.img-button` and `.btn-icon` classes

`app.css` defines `.img-button` (old class). `index.css` defines `.btn-icon` (new class). The config page's header still uses `<img class="img-button">` for drag and close buttons, while the overlay uses `<button class="btn-icon">`.

**Problem**: Two separate styling systems for the same concept. Config header buttons use `<img>` tags (not `<button>`), which is semantically wrong and loses keyboard focusability by default.

**Recommendation**: Convert config header to use `<button class="btn-icon">` with inline SVGs, same as the overlay. Then remove `.img-button` from `app.css`.

### 3.3 Load order causes specificity conflicts

Config page loads: `theme.css` → `bootstrap.min.css` → `app.css` → `config.css` → `enhancements.css`

`enhancements.css` loads last and overrides `config.css` with hardcoded colors (see §2.2E). Since both files have equal specificity (same selector depth), the last-loaded file wins.

**Fix**: Move enhancement-level overrides into `config.css` where they belong. `enhancements.css` should only contain truly global enhancements (scrollbar, selection color, focus-visible, reduced-motion) without duplicating form control styling.

---

## 4. Overdesign Reduction Checklist

The following effects should be evaluated for removal or simplification. Each adds visual weight without clear information value:

| Effect | Location | Verdict |
|--------|----------|---------|
| Gradient `::before` on `.btn-icon` hover | `index.css` | **Remove** — background tint is sufficient |
| `translateY(-2px) scale(1.05)` on button hover | `index.css`, `app.css`, `config.css` | **Remove** — causes visual jitter, no benefit for utility buttons |
| `box-shadow: 0 8px 20px rgba(255, 107, 107, 0.3)` on button hover | `index.css` | **Remove** — glow shadows on 28px buttons are disproportionate |
| Gradient headings | `enhancements.css` | **Remove** — use solid color |
| Diamond on `<hr>` | `enhancements.css` | **Remove** |
| Gradient scrollbar | `app.css` | **Remove** — use solid thumb color |
| `backdrop-filter: blur` on form controls | `enhancements.css`, `config.css` | **Remove** from opaque pages |
| `filter: drop-shadow` on dialog text | `index.css` | **Replace** with lightweight `text-shadow` |
| `.btn-success` orange gradient | `enhancements.css` | **Keep** — this is the accent color used intentionally |
| `.btn-save--dirty` red dot indicator | `config.css` | **Keep** — serves clear purpose |
| Dialog slide-in animation | `index.css` | **Keep** — subtle and purposeful |
| `prefers-reduced-motion` reset | `enhancements.css` | **Keep** — good practice |
| Toast entry animation | `config.css` | **Keep** — short and functional |

**The principle**: Decoration is acceptable when it communicates state (dirty dot, active tab, success/error color). Decoration that exists only for visual richness (gradient headings, glow shadows, floating buttons, diamond dividers) should be removed because it competes with the content.

---

## 5. Accessibility Audit

### 5.1 Already in place ✅
- `role="tablist"` / `role="tab"` / `aria-selected` on settings tabs
- `*:focus-visible` global outline in `enhancements.css`
- `prefers-reduced-motion` media query
- `prefers-contrast: high` border-width increase
- Keyboard arrow-key tab navigation (per acceptance checklist)

### 5.2 Gaps

| Issue | Severity | Fix |
|-------|----------|-----|
| Button size 1.8rem (29px) below 32px minimum | Medium | Increase `--button-size` to `2rem` |
| `.btn-visibility` (eye icon for password toggle) is `<img>` with no `role="button"` | Medium | Convert to `<button>` with `aria-label="Toggle visibility"` |
| Overlay buttons lack `aria-label` (rely on `title` attribute) | Low | Add `aria-label` matching `title` text |
| Config header drag handle and close are `<img>` not `<button>` | Medium | Convert to `<button>` (see §3.2) |
| `form-check-input` switches lack `aria-label` when description is in a sibling div | Low | Associate with `<label for="...">` or add `aria-labelledby` |
| Invalid HTML: `</footer class="container-fluid p-2">` in index.html line 136 | Low | Should be `</footer>` — attributes on closing tags are ignored but invalid |
| No `lang="zh"` on the html element when Chinese is selected | Low | Set dynamically via `setView()` based on config |
| Color-only status indicators (ElevenLabs pills) lack text/icon backup | Low | Already have text labels; acceptable |

### 5.3 Quick Wins
```html
<!-- index.html: fix invalid closing tag -->
</footer>  <!-- was: </footer class="container-fluid p-2"> -->

<!-- index.html: add aria-labels to buttons -->
<button id="img-button-drag" class="btn-icon" title="Drag" aria-label="Drag window">
```

---

## 6. Light Theme Quality

The `[data-theme="light"]` block in `theme.css` is well-structured but several components don't respond to it:

| Component | Problem |
|-----------|---------|
| `enhancements.css` form controls | Hardcoded `rgba(30, 30, 30, 0.5)` background, `#ffffff` text |
| `enhancements.css` heading gradients | Gradient colors are fixed, not theme-aware |
| `custom.css` table styles | Hardcoded dark colors |
| Scrollbar thumb in `app.css` | Fixed coral gradient doesn't change in light mode |
| `enhancements.css` notification | Fixed `rgba(20, 20, 20, 0.95)` background |

**Fix**: Audit every file except `index.css` (overlay is always dark/transparent) for hardcoded color values and replace with `var(--theme-token)` references.

---

## 7. Prioritized Action Plan

### Phase 1: Quick visual cleanup (≤ 2 hours)

These are all CSS-only changes with zero risk of breaking functionality:

1. **Remove gradient headings** — `enhancements.css`, delete the `h1-h6` gradient rule
2. **Remove `hr::after` diamond** — `enhancements.css`
3. **Simplify `.btn-icon` hover** — `index.css`, remove `::before`, remove `translateY`/`scale`, simplify to background tint
4. **Increase button size** — `index.css`, `--button-size: 2rem`
5. **Replace `drop-shadow` filter with `text-shadow`** — `index.css`
6. **Remove dialog hover transform** — `index.css`
7. **Remove gradient scrollbar from `app.css`**
8. **Fix `</footer>` closing tag** — `index.html`

### Phase 2: Token consolidation (half day)

9. **Merge `variables.css` into `theme.css`** — unify the two token systems
10. **Remove `backdrop-filter` from opaque-page elements** — `enhancements.css`, `config.css`
11. **Fix hardcoded colors in `enhancements.css`** to use theme tokens
12. **Add `:focus-within` to `.settings-section`** — `config.css`

### Phase 3: Semantic HTML cleanup (half day)

13. **Convert config header `<img>` buttons to `<button>` with inline SVG** — `config.html`
14. **Remove `.img-button` class from `app.css`** after conversion
15. **Add `aria-label` to overlay buttons** — `index.html`
16. **Associate form switches with labels** — `config.html`

### Phase 4: Future considerations (not urgent)

17. Replace remaining `alert()` calls with toast (some may still exist in edge paths)
18. Add CSS container queries for settings page responsive behavior
19. Consider reducing the number of CSS files (merge `custom.css`, `dictionary.css`, etc. into their respective page CSS or into `app.css`)

---

## 8. Design Token Reference (Proposed Canonical Set)

After merging `variables.css` into `theme.css`, the canonical token set should be:

```css
:root {
  /* Spacing (non-theme, same in light/dark) */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;

  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-pill: 999px;

  /* Transitions */
  --ease-default: 0.2s ease;
  --ease-smooth: 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  /* Accent (same for both themes) */
  --accent: #ff6b6b;
  --accent-warm: #ff9a76;
  --accent-gradient: linear-gradient(135deg, #ff6b6b, #ee5a6f);

  /* Sizing */
  --icon-sm: 16px;
  --icon-md: 20px;
  --btn-size: 2rem;
  --scrollbar-w: 6px;
}

/* Dark theme (default) */
:root {
  --bg-primary: #1a1a1a;
  --bg-surface: rgba(255, 255, 255, 0.03);
  --bg-elevated: rgba(255, 255, 255, 0.05);
  --bg-hover: rgba(255, 255, 255, 0.08);
  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.7);
  --text-disabled: rgba(255, 255, 255, 0.4);
  --border-default: rgba(255, 255, 255, 0.15);
  --border-subtle: rgba(255, 255, 255, 0.08);
  --shadow-default: rgba(0, 0, 0, 0.3);
}

/* Light theme */
[data-theme="light"] {
  --bg-primary: #f5f5f5;
  --bg-surface: rgba(0, 0, 0, 0.03);
  --bg-elevated: rgba(0, 0, 0, 0.05);
  --bg-hover: rgba(0, 0, 0, 0.08);
  --text-primary: rgba(0, 0, 0, 0.87);
  --text-secondary: rgba(0, 0, 0, 0.6);
  --text-disabled: rgba(0, 0, 0, 0.38);
  --border-default: rgba(0, 0, 0, 0.15);
  --border-subtle: rgba(0, 0, 0, 0.08);
  --shadow-default: rgba(0, 0, 0, 0.1);
}
```

This flattens ~60 variables across 3 files into ~30 canonical tokens in 1 file.

---

## Appendix: File Impact Matrix

| File | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| `index.html` | ✏️ fix `</footer>` | | ✏️ add `aria-label` |
| `index.css` | ✏️ simplify buttons, text, hover | | |
| `app.css` | ✏️ remove gradient scrollbar | | ✏️ remove `.img-button` |
| `config.css` | | ✏️ remove `backdrop-filter`, add `:focus-within` | |
| `config.html` | | | ✏️ convert header buttons |
| `enhancements.css` | ✏️ remove gradients, diamond | ✏️ fix hardcoded colors | |
| `variables.css` | | ✏️ delete (merge into `theme.css`) | |
| `theme.css` | | ✏️ absorb `variables.css` tokens | |

---

*This report is analysis-only. No code changes were made.*
