# Phase 9 — Extras (mobile controls, source viewer) & final polish

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-9-polish`
- **Depends on:** all other phases merged (this is the integration and finishing phase)
- **Plan section:** 9 (extras **4 and 5 only**; extras 6 and 8 were done in phases 2 and 4) + the "Polish" step of the plan's execution order (testing, mobile)
- **Touches:** `js/commands.js` and the terminal UI (`tty.js`, `index.html`, `styles.css`), the existing `source`/`cat page/…` commands in `level01.js` (or its phase 3 successor), repository `README.md`, `docs/overhaul/*`

## Goal

Make the game comfortable on a phone, give the player a stylized source viewer that doubles as a clue hunt, and finish with a full cross-device QA pass and documentation.

## Extra 4 — Mobile experience: soft command palette / quick-action buttons

Problem: the game is keyboard-heavy. On a phone the player must open the on-screen keyboard and type commands like `cat page/index.html`, which is slow and error-prone, and the keyboard hides half the screen.

- [ ] A **quick-action bar** docked above the on-screen keyboard (or at the bottom when the keyboard is closed), shown only on touch/coarse-pointer devices (`matchMedia('(pointer: coarse)')`) and togglable with a small button on desktop for testing (`?quickbar=1` on localhost).
- [ ] The bar shows **context-aware chips** for the commands that make sense *right now* from the command registry (phase 3): e.g. `help`, `hint`, `ls`, `cat ▸`, `board`, `source map`, `trace`, and during the trust choice `1` / `2`; after phase 4 also `scan`, `intercept`, `decrypt ▸`. Chips are generated from the registry plus each command's optional `suggest()` (e.g. `cat` offers the files from `ls`; `decrypt` offers locked evidence ids).
- [ ] Tapping a chip **types the command into the prompt and runs it** for no-argument commands. For commands with arguments (`cat`, `decrypt`, `unlock`), the chip opens a small second row of argument chips (files, ids) or places the command text in the input and focuses it for completion. `unlock` is special: the player must still *type* the key (three parts found in the page); do not offer the key as a chip.
- [ ] **Virtual keyboard handling:** use `visualViewport` (`resize`/`scroll` events) so the prompt line and the quick bar stay visible above the keyboard (`position: fixed` bottom = keyboard height). Scroll the output so the latest line is visible after each command. Also set `enterkeyhint="go"`, `autocapitalize="off"`, `autocorrect="off"`, `spellcheck="false"` (already present on the input).
- [ ] **Touch targets ≥ 44×44 px**, font ≥ 11px (the repo-wide rule), visible focus, no horizontal page scroll at 360 px.
- [ ] **Accessibility:** the bar is a `role="toolbar"` with an accessible name and arrow-key navigation; chips are real `<button type="button">`. It must **not** break the phase 1 focus rule (tapping a chip must not leave the terminal unusable; after running, return focus to the terminal input only if the keyboard was already open).
- [ ] Sound/animation: the chips use the normal command path, so the typing and command sounds play as if typed.
- [ ] A small "history" gesture: swipe left/right on the input or ↑/↓ buttons to cycle previous commands (check whether the terminal already supports arrow-key history; add it if not, because mobile users cannot press arrow keys).

## Extra 5 — Stylized, redacted `source` viewer with hidden clues

Today (verify in the code): `source` / `view-source` with no argument prints how to inspect the page; `source map` lists three files; `cat page/index.html`, `cat page/styles.css`, `cat page/js/source.js` fetch the **real** files and print only the lines that match a per-file `clue` regex, then call `caseFile.discover(...)` for `page-markup`, `page-style`, `page-script`.

New: `source` opens a **pager-style viewer** of the real page source inside the terminal:

- [ ] Fetches the real files (same `sourceFiles` map, same `fetch` with error handling) and shows them with line numbers, scrolling by touch/wheel/keys, **syntax tinted** with a few lines of tokenizer (HTML tags/attributes, CSS properties, JS keywords/strings), styled to match the terminal.
- [ ] **Redaction:** the value parts of the key layers are drawn as `█████` (`ghost`, `"shell"`, the char-code expression) until the player has discovered that layer through the *original* discovery path (or paid the hint cost). Redaction must be purely visual and happen after fetch; **the DOM text must not contain the real value while redacted** (otherwise selecting/copying/inspecting the terminal leaks it; build the redacted string from the source before inserting). The real page source (view-source, DevTools) still contains the key, that is the puzzle.
- [ ] The viewer **keeps the puzzle intact**: it must not replace "inspect the page layers". Decide with the owner whether redaction applies at all or only the "annotated" style; the safe default is: show real source, tint it, redact nothing that the existing `cat` already prints, and add *extra* hidden clues/flavor (below).
- [ ] **Hidden clues** (fits the story, easy on mobile): extra comments in the HTML/CSS/JS source (not the key) that the viewer highlights as `[!]` markers when found, feeding `caseFile.discover(...)` for new evidence (`INTEL`/`SIGNAL`, phase 4 schema) and a few lore lines (the erased people, the `sdb9` partition). Keep them short and in character; make sure adding comments to `index.html`/`styles.css`/JS does not disturb `getLevel01Key()` (it reads one `<meta>` and one CSS custom property) or the clue regexes.
- [ ] Commands: `source` (list files), `source <file>` (open viewer), `q` or `Esc` or a visible [CLOSE] button to leave the viewer; works with the quick-action bar and keyboard. It is a modal pager: ensure the session/abort model closes it on reboot.
- [ ] Accessibility: the viewer is a scrollable region with `role="region"`, an accessible name, `tabindex="0"`, and a plain-text fallback (the same lines as text) for screen readers; no animated typing in it.

## Final polish and QA

- [ ] **Full regression:** run the complete smoke suite plus the new tools (`tools/smoke.mjs`, `audio-lint.mjs`, `perf.mjs`, `validate-story.mjs`, `check-fonts.sh`, `check-animations.sh`) on desktop, 390×844 and 360×740 viewports, with reduced motion, in Chromium and (if available in the environment) Firefox and WebKit via Playwright.
- [ ] **Accessibility audit** of the whole game: keyboard-only playthrough, screen-reader snapshot of each screen, contrast re-check, focus order, no keyboard trap, announcements (phase 1 `sr-announcer`), dialogs (launch, power/game over, case board, dev panel). If `axe-core` can be installed, run it on each screen and record the result.
- [ ] **Edge cases:** resizing during boot, rotating a phone, tab hidden/visible mid-trace (the trace continues, per the README; rain pauses), reload mid-game (the game restarts from the launch screen; session persistence is out of scope), rapid reboot spam, an ad blocker blocking the audio file (graceful message, game still playable), a browser without Web Audio (graceful).
- [ ] **Docs:** update the repository `README.md` (fsociety00 section) to the final controls and behavior (commands list, quick actions, `source` viewer, the board mechanics, perf-lite, accessibility notes). Keep `docs/overhaul/` as history; mark every tracker row `merged` and add a short "what changed" summary at the top of `docs/overhaul/README.md`.
- [ ] **Cleanup:** remove dead code and unused CSS (use CSS coverage), unused cues, leftover debug logs; make sure `tools/` has its README and is not deployed (only `sites/*/public` is).
- [ ] **Deploy check:** verify with the owner that both Cloudflare projects build from `sites/main` and `sites/fsociety00` (root directory settings) and that preview deploys work for the branch.

## Explicitly skipped (owner declined; do not build)

Extra 1 Konami code, extra 2 session persistence (`localStorage`), extra 3 sound toggle, extra 7 CRT curvature.

## Verification

- [ ] On a real phone (owner): quick-action bar usable, keyboard does not hide the prompt, board and viewer usable one-handed.
- [ ] Headless: quick-action bar appears with `pointer: coarse` emulation (Playwright `hasTouch: true`, `isMobile: true`), chips run commands, argument chips work, `unlock` is not offered as a chip.
- [ ] `source` viewer: opens each file, redaction does not leak (assert the DOM text does not contain the redacted value), closes cleanly on Esc, on reboot and via the button.
- [ ] The three-layer key can still be found by the original methods (view-source, `cat`, hints) and the win condition works.
- [ ] Final tracker updated; owner sign-off recorded in the decisions log.

## Done when

Mobile play is comfortable, the source viewer is in and the puzzle is intact, all tools pass on all viewports, documentation is current, and every phase in the tracker is `merged`.

## Checkpoint log

Commit and push after **every row** (see "Checkpoints" in the master README). Update the row (status `todo` / `in progress` / `done` / `wip` / `skipped`, short commit hash, one line of notes) in the same push. Add rows if you split a step. A Claude resuming this phase continues at the first row that is not `done`.

| Step | Status | Commit | Notes |
|---|---|---|---|
| 9.1 Quick-action bar (extra 4) | todo | | |
| 9.2 Virtual keyboard handling, touch targets, command history | todo | | |
| 9.3 Source viewer (extra 5) | todo | | |
| 9.4 Hidden clues | todo | | |
| 9.5 Full regression + cross-browser | todo | | |
| 9.6 Accessibility audit + edge cases | todo | | |
| 9.7 README/docs update + cleanup + deploy check | todo | | |

## Implementation notes

_(Keep a **Resume point** block first. It is advisory and goes stale, so write it at the **start of every session** after re-deriving the state from the code, and again if you stop early: branch + head commit, `last green commit`, step in progress, anything broken or half-edited, failing tests, next command. Mark the previous block `(historical)`. Then append here)_
