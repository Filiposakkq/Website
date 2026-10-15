# UI, CSS and the developer panel

Valid after: phase 4b.3 (branch `overhaul/phase-4b-case-file`, verified 2026-10-15, smoke 38 of 38 on `bb599e7`); earlier: phase 3 (PR #10), `main` `1bbc40d`, verified 2026-10-15; the board rows updated by phase 4.5 (branch `overhaul/phase-4-evidence`).

| File | Role |
|---|---|
| `index.html` | Launch dialog, `#screen`, `#output` (`role="log"`), prompt line, case trigger, shutdown and power panels (native `<dialog>`), `#srAnnouncer` |
| `styles.css` | All game CSS in one file. One `prefers-reduced-motion` block near the end; `body.quiet-motion` rules. **Not yet compliant** with "animate only transform/opacity" (phase 5; see Known issues) |
| `js/developer-menu.js` | DEV panel, today localhost only (`isLocalDevelopment()`); phase 7 reworks it and widens it to preview hostnames |

Facts that bite:
- Stacking: `.screen` is `z-index: 2`, the ghost panel layer `3`, trace HUD and skip control `4`. The ghost panel was once under the terminal text (z-index 1).
- Ghost panel on phones (`max-width: 680px`): top, solid background, `max-height: 54vh`.
- "hello, friend." is centred with `position: fixed` in a `.hello-flight-layer` on `body`, then flies into the log (`moveHelloIntoChat`). Cleanup of overlays: `.elliot-echo, .ghost-sequence, .breach-sequence, .identity-surge, .hello-flight-layer`.
- Skip control (lower right): `min-width:104px`, hold 3 s. Its logic is `js/skip-control.js` (per session, follows the engine segments); the visual rework (HOLD TO SKIP label, progress bar) is phase 5.
- Font size minimum 11px outside `.developer-*` (to fix in phase 7); `.case-*` (the board) is at 11px or more since phase 4.5.

- `.output .voice-blue` (static colour `#4da6ff`, 8.21:1 on black, and a static glow) is the third voice `<???>`: name tag and text (`story-data/voices.js`). It does not animate.
- `.case-owner` (blue, 11px): the line `PROPERTY OF THE AGENCY // RESTRICTED // ACCESS LOGGED` under the board title. `.case-cmd-line.is-mystery` is a line of <???> in the board terminal (blue, static).
- The board command line (phase 4b.3) is a little terminal: `.case-pane--commands` (a full-width strip under the 2 x 2 panes, `clamp(220px, 33vh, 320px)`; on a phone at least 55dvh), `.case-term` (one black screen, 15px text, a click focuses the prompt), `.case-cmd-log` (scrolling output, the typed lines echoed as `board> ...`), `.case-cmd-line` with `is-dim` / `is-ok` / `is-warn` / `is-cmd`, and the prompt as its last line: `.case-cmd-form` / `.case-cmd-label` (`board>`) / `.case-cmd-input` (borderless, 44 px high, 16 px text on a phone so the page does not zoom); `.case-tabs` now has five columns. No animation.
- The evidence board (phase 4.5): `.case-dialog` (native `<dialog>`, no backdrop blur), `.case-panel`, `.case-grid` / `.case-pane` (2 x 2 on a wide screen, tabs on a phone via `@media (max-width: 720px)`), `.case-node`, `.case-row`, `.case-detail`, `.topo-*` (trace path). Only opacity animates (`.case-panel.is-opening [data-reveal-index]`; off for reduced motion and `body.quiet-motion`).
