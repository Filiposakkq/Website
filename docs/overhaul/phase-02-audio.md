# Phase 2 — Audio engine rework

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-02-audio` (the owner's name; older docs said `phase-2-audio`)
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
| 2.1 Audit cues + audio-cues.md | done | e68daf6 | all 62 existing cues + scenes mapped to callers; found `trace-tick` is not per-second today, `typing`/`ghost` unused |
| 2.2 Patch table + renderer; port all existing cues | done | 25695fc | `js/audio/patches.js`, `js/audio/render.js`, `audio.js` rewritten (62 cues ported as data; names kept). Full smoke 19/19 on this commit |
| 2.3 Ambient beds + stopBed on the audio clock | done | 25695fc | 4 beds as data, `setScene` keeps all 8 scene names, fades use `setTargetAtTime`, nodes stopped on the audio clock; crossfade click check in the lint. Owner must listen to the beds (unverified by ear) |
| 2.4 New cues (boot, terminal, story, trace, evidence, hacking, game over) | done | e9b34e3 | 21 new cues + 2 aliases registered; lint 0 problems (headroom rule added). Not wired, except what 2.5 does: see `audio-cues.md` |
| 2.5 Typing sounds (extra 6) + reactive trace ticks | done | ee885d4 | `key-tick` wired (real keys + auto-typing every 3rd char at 60% level), `trace-sound.js` (tick every second with `secondsLeft`, warn at 120 s, critical at 60 s and 10 s), `trace.js` `onSecond`; old threshold sounds removed from `level01.js`. Full smoke 20/20 |
| 2.6 Session cleanup + tools/audio-lint.mjs | done | ee885d4 | abort hook: `audio.stopAll({ beds: false })` then `setScene('idle')`; `pendingNodes()` for tests (no global); lint: 108 rows, 0 problems. Full smoke 20/20 |
| 2.7 Listening checklist in the PR | done | PR #7, 0e79a34 | checklist is in `owner-test-checklist.md` ("Phase 2 only") and copied into the PR description; the owner has not listened yet: unverified by ear |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here)_

### Resume point (session 2, 2026-10-14)

- Phase 2 is **finished and waiting for review**. Branch `overhaul/phase-02-audio`, code head `bc1534b` (docs-only commits may follow it). `main` was `a993475` and had not moved.
- `last green commit`: `bc1534b`: full `node tools/smoke.mjs` 20/20 (snapshot run), `node tools/audio-lint.mjs` 110 rows, 0 problems.
- Nothing is half edited. Next: the owner listens on the Cloudflare preview and ticks the "Phase 2 only" list in `owner-test-checklist.md`; a different Claude or the owner merges (never the author). If the owner reports sound problems, change numbers in `js/audio/patches.js` only and rerun the lint.
- If `main` has moved when you resume: `git fetch origin main && git merge origin/main`, rerun smoke and lint, push.

### Resume point (historical: session 1, 2026-10-13)

- Branch `overhaul/phase-02-audio`, created from `main` at `a993475`. Started at 2.2 after the 2.1 audit.
- `last green commit`: `ee885d4` (full `node tools/smoke.mjs`: 20/20 on a snapshot of that commit; `25695fc` was 19/19 before the three new scenarios). Baseline on `a993475` before my changes: 16/16 after rerunning two scenarios that timed out in the parallel run (known flakiness, see `tools/README.md`).
- In progress: 2.2 (patch table + renderer). Plan: `js/audio/patches.js` (data), `js/audio/render.js` (renderer), `js/audio.js` stays the public entry (`createAudioController`).
- Known fallout to handle: the existing smoke scenario `reduced: every audio cue renders offline` finds cues by regex `case '...':` in `audio.js`; the rewrite removes the switch, so that scenario moves to `audio.list()`.
- Next command: `node tools/smoke.mjs --serial` (baseline), then continue 2.2.

### Notes

- The owner named the branch `overhaul/phase-02-audio` (docs said `phase-2-audio`).
- Pushes in this session go through a git proxy that only allows repos attached to the session; the first push attempt failed until the GitHub connection was linked and the repo attached.

## Handoff report (2026-10-14)

### What was built

- **Data-driven engine.** `js/audio/patches.js` holds every sound as data: 83 cues (62 original, all names kept, plus 21 new) and 4 ambient beds, built from a few constructors (`tone`, `noise`, `fm`, `layers`, `variants`, `clip`). `js/audio/render.js` renders any patch with one envelope helper (attack clamped to 40% of the sound, ramp times strictly increasing, NaN-safe) and tracks every source node. `js/audio.js` keeps the public API (`unlock`, `setScene`, `play`) and adds `list()` (the registry for the phase 7 preview panel), `duration()`, `stopAll({ beds })`, `dispose()`, `pendingNodes()` and `prepare()`. `play(name, params)` takes `{ gain }` and cue specific parameters.
- **Review items closed:** 3 (envelope, final), 10 (the 300-line switch), and `stopBed` mixing clocks (beds fade with `setTargetAtTime` and stop with `node.stop(audioClockTime)`; no `setTimeout` for audio lifetimes).
- **Per-play variation:** random detune and gain spread on every play, `variants` for `key-tick` (4 click variants, never the same twice in a row), a per-cue rate limiter (`rate`).
- **Master chain:** compressor, then a soft clip. The loudest possible output is about -2.3 to -2.9 dBFS (the 2x oversampled curve peaks slightly above its nominal value); the lint proves this by driving two cues at 200x gain.
- **Typing (extra 6):** real keystrokes play `key-tick` (limited to 15 per second, never for modifier, navigation, shortcut or auto-repeat keys; `tty.js` got the shortcut guard). Auto-typed text (`type`, `cmd`, `say`) ticks on every 3rd character at 60% level. `key-tap` is no longer played but still exists.
- **Reactive trace sound:** `js/trace-sound.js` is called once per second through a new `onSecond` option of `trace.js` (separate from `onTick`, which `level01.js` still replaces). Tick pitch rises from 1.0 to 2.1 kHz as time drops, it gets louder below 120 s and metallic below 60 s, and the rate doubles at 30 s and below. `trace-warn` once at 120 s, `trace-critical` once at 60 s and once at 10 s (one alarm per tick). The old 60/30/10 s sounds were removed from `level01.js`.
- **Session cleanup:** the abort hook in `story.js` calls `audio.stopAll({ beds: false })` (cues and the voice clip stop at once) then `setScene('idle')` (the bed fades smoothly).
- **New cues, registered but not played by anything yet** (listed with their owners in `audio-cues.md`): boot (`boot-complete`, `boot-memtest`, `boot-fail`), terminal (`cmd-run`, `cmd-fail`), story (`ghost-appear`, `trust-choice`), trace (`trace-start`), evidence (4), hacking (4), game over (3). Two aliases: `trace-expire`, `identity-reveal`.
- **Docs:** `audio-cues.md` (new), owner checklist ("Phase 2 only"), `tools/README.md`, `state-after-phase-1.md` (after-phase-2 section), `CHANGELOG.md`, master README (tracker, decisions, known issue removed), `context.js` typedef.

### Tests

| Check | Result |
|---|---|
| `node tools/smoke.mjs` (full, 20 scenarios, desktop / mobile / reduced) | 20/20 on `bc1534b` (run on a snapshot copy of the tree) |
| `node tools/audio-lint.mjs` | 110 rows, 0 problems: every cue, alias, reactive sample and bed rendered offline (no NaN, not silent, 9 dB headroom, silent after its declared duration), bed crossfades without clicks, rate limits, `stopAll`, the limiter, trace thresholds, `trace.js` `onSecond` |
| New smoke scenarios | no `AudioContext` before the launch click; `body.quiet-motion` alone (without the media query); typing limits; no source node from the previous run alive 1.5 s after a reboot |
| Baseline before my changes (`a993475`) | 14/16 in the first parallel run, 16/16 after rerunning the two timed out scenarios alone (the known flakiness in `tools/README.md`) |
| Independent review-only pass | no Critical or Major findings; 6 minor findings, all fixed in `bc1534b` (see the commit message) |

### Unverified (say so, do not assume)

- **Nobody has listened to any of it.** Levels, taste, "grittier and lower", the beds and the trace tick curve are judged by numbers only. The owner's listening list is in the PR.
- Real devices: iOS Safari and Android audio start, the phone speaker, background tab behaviour of the beds.
- Firefox and Safari: `cancelAndHoldAtTime` does not exist in Firefox, so the code falls back to `cancelScheduledValues` + `setValueAtTime`; that branch has not been run (the lint runs in Chromium only). `Object.hasOwn` needs Safari 15.4 or newer.
- The `hello-friend` voice clip is an mp3; headless Chromium may lack the codec, so the voice path was only checked up to the code level.
- The Cloudflare preview build of this branch has not been looked at.

### Decisions made without the owner

- Branch name `overhaul/phase-02-audio` (the owner's instruction) instead of `phase-2-audio` from the docs.
- `audio.setMasterVolume()` was **not** added (the spec said "only if trivial"; a volume UI is out of scope).
- Brief names that match an existing sound became **aliases** (`trace-expire`, `identity-reveal`); `ghost-appear` and `trust-choice` are new sounds because the brief describes different ones.
- `trace-tick` plays every second for the whole trace, very quietly above 120 s. Phase 3 owns the per-scene trace policy and may want to silence it in some scenes.
- `trace-critical` plays at 60 s and again at 10 s (the 10 s one preserves the old behaviour).
- New cues are registered only; wiring them is left to phases 3, 4 and 6 as the spec says.

### Follow-ups for later phases

- Phase 3: wire `boot-*`, `cmd-*`, `ghost-appear`, `trust-choice`, `trace-start`; decide the per-scene trace sound policy (the tick also runs during the ghost sequence).
- Phase 4: wire the evidence and hacking cues. Phase 6: `traced-alert`, `system-takeover`, `session-kill`. Phase 7: the preview panel reads `audio.list()`; add rows to `audio-cues.md` when wiring.
- `audio.dispose()` is implemented and linted through `stopAll` but nothing calls it.
- `tools/smoke.mjs` now has 20 scenarios and takes about 4 minutes in parallel; two long scenarios can still time out under load (rerun them alone before concluding anything).
