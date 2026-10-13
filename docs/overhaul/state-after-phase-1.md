# State of the code after phase 1

Written 2026-10-13 for the Claudes that start phases 2-9. **Read this before the "Current state (baseline `8ea680b`)" sections in the phase files:** those describe the code *before* phase 1 and their line numbers are stale (`story.js` was rewritten, `fx.js` is gone). Verify every claim against the code (`grep`, not line numbers). Head of `main` when this was written: `841cad0` (phase 1 squash commit).

## What phase 1 changed

- Every long-running thing in the game now belongs to a **session**. Aborting the session (reboot, developer jump) stops all of it.
- Modules get one frozen **GameContext** instead of a long list of loose parameters.
- Shared helpers live in `util.js`; the trust choice lives in `story-choices.js`; the rain is an ES module.
- The terminal no longer steals focus from controls or open dialogs; dialogs are native `<dialog>`; there is a screen-reader announcer.
- `tools/` has the smoke test, the font lint and the contrast tool.

## Files (`sites/fsociety00/public/`)

| File | Lines | Role now |
|---|---|---|
| `index.html` | 70 | Launch dialog, `#screen`, `#output` (`role="log"`), prompt line, case trigger, shutdown and power panels (native `<dialog>`), `#srAnnouncer` |
| `styles.css` | 2134 | All game CSS in one file. One `prefers-reduced-motion` block (near the end); `body.quiet-motion` rules near line 1078. **Not yet compliant** with "animate only transform/opacity" (phase 5) |
| `js/story.js` | 1782 | Entry point, boot, effects (`gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`), story script, game over, developer routes. Builds the session and the GameContext. Phase 3 shrinks it |
| `js/level01.js` | 356 | `createLevel01(ctx)`: puzzle, command switch, `unlock`, hints, trace expiry handling |
| `js/tty.js` | 133 | `createTerminal`: prompt, `readCommand({signal})`, focus rules. No story knowledge any more |
| `js/trace.js` | 110 | `startTrace(secs, { session })`: HUD and countdown; stops at expiry; `set()` restarts it |
| `js/casefile.js` | 707 | Evidence board (API in the master README glossary) |
| `js/audio.js` | 559 | WebAudio synth; `{ unlock, setScene, play }`; envelope clamp added in phase 1 |
| `js/session.js` | 162 | See below |
| `js/context.js` | 65 | `createGameContext(parts)`: throws at startup when a member is missing |
| `js/util.js` | 42 | `SCRAMBLE_CHARSET`, `rand`, `randomChar`, `pad2`, `formatClock`, `scrambleText` |
| `js/choices.js` | 44 | `renderChoices({ container, options, onPick, className })` |
| `js/story-choices.js` | 58 | `chooseTrust({ out, line, cmd, terminal })` |
| `js/rain.js` | 127 | `createRain(canvas)` returns `{ setOpacity, setIntensity, pause, resume, destroy }`; rAF, pauses when hidden, reacts live to reduced-motion and `quiet-motion` |
| `js/developer-menu.js` | 127 | Localhost-only DEV panel (phase 7 reworks it) |
| `js/source.js` | 8 | Third layer of the Level 01 key (console message). Do not touch lightly |

## The rules every new code must follow

1. **Timers belong to the session.** Use `session.sleep(ms)`, `session.wait(ms)`, `session.setTimeout`, `session.setInterval`, session frames, and `session.onAbort(fn)` for cleanup. A raw `setTimeout` / `setInterval` / `requestAnimationFrame` / `addEventListener` that is not cleaned on abort is a bug (a reboot leaves it running into the next run).
2. **`AbortError` must propagate.** Never catch it inside the story. Only the outermost wrapper (`startStory`, via `swallowAbort`) may. After any `await` that is not a session helper (`fetch`, `animation.finished`, `audio.unlock()`), call `session.throwIfAborted()`. Fire-and-forget promises need `.catch(swallowAbort)`.
3. **Use the context.** New story or level code takes a `ctx` (see `context.js` for the typedef: `out`, `screen`, `line`, `type`, `say`, `cmd`, `wait`, `session`, `gfx`, `flash`, `staticBurst`, `corrupt`, `audio`, `caseFile`, `trace`, `terminal`, `gameOver`, `takeover`, `revealSourcePart`, `motionReduced`, `isSkipping`). Adding a member means adding it to `REQUIRED` too.
4. **`readCommand({ signal })`** resolves with the line, `null` after `terminal.abort()`, and rejects with an `AbortError` when the session aborts. In the puzzle loop check `state.over` **before** treating `null` as "closed" (this was the trace-expiry hang).
5. **Helpers:** use `util.js` for random, padding, clock formatting and scrambling. `grep padStart(2` and the scramble charset must only hit `util.js`.
6. **Rain:** `createRain` is created once from `story.js` (`const setRain = ...` is a local wrapper; there is no `window.setRain`, no `window.syncRainMotion` and no `fx.js`).
7. **Dialogs** are native `<dialog>` with `showModal()`; scope `display:flex` rules to `[open]`, otherwise the UA hiding is overridden.
8. **Do not break** (see `CLAUDE.md`): the three-layer Level 01 key and `unlock`, audio only after the launch click, reduced motion and `quiet-motion`, dev panel only on localhost and preview (today: localhost only; preview comes with phase 7.6), no real IP/location, 11px minimum, only transform/opacity animations, Worker names in `wrangler.jsonc`.

## Testing

`node tools/smoke.mjs` (16 scenarios) is the baseline. Two scenarios were flaky in a parallel run (14/16, then 16/16 when run alone): see `tools/README.md`. It cannot judge looks or sound; the owner tests the preview on a phone and on desktop (`owner-test-checklist.md`).

## Known issues carried over from phase 1

See "Known issues carried over" in the master README (each has a home phase).
