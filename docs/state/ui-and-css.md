# UI, CSS and the developer panel

Valid after: phase 3 (PR #10), `main` `1bbc40d`, verified 2026-10-15.

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

- The evidence board (phase 4.5): `.case-dialog` (native `<dialog>`, no backdrop blur), `.case-panel`, `.case-grid` / `.case-pane` (2 x 2 on a wide screen, tabs on a phone via `@media (max-width: 720px)`), `.case-node`, `.case-row`, `.case-detail`, `.topo-*` (trace path). Only opacity animates (`.case-panel.is-opening [data-reveal-index]`; off for reduced motion and `body.quiet-motion`).
