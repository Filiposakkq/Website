# Audio

Valid after: phase 4b (PR #14), `main` `4f6d0de` (as written by the phase PRs; not re-checked against the code since: unverified). Cue list with callers: [`../overhaul/audio-cues.md`](../overhaul/audio-cues.md).

- `js/audio.js` is a thin controller; the sounds are **data** in `js/audio/patches.js` (cues and 4 ambient beds) and the Web Audio code is in `js/audio/render.js`.
- API: `play(name, params?)`, `setScene`, `unlock`, `list()`, `duration()`, `stopAll({ beds })`, `dispose()`, `pendingNodes()`, `prepare()`.
- The AudioContext is created only after the launch click (smoke test asserts it).
- `js/trace-sound.js` plays the trace tick (every second), warning (120 s) and critical (60 s, 10 s) sounds via `trace.js`' `onSecond`.
- Typing uses `key-tick` (rate limited; auto-typed story text ticks softly). A voice in `story-data/voices.js` may name its own `tick` cue; the third voice `<???>` uses `key-tick-mystery` (also for its random lines in the board terminal) (a rounder, lower blip, same rate limit; the last cue of the table because the audio lint draws random numbers in table order). Not heard by anyone yet.
- The session abort hook stops cues and the voice clip (`stopAll({ beds: false })`, scene `idle`).
- New cues that nothing plays yet are registered only; phases 3, 4 and 6 wire them. No master volume API.
- Unverified: nobody has listened yet (owner checklist "Phase 2 only"); the Firefox/Safari fallback for `cancelAndHoldAtTime` has never run.
- Lint: `node tools/audio-lint.mjs` (see `tools.md`).
