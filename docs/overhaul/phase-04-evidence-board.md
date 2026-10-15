# Phase 4 — Evidence board: live intelligence dashboard + hacking mechanics

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-4-evidence`
- **Depends on:** phase 1 and phase 3 merged (command registry, engine, `GameContext`); phase 2 recommended (cues `evidence-*`, `decrypt-progress`, `packet-intercept`, `relay-connect`, `breach-alert`, `node-select`, `board-open`)
- **Review items covered:** 15 (case board dialog), 17 (font sizes in `.case-*`), the font-size lint for case CSS
- **Plan sections:** 4 (Evidence board complete rework), 5 (the new gameplay commands: `scan`, `intercept`, `decrypt`, `trace --status`) + **extra 8 (ASCII network topology during the trace)**
- **Touches:** `js/casefile.js` (large rework), `js/commands.js` (new commands), `js/level01.js` (hook the new mechanics into the puzzle flow), `styles.css` (`.case-*` rules), `index.html` (case trigger), new `js/topology.js`

## Goal

The evidence board stops being a static reference and becomes the **central mechanic** of Level 01: the player actively builds a picture of the intrusion with terminal commands, decrypts locked evidence while the trace keeps running, connects related evidence to reveal intel, and watches the trace path close in on a network map.

The existing puzzle (three key layers: markup, styles, console) must remain solvable and remain *the* way to get the key. The board adds depth and tension around it, it must not replace it, and it must not make the game impossible on a phone.

## Current state (baseline `8ea680b`)

- `casefile.js` (705 lines): a declarative `EVIDENCE` array at the top (each item has `id, group, title, source, summary, detail, x, y, links`), `ROUTE_LABELS`, `OUTCOME_LABELS`, and `createCaseFile({ trigger, getTraceLeft })` returning:
  `start, discover, chooseTrust, markHint, markFailedUnlock, inspectGhostScript, verifyRelay, isolateWatcher, decide, setOutcome, setFailureOutcome, open, snapshot`.
- Callers (grep to confirm): `story.js` (`start`, `chooseTrust`, `decide`, `inspectGhostScript`, `discover('erased-list')`, `snapshot`, `setOutcome`, `setFailureOutcome`) and `level01.js` (`discover(id)` for `lock-header`, `route-note`, `watcher-log`, `page-markup`, `page-style`, `page-script`, `elliot-echo`, plus `open`, `markHint`, `markFailedUnlock`, `verifyRelay`, `isolateWatcher`, `snapshot`).
- The board is a `div role="dialog"` with tabs (CASE FILE trigger button `#caseTrigger` in `index.html`), an interactive pan/zoom map with keyboard support (arrow keys pan, `+`/`-` zoom, `Home` fit), provenance, trace status, choices and a session timeline.
- It has many `8px`/`9px` font sizes that phase 1 deliberately left alone.
- The README (repo root) documents the current board behavior; update it in phase 9.

**Keep the public API stable**, or migrate every caller in the same PR. Add methods, do not silently rename existing ones.

## Target design (from the plan)

```text
┌──────────────────────────────────────────────────┐
│  CASE FILE // INTELLIGENCE DASHBOARD     [CLOSE] │
├──────────────┬───────────────────────────────────┤
│  EVIDENCE    │       NETWORK MAP                 │
│  LIST        │   (interactive node graph)        │
│  • Unlocked  │   [NODE] ──── [NODE]              │
│  • Locked 🔒 │      \                            │
│  • Decrypted │       [NODE] ──── [???]           │
├──────────────┼───────────────────────────────────┤
│  PACKET      │  TRACE STATUS                     │
│  INTERCEPT   │  ████████░░░░ 04:32               │
│  LOG         │  Source: [REDACTED]               │
│              │  Hops remaining: 3                │
└──────────────┴───────────────────────────────────┘
```

(Do not use emoji in the shipped UI; use text or SVG icons for the lock.)

### Evidence types and states

- Types: `INTERCEPT` (captured network packets, auto-collected during the story), `ARTIFACT` (files found with terminal commands), `SIGNAL` (mysterious transmissions from Unknown/Watcher), `INTEL` (unlocked by connecting related evidence), `COMPROMISED` (evidence that gets corrupted if the trace reaches certain thresholds).
- States per item: `hidden` → `locked` (seen but encrypted) → `unlocked` → `decrypted`, plus `compromised` (corrupted, partly unreadable). Extend the `EVIDENCE` records with `type`, `state`, `encrypted` (bool + `decryptSeconds`), `requires` (ids that must be known first), `connects: [[idA, idB]]` and `compromiseAtTrace` (seconds left below which it corrupts). Migrate the existing 7+ items to the new schema, keeping their text.

### Mechanics (terminal commands, registered via the phase 3 registry)

| Command | Behavior |
|---|---|
| `scan` | Scans the local network, **discovers evidence nodes** (they appear as `locked` or `unlocked` on the map). A scan takes a few seconds with progress output and audio (`decrypt-progress` style); the trace keeps running. Limited re-scans or increasing cost are fine design knobs |
| `intercept` | Captures packets for a few seconds, unlocks `INTERCEPT` evidence (`packet-intercept` cue). Shows a short packet table in the terminal and in the board's PACKET INTERCEPT LOG |
| `dump <file>` or extending existing `cat` | Reads artifacts and unlocks `ARTIFACT` evidence |
| `decrypt <node-id>` | Decrypts a locked item. **Takes time** (progress bar, `decryptSeconds`), the trace keeps running; the player can type other commands? Decide: either block input with a progress UI or run it in the background and allow other commands (background is more tense but harder; if background, show a job id and handle `abort`). Must be aborted cleanly by the session (phase 1) |
| `connect <idA> <idB>` and/or connect nodes on the board by selecting two | Connecting two related evidence nodes reveals hidden intel (`INTEL`) and advances the story |
| `trace --status` | Prints the trace progress: time left, hops remaining, the ASCII topology (see extra 8). **A plain `trace` command already exists** in `level01.js` and prints `trace: ACTIVE/CLOSING`, `eta: MM:SS` and a hard-coded `relays: 7 / 9`; keep it working, make `--status` an extension of it, and replace the hard-coded `7 / 9` with the real hop numbers so both commands agree |

Rules:

1. **No command may print the Level 01 key.** The three layers are still found by inspecting the page. New evidence may point the player toward the layers (hints with a cost, flavor text) but never replace them.
2. The numbers (decrypt durations, number of nodes, hop count) must fit the trace: the trace is 8 minutes, tightening to 2 minutes at the puzzle (`trace.js`, `story.js`). Playtest: a careful player should be able to finish, a lazy one should feel pressure. Document the tuning constants in one place at the top of `casefile.js`.
3. **Ghost trail:** the signals from Unknown/Watcher on the board depend on the trust route (`ROUTE_LABELS`, the existing route-specific evidence such as `route-note` and `watcher-log`): show the relevant ghost evidence for the chosen route and keep the other route's evidence hidden or suspiciously incomplete.
4. **COMPROMISED:** if the trace passes a threshold, specific evidence becomes `compromised` (visually corrupted, partly unreadable text using `scrambleText` from `util.js`). It should be possible to *recover* by `decrypt`/`repair` only if that makes sense for the story; otherwise it is simply lost, which adds stakes.
5. The `outcome` bookkeeping (`OUTCOME_LABELS`, `setOutcome`, `setFailureOutcome`) keeps working and the session timeline still lists decisions and events.

### Extra 8: ASCII network topology during the trace — `js/topology.js`

- [ ] A renderer that outputs the trace path as ASCII art, one text block, e.g.

```text
 [YOU]──(hop1)──(hop2)──(hop3)──(hop4)──[ ??? ]
  guest   *        *       ·       ·      target
 trace:  ████████████░░░░░░░░ 62%   hops remaining: 2
```

- [ ] The path **lights up node by node** as the trace progresses: derive "hops reached" from `getTraceLeft()` (seconds left ÷ total). Reached nodes are bright/red, pending nodes dim. Updates once per trace tick; use `textContent`/class toggles on prebuilt spans, no per-frame DOM rebuilds.
- [ ] Used in **two** places from one module: the board's TRACE STATUS panel and the terminal output of `trace --status` (static snapshot). Optionally a compact one-line version in the corner HUD (phase 5 owns the HUD look).
- [ ] Node names/IPs are fictional (use documentation ranges, `203.0.113.x`, `198.51.100.x`) and the final node is redacted. **Never** show or request the player's real IP/location.
- [ ] Respect `prefers-reduced-motion`: no blinking; changes appear instantly.
- [ ] Phase 6 reuses this topology for the TRACED sequence.

### Board UI

- [ ] Convert the board to a native `<dialog>` (review item 15) with `showModal()`, focus trapping, `Escape` to close, focus returns to `#caseTrigger`. Make sure the global terminal focus rule from phase 1 does not steal focus while the board is open.
- [ ] Layout per the diagram on desktop; on phones stack the four panels in tabs (EVIDENCE / MAP / INTERCEPT / TRACE) with big touch targets, no horizontal page scroll. Map pan/zoom must keep working with touch (pointer events, pinch optional).
- [ ] Keep keyboard support: Tab through nodes, `Enter` selects, arrows pan, `+`/`-` zoom, `Home` fits. List and map stay in sync (selecting a list row highlights the node and vice versa); announce selection via the phase 1 `sr-announcer`.
- [ ] **Font sizes ≥ 11px** in all `.case-*` CSS (review item 17); this phase removes the exclusion in `tools/check-fonts.sh` for `.case-*`.
- [ ] Reveal animations ("glitch-in with staggered node reveals") are specified in phase 5; here, add the hooks (a `data-reveal-index` / class) and a basic fade so the board works without phase 5.
- [ ] `getTraceLeft` keeps being the source for trace data; do not start a second timer.

## Tasks

- [ ] Schema migration of `EVIDENCE` + a validator (`tools/validate-story.mjs` extension): every `links`/`requires`/`connects` id exists, no cycles that make evidence unreachable, every `discover('<id>')` call in the code refers to an existing id
- [ ] State machine per evidence item and the new `casefile` methods (add `scan`, `intercept`, `startDecrypt`, `connect`, `compromiseCheck`; keep old ones)
- [ ] Commands `scan`, `intercept`, `dump`, `decrypt`, `connect`, `trace --status` in the registry, listed in `help`, with audio cues
- [ ] Topology module + integration in board and terminal
- [ ] New board layout + dialog conversion + mobile layout + a11y
- [ ] Trust-route ghost trail and COMPROMISED handling
- [ ] Tune with real playtests (record tuning in the notes)
- [ ] Update `docs/overhaul/audio-cues.md`

## Out of scope

Reveal/transition animation polish and trace-reactive vignette (phase 5), the TRACED sequence (phase 6), dev panel inspector (phase 7), the mobile quick-action chips (phase 9; but make sure the new commands are easy to type: short names, tab completion if phase 3 added it).

## Verification

- [ ] Smoke test passes on both routes; add steps that run `scan`, `intercept`, `decrypt` one item, `connect` two items, `trace --status`, then solve the key.
- [ ] A scripted "speedrun" (known key, no board) still wins: the board must be optional for the win condition unless the owner decides otherwise (record that decision).
- [ ] A scripted run where the trace expires during `decrypt`: clean game over, no orphaned timers (phase 1 `session.pending() === 0` after reboot).
- [ ] Mobile 390×844: board usable with touch; all text ≥ 11px; no horizontal overflow.
- [ ] Keyboard-only run of the board; screen-reader snapshot shows dialog, list, selection announcements.
- [ ] `grep` for any place the full key could be printed: none.

## Done when

The board is a live dashboard integrated with the terminal, the extra-8 topology works in board and terminal, fonts and dialog fixes are in, and the puzzle remains winnable in the original way.

## Carried over from the phase 1 review

- [ ] Fix the sub-11px font sizes in `.case-*` (`.case-trigger`, `.case-count`, ... listed by `bash tools/check-fonts.sh --all`); they are visible to players on phones. Then remove the `.case-*` exclusion from `tools/check-fonts.sh`.


## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 4.1 EVIDENCE schema migration + validator | done | `864dd72` | records in `story-data/evidence.js` (19: original 9, 5 network, 5 INTEL), `CASE` constants, evidence validator with 17 mutations; smoke 21/21 on a snapshot (**last green commit: `864dd72`**) |
| 4.2 State machine + casefile methods | done | `6e3e8fc` | hidden/locked/unlocked/decrypted/compromised, `scan intercept dump find startDecrypt finishDecrypt connect compromiseCheck tick`; 45 Node checks in `validate-story`; `trace.onTick` feeds the loss rule; board still the legacy view until 4.5; smoke 21/21 on a snapshot (**last green commit: `6e3e8fc`**) |
| 4.3 Commands scan / intercept / dump / decrypt / connect | done | `d875fab` | `hacking-commands.js` + `story-data/hacking.js`; 31 Node checks with a fake clock (incl. trace ending mid-decrypt, record overwritten mid-decrypt, no key text, documentation IPs); 2 new smoke scenarios; smoke 23/23 on a snapshot (**last green commit: this 4.3 commit**); browser look of the commands on a phone width: unverified |
| 4.4 Topology module (extra 8) + trace --status | done | `e0ac15d` | `topology.js`, `trace --status`, real hop count in plain `trace`, 11 Node checks; board view `createTopologyView` written but not shown until 4.5; smoke 23/23 on a snapshot (**last green commit: this 4.4 commit**); the one-line trace status for the corner HUD was not done (phase 5 owns the HUD look) |
| 4.5 Board layout + native dialog + mobile + a11y + fonts | done | `40a9bf8` | `board-ui.js` (native dialog, 2x2 panes / phone tabs, own live region, map with pan/zoom/pinch/keyboard, connect by rows or nodes), casefile has no DOM code, `.case-*` CSS rewritten at >= 11px, `check-fonts.sh` no longer skips `.case-*`; 2 new smoke scenarios (wide + phone); full smoke 24/25 on the first run, the one failure is the known parallel-load flake `typing ticks are rate limited`, which passes alone (**last green commit: this 4.5 commit**). Unverified: real touch pinch on a device, screen reader output, iOS Safari dialog behavior |
| 4.6 Ghost trail + COMPROMISED handling | done | (see git log, "phase 4.6") | sealed stubs of the other branch in `getView()`, lost records shown scrambled with `AT RISK` warnings, scrambled text hidden from screen readers; 10 Node checks and 1 smoke scenario (**last green commit: the final phase 4 commit**) |
| 4.7 Tuning and playtests | done | (see git log, "phase 4.7") | tuning notes below (scripted only, **no human playtest: unverified**), keyboard-only smoke scenario with the accessibility tree, tracker, changelog, owner checklist, handoff report |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here)_

### Resume point (2026-10-15, session 1, phase complete)

- Branch `overhaul/phase-4-evidence`; every row 4.1 to 4.7 is done; handoff report below. Remaining: the owner's review, the preview test on a phone and a desktop, and the merge (not done by Claude).
- If a review finds issues: fix on this branch, re-run `node tools/smoke.mjs`, `node tools/validate-story.mjs`, `bash tools/check-fonts.sh`, update the Checkpoint log.
- Next phases: 5 (animations: the board has `data-reveal-index` hooks and a plain opacity fade; `.topo-*` and the board are phase 5 material for a glitch-in), 6 (the TRACED sequence can reuse `js/topology.js`), 7 (developer panel: jump routes could pre-fill evidence).

### Resume point (session 1, started 2026-10-15) (historical)

- Branch `overhaul/phase-4-evidence`, created from `main` `872407f` (phase 3 merged, PR #10/#11). Head at the time of writing: `872407f` plus this docs commit.
- `last green commit`: none yet. Baseline on unmodified `main` (`872407f`): `validate-story` ok, `check-fonts.sh --all` fails with the 26 known `.case-*`/`.developer-*` declarations. Full smoke baseline: 20 of 21 passed, `reduced: typing ticks are rate limited ...` failed in the parallel run (`tools/README.md` lists two scenarios that were flaky once under parallel load; re-run alone before treating it as a regression, result in the log below).
- Step in progress: 4.1 (schema migration + validator). Nothing half-edited.
- Next command: `node tools/validate-story.mjs` after the schema move, then `node --check` on the changed files.
- The old "Current state (baseline `8ea680b`)" section above is stale (casefile.js is 707 lines, `level01.js` registers commands through `commands.js`, the story is data). Re-derived state: `docs/state/story.md` and the code.

### Decisions made in phase 4 (2026-10-15)

Defaults chosen without the owner (nobody was there to ask). Change them by editing the data, not the code.

| Decision | Why |
|---|---|
| **The evidence records are data** in `js/story-data/evidence.js`; **every tuning number** (scan, intercept and decrypt times, loss thresholds, hop count, cost of a wrong `connect`) is `CASE` in `js/story-data/constants.js`, not "at the top of `casefile.js`" as this phase file said | Since phase 3 the repo keeps text and numbers in `story-data/`; `validate-story` imports both in Node. `casefile.js` points there in its header |
| `decrypt` **blocks the shell** (progress line, no other command while it runs) and the trace keeps running; it stops cleanly when the trace expires; it uses real time (`session.sleep`), not the reduced-motion `wait`, so the cost is the same for everybody | Background jobs need a job id, `abort` handling and concurrency with the read loop; blocking keeps the loop single-threaded and phone friendly. The tension comes from the HUD ticking |
| **`COMPROMISED` is both a type and a state.** The type marks volatile records (`ram-residue`); any record may have `compromiseAtTrace`. A record that the player does **not hold yet** (hidden or locked) is **lost for good** when the trace reaches the threshold; a record they already read is never taken away. No repair command | Stakes without ever removing information the player has; the plan allowed "simply lost" |
| Evidence can have a **short code** (`e1`..`e19`); every command accepts the code, the id, or a unique id prefix. Only records already seen can be named | Typing `decrypt e11` on a phone is easy; naming a hidden record would leak it |
| **The key layers are untouched.** The three original page records and the original nine are never encrypted and never fragile (validator-enforced); INTEL only points toward the page (`source map`), never prints a layer; the board is optional for the win | CLAUDE.md "Do not break" |
| `scan` has two tiers (local network, then a deep scan); `intercept` has two tiers; later runs find nothing and are instant. A `connect` with no relation costs `CASE.connectMissCost` trace seconds | The plan's "limited re-scans or increasing cost" knobs; the penalty stops brute-forcing pairs |
| The other route's records are shown as **sealed stubs** ("SEALED // OTHER BRANCH"), not hidden completely | The plan: "hidden or suspiciously incomplete"; the story bible already promised this label |
| The case file starts **no timer**: the level shell calls `caseFile.tick(secs)` from `trace.onTick` | Phase 4 rule "do not start a second timer"; the session owns the trace interval |

### Tuning notes (4.7, 2026-10-15)

All numbers are `CASE` in `js/story-data/constants.js`. **No human playtested them**: the figures below are arithmetic and scripted runs (unverified as a feel).

| What | Number | Reasoning |
|---|---|---|
| The puzzle window | 120 s after the trust choice (`TRACE.afterTrust`); `CASE.traceWindow` follows it | The board mechanics must fit inside it and stay optional |
| `scan` | 3 s, then 4 s (deep) | One scan before reading the page costs 3 s of 120 |
| `intercept` | 3 s + 3 s | Same |
| `decrypt` | relay frame 6 s, ledger 8 s | A player who runs everything (scan 3 + 4, intercept 3 + 3, decrypts 14) spends about 27 s of typing and waiting plus the commands themselves; a hint costs 30 s, so the whole board costs less than one hint |
| Loss thresholds (seconds left) | memory record 90, ledger 35, relay frame 45 | The memory record is lost after about 30 s of the window if the deep scan has not found it; the others only when the player is already in the last third. A held record is never lost |
| Wrong `connect` | 3 s of trace | Stops pair brute-forcing (the board has ~14 readable records at most), small enough not to end a run |
| Topology | 4 relays + target; the path advances every 24 s of the 120 s window | `floor(progress x 5)` |

What a scripted run showed: the smoke scenario "scan, intercept, dump, decrypt, connect -> victory" wins the original way after using every command. The "trust unknown / watcher -> victory" scenarios never open the board, so the board is optional for the win (decision below). The tuning to check by hand: does a careful player finish the page layers and still have time for one decrypt, and does a lazy player feel the memory record disappear at 90 s.

### 4.5 and 4.6 notes (2026-10-15)

- The board is `js/board-ui.js`; `casefile.js` has no DOM code any more (it gives `getView()` and `subscribe`). The board draws on 'data' notifications and once per trace tick; it starts no timer and opens only while a dialog exists.
- On a phone (max-width 720px) the four panes are tabs. In that layout selecting a row pans the map so the selected node is on screen; the connect flow works through rows as well as nodes because the 720 px map does not fit a 390 px pane at a readable size (fit never goes below 0.75).
- Lost records are shown with scrambled text made once when they are lost (no flicker); the scrambled copy is `aria-hidden` and an sr-only sentence says the record is overwritten.
- `trace --status` and the board both use `js/topology.js`; the board shows the six path nodes as a list, not as boxes.
- Not done: the one-line trace in the corner HUD (phase 5 owns the HUD look); the board does not start `decrypt` (terminal only); tab completion.

### More decisions made in phase 4 (2026-10-15)

| Decision | Why |
|---|---|
| **The board is optional for the win.** Nothing in the puzzle checks the case file | CLAUDE.md "Do not break": the three-layer key and `unlock` must keep working; the plan asked to record this |
| The board stays closed to the player until the first record exists (as before): `#caseTrigger` is hidden until then | Unchanged behavior |
| The board does not pause the trace | The plan's wording (the timer continues while the board is open) was kept from the old board |
| The board has no `decrypt` button; it connects, selects and shows | The decrypt costs real time and blocks the shell; a button would need a second progress UI (phase 5 / 9 if wanted) |
| Pinch zoom uses pointer events (two pointers); no gesture library | No dependencies |

## Handoff report (2026-10-15)

**Done:** rows 4.1 to 4.7. The evidence is data (`js/story-data/evidence.js`: 19 records with a state machine hidden / locked / unlocked / decrypted / compromised); five new terminal commands (`scan`, `intercept`, `dump`, `decrypt`, `connect`, in `js/hacking-commands.js`, text in `js/story-data/hacking.js`); `trace --status` and the ASCII trace path (`js/topology.js`, also in the board); the board is a native `<dialog>` (`js/board-ui.js`) with four panes (wide) or four tabs (phone), its own live region, pan / zoom / pinch / keyboard map and connect-by-selecting; ghost trail (sealed stubs of the other branch) and lost evidence (scrambled, `AT RISK`). `.case-*` is at 11 px or more and `tools/check-fonts.sh` no longer skips it.

**Verified (last green commit = the head of this branch before the PR):** full `node tools/smoke.mjs` on a snapshot (27 scenarios; see the log row of 4.7 and the PR text for the exact result), `node tools/validate-story.mjs` (evidence schema + 17 mutation tests, 45 state machine checks, 31 command checks with a fake clock, 11 topology checks, view checks), `bash tools/check-fonts.sh` OK, `node --check` on every changed file. The smoke scenarios cover: every new command and a win afterwards, a decrypt followed by trace expiry and a reboot, the board dialog on a wide screen and a phone (4 panes / tabs, no horizontal overflow, text >= 11 px, connect, Escape, focus return), a keyboard-only run with the accessibility tree, and lost / sealed evidence.

**Intentional behavior changes:** the CASE FILE board looks and works differently (the old overlay with three tabs is gone); `trace` prints a real hop count (`relays: n / 4`) instead of `7 / 9`; new `help` entries; the three original puzzle layers and `unlock` are unchanged.

**Unverified:** every number as a feel (no human playtest); sounds of `board-open`, `node-select`, `decrypt-progress`, `packet-intercept`, `evidence-unlock`, `evidence-decrypt`, `relay-connect`, `breach-alert`, `cmd-run`, `cmd-fail` in the new places (nobody listened); touch pinch on a real device; screen reader output on a real screen reader (only Playwright's accessibility tree was checked); Safari / iOS `<dialog>` and `matchMedia` behavior; the board layout in a landscape phone; contrast of the new colors (not run through `tools/contrast.mjs`).

**Not done / carried over:** one-line trace in the corner HUD (phase 5); reveal / glitch animation of the board nodes (phase 5; hooks `data-reveal-index` are in); a `decrypt` button on the board; tab completion; the root `README.md` still describes the old board (phase 9 updates it).

**Smoke result of the final run (27 scenarios, snapshot of the head, `--jobs` default 14):** 26 passed, 1 failed: `reduced: typing ticks are rate limited ...` (flake, passes alone, also failed on baseline). Before the runner got a concurrency cap, all 27 at once failed 4 scenarios from load (audio device error, timeouts); each passes alone.

**Flake:** `reduced: typing ticks are rate limited and ignore modifier and navigation keys` failed once in a parallel full run and passes alone (documented in `tools/README.md`); re-run it alone before treating it as a regression.

**Notes for the next phases:** add a record in `story-data/evidence.js` and run `node tools/validate-story.mjs` (it checks ids, reachability, that nothing leaks a key layer); a command that gives evidence calls the case file methods, never the DOM; the board reads `caseFile.getView()` and re-draws on `subscribe`; `createTopologyView(container).update(secsLeft)` is the live path view for phase 6.
