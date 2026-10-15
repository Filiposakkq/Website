# Phase 4b — Case file from the story's first mention: explanation by a character, and a board command line

Read [`README.md`](README.md) first. Added 2026-10-15 at the owner's request (not part of the original plan sections 1-8; recorded in the decisions log).

- **Branch:** `overhaul/phase-4b-case-file`
- **Depends on:** phases 1, 3 and 4 merged (story engine and data, command registry, the evidence board dialog and `casefile.js` state machine). Phase 2 recommended (cues `board-open`, `evidence-*`, `node-select`).
- **Touches:** `js/casefile.js` (when the board becomes available), `js/board-ui.js` (the command line pane, the explanation), `js/story-data/*` (the first mention and the explanation lines), `js/commands.js` or a new `js/board-commands.js`, `index.html` (only if the trigger or a pane needs markup), `styles.css` (`.case-*` rules only; keep them in their own region, phase 5 also edits this file), `tools/smoke.mjs`, `tools/validate-story.mjs`.
- **Can run in parallel with:** phase 8. Merge before phase 5 if you can; if both run, each keeps its CSS in its own region (`phase-conflicts.md`).

## Owner decisions (2026-10-15)

1. **When:** the case file becomes available **at the first mention in the story** (a character brings it up in a dialogue), not at boot and not only on the first discovered record. Before that mention the trigger stays hidden.
2. **Command line:** inside the board there is a small command line that runs **board commands only** (a limited set; the shell keeps the puzzle). It does not replace the shell.
3. **Explanation:** **a character explains the board** in dialogue (story-driven), not an overlay tutorial. This changes the story, so the wording needs an owner canon decision (see "Open questions").

## Goal

The evidence board stops being something the player stumbles on. A character introduces it in the story, the trigger appears at that moment, and the board has its own command line for working with evidence, with the explanation coming from the story rather than from a manual.

## Design

### 4b.1 First mention and availability

- [ ] Choose the story beat (proposal, **unverified, owner decides**): in the guest session intro, after `cat ~/inbox/001.msg` or at the start of the Level 01 intro, `unknown` says a line pointing at the case file (for example that it keeps a record of everything the guest finds). The beat is a node in the story data (`story-data/intro.js` or `level01.js`), not code.
- [ ] That node calls a small host action (for example `caseFile.makeAvailable()`), which reveals the trigger (the existing reveal animation) and sets `boardUnlocked`. Today `boardUnlocked` is set by the first discovered record (`setState` in `casefile.js`): keep that as a fallback so a developer jump into the puzzle still works.
- [ ] The trigger is reachable by keyboard and touch from that moment; `board` in the shell opens it as before. A dev route that skips the intro must make the board available.
- [ ] The Level 01 puzzle, the three-layer key and `unlock` are untouched. The board stays optional for the win.

### 4b.2 Explanation by a character

- [ ] 2 to 5 short lines in the voice of the speaker (lowercase, calm, no exclamation marks; see `docs/story/story-bible.md` sections 2 and 5) that say: what the board is, that evidence is not identity, that `scan` and `decrypt` cost trace time, and that it is optional. Lines live in story data, validated by `tools/validate-story.mjs`.
- [ ] The explanation is played once, in the story, right after the first mention. On the first time the board is opened, a one-line reminder in the board's log pane points at `help` (no overlay).
- [ ] Skip (the hold control) and reduced motion work as for any other dialogue.

### 4b.3 Board command line

- [ ] A command pane in the board dialog (`board-ui.js`): an input with a visible label, an output log inside the dialog, `Enter` to run, history with the up arrow, `Esc` closes the board as before. It must work with the on-screen keyboard (the input stays visible above it) and with a screen reader (its own live region, as the board already has).
- [ ] Board commands only. Proposed set (owner can change): `help`, `list` (records with state), `open <id|code>` (select a record in the board), `scan`, `intercept`, `decrypt <id|code>`, `connect <a> <b>`, `trace` (same as `trace --status`), `close`. Names are data in a registry (reuse `commands.js` with a `scope: 'board'` group, so that `help` is generated and the validator checks it). Commands that cost time or trace behave **exactly** as in the shell: one implementation, two entry points (the shell and the board pane call the same functions in `hacking-commands.js`).
- [ ] A shell-only command typed in the board answers `use the shell for that` (no new behaviour, no shell access from the board).
- [ ] `decrypt` still blocks input while it runs (phase 4 decision); the board pane shows the same progress line.
- [ ] No second timer: everything uses the session (`session.sleep`, `trace.onTick`). The pane's listeners are removed when the dialog closes or the session aborts.
- [ ] Fonts at least 11px; touch targets at least 44px for the buttons; only `transform` and `opacity` animate.

## Open questions for the owner (answer before building 4b.2)

- Which character speaks the explanation (`unknown`, or the watcher on the other route, or both)? The watcher route must not contradict the sealed-branch evidence.
- Exact beat: right after the inbox message, or at the Level 01 intro? (The inbox message says the key is in the page; the case file mention should not give the key away.)
- Final command set for the board pane.

## Tasks (checklist)

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
| 4b.0 Re-verify + start log | todo | | |
| 4b.1 Availability at the first mention | todo | | |
| 4b.2 Explanation by a character | todo | | needs the owner's answers above |
| 4b.3 Board command pane | todo | | |
| 4b.4 Tests | todo | | |
| 4b.5 Docs | todo | | |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next step.)_
