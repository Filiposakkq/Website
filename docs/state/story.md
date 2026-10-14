# Story, level and evidence code

Valid after: phase 3.1 (branch `overhaul/phase-3-story`; the rest of this file is as of phase 2, `main` `2a9abad`), verified 2026-10-14. The plot itself is in [`../story/story-bible.md`](../story/story-bible.md).

| File | Role |
|---|---|
| `js/story.js` | Entry point, boot, effects (`gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`), story script, game over, developer routes. Builds the session and the GameContext. `say()` has a `floating` option (text in a body-level layer, used for "hello, friend."). Phase 3 shrinks it |
| `js/level01.js` | `createLevel01(ctx)`: puzzle, command switch, `unlock`, hints, trace expiry handling |
| `js/trace.js` | `startTrace(secs, { session, onSecond })`: HUD and countdown; stops at expiry; `set()` restarts it; `onSecond` is the permanent sound hook, `api.onTick`/`onEnd` stay free for level code. No per-scene policy yet (phase 3, task 3.5) |
| `js/casefile.js` | Evidence board (API in the master README glossary); phase 4 reworks it |
| `js/story-choices.js` | `chooseTrust({ out, line, cmd, terminal })` |

Trace facts: timers 480 s at start, 120 s after the trust choice, 120 s after the unlock, 60 s at 8x on the watcher takeover, `hint` costs 30 s. The ghost sequence's trace keeps running (known issue, phase 3).

## Narrative engine (`js/engine.js`, new in phase 3; not yet driving the game, see the phase 3 checkpoint log)

A story is `{ initialState, routes?, segments: [{ id, skippable, announce, nodes }] }`. The engine compiles the segments into one flat program (a `branch` becomes jumps), walks it with a pointer, and asks a **host** (built by `story.js`) to do everything visible. It never touches the DOM, so `node tools/validate-story.mjs` can validate and dry-run a story.

- **Node types** (fields in `NODE_SPECS`, unknown fields are validation errors): output `line blank type say typing cmd bar klog svc memtest`, timing and sound `wait sfx scene`, effects `gfx flash static corrupt blackout rain logo wipe`, `trace` (`do`: `start dock boost slow set mode close`), `state`, `case` (a call on the case file), flow `label goto branch choice end`, and `run { fn(host, flow) }` for a bespoke beat. Any field may be a function `(state, host) => value`.
- **Segments and skip.** `skippable: 'boot' | 'intro'` lets the skip control start a skip while the pointer is in the segment. A skip calls `session.flush()` and sets the pace to fast: waits collapse, `sfx`/`gfx`/`flash`/`static`/`corrupt`/`wait` nodes are dropped, text still appears instantly and state changes (`scene`, `trace`, `state`, `case`, `run`) still happen. Entering the next segment ends the fast-forward. `announce: false` keeps screen readers quiet (the BIOS).
- **State** is a small object; `engine.getState()` returns a read-only copy plus the pointer (for the phase 7 inspector). `run({ from: label, state })` starts anywhere (developer routes).
- **Validation** (`tools/validate-story.mjs`): node types and fields, label and `choice.next` targets, audio cues and scenes, glitch names, case file calls, developer-route labels, plus a dry run for every combination of choices.
