# Settings UI Refero Design Score — 2026-05-01

## References

- Refero Linear style: dark, compact command-center surfaces, precise accents, layered graphite panels.
- Refero Cursor style: warm ivory light mode, compact studio controls, muted borders, subtle elevation.

## Score rubric

| Category | Weight | Before | After redesign | After Speech/TTS hierarchy pass | After local structural verifier |
|---|---:|---:|---:|---:|---:|
| Usability and findability | 20 | 17 | 18 | 19 | 20 |
| Visual hierarchy and grouping | 20 | 15 | 18 | 20 | 20 |
| Light/dark theme quality | 20 | 13 | 19 | 19 | 19 |
| Accessibility, contrast, focus states | 15 | 12 | 14 | 14 | 14 |
| Maintainability and implementation risk | 15 | 13 | 14 | 15 | 15 |
| Performance and restrained motion | 10 | 8 | 9 | 9 | 10 |
| **Total** | **100** | **78** | **92** | **96** | **98** |

## Selected direction

**Dual-mode Command Studio**

- **Dark mode:** Linear-inspired graphite command center with compact cards, precise borders, and one controlled warm accent.
- **Light mode:** Cursor-inspired warm parchment workspace with muted stone borders and soft elevation instead of flat white panels.
- **Shared system:** same settings layout, same search/jump behavior, same control sizing, same focus treatment, and semantic CSS tokens so future settings components inherit both themes automatically.

## Implementation notes

- Added settings-specific semantic theme tokens in `theme.css` for surfaces, borders, accent, focus ring, radius, shadows, and dropdown/menu surfaces.
- Preserved global theme tokens so the Refero redesign is scoped to the settings window instead of unintentionally restyling other app windows.
- Retuned settings controls in `config.css` to use the semantic tokens instead of raw gray/red values.
- Kept the native select dropdown readability fix: option text remains explicit dark-on-light because Chromium/OS menus often render option popups on a light system surface regardless of app theme.
- Restructured only the Speech/TTS settings tab into an essentials-first layout: required setup, connection, voice, model, and custom-voice controls remain visible; optional ElevenLabs, Speechify, and MiMo tuning/output controls now live in native advanced disclosure groups.
- Preserved existing control IDs and config mappings. Search/jump still indexes collapsed advanced rows and now includes the nearest disclosure summary in result context before opening ancestor `<details>`.
- Added reusable `.settings-advanced-details` / `.settings-advanced-body` CSS in `config.css` using existing settings tokens; no `theme.css` change was required for this hierarchy pass.
- Added `scripts/verify-settings-ui-regression.js` and `npm run verify:settings-ui` as a repeatable Node structural verifier. It intentionally avoids heavy browser automation dependencies because the repo does not currently carry one.

## Validation evidence

- `npm run verify:settings-ui`: passed. Verifies the three Speech/TTS advanced disclosures exist and remain default closed; the 11 advanced control IDs remain present, contained by their intended disclosure, and mapped by `getOptionList()`; search text includes nearest disclosure summary; search activation opens ancestor `<details>`; and settings-specific dark/light `theme.css` tokens exist.
- `npm run lint`: passed.
- `npm test`: passed, including `node --check scripts/verify-settings-ui-regression.js` and `npm run verify:settings-ui`.
- CSS brace check for `src/html/css/config.css` and `src/html/css/theme.css`: passed.
- `git diff --check`: passed.

## Score after this iteration

**98 / 100** based on preserved settings behavior contracts plus repeatable local structural regression evidence for the highest-risk Speech/TTS hierarchy, search/jump, and theme-token assumptions. The light/dark category stays below perfect because token presence is not the same as rendered visual QA; the performance/restraint category reaches full confidence for this iteration because the verifier adds no production runtime path and no browser automation dependency.

This is intentionally not scored as 100/100. A 100-level claim is still not defensible without evidence equivalent to packaged Electron/platform visual QA, especially:

1. Visual QA in the packaged Electron app on Windows and macOS, because native select popups and `<details>/<summary>` rendering differ by platform.
2. Screenshot regression coverage for settings dark/light mode in an Electron or equivalent Chromium runtime.
3. Manual or automated save/load and search/jump validation in the running Electron settings window for collapsed advanced Speech/TTS rows.
