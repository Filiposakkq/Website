# fsociety00-dat — Code Review & Improvement Roadmap

A deep audit of the full codebase. Findings are grouped by domain and ranked by impact.

---

## 🔴 Bugs (Fix Now)

### 1. CSS cascade bug — mobile `.logo` padding is dead code
[styles.css (fsociety00)](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/styles.css) — The `@media (max-width: 520px)` override for `.output .logo` at **line 1723** is completely negated by a base rule at **line 1778** that comes *after* it in the file with the same specificity. Mobile padding is never applied.

**Fix:** Move the media query block below the base `.output .logo` rule.

### 2. Trace timer never stops (`trace.js`)
[trace.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/trace.js) — When `secs` reaches 0 (line ~55–65), `clearInterval(id)` is **never called**. The 1-second interval runs forever, calling `api.onTick(0)` every tick for the rest of the session.

**Fix:** Add `clearInterval(id);` in the `secs <= 0` branch.

### 3. Web Audio scheduling violation (`audio.js`)
[audio.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/audio.js) — In `envelope()` (lines 40–45), the attack ramp targets `start + 0.035s`, but several sound effects have total `duration` values of 0.025–0.035s. The decay ramp ends *before* the attack ramp, violating the Web Audio spec's chronological ordering requirement. This can cause `InvalidStateError` or audio glitching.

**Fix:** Scale attack dynamically: `const attack = Math.min(0.035, duration * 0.4);`

### 4. Async reentrancy — game restart doesn't cancel running story
[story.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/story.js) — `resetGame()` (line ~631) and `runDeveloperRoute()` (line ~1538) both fire `void boot()` without cancelling the previous async chain. The old story flow continues waking up from its `await wait(...)` calls and interleaves DOM writes, audio cues, and glitches into the new session.

**Fix:** Thread an `AbortController` / `signal` through all async helpers (`wait`, `say`, `line`, stage loops). Check `signal.aborted` after every `await`.

---

## 🟠 Architecture

### 5. `story.js` is a 1,659-line imperative monolith
The narrative is entirely hardcoded as chained imperative calls (`line()`, `await wait()`, `audio.play()`). Dialogue, timing, and SFX cues are inseparable from runtime logic.

**Compare** with [`casefile.js`](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/casefile.js) lines 1–103, which cleanly defines a declarative `EVIDENCE` array. A similar data-driven approach for story nodes would be transformative:

```js
// Instead of 500 lines of chained awaits:
const BOOT_SEQUENCE = [
  { type: 'line', text: 'FSOC-BIOS v0.0.1', style: 'dim' },
  { type: 'sfx',  cue: 'boot-prompt' },
  { type: 'wait', ms: 300 },
  { type: 'line', text: 'CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz' },
  // ...
];
```

This would unlock: skip logic for free (just advance the pointer), localization, testability, and the ability to author new chapters without touching engine code.

### 6. `createLevel01` takes 13 loose parameters
[level01.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/level01.js) lines 27–41 — `{ line, readCommand, say, gfx, revealSourcePart, wait, staticBurst, audio, caseFile, gameOver, closePrompt, abortCommand, takeover }`. This is a sign of a missing `GameContext` / `RuntimeServices` object that bundles shared capabilities.

### 7. Narrative logic leaked into terminal I/O
[tty.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/tty.js) lines 87–143 — `chooseTrust()` is a high-level story branching function (hardcoded "trust unknown" / "trust watcher" options, CSS classes, DOM construction) living inside what should be a generic terminal primitive module.

### 8. Globals via `window` mutation
[fx.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/fx.js) lines 38–46 — Exposes `window.setRain` and `window.syncRainMotion` as globals. `story.js` calls `window.setRain` in 14 separate locations. Should be a proper ES module export.

### 9. Code duplication across files

| What | Where | Count |
|---|---|---|
| Time formatting (`MM:SS`) | `casefile.js:150`, `level01.js:43`, `trace.js:11` | 3× |
| Text corruption/scramble algorithm | `story.js:307`, `story.js:330`, `story.js:684` | 3× |
| Choice button builder | `tty.js:93–118`, `story.js:726–741` | 2× |

Extract into shared `utils.js` / `format.js`.

### 10. `audio.js` — 300-line procedural switch
[audio.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/audio.js) lines 224–519 — 45 sound cases defined inline with hardcoded oscillator/filter parameters. A data-driven patch table mapping cue names to synth parameter structs would halve the file size and make adding new sounds trivial.

---

## 🟡 Accessibility (WCAG)

### 11. Global focus hijacking violates WCAG 2.1.2 (No Keyboard Trap)
[tty.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/js/tty.js) lines 39–42 — Any keypress *anywhere* on the page yanks focus to `.tty-input` when the terminal is awaiting input. Users cannot Tab to the Evidence Board trigger, Dev menu, or any other interactive element. **This is the single biggest a11y problem in the repo.**

**Fix:** Only steal focus when the event originates within the terminal/screen container, or when no dialog/overlay is open.

### 12. `--dim` color fails WCAG AA contrast
[styles.css (fsociety00)](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/styles.css) line 3 — `--dim: #1a8f3a` on `--bg: #000` is **2.4:1** contrast (AA requires 4.5:1). This colors the terminal prompt, launch instructions, status text, and ghost labels — all functional content.

**Fix:** Bump to `#29b852` or lighter for ≥4.5:1.

### 13. Terminal output is invisible to screen readers
[`#output`](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/index.html#L30) has no `role="log"` or `aria-live` attribute. As `line()`, `type()`, and `say()` append text, screen reader users get zero feedback.

### 14. Canvas rain not hidden from assistive tech
[index.html (fsociety00)](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/index.html#L18) — `<canvas id="rain">` is missing `aria-hidden="true"`. Screen readers encounter an unlabeled empty canvas.

### 15. Custom dialogs lack focus trapping
Both the launch overlay and power panel use `<div role="dialog">` instead of native `<dialog>`. Neither implements keyboard focus trapping — users can Tab out into hidden background content. (The main site correctly uses `<dialog>` for its easter egg.)

### 16. Tool chips on main site missing `aria-pressed`
[index.html (main)](file:///d:/Coding%20stuff/fsociety00-dat/sites/main/public/index.html) lines 60–70 — Toolkit buttons toggle `.is-selected` visually but never update `aria-pressed`. Compare with the language switcher (lines 77–82) which does this correctly.

### 17. Sub-10px font sizes throughout
`8px` and `9px` fonts appear in the developer menu, evidence panel, and logo relay. These are barely legible on high-DPI mobile and fail readability standards.

---

## 🔵 Performance

### 18. `shutdown-scan` animates `top` (layout thrashing)
[styles.css (fsociety00)](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/styles.css) lines 924–929 — Infinite `@keyframes shutdown-scan` animates `top: 0` → `top: 100%`, forcing a full layout recalc every frame.

**Fix:** Use `transform: translateY()` — composited on GPU, zero layout cost.

### 19. Unthrottled `pointermove` on project card (main site)
[script.js (main)](file:///d:/Coding%20stuff/fsociety00-dat/sites/main/public/script.js) lines 78–88 — Calls `getBoundingClientRect()` on every raw pointer move, then immediately writes CSS custom properties. On 120Hz+ displays this is a read/write thrash every ~8ms.

**Fix:** Cache bounds on `pointerenter`; batch writes in `requestAnimationFrame`.

### 20. Digital rain uses `setInterval` instead of `requestAnimationFrame`
[fx.js](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/fx.js) line 34 — Fixed 55ms `setInterval` for the canvas rain. Doesn't pause when the tab is hidden, doesn't adapt to display refresh rate, and the `prefers-reduced-motion` listener can't start/stop it after initialization.

### 21. Stacking expensive composite layers on mobile
The fsociety00 page simultaneously runs:
- Full-screen canvas rain
- Repeating-gradient scanlines
- Animated `background-position` noise with `mix-blend-mode: screen`
- 3 separate `backdrop-filter: blur()` overlays
- 20+ infinite keyframe animations with `text-shadow` and `box-shadow`

On budget phones this combination will drop well below 30fps. Consider reducing simultaneous effects or gating them behind a performance budget.

---

## 🟢 CSS Cleanup (Low Priority, High Payoff)

### 22. 35+ hardcoded color shades on main site
[styles.css (main)](file:///d:/Coding%20stuff/fsociety00-dat/sites/main/public/styles.css) — Despite `:root` tokens, 35+ distinct pink/gray hex values are sprinkled through the file (`#d0c0c2`, `#72575c`, `#c5aeb2`, `#f0dfe1`, etc.). Consolidate into a tiered token scale (`--text-primary`, `--text-secondary`, `--text-muted`, `--text-dim`).

### 23. Redundant breakpoint declarations
[styles.css (main)](file:///d:/Coding%20stuff/fsociety00-dat/sites/main/public/styles.css) lines 826–917 — `.about-details { grid-template-columns: 1fr; }` is declared identically at 780px, 760px, 560px, and 360px breakpoints. Once set at 780px, the narrower ones are pure noise.

### 24. Three disconnected `prefers-reduced-motion` blocks (fsociety00)
Lines 1044, 1069, and 1718 each declare separate reduced-motion overrides. The universal `*` block at line 1069 already overrides everything — the other two are redundant. Consolidate into one block.

### 25. Dead CSS — duplicate `.glyph i.on` rule
[styles.css (fsociety00)](file:///d:/Coding%20stuff/fsociety00-dat/sites/fsociety00/public/styles.css) — Line 1854 defines `.glyph i.on` which is completely overridden by an identical selector at line 1907.

---

## Timer & Cleanup Risks (Leak Surface)

| Risk | Location | Detail |
|---|---|---|
| Orphaned nested timeout | `level01.js:86–92` | Inner 700ms `setTimeout` inside `elliotEchoTimer` is untracked and uncancellable on reset |
| Logo ambient intervals not cleared on victory | `story.js:455–462` | `ambientIntervals` is only cleared in `gameOver()` and dev routes, not the victory path |
| `stopBed()` mixes audio clock with `setTimeout` | `audio.js:193–212` | `context.currentTime` vs `window.setTimeout` drift when tab is backgrounded |
| `fx.js` rain can't restart after reduced-motion toggle | `fx.js:34–46` | If page loads with reduced motion, the interval is never created; toggling it off later has no effect |

---

## What's Already Good

Worth calling out — the codebase has genuine strengths:

- **Zero dependencies.** No framework, no bundler, no build step. Refreshingly lean.
- **`casefile.js` is well-architected.** Declarative evidence data, clean separation of data/rendering, good interactive map with keyboard support.
- **Thoughtful a11y baseline on the main site.** Skip-link, native `<dialog>`, `aria-live` regions, `aria-pressed` on language switcher, proper `aria-hidden` on decorative elements.
- **The creative ambition is exceptional.** A fully playable interactive terminal story with branching choices, an evidence board, timed trace, audio engine, and a shutdown sequence — all in vanilla JS — is genuinely impressive work.
- **`prefers-reduced-motion` respected** (even if the implementation has redundancy).
- **Clean Cloudflare Workers deployment** — each site independently deployable with its own Wrangler config.
