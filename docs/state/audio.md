# Audio

Valid after: phase 2 (PR #7), `main` `2a9abad`, verified 2026-10-14. Cue list with callers: [`../overhaul/audio-cues.md`](../overhaul/audio-cues.md).

- `js/audio.js` is a thin controller; the sounds are **data** in `js/audio/patches.js` (cues and 4 ambient beds) and the Web Audio code is in `js/audio/render.js`.
- API: `play(name, params?)`, `setScene`, `unlock`, `list()`, `duration()`, `stopAll({ beds })`, `dispose()`, `pendingNodes()`, `prepare()`.
- The AudioContext is created only after the launch click (smoke test asserts it).
- `js/trace-sound.js` plays the trace tick (every second), warning (120 s) and critical (60 s, 10 s) sounds via `trace.js`' `onSecond`.
- Typing uses `key-tick` (rate limited; auto-typed story text ticks softly).
- The session abort hook stops cues and the voice clip (`stopAll({ beds: false })`, scene `idle`).
- New cues that nothing plays yet are registered only; phases 3, 4 and 6 wire them. No master volume API.
- Unverified: nobody has listened yet (owner checklist "Phase 2 only"); the Firefox/Safari fallback for `cancelAndHoldAtTime` has never run.
- Lint: `node tools/audio-lint.mjs` (see `tools.md`).
