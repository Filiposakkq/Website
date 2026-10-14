# Story, level and evidence code

Valid after: phase 2 (PR #7), `main` `2a9abad`, verified 2026-10-14. The plot itself is in [`../story/story-bible.md`](../story/story-bible.md).

| File | Role |
|---|---|
| `js/story.js` | Entry point, boot, effects (`gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`), story script, game over, developer routes. Builds the session and the GameContext. `say()` has a `floating` option (text in a body-level layer, used for "hello, friend."). Phase 3 shrinks it |
| `js/level01.js` | `createLevel01(ctx)`: puzzle, command switch, `unlock`, hints, trace expiry handling |
| `js/trace.js` | `startTrace(secs, { session, onSecond })`: HUD and countdown; stops at expiry; `set()` restarts it; `onSecond` is the permanent sound hook, `api.onTick`/`onEnd` stay free for level code. No per-scene policy yet (phase 3, task 3.5) |
| `js/casefile.js` | Evidence board (API in the master README glossary); phase 4 reworks it |
| `js/story-choices.js` | `chooseTrust({ out, line, cmd, terminal })` |

Trace facts: timers 480 s at start, 120 s after the trust choice, 120 s after the unlock, 60 s at 8x on the watcher takeover, `hint` costs 30 s. The ghost sequence's trace keeps running (known issue, phase 3).
