# Phase 2 — Audio engine rework

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-2-audio`
- **Depends on:** phase 1 merged (needs the session/abort model and the smoke test)
- **Can run in parallel with:** phases 3, 5, 8 (it mostly touches only `js/audio.js`)
- **Review items covered:** 3 (final), 10, "`stopBed()` mixes the audio clock with `setTimeout`"
- **Plan section:** 2 (Sound effects rework) + **extra 6 (typing sound feedback)**
- **Touches:** `sites/fsociety00/public/js/audio.js` (rewritten), new `js/audio/` files (optional split), small call-site changes in `story.js` / `level01.js` / `casefile.js`, `tools/audio-lint.mjs`

## Goal

Replace the ~300-line procedural `switch` (62 cases) with a **data-driven patch table**, redesign the sounds so they feel like a real compromised hacker terminal, add the missing cue categories, and fix the timing bugs. The public API used by the game must not break.

## Current state (baseline `8ea680b`)

`audio.js` is ~544 lines and exposes `createAudioController()` → `{ unlock, setScene, play }`:

- `unlock()` creates/resumes the `AudioContext` and unlocks the voice clip `./audio/hello-friend-mr-robot.mp3` (an `<audio>` element used for the "hello, friend." moment). Must be called from the **launch click** (autoplay policy).
- `setScene(scene)` crossfades ambient **beds**. Scenes in use: `idle`, `boot`, `story`, `puzzle`, `ghost`, `reveal`, `shutdown`, `intrusion`.
- `play(cue)` runs a `switch` over cue names. Existing cue names (all used somewhere in the game, **do not rename or remove them**; add aliases if you rename internally):

```text
power-on boot-memory boot-prompt boot-checkpoint kernel-tick kernel-start service service-ready
drive-seek relay-hop network-lock disk-unseal typewriter-start typing key-tap command-submit
message transmission incoming-call mail-arrive file-read list-hit hint success failure
trace-appear trace-tick trace-status trace-warning trace-critical trace-expired puzzle-start
progress-start progress-tick progress-complete ghost ghost-step ghost-scan ghost-command
ghost-transition ghosted-stamp identity identity-hit hello-move hello-friend elliot-echo
logo static corrupt signal intrusion disconnect
glitch-rgb glitch-slice glitch-roll glitch-invert glitch-zoom
shutdown shutdown-stage power-cut reboot terminal-open
```

- Typing sounds already partly exist: `tty.js` has an `onKeyPress` hook and `story.js` wires it to `audio.play(key === 'Enter' ? 'command-submit' : 'key-tap')`.

Known defects:

1. `envelope()` ramps the attack to `start + 0.035` s even for sounds shorter than 35 ms, so the decay ramp can end before the attack ramp. (Phase 1 applied a minimal clamp; here it is removed by design.)
2. `stopBed()` computes an end time on the audio clock but stops the nodes with `window.setTimeout`; when the tab is throttled/backgrounded the two clocks drift and beds can keep playing or get cut early.
3. Everything is hard-coded oscillator/filter parameters inside the switch, so adding a sound means writing 15 lines of node wiring.

## Target architecture

```js
// js/audio/patches.js — pure data
export const PATCHES = {
  'boot-prompt': { kind: 'tone',  wave: 'square', freq: 880, attack: 0.005, decay: 0.08, gain: 0.18 },
  'trace-tick':  { kind: 'noise', filter: 'bandpass', freq: 2000, q: 12, attack: 0.002, decay: 0.05, gain: 0.12 },
  'hdd-seek':    { kind: 'seq', steps: [ /* array of patches with offsets */ ] },
  // ...
};
```

- [ ] Patch **kinds** (extend if needed): `tone` (one oscillator, optional pitch sweep `freqEnd`, optional vibrato/LFO), `noise` (filtered noise burst, `filter` type/freq/q, optional filter sweep), `chord`/`layers` (several tones/noises at once), `seq` (timed list of sub-patches), `fm` (carrier+modulator, good for alarms), `drone` (long, looping, for beds).
- [ ] One generic `playPatch(patch, startTime, options)` renders any patch with an envelope helper that **clamps attack to `Math.min(patch.attack, duration * 0.4)`** and guarantees monotonically increasing ramp times. No ramp may target a time earlier than the previous one.
- [ ] Per-play **variation**: `detune`/`gain` jitter of a few percent (and an optional `variants: [...]` list) so repeated cues such as `key-tick` do not sound machine-gunned.
- [ ] A cue **registry** with metadata: `{ category, description }`, exposed as `audio.list()` for the phase 7 sound-preview panel.
- [ ] `audio.play(name, params?)` keeps the existing signature and ignores unknown names with a **one-time** `console.warn` (not an error, not per play). Optional second argument for reactive cues (e.g. `play('trace-tick', { secondsLeft })`).
- [ ] **Ambient beds** also data-driven (layers of drones/LFOs/noise with gain per layer), crossfaded by `setScene`. Stop nodes with `node.stop(audioClockTime)` scheduled on the **audio clock** and clean up in `onended`; no `setTimeout` for audio lifetimes. Keep the scene names above and add the new beds (below).
- [ ] Master chain: keep the existing compressor/limiter; add a master gain ceiling so no cue exceeds −1 dBFS; expose `audio.setMasterVolume()` only if trivial (a user-facing mute toggle is **out of scope**, the owner declined extra 3).
- [ ] `audio.dispose()` / session cleanup: stop beds and cancel scheduled one-shots when the session aborts (hook into phase 1's `session.onAbort`). `voiceClip` must be paused and reset on abort.
- [ ] Respect `prefers-reduced-motion`? That setting is about motion, not sound; **do not** silence audio for it. Do respect that audio only starts after the launch click.

## Sound design brief (from the original plan)

Grittier and lower in frequency than the current cues; analog, lo-fi, digital; not "game-y". Keep the dynamic range sensible: UI ticks quiet, alerts loud but limited.

| Category | Cues | Direction |
|---|---|---|
| **Boot** | `boot-prompt`, `boot-checkpoint`, `boot-complete` (new), `boot-memtest` (new sweep), `boot-fail` (new distortion burst), `drive-seek` | POST beep → HDD seek chirps → hardware init tones. Grittier, lower frequency. `boot-memtest` is a rising sweep matched to the memory counter. `boot-fail` is a short distorted burst for the `[FAILED] Failed to start Firewall Service` line (phase 3 will add that line) |
| **Terminal** | `key-tick` (typing, extra 6), `cmd-run`, `cmd-fail`, plus existing `key-tap`, `command-submit` | Mechanical key click (filtered noise burst, 2–4 variants + slight pitch jitter). Enter/command run = brief data burst. Fail = low buzz + static crackle. **Extra 6:** typing feedback must be subtle: quieter than other UI sounds, throttled (max ~15 per second) so fast typists or key repeat do not create a roar, and no sound for modifier/navigation keys |
| **Story / tension** | `ghost-appear`, `trust-choice`, `identity-reveal` | Detuned pads, slow LFO sweeps. `trust-choice` = a held drone with rising tension (the decision moment) |
| **Trace** | `trace-start`, `trace-tick`, `trace-warn`, `trace-critical`, `trace-expire` | Tick = cold radar ping. As time drops: pitch rises, tick rate doubles, add distortion. `trace-expire` = flatline tone + burst of noise. The trace code calls `trace-tick` once per second; make it reactive by passing seconds left |
| **Evidence** | `evidence-unlock`, `evidence-decrypt`, `board-open`, `node-select` | Unlock = data chime. Decrypt = filtered sweep resolving to a tone. Board open = panel slide (noise sweep). Node select = soft click |
| **Hacking** | `decrypt-progress`, `packet-intercept`, `relay-connect`, `breach-alert` | New cues for the phase 4 gameplay. Glitchy, lo-fi, digital |
| **Game over** | `traced-alert`, `system-takeover`, `session-kill` | Alarm → escalating corruption → hard cut (used by phase 6) |
| **Ambient beds** | `ambient-boot`, `ambient-story`, `ambient-puzzle`, `ambient-traced` | Evolving background drones. Puzzle bed adds tension. Traced bed is aggressive and distorted. Map to the existing scenes: `boot`→`ambient-boot`, `story`/`reveal`/`ghost`→`ambient-story`, `puzzle`→`ambient-puzzle`, `intrusion`/`shutdown`→`ambient-traced`; keep `idle` silent |

Cues defined here for later phases are fine to exist before they are used (document them in the registry with `usedBy: 'phase N'`).

## Tasks

- [ ] Audit: list every `audio.play(...)` / `audio.setScene(...)` call site (grep) and write the result as `docs/overhaul/audio-cues.md` (cue → who calls it → category). Keep this file updated; phases 3–7 add rows.
- [ ] Build `PATCHES` and the generic renderer; port **every** existing cue first (sounds may be improved, names stay). Then add the new cues from the table.
- [ ] Redesign beds and fix `stopBed` with audio-clock scheduling.
- [ ] Typing sounds (extra 6): `key-tick` with variants and a rate limiter; wire the existing `onKeyPress` hook (already calls `key-tap` / `command-submit`; either rename internally to the new cues through aliases or switch the call to the new names). Also play it for the `type()` / `say()` auto-typing effects **at a reduced rate** (e.g. every 2nd–3rd character, quieter) so the intro feels alive but not noisy. Read how `typewriter-start` / `typing` are used today before changing.
- [ ] Reactive trace ticking: in the code that already reacts each second to the trace (`trace.js` `onTick`, wired in `story.js`), play `trace-tick`/`trace-warn`/`trace-critical` according to seconds left (thresholds: ≤ 120 s warn, ≤ 60 s critical, rate doubles at ≤ 30 s).
- [ ] Session integration: audio stops when a session aborts (phase 1).
- [ ] `tools/audio-lint.mjs` (Playwright): in headless Chromium create an `OfflineAudioContext`, render **every registered cue and every bed for N seconds**, assert: no exception, no NaN/Infinity in the samples, not silent (RMS above a small floor, except the intentionally silent ones), peak ≤ 1.0, total duration ≤ declared. Print a table. Run it in CI-style locally.
- [ ] Listening checklist for the owner (see below), included in the PR description.

## Out of scope

Mute/volume UI (extra 3 declined), new gameplay or story, wiring cues that only exist for later phases beyond registering them (phase 4, 6 and 7 wire them).

## Verification

- [ ] `node tools/audio-lint.mjs` passes for all cues and beds.
- [ ] Smoke test passes; reboot mid-sound leaves no audio playing (assert `audio.pendingNodes() === 0`, expose a debug counter for tests only, no global).
- [ ] No console warnings about unknown cues in a full playthrough.
- [ ] **The owner must listen** (agents cannot hear): play through boot → intro → trust choice → puzzle → victory, and the failure path. Checklist to put in the PR for the owner:
  - [ ] Boot beeps/seek/memtest/fail sound like old PC hardware, not like a game
  - [ ] Typing clicks are subtle, no machine-gun effect when typing fast
  - [ ] Trace tick gets faster and higher as time drops; critical state is unmistakable but not painful
  - [ ] "hello, friend." clip still plays at the right moment and is not masked by beds
  - [ ] Beds crossfade smoothly between scenes; no clicks/pops at transitions
  - [ ] Nothing is louder than the voice clip; no cue clips/distorts unintentionally
  - [ ] After REBOOT there is no leftover sound

## Done when

All cues ported and new ones added, the lint passes, the owner's listening feedback is captured in the implementation notes, and `docs/overhaul/audio-cues.md` is complete.

## Carried over from the phase 1 review

- [ ] Add a smoke assertion that no `AudioContext` exists before the launch click (phase 1 verified it only by reading `audio.js`).
- [ ] Add a smoke scenario for `body.quiet-motion` without the `prefers-reduced-motion` media query (it currently only uses `emulateMedia`).


## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 2.1 Audit cues + audio-cues.md | todo | | |
| 2.2 Patch table + renderer; port all existing cues | todo | | |
| 2.3 Ambient beds + stopBed on the audio clock | todo | | |
| 2.4 New cues (boot, terminal, story, trace, evidence, hacking, game over) | todo | | |
| 2.5 Typing sounds (extra 6) + reactive trace ticks | todo | | |
| 2.6 Session cleanup + tools/audio-lint.mjs | todo | | |
| 2.7 Listening checklist in the PR | todo | | |

## Implementation notes

_(if you stop early, put a **Stopped at** block first: state, half-edited files, failing tests, next command. Then append here)_
