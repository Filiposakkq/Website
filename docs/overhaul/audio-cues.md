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
| `key-tap` | terminal | `story.js` `createTerminal({ onKeyPress })` for real typing; `type`, `cmd`, `say` for auto-typing (every 5th / 3rd / 6th character) |
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
| `trace-tick` | trace | `level01.js` `trace.onTick`, once at 60 s and once at 30 s left (**not** every second today) |
| `trace-status` | trace | `level01.js` command `trace` |
| `trace-warning` | trace | `story.js` `runStory` (the failed-trace warning in the boot) |
| `trace-critical` | trace | `level01.js` `trace.onTick`, once at 10 s left |
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
- `trace-tick` is not called once per second today. The phase file assumed it was; phase 2.5 adds that (see "Trace" in the sound brief).
- `tty.js` already ignores `event.repeat` and any key that is not a single character, Backspace or Enter, so the `onKeyPress` hook never fires for modifier or navigation keys.
- Nothing in `casefile.js`, `trace.js`, `tty.js` or `developer-menu.js` calls the audio controller directly.

## Scenes (`audio.setScene(name)`)

| Scene | Set by |
|---|---|
| `idle` | `armSession`, `resetGame` (silence) |
| `boot` | `launchStory`, `resetGame`, DEV route |
| `story` | `runStory`, `playIdentityReveal` (end), DEV route |
| `puzzle` | `runStory`, `finishSequence`, `watcherTakeover`, DEV route |
| `ghost` | `runGhost`, DEV route |
| `reveal` | `playIdentityReveal` |
| `shutdown` | `gameOver` |
| `intrusion` | `watcherTakeover` |
