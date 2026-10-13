# Phase 5 — Animation rework & mobile performance budget

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-5-animations`
- **Depends on:** phase 1 merged (rain module, merged reduced-motion block, session model). Phase 3 recommended (stable effect call sites); phase 4 helps for the board reveal
- **Blocks:** phase 6 (the TRACED sequence is built from these effects)
- **Review items covered:** 21 (stacked composited layers on mobile), the animation parts of plan 1 not already done in phase 1 (item 18 was fixed there)
- **Plan section:** 3 (Animation rework)
- **Touches:** `styles.css`, the effect helpers (`gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`, logo, rain), `js/rain.js`, `js/trace.js` hooks, `index.html` (overlay elements), the case board CSS for the reveal

## Goal

Cinematic but cheap: every effect uses only compositor properties, the game stays smooth on a low-end phone, and the visuals react to the game state (trace time, trust choice, game over). Nothing looks like a default `linear` CSS animation.

## Principles (non-negotiable)

1. **GPU-only:** animate `transform` and `opacity` (and `filter` only on small elements, sparingly). No animating `top`, `left`, `width`, `height`, `margin`, `background-position`, or large `box-shadow`/`text-shadow` values.
2. **Cinematic pacing:** intentional easing (`cubic-bezier(...)`, `steps()` for digital stutter), anticipation and settle; vary durations.
3. **Reactive:** state drives the look (trace seconds left, trust choice, game over), through CSS custom properties or a `data-*` attribute on `<body>`, not by rewriting styles every frame.
4. **Budgeted:** a hard cap on simultaneous expensive effects (see "Performance budget").
5. **Accessible:** every animation is covered by the single `prefers-reduced-motion` block (from phase 1) and by `body.quiet-motion`. Flashing: **no more than 3 flashes per second** anywhere (WCAG 2.3.1); the strobe/invert/flash effects must be checked against that and have a reduced alternative (a single soft fade).

## Current state (baseline `8ea680b`)

- Effects are JS helpers in `story.js` that toggle classes with a timeout: `gfx(name)` (names: `rgb`, `slice`, `roll`, `invert`, `zoom`, durations in `FX_MS`), `flash()`, `glitch()`, `blackout()`, `staticBurst()` (a fixed `#noise` overlay whose background-position is animated, with `mix-blend-mode: screen`), `corrupt()`, `glitchHello()`, the logo (noise → lock → scan → jitter), `wipe()`/`decay()`.
- CSS: ~2100 lines in `styles.css`, 20+ infinite keyframe animations with `text-shadow`/`box-shadow`, three `backdrop-filter: blur()` overlays, scanlines (repeating gradient), vignette, the rain canvas, the noise overlay.
- `shutdown-scan` was converted to `transform` in phase 1; the rest of the shutdown sequence still needs the plan's redesign.
- Trace HUD (`trace.js`, `#hud` with classes `center`, `corner`, `hot`, `expired`, `dead`) is a static counter that blinks when hot.

## Specific changes (from the plan)

| Animation | Current | Proposed |
|---|---|---|
| **Boot sequence** | Plain text appear | Staggered reveal with a **CRT warm-up flicker** and a scanline-intensity pulse. Implement the pulse as an opacity animation of a single scanline overlay element, not a repaint of gradients |
| **Glitch effects** | Text character swaps | `clip-path` slicing + `hue-rotate` + horizontal offset jitter, like **VHS tracking errors**. Keep the five names (`rgb`, `slice`, `roll`, `invert`, `zoom`) as the API; improve what each does. Each stays visually distinct |
| **Screen transitions** | Instant or basic fade | A brief **screen tear** (clip-path wipe) plus a static burst, used for scene changes (boot → story → puzzle) |
| **Ghost appearance** | Fade in | **Interference pattern → resolve**: opacity oscillation + horizontal shift that settles. Applies to `<unknown>`/`<watcher>` first appearances |
| **Shutdown sequence** | (`top` fixed in phase 1) | `translateY` scan + **RGB channel split via `text-shadow`** on the title. Keep it readable |
| **Trace HUD** | Static counter | **Pulsing glow** that intensifies as time drops, and a **screen-edge vignette that turns red** as time runs out. Drive it with a `data-trace="calm|warn|critical|expired"` attribute (or `--trace-danger: 0..1` custom property) set once per tick from the trace's `onTick`; the vignette is one fixed element whose opacity/scale is transitioned |
| **Digital rain** | Fixed interval (rAF since phase 1) | Speed and density **respond to game state**: faster during the trace, calmer in the story, stopped on game over. Use the rain module's `setIntensity()` |
| **Evidence board** | Slide in | **Glitch-in** with **staggered node reveals** (use a `--i` index custom property and `animation-delay`); the board is a dialog since phase 4 (if phase 4 is not merged, do this against the current markup and note it) |
| **Trust choice** | Basic button appear | Cards **slide up from the bottom** with slow, dramatic timing, staggered, then settle; selection pulses the chosen card and fades the other |
| **Game over** | Basic text | A **full-screen corruption cascade → hard cut to black → aftermath** panel. This phase builds the reusable cascade effect (`cascade()`), phase 6 composes the sequence |

## Performance budget (review item 21)

The game currently stacks, at once: full-screen canvas rain, repeating-gradient scanlines, an animated-background noise overlay with `mix-blend-mode: screen`, three `backdrop-filter: blur()` overlays and 20+ infinite keyframes with shadows. Low-end phones will drop below 30 fps.

- [ ] **Measure first.** Add `tools/perf.mjs` (Playwright + Chromium tracing or `performance.measure`/`requestAnimationFrame` frame-time sampling) that plays the first 60 seconds and the puzzle under **CPU throttling 4×** (`CDP: Emulation.setCPUThrottlingRate`) at 390×844 and reports p50/p95 frame time and dropped frames. Record the baseline numbers in the implementation notes **before** changing anything, and the numbers after.
- [ ] Budget: at most **2 full-screen composited effects** at once (e.g. rain + one overlay). Scanlines + vignette become a single static pre-rendered layer (one element with both gradients, never animated).
- [ ] Convert the noise overlay to a **pre-rendered noise texture moved with `transform: translate3d`** on an oversized element (not `background-position`), and avoid `mix-blend-mode` (use plain opacity). Pause it when not visible.
- [ ] Replace infinite `text-shadow`/`box-shadow` animations with a fixed shadow plus an animated **opacity** of a duplicate pseudo-element, or remove the loop.
- [ ] `backdrop-filter`: at most one visible at a time; drop it on low-power devices.
- [ ] **Adaptive quality:** a tiny runtime monitor (`js/perf.js`): sample frame times with rAF for the first seconds and every few seconds after; if the average exceeds ~28 ms for a sustained period, set `body.perf-lite`, which turns off the noise overlay, backdrop blurs, rain density (halve) and the heaviest glows. Also start in `perf-lite` when `navigator.hardwareConcurrency <= 4`, `navigator.deviceMemory <= 4` (when available) or `matchMedia('(pointer: coarse)')` combined with a small viewport; allow a localhost override query (`?perf=full|lite`). Never reduce below what is needed to read the text.
- [ ] Offscreen/hidden effects are paused (`document.hidden`, elements not displayed).
- [ ] `will-change` only on elements that animate right now; remove it afterwards.

## Tasks

- [ ] Baseline perf numbers and the perf tool
- [ ] Rework `gfx`/`flash`/`glitch`/`blackout`/`staticBurst`/`corrupt` visuals per the table, keeping their function names and signatures (call sites in story data stay valid)
- [ ] Boot CRT warm-up + scanline pulse; screen tear transition; ghost interference; shutdown RGB split
- [ ] Trace HUD reactivity: `data-trace` states, glow, red vignette, rain intensity hook, tie into `onTick`
- [ ] Trust choice cards animation; board reveal; `cascade()` effect for game over
- [ ] Performance budget work and `perf-lite` mode
- [ ] Flash-rate review (≤ 3/s) and reduced-motion alternatives for every new animation (extend the single reduced-motion block)
- [ ] Remove now-unused keyframes/classes (grep before deleting)

### Skip control rework (added 2026-10-13)

- [ ] Visual rework of the lower-right skip control: label `HOLD TO SKIP`, hold progress shown as a bar that grows with `transform: scaleX` (animate only `transform`/`opacity`, so no conic gradients or `stroke-dashoffset`), a calm idle state **without lowering the text opacity**, minimum 104 x 44 px touch target, font at least 11px. Prefer placing it above the prompt/keyboard on phones so it never covers text. The 3 s hold stays. The skip logic itself is phase 3.
- [ ] Trace HUD (5.4): also stop it overlapping the ghost panel label on phones; add the "TRACE PENDING" and "TRACE CLOSED" looks that phase 3.5 sets up.

## Out of scope

The TRACED sequence content (phase 6), audio (phase 2), dev panel animation previews (phase 7; but keep effect names stable so it can preview them).

## Verification

- [ ] `node tools/smoke.mjs` passes (desktop, 390 px, reduced motion).
- [ ] `node tools/perf.mjs`: after numbers are **better or equal** to baseline at 4× CPU throttle; target p95 frame time ≤ 33 ms on the puzzle screen in `perf-lite`.
- [ ] Screenshots/video frames of each effect at 390×844 and 1280×800 (headless screenshots at several animation times; attach to the PR).
- [ ] With reduced motion: no transforms/flicker; the info still appears.
- [ ] `grep` shows no animated `top/left/width/height/background-position` in `styles.css` (a simple lint in `tools/check-fonts.sh`'s neighbor, `tools/check-animations.sh`).
- [ ] The owner checks the **feel** on a real phone (cannot be judged headless); list the specific effects to review in the PR.

## Done when

All table rows are implemented with compositor-only properties, performance numbers are better than the baseline and recorded, `perf-lite` works, and reduced-motion is honored everywhere.

## Carried over from the phase 1 review

- [ ] Phase 1 left **41 of 73 `@keyframes`** animating `filter`, `box-shadow`, `text-shadow`, `clip-path`, `letter-spacing`, colors, `background-position` or `top`, and one transition animating `top`/`left`/`font-size` (only `shutdown-scan` was converted). Convert them to `transform`/`opacity` (or replace with layered pseudo-elements) as part of this phase; count the offenders with a script before and after.


## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 5.1 Baseline perf numbers + tools/perf.mjs | todo | | |
| 5.2 Rework gfx / flash / glitch / blackout / staticBurst / corrupt | todo | | |
| 5.3 Boot CRT warm-up, screen tear, ghost interference, shutdown RGB split | todo | | |
| 5.4 Trace HUD reactivity (data-trace, vignette, rain intensity) | todo | | |
| 5.5 Trust-choice cards, board reveal, cascade() | todo | | |
| 5.6 Performance budget + perf-lite mode | todo | | |
| 5.7 Reduced-motion + flash-rate review + cleanup | todo | | |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here: baseline vs after frame times, what was removed, what the owner must eyeball)_
