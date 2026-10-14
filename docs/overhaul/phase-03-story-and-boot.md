# Phase 3 — Story engine, realistic boot, realistic commands

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-3-story`
- **Depends on:** phase 1 merged (session/abort, `GameContext`, utilities)
- **Blocks:** phase 4 (it adds commands through the registry built here)
- **Review items covered:** 5 (monolith), 6 (use the context), plus plan section 5 partly (boot text, Linux commands) and plan section 1 "move `chooseTrust`" follow-ups
- **Plan section:** 5 ("Realistic hacker experience": boot sequence + more realistic commands, minus the new gameplay commands that belong to phase 4)
- **Touches:** `js/story.js` (shrinks a lot), `js/level01.js`, new `js/engine.js`, `js/commands.js`, `js/story-data/*.js`

## Goal

1. Turn the 1,658-line imperative `story.js` into a small **engine + data**: dialogue, timing and sound cues become data that can be edited without touching engine code.
2. Rewrite the **boot sequence** to look like a real compromised machine booting.
3. Make the terminal feel like a real Linux shell with believable commands.

The player-visible story, the puzzle, the characters' voices and the three-layer key must remain intact. This is a re-platforming plus the boot/command content work.

## Current state (baseline `8ea680b`)

- `story.js` mixes DOM wiring, skip-hold logic, effects (`glitch`, `gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`), output primitives (`line`, `type`, `say`, `typingFor`, `cmd`, `bar`, `klog`, `svc`, `memtest`), the logo renderer, `gameOver`, `watcherTakeover`, `resetGame`, the ghost route (`promptGhost`, `runGhost`), the identity reveal (`playIdentityReveal`, `moveHelloIntoChat`, `revealName`, `renameEverywhere`), `branchDialogueForWatcher`, a ~400-line `boot()` and `runDeveloperRoute()`.
- `boot()` has numbered stages as comments: `1) BIOS / POST` through `8) něco je špatně`, then `9) příběh` and the continuation, the LEVEL 01 brief, the trace HUD, the watcher interruption and the trust choice. Skip logic is flag based (`skip`, `skippable`, `skipToChoice`, `skipToChoiceArmed`).
- `level01.js` implements commands with a big `switch (name)`: `help ls cat board evidence verify isolate source view-source trace hint unlock abort` (see the README for the flow).
- `casefile.js` is the model of good structure: a declarative `EVIDENCE` array and rendering separate from data.

## Design

### 3.1 Node-based narrative engine — `js/engine.js`

A story is an array of **nodes**. A runner walks it with a pointer and the phase 1 session (so abort works for free). Suggested node types (extend as needed):

```js
{ type: 'line',  text: 'FSOC-BIOS v3.1.4', style: 'dim', silent: true }
{ type: 'type',  text: 'hello, friend.', speed: 90 }
{ type: 'say',   who: 'unknown', text: "i've been waiting for you.", speed: 80, typoAt: 4 }
{ type: 'typing', who: 'unknown', ms: 1800 }          // the three-dots indicator
{ type: 'cmd',   text: 'ls /dev/sdb9' }                // types a command after the prompt
{ type: 'sfx',   cue: 'boot-prompt' }
{ type: 'scene', name: 'story' }                       // audio.setScene
{ type: 'gfx',   name: 'rgb' }                         // glitch effect
{ type: 'wait',  ms: 1200 }
{ type: 'bar',   label: 'fsck /dev/sda1', ms: 1300 }
{ type: 'choice', id: 'trust', options: [...], next: { unknown: 'route-unknown', watcher: 'route-watcher' } }
{ type: 'label', id: 'route-unknown' }  { type: 'goto', id: '...' }
{ type: 'branch', when: (state) => state.trusted === 'watcher', then: [...], else: [...] }
{ type: 'run',   fn: async (ctx) => {...} }            // escape hatch for complex bespoke beats
```

Requirements:

- [ ] **Skip = advance the pointer.** A node list is split into *segments* with a `skippable` flag (BIOS: skippable by the 3-second hold; story intro: skippable to the trust choice; the trust choice and the puzzle are not). Skipping fast-forwards through nodes **applying only their final state** (DOM output still appears instantly, sounds and long waits are dropped, state changes still happen) and stops at the segment boundary. Preserve today's behavior: BIOS skippable until the intro begins; a second hold skips the intro to the trust choice.
- [ ] Keep `quiet-motion` / `prefers-reduced-motion` behavior: waits collapse to zero.
- [ ] All timing/waits and SFX cues live in the data, not in the engine.
- [ ] String content is centralized in `js/story-data/*.js` (boot, intro, watcher interruption, unknown route, watcher route, ghost, reveal, level01 brief, endings). This also makes translation possible later; no i18n system is required now.
- [ ] A small `state` object (`trusted`, `investigated`, `ghostRun`, …) replaces scattered module variables; it is exposed read-only to the phase 7 state inspector (`engine.getState()`).
- [ ] `story.js` shrinks to: DOM references, creating the session and context, wiring audio/terminal/case file/trace, and starting the engine. Target: under ~400 lines. Effects (`glitch`, `gfx`, `flash`, `blackout`, `staticBurst`, `corrupt`, logo renderer) move to `js/fx-screen.js`/`js/logo.js` (or similar) as modules the context exposes.
- [ ] The engine must be testable without a browser for non-visual logic (node list validation: every `goto`/`next` target exists, every `sfx` cue exists in the audio registry). Add `tools/validate-story.mjs`.

**Migration strategy (important, this is the riskiest part of the whole overhaul):** convert in slices, not in one commit, and run `node tools/smoke.mjs` after each slice: (a) engine + boot data, (b) intro and transmission, (c) trust choice and branches, (d) ghost route, (e) identity reveal, (f) endings, (g) delete dead code. Complex bespoke beats (the logo build, `wipe`, `moveHelloIntoChat`, `renameEverywhere`) may stay as `run` nodes calling existing functions; do not rewrite visual effects here, that is phase 5.

### 3.2 Command registry — `js/commands.js`

- [ ] Replace the `switch` in `level01.js` with `registerCommand({ name, aliases, help, hidden, when(ctx) { ... }, async run(ctx, args) { ... } })`. `when` lets commands exist only on a route (e.g. `isolate` for Watcher, `verify` for Unknown, `abort` for Watcher) or in a phase.
- [ ] `help` is generated from the registry (keep today's wording and the route-specific lines).
- [ ] Unknown command output stays `command not found: <name>`; typos could suggest the nearest command (`did you mean 'hint'?`), optional.
- [ ] Preserve every existing command and its output: `help ls cat board evidence verify isolate source view-source trace hint unlock abort`, including the `unlock elliot` easter egg, the 3 attempts, the `[ok] [--] [ok]` feedback and the case-file discovery calls (`caseFile.discover(...)`).
- [ ] Commands share a small `parseArgs` helper (quotes, flags like `-a`, `--status`).
- [ ] Phase 4 will register `scan`, `intercept`, `decrypt`, `dump`, `trace --status` through this registry; design the API so those need no engine changes.

### 3.3 Realistic boot sequence (plan section 5)

Rewrite the boot data to this shape (text from the plan; adjust only for typos or tone, keep the vibe). Stages and pacing: BIOS lines appear fast with small random jitter, hardware detection pauses at the "Detecting…" lines, kernel log lines have increasing timestamps, service lines flip from `[ .... ]` to `[  OK  ]`, **one line fails**, and the warnings appear last. Use the audio cues (phase 2): `boot-prompt` at the BIOS banner, `boot-memtest` while memory counts up, `drive-seek` for drives, `boot-checkpoint` per stage, `boot-fail` on the failed service, `boot-complete` at the login prompt.

```text
AMIBIOS (C) 2015 E Corp Systems
FSOC-BIOS v3.1.4 Release 09/23/2015

CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz
Memory Test: 16384MB OK
  Extended Memory: 16252MB
  L1 Cache: 256KB  L2 Cache: 1024KB  L3 Cache: 8192KB

Detecting Primary Master... WDC WD10EZEX-00W 931.5GB
Detecting Primary Slave...  None
Detecting Secondary Master... ATAPI DVD-ROM
PCI Device Listing:
  Bus 0, Dev 2:  Intel HD Graphics 4600
  Bus 0, Dev 26: Intel 9 Series USB EHCI
  Bus 0, Dev 31: Intel 9 Series LPC
  Bus 1, Dev 0:  Realtek RTL8168 GbE

Press DEL to enter Setup, F12 for Boot Menu...

Loading GRUB...
  GNU GRUB version 2.02

Booting 'fsociety-os (kernel 4.4.0-custom)'...

[    0.000000] Linux version 4.4.0-fsoc (root@fsociety)
[    0.000000] Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1
[    0.041523] ACPI: RSDP 0x00000000000F0490
[    0.126842] Initializing cgroup subsys cpu
[    0.284012] pid_max: default: 32768 minimum: 301
[    0.310511] Security Framework initialized
[    0.310515] SELinux: Disabled at boot.
[    0.493211] NET: Registered protocol family 2
[    1.012340] e1000: eth0 NIC Link is Up 1000 Mbps
[    1.234102] EXT4-fs (sda1): mounted filesystem
[    1.502831] systemd[1]: Detected architecture x86-64.

[  OK  ] Started Journal Service.
[  OK  ] Started Network Manager.
[  OK  ] Reached target Network.
[FAILED] Failed to start Firewall Service.        <- ominous, red
[  OK  ] Started OpenSSH Server.
[  OK  ] Reached target Multi-User System.

WARNING: Unauthorized network adapter detected on eth0:1
WARNING: Unknown process 'ghost.sh' running as PID 1337
WARNING: Outbound connection to [REDACTED] on port 4444

fsociety-os login: guest
Password: ********
Last login: Thu Sep 24 03:14:07 2015 from 192.168.1.???

guest@fsociety00:~$
```

- [ ] The current boot also teases a hidden partition `/dev/sdb9` ("found unlisted partition", "size 0 bytes", "owner unknown") and a failed trace. **Keep that story hook**: weave the `sdb9` partition into the new boot (e.g. in the PCI/drive listing or as an extra warning) so the transmission that follows still makes sense; do not remove the references the later dialogue relies on. Check what the later text mentions before cutting anything.
- [ ] The login lines type themselves (use the `cmd`-style typing; the password is masked). The prompt string everywhere is `guest@fsociety00:~$` (the `index.html` prompt already uses it).
- [ ] Total BIOS length: keep it watchable. The old one was about 25 seconds un-skipped; aim for roughly 30–40 seconds, with the 3-second-hold skip still available and the **first 5 seconds visually interesting** (the player has just clicked INITIALIZE).
- [ ] Use fictional/documentation-range IPs and made-up identifiers only (see the README invariant about real IP/location).

### 3.4 Realistic Linux-style commands

Add to the registry (output must be consistent with the story world: user `guest`, host `fsociety00`, rogue adapter `eth0:1`, suspicious `ghost.sh` as PID 1337, outbound port 4444 to a redacted host). Keep outputs short, formatted like the real tools.

| Command | Output direction |
|---|---|
| `whoami` | `guest (uid=1000) — restricted shell` |
| `uname -a` | `Linux fsociety-os 4.4.0-fsoc #1 SMP x86_64` (match the boot's kernel line) |
| `ps aux` | A believable process list including `ghost.sh` (PID 1337), `sshd`, `NetworkManager`, a `[kworker]` line or two, and one suspicious process; the `ghost.sh` line is also an investigation clue (`caseFile.discover(...)` if an evidence id fits) |
| `netstat -an` | Active connections with one outbound to a suspicious redacted address on port 4444 |
| `ifconfig` | Interfaces `lo`, `eth0` and the rogue `eth0:1` |
| `cat /var/log/auth.log` | Failed login attempts from external (documentation-range) IPs, a successful `guest` login at 03:14 |
| `history` | A few earlier commands from a previous session giving story context (e.g. someone looked at `sdb9.lock`) |
| `pwd`, `date`, `clear`, `echo` | Small niceties; `clear` must keep the engine consistent (it clears `#output` only when allowed) |
| `help` | Updated to list the realistic commands under a "system" group |

Constraints: realistic commands must **not** become a way to bypass the puzzle (no command may print the full key); they may add flavor and extra clues. Commands that have no meaning in the story respond like a restricted shell: `bash: <cmd>: permission denied` / `command not found`. Tab completion for commands and the virtual file names is welcome if it is cheap (the terminal input is a single `<input>`).

`scan`, `intercept`, `dump`, `decrypt <id>` and `trace --status` are **phase 4**. Leave a stub registered with a TODO only if it prevents the help text from being inconsistent.

## Tasks (checklist)

- [ ] Engine + node types + validator tool
- [ ] Skip logic as segment fast-forward, behavior-compatible
- [ ] Boot data (new realistic sequence) incl. the `sdb9` hook and the failed service
- [ ] Intro, trust choice, route, ghost, reveal, endings migrated to data (slice by slice; smoke after each)
- [ ] Command registry; migrate every existing command; keep `help`
- [ ] Realistic Linux commands
- [ ] `story.js` under ~400 lines; no dead code; `createLevel01` consumes the registry
- [ ] Dialogue polish pass (typos, rhythm). Keep each character's voice: Unknown is warm and cryptic, Watcher is cold and accusatory. Characters must not use a fixed real name for the first character before the identity reveal
- [ ] Update `docs/overhaul/audio-cues.md` with the cues the story data uses

### 3.5 Trace policy per scene and the skip control (added 2026-10-13)

Why: the HUD can reach 00:00 before the trust choice with nothing happening; during the ghost sequence it keeps running although the story says the trace is being closed; the times are guesses.

- [ ] Every scene or node in the story data declares `trace: 'running' | 'frozen' | 'lethal'`. `running` counts down; `frozen` holds the HUD and cannot expire; `lethal` is the only state that can end the game with TRACED.
- [ ] Before the trust choice the trace cannot kill the player: either `frozen`, or it floors at a low value (e.g. 00:10) and the HUD shows it as "TRACE PENDING". After the trust choice and after the unlock it is `lethal` (this is what `level01.js` and `promptGhost` do today with `state.over` and `onEnd`).
- [ ] The first `ghost.sh` step "CLOSE TRACE REQUEST" ends the danger: from that line on the trace is `frozen` and the HUD reads "TRACE CLOSED" (hardcode it in the data so no timer can fire during the ghost sequence). It has to make sense in the story: the script closes the request first, so nothing can locate the player afterwards.
- [ ] Tune the times (480 / 120 / 120 / 60, `hint` = 30 s) in the data after phone tests by the owner; keep them as named constants in the story data, not literals in code.
- [ ] Remove the raw `setInterval` fallback in `trace.js` (Known issues).
- [ ] Skip control: the hold state (3 s) lives in the session, the skip logic moves with the engine; keep the 3 s hold and keep the smoke test pressing with a real mouse. Visuals are phase 5 (see its task "Skip control rework").
- Story reasons to be traced beyond the clock (noisy commands, honeypot file, unverified `ghost.sh`, watcher lockout) are **not** in this phase; see "Phase 10" in `docs/story/README.md`.

## Out of scope

Visual effects redesign (phase 5), new evidence mechanics and commands `scan/intercept/decrypt` (phase 4), the TRACED sequence (phase 6), dev panel (phase 7).

## Verification

- [ ] `node tools/validate-story.mjs` passes (all targets and cues exist).
- [ ] `node tools/smoke.mjs` passes after every slice and at the end (both trust routes, victory, every failure reason, reboot, 390 px, reduced motion).
- [ ] Skip behavior identical: hold 3 s skips the BIOS; a second hold skips the intro to the choice; neither is possible during the puzzle.
- [ ] A full playthrough text diff against the baseline: every story line that was not intentionally changed is still present (record the intentional changes in the notes).
- [ ] `source map` and the three-layer key still work.

## Done when

`story.js` is a thin entry point, narrative content lives in data, the boot looks like the plan, the realistic commands work and are listed in `help`, and phase 4 can add commands with no engine changes.

## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 3.1 Engine + node types + tools/validate-story.mjs | done | 1650879 | `js/engine.js`, `js/pace.js`, `session.flush()`, `tools/validate-story.mjs` (self-test only; no story data yet). Engine is not driving the game before 3.3 |
| 3.2 Skip logic as segment fast-forward | done | see 3.3 | Skip = `pace.setFast` + `session.flush()` per engine segment; `js/skip-control.js` holds the 3 s state per session; old `run.skip*` flags deleted. Smoke 20/20 |
| 3.3 Realistic boot data (incl. the sdb9 hook) | done | 61b98cd | `story-data/boot.js` runs through the engine; `output.js` extracted; smoke 20/20 (updated the BIOS header string in `tools/smoke.mjs`); transcript diff vs baseline = boot text only |
| 3.4 Intro + transmission migrated | done | ae37c3c | `story-data/intro.js`; transcript = baseline byte for byte (smoke 19/20 in one parallel run, the typing-ticks scenario is the known flaky one, passes alone) |
| 3.5 Trust choice + branches migrated | done | ae37c3c | `story-data/routes.js`, generic `chooseOption`; trace policy (Design 3.5): `trace.js` modes + `close()`, `TRACE` constants, `trust-choice` and `trace-start` cues wired; smoke 20/20 incl. new TRACE CLOSED assertion; audio-lint 0 problems |
| 3.6 Ghost route migrated | done | (this commit) | `story-data/ghost.js` (unlock to the end of the script) + `js/ghost.js` (prompt and panel); transcript = baseline; smoke 20/20 |
| 3.7 Identity reveal + endings migrated | todo | | |
| 3.8 Command registry (migrate all existing commands) | todo | | |
| 3.9 Realistic Linux commands | todo | | |
| 3.10 story.js cleanup (< ~400 lines) + dialogue polish + audio-cues.md | todo | | |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here)_

### Resume point (2026-10-14, session 1, after 3.6)

- Branch `overhaul/phase-3-story`. `last green commit`: the commit of row 3.6 (full smoke 20/20 on a snapshot, `node tools/validate-story.mjs` passes, transcript diff vs the baseline = boot text only).
- Engine segments: `boot`, `intro`, `choice` (trust choice, routes, trace reset, then the Level 01 shell as a legacy `run` node that ends the run on game over), `ending` (unlock, watcher, ghost prompt and script as nodes, then `legacyEnding` in `story.js`).
- Next: 3.7. `legacyEnding` (erased list, GHOSTED stamp, assessment, then `playIdentityReveal`) into `story-data/ending.js`; the bespoke beats (`renameEverywhere`, `moveHelloIntoChat`, the GHOSTED row swap) stay functions called by `run` nodes, ideally moved to a module (`js/fx-reveal.js`) so `story.js` shrinks. `gameOver` / `watcherTakeover` / endings text (`TRACE COMPLETE`, `LOCKED OUT`, `SESSION COMPROMISED`, `DEVELOPER SHUTDOWN TEST`) also move to data/module there. Then 3.8 command registry, 3.9 Linux commands, 3.10 cleanup (story.js under ~400 lines), dialogue polish, `CHANGELOG.md`, handoff report.
- Nothing half edited. Baseline for transcript diffs: `main` 33c7b94.

### Resume point (2026-10-14, session 1, after 3.5) (historical)

- Branch `overhaul/phase-3-story`. `last green commit`: `ae37c3c` (full `node tools/smoke.mjs` 20/20 on a snapshot of it, `node tools/audio-lint.mjs` 0 problems, `node tools/validate-story.mjs` passes, `node tools/transcript.mjs --diff` vs the baseline shows the boot text only).
- Engine segments: `boot` (nodes), `intro` (nodes), `choice` (nodes: trust choice, both routes, trace reset, then one `run` node calling `legacyLevel` in `story.js`).
- Next: 3.6 ghost route. `promptGhost` + `runGhost` + the ghost part of `revealName` into nodes (the ghost panel with its steps stays a bespoke `run` beat; the trace is already `close()`d there). Then 3.7 reveal + endings (`playIdentityReveal`, `renameEverywhere`, `moveHelloIntoChat`, `gameOver`, `watcherTakeover` stay functions called by `run` nodes), 3.8 command registry (`level01.js` switch), 3.9 Linux commands, 3.10 cleanup (story.js under ~400 lines) + dialogue polish.
- Nothing half edited. Baseline for transcript diffs: `main` 33c7b94 (record into a scratch dir from a checkout; the session scratchpad copy is not committed).
- Reminders: update docs in the same commit (audio-cues.md, docs/state/*, tools/README.md); a `CHANGELOG.md` line at the end; the handoff report at the end.

### Resume point (2026-10-14, session 1, after 3.3) (historical)

- Branch `overhaul/phase-3-story`. `last green commit`: the commit of row 3.3 (full `node tools/smoke.mjs` 20/20 on a snapshot of it; the commit before it, 1650879, was 17/20 in one parallel run and the 3 load failures passed alone).
- Done: 3.1 engine, 3.2 skip, 3.3 boot data. The engine runs three segments: `boot` (nodes), `intro` and `choice` (each a single `run` node calling `legacyIntro` / `legacyRest` in `story.js`).
- Next: 3.4. Turn `legacyIntro` (flash/blackout, INCOMING TRANSMISSION, hello, wipe, logo, inbox, LEVEL 01 brief, trace start, cut-off, watcher interruption, "who do you trust?") into nodes in `story-data/intro.js`. Bespoke beats stay `run` nodes. Check with `node tools/transcript.mjs --out=<dir>` then `--diff=` against the baseline (record the baseline from a checkout of `33c7b94`; the scratchpad copy is not committed).
- Nothing half edited. Known harmless leftovers: `const story = []` in `legacyIntro` (dead, remove in 3.4).
- Tools: `tools/validate-story.mjs`, `tools/transcript.mjs`, `tools/smoke.mjs`.

### Resume point (2026-10-14, session 1 start) (historical)

- Branch `overhaul/phase-3-story`, created from `main` `33c7b94`. Head commit: see `git log`.
- `last green commit`: none yet (no smoke run on this branch).
- Step in progress: none, only the tracker row was set to `in progress`.
- Nothing broken, nothing half edited. No code has been changed yet.
- Next: re-verify the "Current state" section of this file against the code, then start 3.1 (engine, node types, `tools/validate-story.mjs`).


### 3.1 notes (2026-10-14)

- **Baseline smoke on `main` 33c7b94 (before any change):** 18/20 in the parallel run; `reduced: typing ticks are rate limited...` (30 instant keystrokes started 14 click nodes) and `desktop: trust unknown -> victory` (90 s timeout waiting for the trust choice) failed under load and both passed when rerun alone (5 s and 158 s). This is the known flakiness in `tools/README.md`. Judge later runs against it: rerun failures alone before concluding anything.
- **Engine design decisions.** Segments carry the skip policy (`skippable: 'boot' | 'intro'`, `announce`); a skip is `pace.setFast(true)` plus `session.flush()` (new, wakes every pending sleep without aborting), so a skip takes effect at once instead of after the current wait. `sfx`, `gfx`, `flash`, `static`, `corrupt` and `wait` nodes are dropped while skipping; text, `scene`, `trace`, `state`, `case` and `run` nodes still run. The next segment ends the fast-forward. Branches compile to jumps, so there is one flat program and a real pointer for `engine.getState()`.
- **Validator.** `tools/validate-story.mjs` checks node fields strictly (a misspelled field is an error) and dry-runs every combination of choices with a recording host; `run` nodes are not called in a dry run.

### 3.2 and 3.3 notes (2026-10-14)

- **Stale engine events.** A developer jump aborts the old session, and the old engine's `finally` reports its end a moment later; it used to hide the shared skip button after the new run had shown it (found by the scenario `abort at BIOS...`). `skip-control.js` now ignores events once its own session has aborted. Anything that touches shared DOM from an engine event must do the same.
- **Boot text changes (intentional, from the plan):** new BIOS/GRUB/kernel/service text; one failing service (`Firewall`); login lines type themselves with a masked password; three warnings after the partition scan. **Removed:** the Tor and relay-service lines, `fsck`, the network bring-up with five relay hops, cryptsetup/`/dev/sdb1`, the drive list `sda/sdb/sdc`. **Kept:** `scanning for partitions... found unlisted partition: /dev/sdb9 / contents: encrypted / owner: unknown` and the final `WARNING: unauthorized access detected / source: unknown / tracing connection... / trace request failed.` The later dialogue never mentions the removed lines (grep checked).
- **Audio:** the boot now plays `boot-memtest`, `boot-checkpoint`, `drive-seek`, `boot-fail` (on the failed service, instead of `failure`) and `boot-complete`. `boot-memory`, `relay-hop`, `network-lock` and `disk-unseal` have no caller (kept). Listening is unverified (nobody has heard the new boot).
- **Boot length** is unverified on a real clock: estimated about 38 s un-skipped (the BIOS part is about 14 s). Check on the preview; tune the waits in `story-data/boot.js`.
- **`tools/transcript.mjs`** gained a `boot` scenario (captured inside the page, because the story wipes the screen) and normalizes the `eta:` line. Baseline for later diffs: record from a checkout of `33c7b94`.
- `tools/smoke.mjs`: the only change is the BIOS header string (`FSOC-BIOS v3.1.4`).

### 3.4 and 3.5 notes (2026-10-14)

- **Skipping now drops sounds** in the skipped segment (`sfx` nodes and the sounds inside typing helpers): before, a skipped intro still played `transmission`, `mail-arrive` and so on. Intended (spec: sounds are dropped).
- **Trace policy.** `running` (until the trust choice) counts down to 10 s and holds there reading TRACE PENDING, so it can never end the game before the player has chosen; the trust route turns it `lethal` (`trace-start` cue) and resets it to 120 s; `ghost.sh`'s "close_trace" now calls `trace.close()` (HUD reads TRACE CLOSED, clock stopped for good; before it was `kill()` / TRACE KILLED, same effect). Between the start of the ghost script and that step (about 5 s) the trace is still lethal, as before. `startTrace` requires the session now (the raw `setInterval` fallback is deleted). The times are named constants (`story-data/constants.js` `TRACE`); tuning is for after the owner's phone test.
- **Generic choice.** `story-choices.js` exports `chooseOption(ctx, options)`; `chooseTrust` is gone. The accepted answers (`1`, `unknown`, `trust <unknown>` ...) are the options' `match` lists in `story-data/routes.js`; the optional leading `trust ` verb is still stripped inside `chooseOption` (a small trust-specific leftover, noted for 3.10).
- **Tool fix.** `tools/transcript.mjs` shared one variable between its two capture scenarios (a race when run in parallel); each scenario returns its own rows now and the baseline was re-recorded. `tools/audio-lint.mjs` passes a session and `mode: 'lethal'` to `startTrace` and checks the new modes.
- **Smoke note.** The scenario `reduced: typing ticks are rate limited...` failed once in a loaded parallel run again (unrelated to this phase; passes alone).
