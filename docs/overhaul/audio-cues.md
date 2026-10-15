# Audio cues: who calls what

Written in phase 2 (step 2.1) from `grep` over `sites/fsociety00/public/js` at commit `a993475` (head of `main` after phase 1). **Keep this file current:** phases 3 to 7 add or change rows when they wire a cue. The runtime registry (`audio.list()`, built from `js/audio/patches.js`) is the source of truth for names, categories and durations; this file adds *who calls the cue*.

Rules: do not rename or remove a cue name another file uses (grep first). Scene names used by `audio.setScene()` are listed at the bottom.

## Existing cues (all 62, plus the voice clip)

"Caller" is the file and function (or command) that plays the cue. Categories follow the phase 2 sound design brief.

| Cue | Category | Caller |
|---|---|---|
| `power-on` | boot | `story.js` `launchStory` (after the launch click) |
| `boot-memory` | boot | no caller since phase 3.3 (the boot plays `boot-memtest` instead; kept, names are never removed) |
| `boot-prompt` | boot | `story-data/boot.js` (BIOS) |
| `boot-checkpoint` | boot | `story-data/boot.js` (BIOS) |
| `kernel-tick` | boot | `output.js` `klog` (every 3rd kernel line) |
| `kernel-start` | boot | `story-data/boot.js` (GRUB to kernel) |
| `service` | boot | `output.js` `svc` (start of a service line) |
| `service-ready` | boot | `output.js` `svc` (state `OK`) |
| `drive-seek` | boot | `story-data/boot.js` |
| `relay-hop` | boot | no caller since phase 3.3 (the new boot has no relay hops; kept) |
| `network-lock` | boot | no caller since phase 3.3 (kept) |
| `disk-unseal` | boot | no caller since phase 3.3 (kept) |
| `terminal-open` | boot | `output.js` `cmd` (a typed command appears) |
| `typewriter-start` | terminal | `output.js` `type` (start of each typed line) |
| `typing` | terminal | no caller found (defined, unused) |
| `key-tap` | terminal | no caller since phase 2.5 (replaced by `key-tick`; kept, names are never removed) |
| `command-submit` | terminal | `story.js` `onKeyPress` when the key is Enter |
| `list-hit` | terminal | `level01.js` commands `help`, `ls` |
| `file-read` | terminal | `level01.js` commands `cat`, `evidence`, `view-source`, and the system commands (`system-commands.js`: `whoami`, `ps`, `netstat`, ...) |
| `hint` | terminal | `level01.js` command `hint` |
| `success` | terminal | `level01.js` `unlock` (correct key); `ghost.js` `setStep` (last ghost step) |
| `failure` | terminal | `level01.js` `unlock` (wrong key); `output.js` `svc` plays `boot-fail` instead since phase 3.3 |
| `progress-start` | terminal | `output.js` `bar` |
| `progress-tick` | terminal | `output.js` `bar` (every 4th step) |
| `progress-complete` | terminal | `output.js` `bar` |
| `message` | story | `output.js` `say` |
| `transmission` | story | `story-data/intro.js` |
| `incoming-call` | story | `output.js` `typingFor` |
| `mail-arrive` | story | `story-data/intro.js` |
| `logo` | story | `logo.js` |
| `puzzle-start` | story | `story-data/intro.js` |
| `hello-move` | story | `reveal.js` `moveHelloIntoChat` (via `story-data/ending.js`) |
| `hello-friend` | story | `story-data/ending.js` (sfx node): **plays the mp3 clip, not a synth**; needs `unlock()` first |
| `identity` | story | `story-data/ending.js` |
| `identity-hit` | story | `story-data/ending.js` |
| `elliot-echo` | story | `level01.js` `showElliotEcho`, and `unlock elliot` |
| `ghost` | story | no caller found (defined, unused) |
| `ghost-transition` | story | `story-data/ghost.js` |
| `ghost-step` | story | `ghost.js` `setStep` |
| `ghost-scan` | story | `story-data/ghost.js`, `story.js` DEV route `ghosted` |
| `ghost-command` | story | `story-data/ghost.js` (twice: `close_trace`, `disconnect_peer`) |
| `ghosted-stamp` | story | `story-data/ending.js` (sfx node), `story.js` DEV route |
| `trace-appear` | trace | `story.js` `createTrace` (the intro's `trace start` node) |
| `trace-tick` | trace | `trace-sound.js`, called once per second by `trace.js` (`onSecond`, attached in `story.js` `createTrace`) with `{ secondsLeft }` |
| `trace-status` | trace | `level01.js` command `trace` |
| `trace-warning` | trace | `story-data/boot.js` (the warnings after the partition scan) |
| `trace-critical` | trace | `trace-sound.js`: when the trace crosses 60 s and again at 10 s |
| `trace-expired` | trace | `endings.js` `gameOver` (when the reason is a trace expiry) |
| `static` | glitch | `fx-screen.js` `flash`, `glitch`, `staticBurst` |
| `corrupt` | glitch | `fx-screen.js` `corrupt` |
| `signal` | glitch | `story-data/ghost.js`, `endings.js` `watcherTakeover` |
| `glitch-rgb` | glitch | `fx-screen.js` `gfx('rgb')`, DEV route |
| `glitch-slice` | glitch | `fx-screen.js` `gfx('slice')` |
| `glitch-roll` | glitch | `fx-screen.js` `gfx('roll')` |
| `glitch-invert` | glitch | `fx-screen.js` `gfx('invert')` |
| `glitch-zoom` | glitch | `fx-screen.js` `gfx('zoom')` |
| `intrusion` | game over | `story-data/ghost.js`, `endings.js` `watcherTakeover` |
| `disconnect` | game over | `endings.js` `watcherTakeover` (last intrusion stage) and `story-data/intro.js` |
| `shutdown` | game over | `endings.js` `gameOver` |
| `shutdown-stage` | game over | `endings.js` `gameOver` (each phase except the last) |
| `power-cut` | game over | `endings.js` `gameOver` (last phase) |
| `reboot` | game over | `story.js` `resetGame` |

Notes from the audit:

- `typing` and `ghost` have no caller today. They stay (names are never removed).
- Before phase 2.5 `trace-tick` was not called once per second: `level01.js` played it once at 60 s and 30 s and `trace-critical` once at 10 s. Phase 2.5 moved this to `trace-sound.js` (every second, reactive).
- `tty.js` fires the `onKeyPress` hook only for a single character, Backspace or Enter, never for `event.repeat` and never with Ctrl, Cmd or Alt held (shortcuts; added in phase 2 after the review), so modifier, navigation and shortcut keys are silent.
- Nothing in `trace.js`, `tty.js` or `developer-menu.js` calls the audio controller directly. Since phase 4.2 `casefile.js` does (it receives `audio` and plays the evidence state-change cues).

## New cues added in phase 2 (registered, wired later unless noted)

All are in `js/audio/patches.js` and appear in `audio.list()`. "Wired by" says who has to call them. Phase 2 wires only the typing and trace cues (see the next section).

| Cue | Category | Wired by |
|---|---|---|
| `boot-complete` | boot | **phase 3.3, wired**: `story-data/boot.js` at the login prompt |
| `boot-memtest` | boot | **phase 3.3, wired**: `story-data/boot.js` while the memory counts up |
| `boot-fail` | boot | **phase 3.3, wired**: `output.js` `svc` when a service line is `FAILED` (the firewall) |
| `key-tick` | terminal | **phase 2, wired**: real keystrokes (`story.js` `onKeyPress`) and auto-typing in `type`, `cmd`, `say` (every 3rd character, `{ gain: 0.6 }`) |
| `key-tick-mystery` | terminal | **phase 4b.2, wired**: the typing tick of the third voice `<???>`: `output.js` `say` plays the `tick` named in `story-data/voices.js` instead of `key-tick` for that voice only. A soft hollow blip (390 to 500 Hz, round, quiet), rate limited to 15 per second like `key-tick`. It is the last cue of the table (the audio lint draws random numbers in table order). **Not heard by anyone yet**: owner checklist, section "Phase 4b only" |
| `cmd-run`, `cmd-fail` | terminal | wired in phase 4.3 by `hacking-commands.js` (`cmd-run` when `scan`/`intercept`/`decrypt` start, `cmd-fail` on a refusal or a miss); the phase 3 Linux commands still do not play them |
| `ghost-appear` | story | **phase 3.6, wired**: `story-data/ghost.js` when the ghost panel opens |
| `trust-choice` | story | **phase 3.5, wired**: `story-data/routes.js`, right after the player picks |
| `trace-start` | trace | **phase 3.5, wired**: `story.js` engine host, when the trace turns `lethal` (after the trust choice) |
| `trace-warn` | trace | **phase 2, wired**: `trace-sound.js` when the trace crosses 120 s |
| `evidence-unlock` | evidence | **phase 4.2, wired**: `casefile.js` when a record becomes readable (`discover`, `dump`, an `intercept` capture) |
| `evidence-decrypt` | evidence | **phase 4.2, wired**: `casefile.js` `finishDecrypt` |
| `board-open`, `node-select` | evidence | **phase 4.5, wired**: `board-ui.js` (the board opens; a row or node is selected) |
| `relay-connect` | hacking | **phase 4.2, wired**: `casefile.js` `connect` (a pair revealed INTEL) |
| `breach-alert` | hacking | **phase 4.2, wired**: `casefile.js` `compromiseCheck` (evidence lost to the trace) |
| `decrypt-progress` (12 per second max), `packet-intercept` | hacking | wired in phase 4.3: `decrypt-progress` ticks with every redraw of the progress line of `scan` and `decrypt`; `packet-intercept` plays once per packet row of `intercept` |
| `traced-alert`, `system-takeover`, `session-kill` | game over | phase 6 |

Aliases (different name, same sound; `audio.list()` marks them `kind: 'alias'`): `trace-expire` is `trace-expired`, `identity-reveal` is `identity`.

## Scenes (`audio.setScene(name)`)

| Scene | Set by |
|---|---|
| `idle` | `armSession`, `resetGame` (silence, no bed) |
| `boot` | `launchStory`, `resetGame`, DEV route |
| `story` | `story-data/ending.js`, DEV route |
| `puzzle` | `runStory`, `finishSequence`, `watcherTakeover`, DEV route |
| `ghost` | `runGhost`, DEV route |
| `reveal` | `story-data/ending.js` |
| `shutdown` | `endings.js` `gameOver` |
| `intrusion` | `watcherTakeover` |

Beds (data in `BEDS`, also accepted by name in `setScene`): `ambient-boot` (scene `boot`), `ambient-story` (scenes `story`, `reveal`, `ghost`, as three flavours of one bed), `ambient-puzzle` (scene `puzzle`), `ambient-traced` (scenes `shutdown`, `intrusion`).

## Reactive cues

`audio.play(name, params)`: `trace-tick` reads `{ secondsLeft }` (pitch 1.0 to 2.1 kHz as time drops, louder below 120 s, metallic layer below 60 s, a second ping half a second later at 30 s and below). Every cue also accepts `{ gain }`.
