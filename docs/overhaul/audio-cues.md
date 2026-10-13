# Audio cues: who calls what

Written in phase 2 (step 2.1) from `grep` over `sites/fsociety00/public/js` at commit `a993475` (head of `main` after phase 1). **Keep this file current:** phases 3 to 7 add or change rows when they wire a cue. The runtime registry (`audio.list()`, built from `js/audio/patches.js`) is the source of truth for names, categories and durations; this file adds *who calls the cue*.

Rules: do not rename or remove a cue name another file uses (grep first). Scene names used by `audio.setScene()` are listed at the bottom.

## Existing cues (all 62, plus the voice clip)

"Caller" is the file and function (or command) that plays the cue. Categories follow the phase 2 sound design brief.

| Cue | Category | Caller |
|---|---|---|
| `power-on` | boot | `story.js` `launchStory` (after the launch click) |
| `boot-memory` | boot | `story.js` `memtest` |
| `boot-prompt` | boot | `story.js` `runStory` (BIOS step) |
| `boot-checkpoint` | boot | `story.js` `runStory` (BIOS step) |
| `kernel-tick` | boot | `story.js` `klog` (every 3rd kernel line) |
| `kernel-start` | boot | `story.js` `runStory` |
| `service` | boot | `story.js` `svc` (start of a service line) |
| `service-ready` | boot | `story.js` `svc` (state `OK`) |
| `drive-seek` | boot | `story.js` `runStory` |
| `relay-hop` | boot | `story.js` `runStory` (network relays) |
| `network-lock` | boot | `story.js` `runStory` |
| `disk-unseal` | boot | `story.js` `runStory` |
| `terminal-open` | boot | `story.js` `cmd` (a typed command appears) |
| `typewriter-start` | terminal | `story.js` `type` (start of each typed line) |
| `typing` | terminal | no caller found (defined, unused) |
| `key-tap` | terminal | no caller since phase 2.5 (replaced by `key-tick`; kept, names are never removed) |
| `command-submit` | terminal | `story.js` `onKeyPress` when the key is Enter |
| `list-hit` | terminal | `level01.js` commands `help`, `ls` |
| `file-read` | terminal | `level01.js` commands `cat`, `evidence`, `view-source` |
| `hint` | terminal | `level01.js` command `hint` |
| `success` | terminal | `level01.js` `unlock` (correct key); `story.js` `setStep` (last ghost step) |
| `failure` | terminal | `level01.js` `unlock` (wrong key); `story.js` `svc` (state not `OK`) |
| `progress-start` | terminal | `story.js` `bar` |
| `progress-tick` | terminal | `story.js` `bar` (every 4th step) |
| `progress-complete` | terminal | `story.js` `bar` |
| `message` | story | `story.js` `say` |
| `transmission` | story | `story.js` `runStory` |
| `incoming-call` | story | `story.js` `typingFor` |
| `mail-arrive` | story | `story.js` `runStory` |
| `logo` | story | `story.js` `logo` |
| `puzzle-start` | story | `story.js` `runStory` |
| `hello-move` | story | `story.js` `moveHelloIntoChat` |
| `hello-friend` | story | `story.js` `playIdentityReveal`: **plays the mp3 clip, not a synth**; needs `unlock()` first |
| `identity` | story | `story.js` `playIdentityReveal` |
| `identity-hit` | story | `story.js` `playIdentityReveal` |
| `elliot-echo` | story | `level01.js` `showElliotEcho`, and `unlock elliot` |
| `ghost` | story | no caller found (defined, unused) |
| `ghost-transition` | story | `story.js` `runGhost` |
| `ghost-step` | story | `story.js` `setStep` |
| `ghost-scan` | story | `story.js` `finishSequence`, DEV route |
| `ghost-command` | story | `story.js` `finishSequence`, `watcherTakeover` |
| `ghosted-stamp` | story | `story.js` `redact`, DEV route |
| `trace-appear` | trace | `story.js` `createTrace` |
| `trace-tick` | trace | `trace-sound.js`, called once per second by `trace.js` (`onSecond`, attached in `story.js` `createTrace`) with `{ secondsLeft }` |
| `trace-status` | trace | `level01.js` command `trace` |
| `trace-warning` | trace | `story.js` `runStory` (the failed-trace warning in the boot) |
| `trace-critical` | trace | `trace-sound.js`: when the trace crosses 60 s and again at 10 s |
| `trace-expired` | trace | `story.js` `gameOver` (when the reason is a trace expiry) |
| `static` | glitch | `story.js` `flash`, `glitch`, `staticBurst` |
| `corrupt` | glitch | `story.js` `corrupt` |
| `signal` | glitch | `story.js` `finishSequence`, `watcherTakeover` |
| `glitch-rgb` | glitch | `story.js` `gfx('rgb')`, DEV route |
| `glitch-slice` | glitch | `story.js` `gfx('slice')` |
| `glitch-roll` | glitch | `story.js` `gfx('roll')` |
| `glitch-invert` | glitch | `story.js` `gfx('invert')` |
| `glitch-zoom` | glitch | `story.js` `gfx('zoom')` |
| `intrusion` | game over | `story.js` `finishSequence`, `watcherTakeover` |
| `disconnect` | game over | `story.js` `watcherTakeover` and the end of the intrusion stages in `runStory` |
| `shutdown` | game over | `story.js` `gameOver` |
| `shutdown-stage` | game over | `story.js` `gameOver` (each phase except the last) |
| `power-cut` | game over | `story.js` `gameOver` (last phase) |
| `reboot` | game over | `story.js` `resetGame` |

Notes from the audit:

- `typing` and `ghost` have no caller today. They stay (names are never removed).
- Before phase 2.5 `trace-tick` was not called once per second: `level01.js` played it once at 60 s and 30 s and `trace-critical` once at 10 s. Phase 2.5 moved this to `trace-sound.js` (every second, reactive).
- `tty.js` fires the `onKeyPress` hook only for a single character, Backspace or Enter, never for `event.repeat` and never with Ctrl, Cmd or Alt held (shortcuts; added in phase 2 after the review), so modifier, navigation and shortcut keys are silent.
- Nothing in `casefile.js`, `trace.js`, `tty.js` or `developer-menu.js` calls the audio controller directly.

## New cues added in phase 2 (registered, wired later unless noted)

All are in `js/audio/patches.js` and appear in `audio.list()`. "Wired by" says who has to call them. Phase 2 wires only the typing and trace cues (see the next section).

| Cue | Category | Wired by |
|---|---|---|
| `boot-complete` | boot | phase 3 (realistic boot) |
| `boot-memtest` | boot | phase 3 (rising sweep for the memory counter) |
| `boot-fail` | boot | phase 3 (the `[FAILED] Failed to start Firewall Service` line) |
| `key-tick` | terminal | **phase 2, wired**: real keystrokes (`story.js` `onKeyPress`) and auto-typing in `type`, `cmd`, `say` (every 3rd character, `{ gain: 0.6 }`) |
| `cmd-run`, `cmd-fail` | terminal | phase 3 (Linux commands) |
| `ghost-appear` | story | phase 3 (story engine) |
| `trust-choice` | story | phase 3 (story engine, the trust choice) |
| `trace-start` | trace | phase 3 (trace policy) |
| `trace-warn` | trace | **phase 2, wired**: `trace-sound.js` when the trace crosses 120 s |
| `evidence-unlock`, `evidence-decrypt`, `board-open`, `node-select` | evidence | phase 4 |
| `decrypt-progress` (12 per second max), `packet-intercept`, `relay-connect`, `breach-alert` | hacking | phase 4 |
| `traced-alert`, `system-takeover`, `session-kill` | game over | phase 6 |

Aliases (different name, same sound; `audio.list()` marks them `kind: 'alias'`): `trace-expire` is `trace-expired`, `identity-reveal` is `identity`.

## Scenes (`audio.setScene(name)`)

| Scene | Set by |
|---|---|
| `idle` | `armSession`, `resetGame` (silence, no bed) |
| `boot` | `launchStory`, `resetGame`, DEV route |
| `story` | `runStory`, `playIdentityReveal` (end), DEV route |
| `puzzle` | `runStory`, `finishSequence`, `watcherTakeover`, DEV route |
| `ghost` | `runGhost`, DEV route |
| `reveal` | `playIdentityReveal` |
| `shutdown` | `gameOver` |
| `intrusion` | `watcherTakeover` |

Beds (data in `BEDS`, also accepted by name in `setScene`): `ambient-boot` (scene `boot`), `ambient-story` (scenes `story`, `reveal`, `ghost`, as three flavours of one bed), `ambient-puzzle` (scene `puzzle`), `ambient-traced` (scenes `shutdown`, `intrusion`).

## Reactive cues

`audio.play(name, params)`: `trace-tick` reads `{ secondsLeft }` (pitch 1.0 to 2.1 kHz as time drops, louder below 120 s, metallic layer below 60 s, a second ping half a second later at 30 s and below). Every cue also accepts `{ gain }`.
