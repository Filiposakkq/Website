# Phase 7 — Developer panel fix & upgrade

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-7-devpanel`
- **Depends on:** phase 1 merged (session/abort, native dialogs). **Best done after phases 2–6** so it can preview the final sounds, animations, scenes and state; if done earlier, build it against registries (`audio.list()`, the story engine's labels, the effect names) so it keeps working as those grow
- **Review items covered:** 15 (dev panel focus trapping), 17 (`.developer-*` font sizes)
- **Plan section:** 7 (Developer panel fix)
- **Touches:** `js/developer-menu.js`, `js/story.js` (`runDeveloperRoute`, `installDeveloperMenu` wiring at the bottom), `styles.css` (`.developer-*`), `tools/check-fonts.sh` (remove the last exclusion)

## Goal

A reliable test console (localhost and Cloudflare preview URLs only): jump to any scene with the new cancel-and-restart flow, preview any animation or sound in isolation, and inspect live game state. It must still be impossible to use in production.

## Current state (baseline `8ea680b`)

- `developer-menu.js` exports `isLocalDevelopment()` (hostnames `localhost`, `127.0.0.1`, `[::1]`) and `installDeveloperMenu(onAction)`, which adds a `DEV` button and builds an overlay `div` containing a `section role="dialog" aria-modal="true"` made of JS-created DOM. It only handles `Escape` and overlay clicks; **no focus trap** (Tab leaves the panel into hidden content), and the page behind stays interactive.
- Actions (data: `groups` in `openDeveloperMenu`):
  - JUMP TO: `boot` (BIOS / intro), `puzzle` (Level 01 puzzle), `puzzle-watcher` (watcher route), `ending` (ghost sequence), `identity` (Mr. Robot reveal)
  - PLAY ANIMATION: `logo`, `ghosted`, `glitches`, `takeover`, `shutdown`
- `story.js` `runDeveloperRoute(route)` handles each route (also sets `trusted`, scene audio, clears ambient intervals) and, in the baseline, restarts with `void boot()` without cancelling the previous run. Phase 1 fixed that with the session model; verify the dev route now calls `session.abort()` first.
- Wiring: `installDeveloperMenu(async (action) => runDeveloperRoute(action))` near the end of `story.js`.
- `.developer-*` CSS has sub-10px fonts.

## Tasks

### 7.1 Focus and structure

- [ ] Convert the panel to a native `<dialog>` + `showModal()` (focus trap, inert background, `Escape` handled natively). Remove the manual overlay and `document` keydown listener. Return focus to the `DEV` trigger on close. Preserve "click outside closes" (listen for a click whose target is the dialog element itself).
- [ ] The phase 1 terminal focus rule must not steal focus while the dialog is open (it checks `dialog[open]`; verify).
- [ ] Fonts ≥ 11px in all `.developer-*` CSS; remove the exclusion in `tools/check-fonts.sh` so it lints the whole stylesheet.

### 7.2 Scene jumps that really work

- [ ] Every jump button does: `session.abort()` → full DOM/state reset (the same path as the reboot) → start the target scene with the right preconditions (trust route, trace time, evidence state). Define scene entry points in one table (`SCENES = { boot, intro, trust-choice, puzzle, puzzle-watcher, ghost, identity, traced, … }`) next to the story data so adding a scene is one line. Phase 3's engine labels are the natural entry points (`engine.start({ label })`).
- [ ] Add jumps for the phase 4–6 scenes that exist by then: `trust-choice`, `evidence board open`, `traced` (the TRACED sequence), game over variants.
- [ ] Stress test: clicking jump buttons rapidly 20 times leaves exactly one live story (assert `session.pending()` is small and stable, no duplicated output, no console errors).

### 7.3 Animation preview in an isolated container

- [ ] A "PLAY ANIMATION" button must not disturb the running game. Provide a **preview stage** inside the panel (a framed box with its own dark background) where each animation plays on sample content: the five glitches (`rgb`, `slice`, `roll`, `invert`, `zoom`), flash, screen tear, ghost interference, the logo reveal, the TRACED cascade, trace HUD states (`calm/warn/critical/expired`), shutdown. Where an effect is inherently full-screen (shutdown, takeover), keep the existing full-screen preview but go through the session so it can be cancelled.
- [ ] Each preview has Replay and Stop buttons, and a "reduced motion" toggle to see the fallback.
- [ ] Effects register in one table (`ANIMATIONS = { id, label, description, play(stage, session) }`) shared with phase 5's effect module, so new effects show up automatically.

### 7.4 Sound preview

- [ ] A list of every cue from `audio.list()` (phase 2 registry: name, category, description), grouped by category, with a play button each, a volume slider (dev only, does not change the shipped master), and scene/bed buttons for `setScene(...)` with a visible "now playing bed". Audio needs the context unlocked: the panel's first sound button calls `audio.unlock()` if needed (user gesture is satisfied by the click).
- [ ] Never log errors for unknown cues; the list comes from the registry.

### 7.5 State inspector

- [ ] A live, read-only view (updates ~4×/s while the panel is open, not when closed) showing: current story stage/label (from the engine), trace time left and speed multiplier, trust route, evidence list with states (phase 4) or discoveries (before phase 4), hints used, failed unlock attempts, current audio scene, skip flags, active session id and pending timers, `quiet-motion`/reduced-motion status, `perf-lite` (phase 5).
- [ ] Read through an explicit debug accessor exported by modules (e.g. `engine.getState()`, `trace.left()`, `caseFile.snapshot()`), **not** by adding `window.*` globals.
- [ ] A few safe state setters useful for testing: set trace time, grant all evidence, force trust route. Clearly labeled as dev-only; they must call the same public methods the game uses.

### 7.6 Production safety

- [ ] The panel and everything it imports for previews must be inert unless `isLocalDevelopment()`; ideally the heavy preview code is loaded with a dynamic `import()` only on localhost so it is never fetched in production. Add a smoke test that loads the page on a non-local hostname (Playwright `route` rewriting the host, or run the server bound to `127.0.0.2`/a custom `Host` header and test `isLocalDevelopment()` returns false there) and asserts no `DEV` button and no developer modules in the network log.
- [ ] Keep a label such as "LOCAL / PREVIEW ONLY".

### Developer panel hostnames (decided 2026-10-13)

The panel is available on `localhost`, `127.0.0.1`, `[::1]` **and on Cloudflare preview hostnames**, and never on production.

- [ ] Replace the single `isLocalDevelopment()` check with one function (e.g. `isDeveloperHost(hostname)`) that returns true for the local names and for the preview pattern, and false for everything else. Keep the production names `fsociety.filiposakkq.dev` and `filiposakkq.dev` as an explicit deny list that wins over any pattern. Keep the patterns in one constant at the top of the file.
- [ ] Preview pattern: assumed to be `*.workers.dev` (Cloudflare preview URLs look like `<alias>-<worker>.<account>.workers.dev`). **Unverified: the owner confirms the exact hostname on a real preview and whether the production Workers' own `workers.dev` URLs are enabled** (if they are, the panel would show there too; the owner then disables them or the pattern must be narrower).
- [ ] The 7.6 smoke test asserts: no `DEV` button and no developer module fetched on the production hostnames and on an unrelated hostname; the button is present on `localhost` and on a hostname matching the preview pattern.
- [ ] Update the "Do not break" line (`CLAUDE.md`), `owner-test-checklist.md` (DEV button check) and `state-after-phase-1.md` in the same PR.
- A hostname check is not access control. The panel only jumps scenes (spoilers, no data). If real protection is wanted, put Cloudflare Access on the production Worker; not planned.

## Out of scope

Changing gameplay, adding new cues/animations (they belong to their phases; the panel just lists them).

## Verification

- [ ] Keyboard: open with the DEV button via Enter, Tab cycles only inside the panel, Escape closes, focus returns to the DEV button.
- [ ] Every jump works from every other state (matrix test: from each scene jump to each scene), no leftover timers.
- [ ] Every animation preview plays and stops; every cue plays (owner listens).
- [ ] Inspector values match reality (compare with the game's own HUD).
- [ ] Production-hostname test passes (no dev code loaded).
- [ ] `tools/check-fonts.sh` passes on the whole stylesheet; 390×844 screenshot of the panel is usable on a phone.

## Done when

The panel is a real modal dialog, scene jumps use the cancel-and-restart flow reliably, animation and sound previews work from the registries, the state inspector is live, and nothing ships to production.

## Carried over from the phase 1 review

- [ ] The DEV `boot` route calls `runStory()` directly, so the ambient-interval cleanup in `startStory`'s `finally` does not run when it ends normally. Route it through `startStory` / the new scene table.


## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 7.1 Native dialog + focus + fonts | todo | | |
| 7.2 Scene jumps via cancel-and-restart | todo | | |
| 7.3 Animation preview stage | todo | | |
| 7.4 Sound preview | todo | | |
| 7.5 State inspector | todo | | |
| 7.6 Production safety test | todo | | |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here)_
