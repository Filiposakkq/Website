# Phase 1 — Foundation & bug fixes

Read [`README.md`](README.md) first. This phase must be **merged before any other fsociety00 phase starts**: it introduces the shared utilities, the cancellation model and the context object that later phases use.

- **Branch:** `overhaul/phase-1-foundation`
- **Depends on:** nothing
- **Review items covered:** 1, 2, 3 (minimal), 4, 6 (introduce), 7, 8, 9, 11, 12 (verify only), 13, 14, 15 (launch + power panel), 17 (outside `.case-*`/`.developer-*`), 18, 20, 24, 25, plus the timer-leak table (except `stopBed`), plus "level01 crash when DOM metadata missing"
- **Plan section:** 1 ("All 25 code review fixes", infrastructure part of the execution order)
- **Touches:** `sites/fsociety00/public/{index.html,styles.css,fx.js}`, `js/{story,level01,tty,trace,audio,casefile}.js`, new `js/{util,session,context,rain,choices}.js`, new `tools/*`

## Goal

Make the existing game **correct, cancellable and accessible** without changing how it plays. After this phase the story can be aborted at any moment (reboot, dev jump) without ghost timers, shared helpers exist so later phases do not copy code, and the obvious accessibility defects are fixed. Visible behavior should be unchanged except where a bug is fixed.

## Do these in this order

### 1.1 Test and lint tooling (do first, everything else relies on it)

- [ ] `tools/smoke.mjs`: Playwright script implementing the README's *Standard smoke test* (desktop, 390×844, reduced motion, both trust branches, victory, game over + reboot). Starts its own static server (`node:http` or `python3 -m http.server` on a free port), launches Chromium via `executablePath: '/opt/pw-browsers/chromium'` if needed, fails on any `console.error`, `pageerror` or failed request. Skip button hold: dispatch `pointerdown` on `#skipHint`, wait 3.1 s, `pointerup`. The audio clip request must not fail the run (headless audio is fine).
- [ ] `tools/check-fonts.sh`: fails if any `font-size` in `sites/fsociety00/public/styles.css` is `< 11px` (matches `[0-9]px` with 1 digit, and `10px`). During this phase it is allowed to exclude `.case-*` and `.developer-*` selectors (owned by phases 4 and 7). By phase 7 it must run on the whole file.
- [ ] `tools/contrast.mjs`: computes WCAG contrast for pairs of hex colors (see formula in the README findings). Used for review item 12 and phase 8.
- [ ] Add a short `tools/README.md` explaining how to run each tool.

Acceptance: `node tools/smoke.mjs` passes against the **unmodified** baseline before you change anything else. Commit this first so regressions are attributable.

### 1.2 Shared utilities — `js/util.js` (review item 9)

- [ ] `formatClock(totalSeconds)` → `"MM:SS"`; clamps negatives/NaN to `00:00`. Replace the three copies: `casefile.js`, `level01.js`, `trace.js` (grep for `padStart(2, '0')`).
- [ ] `scrambleText(text, { intensity, charset })` → returns the text with a fraction of non-whitespace characters replaced from `charset` (default `'#%&@$*+=?01<>/\\|'`). Replace the three copies in `story.js` (`corrupt`, `glitchHello`, `renameEverywhere`/`decay`; grep the charset string).
- [ ] `rand(a,b)`, and any other tiny helpers that are duplicated (check `story.js` header helpers).
- [ ] `js/choices.js`: `renderChoices({ container, options, onPick, className })` that builds the choice cards/buttons. It must produce the same DOM/classes the CSS expects today (look at `tty.js` `chooseTrust` and the second builder in `story.js`, around `promptGhost`). Replace both builders.

Acceptance: `grep -rn "padStart(2" js/` shows only `util.js`; the junk charset appears once.

### 1.3 Cancellation: `js/session.js` (review item 4) — the core of this phase

Problem: `resetGame()` and `runDeveloperRoute()` call `void boot()` while the previous `boot()` chain is still asleep inside `await wait(...)`. When it wakes it keeps writing to the DOM, plays sounds and fires glitches into the new run.

Design:

- [ ] `createSession()` returns an object with an `AbortController`, `signal`, and helpers:
  - `session.sleep(ms)` / `session.wait(ms)` — reject with an `AbortError` sentinel when aborted (listen to `signal` so sleeping unblocks **immediately**, do not wait for the timer).
  - `session.setTimeout(fn, ms)`, `session.setInterval(fn, ms)`, `session.requestAnimationFrame(fn)` — register the handle and clear everything on abort.
  - `session.onAbort(fn)` — cleanup callbacks (stop audio beds, halt the trace, remove temporary DOM like the Elliot echo, remove overlay elements).
  - `session.abort(reason)` and `session.isAborted()`.
  - `session.throwIfAborted()` — call after any `await` that is not a session helper.
- [ ] Export `isAbortError(e)`.
- [ ] In `story.js`: all primitives that sleep or animate (`wait`, `type`, `say`, `typingFor`, `bar`, `klog`, `svc`, `memtest`, `glitch`, `gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`, `cmd`, `logo`, `wipe`, `decay`, …) take the **current session's** `wait` and propagate `AbortError` (never swallow it). Easiest is a module-level `let session` that those helpers read; each reboot creates a new one.
- [ ] `boot()` becomes `runStory(session)`; a thin wrapper `startStory()` creates the session, runs it and **catches only `AbortError`** (anything else is a real bug and must surface).
- [ ] `resetGame()` and `runDeveloperRoute()` do: `session.abort()` → wait one microtask → clear `#output`, remove leftover overlays/classes (grep for the classes added to `screen`/`document.body`) → `startStory()` with a fresh session.
- [ ] Interaction with the terminal: `readCommand()` returns a promise that never resolves if the session aborts mid-prompt, leaking the closure. Make `tty.abort()` resolve/reject it, and call it from `session.onAbort`.
- [ ] The trace (`trace.js`), ambient logo intervals (`ambientIntervals` in `story.js`), `showElliotEcho` timers in `level01.js`, audio beds and the dev-panel animation previews all register with the session or via `onAbort`.
- [ ] The skip-hold state (`skip`, `skipToChoice`, `holdFrame`, `skippable`) must be reset per session (move it into a per-session state object).

Acceptance (add to the smoke test): start the game, abort it at four different moments (during BIOS, during the intro, at the trust choice, mid-puzzle), reboot each time, and assert: only one `#output` stream, no duplicated lines, no timers left (`session` exposes a counter of live handles for tests: `session.pending()`), no console errors, and the final run still completes normally.

### 1.4 Context object (review item 6)

- [ ] `js/context.js` defines (JSDoc `@typedef`) and builds `GameContext`: `{ out, screen, line, type, say, cmd, wait, session, gfx, flash, staticBurst, corrupt, audio, caseFile, trace, terminal: { readCommand, abort, close }, gameOver, takeover, revealSourcePart, motionReduced, isSkipping }`.
- [ ] Change `createLevel01(ctx)` to take the context object instead of 13 loose parameters. **Behavior-neutral**: the function body just destructures `ctx`. Update the single call site in `story.js`.

### 1.5 Move narrative out of `tty.js` (review item 7)

- [ ] Move `chooseTrust()` from `tty.js` into the story layer (a new `js/story-choices.js`, or next to the other story functions) using `renderChoices` from `choices.js`. `tty.js` keeps only the generic terminal (`readCommand`, `abort`, `close`, key handling). Keep accepted answers identical: tap, `1`, `2`, `unknown`, `watcher`, `trust unknown`, `trust watcher` (read the current implementation and preserve every alias).

### 1.6 Terminal focus (review item 11) — `tty.js`

Current: `addEventListener('keydown', () => { if (tty.resolve && document.activeElement !== input) input.focus(); })` steals focus on **every** key, so keyboard users cannot Tab to `CASE FILE`, `DEV`, the skip control or dialogs.

- [ ] Redirect focus to the terminal input only when **all** hold: the terminal is awaiting input; the event target is `document.body`, `#screen`, or inside `#screen`; the target is not an interactive control (`button, a, input, textarea, select, summary, [contenteditable], [tabindex]`); no modal is open (`dialog[open]`, `[aria-modal="true"]:not([hidden])`); the key is a printable character, `Backspace` or `Enter` (never `Tab`, `Shift`, arrows, `Escape`).
- [ ] Apply the same rule to the `pointerdown` handler: only refocus when the pointer went down inside `#screen` and not on a control.
- [ ] Acceptance: Tab moves through skip control → CASE FILE trigger → DEV trigger (local only) → back, in a visible order; typing after clicking the terminal still works; arrow keys inside the case board are not captured.

### 1.7 HTML accessibility (review items 13, 14, 15)

- [ ] `<canvas id="rain" aria-hidden="true">`.
- [ ] `#output` gets `role="log"`. **Do not** put `aria-live` on the element that is mutated character-by-character: screen readers would read every keystroke. Instead: `aria-live="off"` on `#output`, plus a visually hidden `<div id="sr-announcer" class="sr-only" aria-live="polite">`. When a line (from `line()`, `type()`, `say()`) is **complete**, copy its final text there. Add a `.sr-only` utility class. Decorative output (progress bars, scramble, glitch text, fake kernel spam) must **not** be announced: add a `silent` option to the helpers, and announce the story/dialogue lines, errors/warnings and command results only.
- [ ] Convert `#launch` and `#powerPanel` from `div role="dialog"` to native `<dialog>` opened with `showModal()` (gives focus trapping, inert background, top-layer). Details that bite:
  - Reset UA styles: `dialog { border:0; padding:0; max-width:none; max-height:none; width:100%; height:100%; background: …; color: inherit; }` and style `::backdrop`.
  - `Escape` fires the `cancel` event: call `event.preventDefault()` on both dialogs (the launch screen must not be dismissible without initializing; the power panel only closes via REBOOT).
  - Move initial focus to the primary button (`autofocus` or `.focus()` after `showModal()`).
  - Existing code toggles `hidden` / classes on these elements: replace with `show()/close()` and update the CSS selectors that depended on `[hidden]`.
  - The shutdown sequence (`role="status"` overlay) is not a dialog; leave it.
  - The case board (phase 4) and dev panel (phase 7) get their own conversions; leave them.

### 1.8 CSS fixes — `styles.css` (review items 1, 12, 17, 18, 24, 25)

- [ ] **Item 1 (cascade bug):** the `@media (max-width: 520px) { .output .logo { padding: … } }` rule is overridden by the later base `.output .logo` rule at equal specificity. Move the media-query block **after** the base rule (or raise specificity), then check in a 390 px screenshot that the logo has the mobile padding and nothing overflows horizontally.
- [ ] **Item 12 (contrast):** the review claims `--dim: #1a8f3a` on `#000` is 2.4:1. **It is 5.03:1 and passes AA.** Run `node tools/contrast.mjs` to confirm. Do not change the color just because the review says so. Instead check the places `--dim` actually appears over *non-black* backgrounds (the rain canvas, panels, gradients, `.case-*`), and any other low-contrast color pair you find (use the tool). Only adjust the failing pairs and document each change in the implementation notes.
- [ ] **Item 17 (fonts):** raise every `font-size` below 11px (many `8px`/`9px`) to ≥ 11px. Skip selectors starting with `.case-` and `.developer-` (phases 4 and 7); list them in the notes so those phases know. After raising, check for overflow/wrapping at 390 px (labels like `.logo::before`, tabs) and fix with letter-spacing or layout, not by shrinking again.
- [ ] **Item 18 (`shutdown-scan`):** `@keyframes shutdown-scan` animates `top: 0 → 100%` (layout). Rewrite to `transform: translateY(0 → 100%)`. The element needs `position:absolute; top:0; height` set statically and `will-change: transform` at most while running. Keep opacity keyframes. Verify visually that the scan line still sweeps the same distance (use the dev panel's shutdown preview on localhost).
- [ ] **Item 24:** there are three `@media (prefers-reduced-motion: reduce)` blocks. Merge them into **one** block at the end of the file (keep the universal `*` rule and any specific overrides that are not subsumed; check each one before deleting). Phases 5 and 6 will append to this block.
- [ ] **Item 25:** remove the dead duplicate `.glyph i.on` rule (there are two identical selectors, the earlier is fully overridden). Keep the `.logo.done .glyph i.on` variant if it differs; verify with a screenshot of the logo that nothing changes.

### 1.9 Rain → ES module (review items 8, 20, rain timer risk) — replace `fx.js`

- [ ] New `js/rain.js` exporting `createRain(canvas)` returning `{ setOpacity(v, immediate), setIntensity(n), pause(), resume(), destroy() }`.
- [ ] Use `requestAnimationFrame` with a time accumulator that advances the animation in the same ~55 ms steps as today (so the look is unchanged), pause when `document.hidden`, resize with `ResizeObserver` or a debounced `resize`.
- [ ] Respect **live changes** of `prefers-reduced-motion` (`matchMedia(...).addEventListener('change', …)`) and `body.quiet-motion`: start/stop the loop accordingly, so a page loaded with reduced motion can start the rain after the user turns it off. Today the interval is only created at load when motion is allowed: that is the bug.
- [ ] `story.js` imports it; replace all 12 `window.setRain(...)` / `setRain(...)` calls (grep) and `window.syncRainMotion`. Remove `fx.js` and its `<script src="fx.js">` from `index.html`.
- [ ] Keep `setRain(v, immediate)` semantics: `immediate` disables the CSS opacity transition for one frame.
- [ ] No `window.*` globals remain from this file.

### 1.10 Timer and leak fixes

- [ ] **`trace.js` (item 2):** when `secs` reaches 0, `clearInterval(id)`; fire `onEnd` once; then no more ticks. **Subtlety:** `api.set(n)` re-arms the trace (`ended = false`); after the interval is cleared, `set()` must start a fresh interval, so restructure with a `start()`/`stop()` pair and make `set()` call `start()` if it is not running. `boost`, `slow`, `kill`, `halt` must keep working. Register the interval with the session. Use `formatClock`. Do not call `onTick` after expiry other than the final tick at 0. Check who relies on `onTick` after the end (grep `onTick`, notably the case board).
- [ ] **Elliot echo (`level01.js`, `showElliotEcho`):** the inner 700 ms `setTimeout` inside `elliotEchoTimer` is untracked. Register both timers with the session so a reboot cancels them, and make sure the `elliot-present` class and echo element are removed on abort.
- [ ] **Victory path:** make sure `ambientIntervals` (the logo's ambient jitter intervals) are cleared on victory as well as in `gameOver()` and the dev route; simplest is to register them with the session so every exit path is covered.
- [ ] **`audio.js` envelope (item 3, minimal):** in `envelope()` use `const attack = Math.min(0.035, duration * 0.4)` and ramp to `start + attack`; also clamp `hold` so the decay ramp never ends before the attack ramp. Do **not** restructure `audio.js` here (phase 2 replaces it). Add a console-free test: call every cue once in an `OfflineAudioContext` and assert no exception (a first draft of the phase 2 audio lint).
- [ ] **`level01.js` missing-DOM crash:** `getLevel01Key()` throws if the meta tag or CSS variable is absent, and it is called when `createLevel01` runs (`const key = getLevel01Key()`), crashing the whole game start. Wrap it: on failure `console.warn` and fall back to the built-in parts (`['ghost', 'shell', sourcePartThree]`), and print an in-terminal diagnostic line (`sdb9: integrity check failed, using sealed key`) so the game never crashes. Add a smoke test case that removes the meta tag and still reaches the shell.

## Out of scope for this phase

New sounds (phase 2), data-driven story (phase 3), case board layout/fonts (phase 4), new animations/perf work (phase 5), dev panel changes (phase 7), anything on the main site (phase 8).

## Verification checklist

- [ ] `node tools/smoke.mjs` passes: desktop, mobile viewport, reduced motion, trust 1 and 2, victory, game over + reboot, abort at four moments.
- [ ] `tools/check-fonts.sh` passes (excluding `.case-*`/`.developer-*`).
- [ ] No `window.setRain`, `window.syncRainMotion`, or `fx.js` references remain (`grep -rn "setRain\|syncRainMotion\|fx.js" sites/fsociety00`). A local `const setRain` in `story.js` and a comment in `rain.js` still match the grep and are fine.
- [ ] Keyboard: Tab order works; typing in the terminal still works.
- [ ] A screen reader (or the accessibility tree via Playwright `page.accessibility.snapshot()`) shows the log and dialogs; typing animation does not spam the live region.
- [ ] Screenshots at 390×844: logo padding (item 1) and the shutdown scan.

## Done when

Everything above is checked, the PR description lists each review item with the fix or the reason it was skipped, and the README tracker is updated. Then phases 2, 3, 5 and 8 can start.

## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 1.1 Test and lint tooling (smoke, fonts, contrast) | done | `a51b589` | smoke 6/6 on the unmodified baseline; abort, expiry, 3rd-hint and missing-key scenarios added later (16 scenarios in total after the whole phase, all green at `c108716`) |
| 1.2 Shared utilities (util.js, choices.js) | done | `055c0ea` | `util.js` (`rand`, `pad2`, `formatClock`, `scrambleText`) replaces the copies in story/trace/level01/casefile; `renderChoices` used by `promptGhost`; `grep padStart(2` and the junk charset only hit `util.js`. Desktop real-time victory smoke passes |
| 1.3a session.js module | done | `eda836d` | `session.js`: abortable `sleep`/`wait`, tracked timers/intervals/frames, `onAbort`, `pending()`, `swallowAbort` |
| 1.3b Convert story helpers to the session | done | `eda836d` | story helpers sleep through the module-level `session`; `boot()` is `runStory()`, wrapped by `startStory()` which only swallows aborts; logo/ambient timers, trace, Elliot echo, hello flight register with the session; skip state is a per-session `run` object |
| 1.3c Reset / dev route / terminal abort + abort smoke test | done | `eda836d` | `resetGame` / `runDeveloperRoute` call `beginSession()` (abort, fresh session, one microtask); `readCommand({signal})` rejects on abort; smoke scenario aborts at BIOS, intro, trust choice and mid-puzzle and asserts `pending() === 0`, one `#output`, no duplicates. Dev `boot` route also resets the skip hint |
| 1.4 GameContext + createLevel01(ctx) | done | `eda836d` | `createGameContext` (throws on a missing member) + `createLevel01(ctx)`; built once per session. Fixes the missing `revealSourcePart` (third hint crash); smoke scenario added |
| 1.5 Move chooseTrust out of tty.js | done | `055c0ea` | `chooseTrust` now in `story-choices.js` (all aliases kept), removed from `tty.js`; reduced-motion smoke passes |
| 1.6 Terminal focus fix | done | `3690844` | focus is only redirected for typing keys inside `#screen`, never from controls or while a modal is open. Smoke scenario `keyboard focus is not hijacked` passes on the fix and fails on the baseline (Tab never reached DEV). Full suite green at `7032663` (before this scenario existed) |
| 1.7 HTML accessibility (role=log, canvas, native dialogs) | done | `f0c8826` | canvas `aria-hidden`; `#output` `role=log aria-live=off`; `#srAnnouncer` (polite, sr-only, capped at 12 entries, cleared on abort) receives each *completed* `say`/`type`/`line`, while BIOS/kernel text, progress bars and typing are silent; `#launch` and `#powerPanel` are native modal `<dialog>`s (Escape cannot dismiss them, a Chrome second-Escape close is reopened). Smoke covers all of it. A real screen reader was **not** used (unverified); the accessibility-tree check is only the markup assertions. Note: while a modal dialog is open the DEV and CASE FILE buttons are inert (expected). One flaky failure under 16-way parallel load was a test race (sampled once instead of waiting for the reopen), fixed in the test |
| 1.8 CSS fixes (cascade, fonts, shutdown-scan, reduced-motion, dead rule, contrast check) | done | `5c4f941` | logo padding cascade, dead `.glyph i.on` / `.logo::before` rules, reduced-motion blocks merged into one, `shutdown-scan` on `transform`, fonts >= 11px outside `.case-*`/`.developer-*`, failing contrast pairs fixed (details in "Step 1.8 notes"). Commits `ce2cff6`, `dcb6225`, `0e36797`, `5c4f941` |
| 1.9 Rain to ES module | done | `ecfa5d4` | `rain.js` (rAF with 55 ms step accumulator, pauses when hidden, ResizeObserver, reacts live to reduced-motion and `quiet-motion`) replaces `fx.js`; `window.setRain`/`syncRainMotion` and the script tag are gone. Smoke: no rain globals, rain starts after reduced motion is switched off, and the real game's canvas is at 0.22 and painting at the intro. Visual look unchanged is **unverified** (owner: check on the preview) |
| 1.10 Timer and leak fixes (trace, Elliot echo, victory path, audio envelope, key crash) | done | `3646a55` | `trace.js` stops at expiry and `set()` restarts it; Elliot echo timers are session-owned; ambient intervals and all other timers are gone after victory (smoke asserts `pending() === 0`); `getLevel01Key` fallback + terminal notice; `envelope()` attack/hold clamped; every cue renders in an `OfflineAudioContext` without errors or NaN (smoke). Each has a smoke scenario; the envelope clamp itself is only exercised indirectly (no audible check, owner listens in phase 2) |

## Implementation notes

### State at handoff (historical: phase 1 is merged, see the master README tracker)

All rows 1.1-1.10 are `done`. **Last green commit: `5c4f941`** (full `node tools/smoke.mjs`: 14 of 16 in the parallel run; the other two, `reduced: log role...` and `desktop: trust unknown -> victory`, failed only under the 16-way parallel load and both passed when re-run alone with `--serial`). A later commit hardens the Escape check in `tools/smoke.mjs` (waits for the power panel to open first); that scenario passes alone. `tools/check-fonts.sh`: OK (skips 26 `.case-*`/`.developer-*` declarations for phases 4 and 7). `node tools/contrast.mjs --audit`: only `#000` and `#001707` (button fill colors) are listed below 4.5:1.

### Step 1.8 notes (CSS fixes)

- **Chunk 1 (item 1, item 25):** the mobile `.output .logo` padding now lives in its own `@media (max-width: 520px)` block placed right after the base `.output .logo` rule, so it wins. I used `14px 10px 12px`, **not** the old `28px 10px 12px`: the extra top padding was for the `.output .logo::before` label, which no longer exists (the label is the `.logo-header` element), so 28px would only add dead space. The dead `.output .logo::before` rule was removed; the `.developer-*` rules stayed in their old media block. The earlier duplicate `.glyph i.on` (lines ~1883) was removed (the later rule wins); `.logo.done .glyph i.on` is kept. Verified with a headless screenshot at 390x844 and 1280x800 (logo padding `14px 10px 12px` on mobile, unchanged on desktop, `scrollWidth` equals the viewport, no horizontal overflow). The visual comparison was by eye on my own screenshot only.

- **Chunk 2a (item 24):** the three `@media (prefers-reduced-motion: reduce)` blocks (power/launch/breach rules, the universal `*` rule plus `.elliot-echo img`, and the `.case-*` rules) are now one block at the end of `styles.css`, with every declaration kept. Moving it to the end can only make the overrides win more often, never less. The 10 reduced-motion smoke scenarios pass. Phases 5 and 6 append to this block.
- **Chunk 2b (item 18):** `.shutdown-frame::before` is now full frame height with the 2px line painted at its top edge, and `shutdown-scan` animates `transform: translateY(0 -> 100%)` plus opacity (the 2px box could not use `translateY(100%)` directly, it would only move 2px). The glow became a static `filter: drop-shadow(...)` instead of `box-shadow`. Measured on a paused animation at 20%, 50% and 85% of the cycle (390x844): old line rows 272, 429, 581; new line rows 272, 429, 582 (same sweep within 1px). The glow looks nearly identical in a before/after crop, but the exact glow strength is **unverified** on a real device (owner: check the shutdown screen on the preview).

- **Chunk 3a (item 17, fonts):** `.logo-relay` and `.logo-caption` 8px -> 11px; `.skip`, `.power-foot` and `#hud .lbl` use `max(11px, Nem)`. `tools/check-fonts.sh` passes (it still skips 26 `.case-*`/`.developer-*` declarations, **left for phases 4 and 7**). Checked on a 390px screenshot: the logo header and caption fit inside the frame, no horizontal overflow. `#hud .lbl` and `.skip` at their real sizes were not looked at on screen (unverified).

- **Chunk 3b (item 12, contrast):** `--dim` (#1a8f3a, 5.03:1 on black) was **not** changed. Pairs fixed: `.power-foot` #555 (2.82:1) -> #7a7a7a (4.89:1); inactive `.ghost-step` #436e4e (3.58:1) -> #5b8d68 (5.45:1); `.skip` idle opacity .42 -> 1 and its hover/focus/holding opacity .9 -> 1 (any opacity below 1 drops `--dim` under 4.5:1; the idle hint is now more visible, owner: check it is not too loud on the preview); `#hud .lbl` opacity .85 -> .9 (4.45:1 -> above 4.5:1 by calculation). `contrast.mjs --audit` now lists only `#000` and `#001707`, which are button fill colors, not text on black. **Known, not fixed (unverified on screen):** `--dim` text drawn directly over the digital rain can fall to about 3.2:1 where a bright rain glyph sits behind a letter (worst case, 0.22 opacity), and `--dim` on the `#001707` panel color is 4.47:1. The `.skip` control has its own dark background; I did not audit the other 9 `--dim` uses.

### Findings beyond the docs (verified at baseline)

- **Third `hint` crashes the shell.** `createLevel01` destructures `revealSourcePart` but `story.js` never passes it (12 of 13 params). `revealSourcePart()` throws `TypeError`, the shell loop dies. Fix with the context object (`createGameContext` throws at startup if a member is missing); pass `revealLevel01SourcePart`. Add a smoke scenario for the third hint and assert the console shows `[sdb9] key :: layer 3/3`.
- **Trace expiry at the prompt hangs the game.** In `level01.js` the loop checks `if (raw === null) { return false; }` *before* `if (state.over) break;`, so when `trace.onEnd` calls `abortCommand()` the shell returns silently and `gameOver` never runs (HUD shows `TRACE COMPLETE 00:00`, prompt stays open). Check `state.over` first. Add a "trace expiry -> game over" smoke scenario (2 `hint`s, then wait; drafted in the smoke history, removed from the baseline commit).
- **Smoke harness facts:** the skip control must be held with real keyboard/mouse input (a synthetic `pointerdown` makes `setPointerCapture` throw). The terminal drops commands sent while no `readCommand()` is pending (during `gfx`, typed hints), so `sendCommand` retries until the echo line appears. With reduced motion the whole BIOS runs instantly and `blackout()` wipes it, so do not assert BIOS text in that variant.
- **Item 1 (logo padding):** the `@media (max-width:520px)` `.output .logo` padding is overridden as claimed, but its companion `.output .logo::before` rule is dead (no base `::before` exists; the label is now the `.logo-header` element). The 28px top padding was meant for that old label, so check the screenshot before applying it as-is.
- **Item 25:** `.glyph i.on` is declared twice (lines ~1854 and ~1907); the later one wins, so remove the earlier one.
- **Item 12:** confirmed `--dim` is 5.03:1. Real low pairs found by `contrast.mjs --audit`: `.power-foot` `#555` (2.82:1) and `#436e4e` (3.58:1, locate its use). `.skip` is `--dim` at `opacity: .42`, effectively far below 4.5:1.
- **Item 17:** besides px sizes, em sizes can compute below 11px (root is `clamp(18px, 4.8vw, 22px)`): `.skip` and `.power-foot` (0.58em), `#hud .lbl` (0.32em of a 34–64px HUD). Plan: `max(11px, Nem)`. `tools/check-fonts.sh` already understands that form. Non-`.case-`/`.developer-` px offenders: `.logo-relay`, `.logo-caption` (8px) and the dead `.output .logo::before` rule.
- **Dialog conversion caveats (1.7):** `.launch, .power-panel { display:flex }` would override the UA `dialog:not([open])` hiding, so scope the display rules to `[open]`. `.developer-trigger` (z-index 140) sits above both panels today; once they are modal `<dialog>`s the DEV button is inert while they are open. Flag to the owner (phase 7 can add a shortcut).
- **Session design notes (1.3):** non-session awaits (`fetch` in `cat page/...`, `animation.finished`, `audio.unlock()`) must call `session.throwIfAborted()` afterwards; fire-and-forget calls (`staticBurst(500)` in `renameEverywhere`, `void boot()`) need `.catch(swallowAbort)`. `readCommand` takes `{ signal }` and rejects with the abort error so callers unwind.

### Handoff report (end of phase 1)

- **Branch / head:** `overhaul/phase-1-foundation`, head verified with `git ls-remote --heads origin overhaul/phase-1-foundation` after the final push (the hash is in the PR description). Never pushed to `main`, no force-push, PR not merged.
- **Per-step status:** 1.1 done (`a51b589`), 1.2 done (`055c0ea`), 1.3a/b/c done (`eda836d`), 1.4 done (`eda836d`), 1.5 done (`055c0ea`), 1.6 done (`3690844`), 1.7 done (`f0c8826`), 1.8 done (`5c4f941`), 1.9 done (`ecfa5d4`), 1.10 done (`3646a55`).
- **Results:** smoke 16 scenarios, green (see the state block above for the two load-related reruns); check-fonts OK; contrast audit clean except fill colors.
- **Known issues / unverified:** audio cannot be heard headless (owner listens in phase 2); `rain.js` visual look and the `shutdown-scan` glow strength are only checked by screenshot (check on the Cloudflare preview); the idle `.skip` hint is now fully opaque (more visible than before); `--dim` text directly over bright rain glyphs can be about 3.2:1 (not changed, see "Step 1.8 notes"); no real screen reader was used; the DEV and CASE FILE buttons are inert while a modal dialog is open (phase 7 can add a shortcut); 26 `.case-*`/`.developer-*` font declarations below 11px remain for phases 4 and 7. The parallel full smoke run can time out in two scenarios on a slow machine; use `--serial --only=...` to confirm.
- **Next step:** the owner reviews and merges the PR. Then phases 2, 3, 5 and 8 can start (each merges `main` into its branch first).

### Correction after review (2026-10-13)

- 1.8 had left `@media (hover: none) { .skip { opacity: 0.55; } }` in `styles.css`, which re-dimmed the skip control (text and background) on touch devices and undid the contrast fix. Removed. **Unverified on a real phone.**
- Worker names fixed: `sites/fsociety00/wrangler.jsonc` is now `fsociety`, `sites/main/wrangler.jsonc` is `filiposakkq` (the real Cloudflare Worker names); README, `docs/overhaul/README.md` and `CLAUDE.md` updated. Whether the Cloudflare preview builds now pass is **unverified** until the owner checks them.
- The full smoke test was **not** re-run after these edits (CSS rule removal and config names only).

### Merged (2026-10-13)

Merged as PR #4 (squash commit `841cad0` on `main`) after: a review-only pass (smoke 16/16 at `c108716`, "Do not break" list verified, no critical findings), the Cloudflare preview fix (`previews: {}`, Worker names), and the owner's test of the preview on phone and PC. The findings that were not fixed are listed in the master README under "Known issues carried over". One owner observation, handled in the post-phase-1 docs PR: the skip control sometimes covered text on phones, so it was made smaller with a more transparent background.
