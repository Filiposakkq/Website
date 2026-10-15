# Phase 4b — Case file from the story's first mention: explanation by a character, and a board command line

Read [`README.md`](README.md) first. Added 2026-10-15 at the owner's request (not part of the original plan sections 1-8; recorded in the decisions log).

- **Branch:** `overhaul/phase-4b-case-file`
- **Depends on:** phases 1, 3 and 4 merged (story engine and data, command registry, the evidence board dialog and `casefile.js` state machine). Phase 2 recommended (cues `board-open`, `evidence-*`, `node-select`).
- **Touches:** `js/casefile.js` (when the board becomes available), `js/board-ui.js` (the command line pane, the explanation), `js/story-data/*` (the first mention and the explanation lines), `js/commands.js` or a new `js/board-commands.js`, `index.html` (only if the trigger or a pane needs markup), `styles.css` (`.case-*` rules only; keep them in their own region, phase 5 also edits this file), `tools/smoke.mjs`, `tools/validate-story.mjs`.
- **Can run in parallel with:** phase 8. Merge before phase 5 if you can; if both run, each keeps its CSS in its own region (`phase-conflicts.md`).

## Owner decisions (2026-10-15)

1. **When:** the case file becomes available **at the first mention in the story**, which is **right after the inbox message** (`cat ~/inbox/001.msg`, before the Level 01 intro), not at boot and not only on the first discovered record. Before that mention the trigger stays hidden.
2. **Command line:** inside the board there is a small command line that runs **board commands only** (a limited set; the shell keeps the puzzle). It does not replace the shell.
3. **Explanation:** **a character explains the board** in dialogue (story-driven), not an overlay tutorial. The speaker is a **third character who stays a complete mystery** (neither `unknown` nor `watcher`), shown as **`<???>` in blue** (decided): no name, no backstory, no explanation of who it is or why it helps. This is deliberate and is recorded in `docs/story/story-bible.md` as an intended open end, not a loose end to fix. The wording still needs the owner's approval.
4. **Board commands are new evidence commands** (not the shell's), and where one depends on the trace the rules in 4b.3 apply.
5. **The window after the trust choice becomes 5 minutes** (300 s) instead of 2 (120 s): task 4b.0b. The start of the trace (480 s before the trust choice) is **not** changed.

## Goal

The evidence board stops being something the player stumbles on. A character introduces it in the story, the trigger appears at that moment, and the board has its own command line for working with evidence, with the explanation coming from the story rather than from a manual.

## Design

### 4b.1 First mention and availability

- [ ] The beat is **right after the inbox message** is read (decided). It is a node in the story data (`story-data/intro.js` or wherever the inbox scene lives), not code. The new voice appears for the first time here: a new voice in `story-data/voices.js` (`mystery: { name: '???', nameCls: 'voice-blue', cls: 'voice-blue', quiet: false }`, the same shape as `unknown` and `watcher`), rendered as `<???>`. Blue is a new CSS class `.voice-blue`; candidate `#4da6ff` on the black background is 8.21:1 (checked with `node tools/contrast.mjs`; `#3d8bff` is 6.34:1), both pass AA. Keep it clearly different from the cyan `#76dcff` of `.ghosted-id`. Under reduced motion and for screen readers the line is announced as `??? says: ...`.
- [ ] That node calls a small host action (for example `caseFile.makeAvailable()`), which reveals the trigger (the existing reveal animation) and sets `boardUnlocked`. Today `boardUnlocked` is set by the first discovered record (`setState` in `casefile.js`): keep that as a fallback so a developer jump into the puzzle still works.
- [ ] The trigger is reachable by keyboard and touch from that moment; `board` in the shell opens it as before. A dev route that skips the intro must make the board available.
- [ ] The Level 01 puzzle, the three-layer key and `unlock` are untouched. The board stays optional for the win.

### 4b.2 Explanation by a character

- [ ] Short lines (2 to 5 at first; extended to 12 at the owner's request on 2026-10-15, the validator allows 2 to 12) in the voice of the third character (**very cryptic, neutral in tone, but with the tone of someone who wants to take charge: short directive statements, not requests; confirmed by the owner: "šéfovat", to boss, to command**; it never says who it is, why it knows, or what it wants; it must not give away the key or contradict `unknown` or `watcher`). Keep the story bible's style (lowercase, short lines, no exclamation marks). The lines (lowercase, calm, no exclamation marks; see `docs/story/story-bible.md` sections 2 and 5) that say: what the board is, that evidence is not identity, that `scan` and `decrypt` cost trace time, and that it is optional. Lines live in story data, validated by `tools/validate-story.mjs`.
- [ ] **Its own typing sound** (decided: different from every other voice). Add a new cue (for example `key-tick-mystery`) to `js/audio/patches.js` that is clearly different from `key-tick` (a different timbre and pitch, quiet, rate limited like `key-tick`), register it so `tools/audio-lint.mjs` renders it, list it in `docs/overhaul/audio-cues.md`, and give the voice a field in `story-data/voices.js` (for example `tick: 'key-tick-mystery'`) that `output.js` uses instead of the default tick for that voice only. No other voice changes. The owner listens to it (it cannot be judged by a test). Speed of its typing is the owner's call; default: the same as `unknown`.
- [ ] The explanation is played once, in the story, right after the first mention. On the first time the board is opened, a one-line reminder in the board's log pane points at `help` (no overlay).
- [ ] Skip (the hold control) and reduced motion work as for any other dialogue.

### 4b.3 Board command line

- [ ] A command pane in the board dialog (`board-ui.js`): an input with a visible label, an output log inside the dialog, `Enter` to run, history with the up arrow, `Esc` closes the board as before. It must work with the on-screen keyboard (the input stays visible above it) and with a screen reader (its own live region, as the board already has).
- [ ] Board commands only: **new evidence commands, every one of them about evidence** (decided), not copies of the shell. Set: `help` (lists the board commands), `list` (records with state), `open <id|code>` (select a record in the board), `scan`, `intercept`, `dump`, `decrypt <id|code>`, `connect <a> <b>`, `close` (closes the board). `trace --status` stays a shell command (it is not evidence; the map is shown in the board anyway). Typing a shell-only word in the pane answers `use the shell for that`.
- [ ] **Trace dependency (resolve before building).** The board is available from the inbox on, i.e. **before the trace exists** (it starts at the Level 01 intro) and later while it is `running` (cannot expire, floors at TRACE PENDING) and `lethal` (after the trust choice). Rules to implement, each as data in the command definitions (for example `needs: 'none' | 'trace'`), and to test: (a) before the trace has started, only the read-only commands (`help`, `list`, `open`, `close`) work; `scan`, `intercept`, `decrypt`, `connect` answer with one in-world line such as "no active link yet"; (b) while the trace is `running` before the trust choice they work and take their run time, but their trace cost (`connectMissCost`, `hintCost`-style costs) is **not charged** because the trace cannot be hurt yet; (c) after the trust choice (`lethal`) they behave exactly as phase 4 built them; (d) **verify in the code** how the evidence loss thresholds (`CASE.compromiseAt`, measured in trace seconds left) behave in `running` mode and before the trace exists: a record must never be lost while the trace is not lethal (unverified: the phase 4 notes do not say); (e) the board and `trace` command show `TRACE PENDING` / no trace honestly instead of a false countdown. Names are data in a registry (reuse `commands.js` with a `scope: 'board'` group, so that `help` is generated and the validator checks it). Commands that cost time or trace behave **exactly** as in the shell: one implementation, two entry points (the shell and the board pane call the same functions in `hacking-commands.js`).
- [ ] A shell-only command typed in the board answers `use the shell for that` (no new behaviour, no shell access from the board).
- [ ] `decrypt` still blocks input while it runs (phase 4 decision); the board pane shows the same progress line.
- [ ] No second timer: everything uses the session (`session.sleep`, `trace.onTick`). The pane's listeners are removed when the dialog closes or the session aborts.
- [ ] Fonts at least 11px; touch targets at least 44px for the buttons; only `transform` and `opacity` animate.

## Open questions for the owner (answer before building 4b.2)

- The third character: label `<???>`, blue, the cryptic-neutral-commanding tone and its own typing sound are decided. Decided: it will most likely **return in the next level or chapter** (not built now; it stays unexplained). Still open: its typing speed (default: the same as `unknown`).
- On the watcher route the same voice must still make sense (the sealed-branch evidence is shown as `SEALED // OTHER BRANCH`).
- Answered: speaker is a third mystery character shown as `<???>` in blue with its own typing sound; beat is right after the inbox message; board commands are new evidence-only commands (list above).

## Tasks (checklist)

- [ ] 4b.0b **The trace window after the trust choice is 300 s (5 minutes)** (owner decision; was 120 s): change `TRACE.afterTrust` in `story-data/constants.js` to 300. `TRACE.start` (480), `TRACE.afterUnlock` (120, the ghost.sh window) and `TRACE.takeover` stay. Everything that says "two minutes" or `02:00` follows: the spoken line `two minutes. no extensions.` in `story-data/routes.js` (rewrite to five minutes, keep the voice), `ETA RESET: 02:00` is generated from the constant, the `trace-warn` description ("two minutes") in `js/audio/patches.js`, `docs/story/story-bible.md` (scene 14, the timers list, loose end 3), `docs/state/story.md`, `owner-test-checklist.md`, the smoke tests and `validate-story` if any assume 120. **Re-tune what was built for the 120 s window (phase 4):** `CASE.traceWindow` follows `afterTrust` (the map and its hop timing then spread over 300 s, so check it still feels like pressure), but the loss thresholds `CASE.compromiseAt` (45, 35, 90 s left) are absolute: with 300 s they trigger after 210, 265 and 255 s, i.e. almost never, so records would no longer be at risk. Move them to be relative (a share of the window) or re-tune them, and re-check the phase 4 tuning table ("the whole board costs less than one hint"). The sound thresholds in `trace-sound.js` (warning at 120 s, critical at 60 s and 10 s) must be checked against 300 s: the warning at 120 s now arrives after 60 % of the window. Check `hint` (30 s) against the longer window, the `trace-expiry` smoke scenarios (a real 300 s wait would be far too slow: they must use the fast path, check `dev-routes.js`/`lethalTrace`), and the TRACE PENDING floor is no longer an issue because `TRACE.start` is unchanged. More time makes the puzzle easier: the owner confirms that is wanted.
- [ ] 4b.0 Re-verify the "current state" of `casefile.js`, `board-ui.js`, `hacking-commands.js` against the code; start the checkpoint log and the Resume point.
- [ ] 4b.1 Availability (`makeAvailable`, story node, fallback, dev routes) + smoke scenario: the trigger is hidden before the mention and visible after it, on both routes.
- [ ] 4b.2 Explanation lines in the story data + validator checks (no key text, no real names, lowercase style rules are manual).
- [ ] 4b.3 Board command pane + board command group in the registry + shared implementations with the shell.
- [ ] 4b.4 Tests: smoke scenario for the board command line (run `scan`, `decrypt`, `connect` from the board; the shell and the board show the same state), keyboard-only, phone viewport (390x844), abort leaves no listeners and no timers.
- [ ] 4b.5 Docs in the same commits: `docs/state/story.md` and `ui-and-css.md`, `story-bible.md` (the new beat; open loose end if any), `audio-cues.md` if a cue is wired, `owner-test-checklist.md`, `CHANGELOG.md`, tracker row.

## Out of scope

- A tutorial overlay, an interactive tutorial, a shell inside the board, or a second independent terminal (the owner chose board-only commands).
- New evidence records or new mechanics beyond what phase 4 built.
- Visual polish of the board reveal (phase 5).

## Verification

- `node --check`, `node tools/validate-story.mjs`, `node tools/audio-lint.mjs`, `bash tools/check-fonts.sh`, and the full `node tools/smoke.mjs`.
- Owner on the preview (phone and desktop): the first mention feels natural, the board opens from the trigger and from `board`, the command line is usable with the on-screen keyboard, the key is still findable only from the page.

## Done when

Code, tests and docs agree; the owner confirmed the beat and the wording; the handoff report is in this file; the tracker row is `in review` with the PR number.

## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 4b.0 Re-verify + start log | done | `75d1266` | branch pushed; findings in "Re-verification (4b.0)" below; baseline smoke on `main` `bad4a0b`: 26 of 27 in the parallel run, the 27th (`reduced: typing ticks ...`, a known load flake) passes alone |
| 4b.0b Trace window after trust = 300 s | done | `25bfc45` | window 300 s, loss thresholds as shares (113 / 88 / 225 s left), spoken line, docs, smoke serves a 120 s test window + one scenario for the shipped value. **last green commit: `25bfc45`**: full smoke 25/28 in the parallel run; the 3 failures (`reduced: typing ticks ...` and two real-time desktop scenarios that timed out in `reachTrustChoice` while other tools ran) all pass alone on the same snapshot; `validate-story`, `audio-lint` (0 problems) and `check-fonts` pass |
| 4b.1 Availability at the first mention | done | `05a7fa9` | `makeAvailable()`, the story node (`caseBriefing`), developer routes, validator and 4 smoke scenarios; each passes alone on the snapshot; full smoke run again after 4b.2 (see its row) |
| 4b.2 Explanation by a character | done | `5c43666` | third voice `<???>` (blue, `key-tick-mystery`), 5 draft lines, validator + 1 smoke scenario (passes alone), docs; wording and sound **unverified** (owner checklist); **last green commit: `5c43666`**: full smoke 33 of 33 (`--jobs=8`, snapshot) |
| 4b.3 Board command pane | done | `bb599e7` | registry group `board`, `board-commands.js`, shared `hacking-commands.js` (one job slot, `needs: link`), pane in `board-ui.js`, lethal-only loss and charge, honest TRACE pane. **last green commit: `bb599e7`**: full smoke 38 of 38 (`--jobs=8`, snapshot), `validate-story`, `audio-lint` (0 problems), `check-fonts` pass; phone keyboard, screen reader and feel **unverified** |
| 4b.4 Tests | done | `bb599e7` | tests were written with the code: a `validate-story` block (registry, words, rules a to e, shared state, job slot, trace end, abort, reset, mutation-checked) and 5 smoke scenarios (pending trace, no trace, phone, keyboard only, reboot during a decrypt); see the handoff report |
| 4b.5 Docs | done | see PR | state docs (`story`, `ui-and-css`, `tools`, `audio`), story bible, `audio-cues.md`, owner checklist, CHANGELOG, tracker, known issues, decisions log, this report |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next step.)_

### Resume point (session 1, 2026-10-15, written at the start) (historical)

- Branch `overhaul/phase-4b-case-file`, created from `main` `bad4a0b` and pushed. Nothing is half edited.
- `last green commit`: `bad4a0b` (baseline `main`, no 4b code yet): `node tools/smoke.mjs` 26 of 27 in the parallel run; the failing one (`reduced: typing ticks are rate limited ...`) passes alone (known load flake, see `tools/README.md`).
- Step in progress: 4b.0 (this log), then 4b.0b, 4b.1, 4b.2, 4b.3, 4b.4, 4b.5 in that order.
- Next command: `node tools/validate-story.mjs` after each change; `node tools/smoke.mjs --only=<name>` while developing.

### Re-verification (4b.0): the "current state" claims against the code (`main` `bad4a0b`)

- **Phase 4 is on `main`** (squash `c976821`, PR #12; `board-ui.js`, `hacking-commands.js`, `topology.js`, `story-data/evidence.js`, `story-data/hacking.js` exist). The master README tracker still said "in review": corrected in the same commit. The dependency "phases 1, 3, 4 merged" holds.
- `casefile.js`: `boardUnlocked` is set only by the first record that leaves `hidden` (`setState`); `start()` resets it and `updateTrigger()` hides `#caseTrigger` (also `hidden` in `index.html`). `getTraceLeft()` is `null` before the trace exists (`activeTrace?.left() ?? null` in `story.js`).
- The trace is created by the story data at the LEVEL 01 brief (`trace('start')`, mode `running`), **after** the inbox message; `trace.onTick` (which feeds `caseFile.tick`) is only set by the Level 01 shell, i.e. after the trust choice.
- **Rule (d), answered from the code:** `compromiseCheck` does not look at the trace mode. Today nothing can call it before the trace is `lethal` (it runs from `caseFile.tick` and from the evidence commands, and both exist only inside the Level 01 shell, which starts after `trace('mode', 'lethal')`). Once the board and its commands are reachable earlier this protection disappears, so 4b.3 gates the check explicitly on the mode (`lethal` only).
- `topologyState()` clamps `1 - secsLeft / CASE.traceWindow`; in `running` mode the clock counts 480 s down to the 10 s floor, so a map fed with it would read about 97 % at TRACE PENDING (a false countdown, rule (e)). The board must not feed it unless the trace is lethal.
- `hacking-commands.js` prints through the shell's `line`, hides the shell prompt with `ctx.terminal.close`, reads `env.play.over` and sets time through `env.trace.set`. It has **no guard against two jobs at once**: with a second entry point (the board) a shell `scan` and a board `scan` could overlap, so the shared implementation gets one busy guard.
- The shell command `board` opens the dialog and returns at once; the story and the prompt keep running behind the modal dialog. With the trigger visible from the inbox on, the player can also open the board during the intro.
- The tests: `loseByTraceExpiry` and the "lost evidence" scenario assume a 120 s window (two hints, a 90 s threshold); with 300 s they would need minutes of real time. Plan (4b.0b): the smoke runner serves `constants.js` with a shorter `afterTrust` for the timing scenarios (Playwright route, no test hook in the shipped code) and one scenario checks the shipped value.

### Resume point (session 1, final)

- Branch `overhaul/phase-4b-case-file`, all sub-steps done and pushed; the PR to `main` is open and is **not merged** (the owner merges).
- `last green commit`: `bb599e7` (full smoke 38 of 38). Later commits change only documents.
- Nothing is half-edited. If a review finds something, fix it on this branch, run `node tools/validate-story.mjs` and the affected `--only=` scenarios, then the full smoke.

## Handoff report (phase 4b)

**What was built** (the sub-steps, in order)

- 4b.0b: the window after the trust choice is `TRACE.afterTrust = 300` s; the loss thresholds are shares of it (`CASE.compromiseShare`: 113 / 88 / 225 s left); the spoken line says five minutes. The smoke runner serves a 120 s test window (a Playwright route that rewrites `constants.js`, no hook in shipped code) and one scenario checks the shipped value.
- 4b.1: `caseFile.makeAvailable()` and a story node right after the inbox message reveal the CASE FILE button; developer routes call it; the first record that leaves `hidden` is still a fallback.
- 4b.2: the third voice `<???>` (blue `#4da6ff`, 8.21:1; own cue `key-tick-mystery`) says twelve lines (`caseBriefing` in `story-data/intro.js`), validated for order, tone and forbidden words.
- 4b.3: the board command line.
  - `board-commands.js` has its own registry (group `board`): `help list open scan intercept dump decrypt connect close`. `scan intercept dump decrypt connect` are the shell's definitions (`registerHackingCommands(registry, deps, io)` is called by both).
  - One job slot: `caseFile.claim()`; a second timed command answers `another job is running.`
  - Trace rules (`caseFile.linkState()` and `getTraceMode`): (a) no trace: `no active link yet.`; (b) pending: commands work and take their time, nothing is charged; (c) lethal: as phase 4; (d) `compromiseCheck` returns nothing unless the trace is lethal; (e) the board's TRACE pane reads NO TRACE YET / TRACE PENDING and the path says `trace: not counting yet`, with no `atRisk` flags.
  - The pane in `board-ui.js` (wide: a strip under the four panes; phone: the COMMANDS tab), `.case-cmd-*` CSS region. The log lives in `board-commands.js`, so a decrypt keeps its output when the dialog is closed.
  - `BOARD_SHELL_WORDS` (in `story-data/hacking.js`) answers `use the shell for that`; `validate-story` checks it against the real shell registrations.
- 4b.4 tests: see the checkpoint rows.

**Verified** (by me, headless): `node tools/validate-story.mjs` (with mutation checks that removing the lethal gate on loss or on the charge fails), `node tools/audio-lint.mjs` (0 problems, 112 rows), `bash tools/check-fonts.sh`, and the full `node tools/smoke.mjs --jobs=8` on a snapshot: 38 of 38.

**Unverified** (needs the owner or a real device)

- How the 5-minute window feels (easier than before, as intended).
- The sound of `key-tick-mystery`, and the wording and typing speed of the `<???>` lines (a draft).
- The command pane with an on-screen keyboard on a real phone (checked only at 390 x 844 in a headless browser) and with a screen reader (log region, silent progress line).
- No separate review-only pass by a different Claude was done.

**Decisions made without the owner** (also in the decisions log)

- The board's `dump` needs a link like the other evidence commands (rule a lists only help, list, open and close as read-only).
- A command from the board keeps running when the dialog is closed (its output waits in the log); the input is read-only while it runs.
- `board` and `evidence` typed in the pane answer `use the shell for that`.
- `frozen` and `running` both count as "pending" for the rules (no cost, no loss).

**Known follow-ups**

- The trace sound thresholds (warning at 120 s, critical at 60 s) are unchanged and absolute; with 300 s the warning now comes after 60 % of the window. Listen and tune.
- `hint` still costs 30 s, which is now a smaller share of the window.
