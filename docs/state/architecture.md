# Architecture and rules

Valid after: phase 3.6 (branch `overhaul/phase-3-story`; rest as phase 2, `main` `2a9abad`), verified 2026-10-14. Verify claims with `grep`, not line numbers.

## Core ideas

- Every long-running thing (timers, intervals, frames, listeners, audio nodes) belongs to a **session** (`js/session.js`). Aborting it (reboot, developer jump) stops everything of that run.
- Modules get one frozen **GameContext** (`js/context.js`, `createGameContext(parts)` throws at startup when a member is missing) instead of loose parameters.
- No build step, no dependencies: vanilla ES modules over HTTP (`file://` does not work).

## Core modules (`sites/fsociety00/public/js/`)

| File | Role |
|---|---|
| `session.js` | Session: `sleep`, `wait`, `flush()` (ends every pending sleep now, used by a skip), `setTimeout`, `setInterval`, frames, `onAbort`, `throwIfAborted`, `pending()`, `currentSession()`, `swallowAbort` |
| `pace.js` | `createPace({ session, motionReduced })`: `wait(ms)` collapses when skipping or when motion is reduced, `sleep(ms)`, `setFast(bool)`, `isSkipping()`. One per session |
| `engine.js` | The narrative engine: `createEngine`, `compileStory`, `validateStory`, `NODE_SPECS`. No DOM, importable in Node. See `story.md` |
| `context.js` | `createGameContext(parts)`, typedef and `REQUIRED` list |
| `util.js` | `SCRAMBLE_CHARSET`, `rand`, `randomChar`, `pad2`, `formatClock`, `scrambleText` |
| `choices.js` | `renderChoices({ container, options, onPick, className })` |
| `tty.js` | `createTerminal`: prompt, `readCommand({signal})`, focus rules, `key-tick` sound on real keys (ignores Ctrl/Cmd/Alt shortcuts). No story knowledge |
| `rain.js` | `createRain(canvas)` returns `{ setOpacity, setIntensity, pause, resume, destroy }`; pauses when hidden; reacts live to reduced motion and `quiet-motion` |
| `source.js` | Third layer of the Level 01 key (console message). Do not touch lightly |

## Rules every new code must follow

1. **Timers belong to the session.** Use `session.sleep/wait/setTimeout/setInterval`, session frames, `session.onAbort(fn)`. A raw `setTimeout`/`setInterval`/`requestAnimationFrame`/`addEventListener` not cleaned on abort is a bug (a reboot leaves it running).
2. **`AbortError` must propagate.** Never catch it inside the story; only the outermost wrapper (`startStory`, via `swallowAbort`). After any `await` that is not a session helper (`fetch`, `animation.finished`, `audio.unlock()`) call `session.throwIfAborted()`. Fire-and-forget promises need `.catch(swallowAbort)`.
3. **Use the context.** New story or level code takes a `ctx` (members: see `context.js`). Adding a member means adding it to `REQUIRED` too.
4. **`readCommand({ signal })`** resolves with the line, `null` after `terminal.abort()`, rejects with `AbortError` when the session aborts. In the puzzle loop check `state.over` **before** treating `null` as "closed".
5. **Helpers:** random, padding, clock and scrambling come from `util.js` only.
6. **Rain:** `createRain` is created once from `story.js`; there is no `window.setRain`.
7. **Dialogs** are native `<dialog>` with `showModal()`; scope `display:flex` rules to `[open]`.
8. **Fixed-position overlays must not live inside `.screen`.** An animated `filter`/`transform` on `.screen` makes it the containing block, so "fixed" text lands in the middle of the whole scrolled log, not the window (the "hello, friend." bug). Put them in a layer appended to `body` (see `say(..., { floating: true })`).
9. **Do not break** (see `CLAUDE.md`): the three-layer Level 01 key and `unlock`, audio only after the launch click, reduced motion and `quiet-motion`, dev panel only on localhost and preview (today: localhost only; preview comes with phase 7.6), no real IP/location, 11px minimum, only transform/opacity animations, Worker names in `wrangler.jsonc`.

## Known issues

See "Known issues carried over" in the master README (`docs/overhaul/README.md`); each has a home phase.
