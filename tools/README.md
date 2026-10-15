# Dev tools

Development-only scripts. They are **not deployed**: Wrangler publishes only `sites/*/public`.
Run everything from the repository root.

## `smoke.mjs` — end-to-end smoke test for the fsociety00 game

```sh
node tools/smoke.mjs                 # every scenario
node tools/smoke.mjs --only=victory  # scenarios whose name contains "victory"
node tools/smoke.mjs --list          # print scenario names
node tools/smoke.mjs --serial        # run one scenario at a time (easier to read logs)
```

Starts its own static server on a free port (serving `sites/fsociety00/public` on `127.0.0.1`,
so the localhost-only DEV panel is available), launches headless Chromium through Playwright,
and drives the game. Every scenario fails on any `console.error`, uncaught exception, failed
request or HTTP status >= 400.

Scenarios cover the README's *Standard smoke test*: both trust branches, victory, lock-out and
trace-expiry game overs, reboot, the desktop / 390x844 mobile / reduced-motion variants, keyboard
focus order, the missing-key-material fallback, and aborting the story at four different moments.

Notes:

- Playwright is not a dependency of this repo. The script looks for it in `$PLAYWRIGHT_MODULE_PATH`,
  the working directory, and the usual global locations (`/opt/npm-tools`, `/opt/node-tools`, the npm
  global root). Install it yourself if none is found: `npm i -D playwright` outside the repo.
- Chromium comes from `$PLAYWRIGHT_BROWSERS_PATH`. Never run `playwright install` in the cloud container.
- The skip control is held with a **real** mouse press (or keyboard), not a synthetic `pointerdown`:
  the game calls `setPointerCapture`, which throws for pointer ids that do not exist.
- Set `SMOKE_SITE_DIR=<copy of sites/fsociety00/public>` to test a snapshot while you keep editing; set `SMOKE_SHOTS=<dir>` to get a screenshot when a scenario fails.
- Audio cannot be heard in headless runs. The smoke only checks that nothing throws, that no `AudioContext` exists before the launch click, and that a reboot leaves no source node running (a test-only probe installed with `addInitScript`; the game exposes no global). Levels and tails are in `audio-lint.mjs`.
- A full run takes a few minutes because the story runs in real time (scenarios run in parallel).

## `validate-story.mjs` — story data and engine check (phase 3)

Since phase 4.3 it also drives the real `hacking-commands.js` with a fake clock (scan, intercept, dump, decrypt, connect, trace ending during a decrypt) and checks that the command text uses only documentation-range addresses and never prints a key layer.

```sh
node tools/validate-story.mjs            # self-test, then validate and dry-run the story data
node tools/validate-story.mjs --verbose  # also list the cues and labels the story uses
```

Needs no browser and no server (about a second). Step 1 runs small fixture stories through the engine and checks
that it reports every kind of mistake (unknown node type or field, missing label, bad cue, choice without a target ...)
and that branches, choices, `end` and the skip rules behave. Step 2 loads `js/story-data/index.js`, validates it
against the real registries (`js/audio/patches.js` cues and scenes, the case file API in `js/casefile.js`, the glitch
names) and walks the story with a recording host once per combination of choices. `run` nodes (bespoke visual beats)
are not called in a dry run, so it proves the node graph, not what the screen looks like. Exit code 1 on any problem.

Phase 4 added an **evidence** section: it validates `js/story-data/evidence.js` (unique ids and short codes, types, `found`
values, positions, `links`/`requires`/`connects` ids, no `requires` cycle, scan and intercept tiers without gaps, every
record reachable on both trust routes, encrypted and fragile records only where the original puzzle path stays open, no
text that prints a key layer), proves with 17 mutations of the real data that each kind of mistake is reported, and
checks that every `discover('<id>')` call, every `caseFile('discover', '<id>')` story node and every id in
`story-data/level01.js` names an existing record that a plain `discover` may reach.

## `transcript.mjs` — playthrough text recorder and differ (phase 3)

```sh
node tools/transcript.mjs --out=/tmp/before                  # record 4 scripted playthroughs (reduced motion, ~1 min)
node tools/transcript.mjs --site=<copy-of-public> --out=/tmp/after
node tools/transcript.mjs --diff=/tmp/before,/tmp/after      # lines present in only one of the two recordings
```

Plays both trust routes to victory (every shell command, the ghost prompt), the `abort` ending and the lock-out in
reduced motion and saves the terminal text, plus two captures taken the moment a marker line appears (`boot`, `transmission`: the story wipes those lines from the screen), with random parts normalized (relay IPs, latencies, redaction blocks,
kernel timestamps, memory counter), so two recordings of the same build are identical. Used in phase 3 to check that
every story line that was not changed on purpose is still there. `--diff` compares sets of lines, not their order,
and exits 1 when anything differs. To record the baseline of an older commit, check it out into a scratch directory and
pass its `sites/fsociety00/public` as `--site`. It judges text only, not looks or sound.

## `audio-lint.mjs` — audio engine lint (phase 2)

```sh
node tools/audio-lint.mjs                 # every cue, alias and bed; prints a table
node tools/audio-lint.mjs --only=trace    # names containing "trace"
node tools/audio-lint.mjs --json          # machine-readable
```

Loads `js/audio.js` in headless Chromium and renders everything through an `OfflineAudioContext`
(seeded random, so a run is repeatable). Checks, per cue (and per sample parameter set of a reactive cue):
no exception, no `console.warn` (unknown cue), no NaN/Infinity, not silent (RMS floor), a peak at least 9 dB
under full scale (the real loudness gate: nothing may rely on the output limiter), and silence after the duration
`audio.duration()` declares. The master chain's soft clip tops out near -2.3 to -2.9 dBFS, so the "-1 dBFS" check cannot fail
by itself; a separate row drives two cues at 200x gain to prove the limiter holds. For beds: audible while
running, silent after `setScene('idle')` (nodes stopped on the audio clock), no click when crossfading
through every scene. Also: rate-limited cues admit at most `rate` plays per second, `trace.js` modes (a running trace holds at 10 s and reads TRACE PENDING, frozen holds, lethal expires, `close()` reads TRACE CLOSED, a session is required), and `stopAll()` leaves no
pending source node and no sound, `trace-sound.js` thresholds and `trace.js` `onSecond` (about 5 s of real time).
Exit code 1 on any problem. The voice clip is a file and is skipped.
It judges numbers, not taste: the owner still has to listen (listening checklist in the phase 2 PR).

## `check-fonts.sh` — minimum font size

```sh
tools/check-fonts.sh          # ignores .developer-* (phase 7 owns it); .case-* is checked since phase 4.5
tools/check-fonts.sh --all    # whole file; required to pass from phase 7 on
```

Fails when a declaration can render below 11px: px values under 11, and em/rem values that fall under
11px at the smallest root size (18px). `max(11px, 0.6em)` floors are accepted.

## `contrast.mjs` — WCAG contrast

```sh
node tools/contrast.mjs '#1a8f3a' '#000'                 # one pair: foreground background
node tools/contrast.mjs '#1a8f3a/#000' '#7a7a7a/#000'    # several fg/bg pairs
node tools/contrast.mjs --audit [css-file] [background]  # every hex `color:` in a stylesheet
```

Prints the ratio and PASS/FAIL against 4.5:1 (AA, normal text). `--audit` ignores opacity and the real
background behind each rule, so treat it as a lead generator, not a verdict. Dark colors that are only used
as text on light hover fills (`#000`) show up as LOW and can be ignored.

## Known flakiness and cost (added 2026-10-13)

- In a **parallel** run two scenarios (`reduced: log role...` and `desktop: trust unknown -> victory`) once timed out (14/16); run alone (`--only=...` or `--serial`) they passed 16/16. If a full run shows 1-2 failures, rerun just those scenarios before concluding anything. Do not "fix" a timeout by deleting an assertion.
- A full run takes minutes because the story runs in real time. On a limited usage budget: run `node --check` on changed files for wip commits, run the relevant `--only=` scenarios while developing, and the full suite when a sub-step is finished and before the handoff. Save the output to a file and show only the summary (`tail`).
- The suite does not check that no `AudioContext` exists before the launch click, nor `body.quiet-motion` without the media query (phase 2 adds both).

