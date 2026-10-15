# Which phase touches which files

Written 2026-10-13 from the "Touches" line of each phase file. It is the file-level view of the dependency graph in the master README. Use it to decide which phases can run in parallel and in what order to merge. "Touches" lists are plans: re-check with `git diff --stat origin/main...HEAD` before merging.

| File | 2 Audio | 3 Story | 4 Evidence | 5 Animations | 6 TRACED | 7 Dev panel | 8 Main site | 9 Extras |
|---|---|---|---|---|---|---|---|---|
| `js/story.js` | call sites | **shrinks a lot** | | helpers | endings | `runDeveloperRoute` | | |
| `js/level01.js` | call sites | **yes** | **yes** | | | | | `source`/`cat` |
| `js/casefile.js` | call sites | | **large rework** | board reveal CSS | | | | |
| `js/audio.js`, `js/audio/*` (`patches.js`, `render.js`, new in 2) | **rewrite** | | | | cue wiring | previews | | |
| `js/trace-sound.js` (new in 2) | **creates** | trace policy (3.5: no tick when frozen) | | | | | | |
| `js/trace.js` | `onSecond` option (sound hook) | policy (3.5) | | hooks | `onEnd` hook | | | |
| `js/rain.js` | | | | **yes** | | | | |
| `js/commands.js` (new in 3) | | **creates** | new commands | | | | | quick actions |
| `js/engine.js`, `js/story-data/*` (new in 3) | | **creates** | | | uses | scene table | | |
| `js/developer-menu.js` | | | | | | **rewrite** | | |
| `js/tty.js` | key-tick, ignores Ctrl/Cmd/Alt shortcuts | | | | | | | **yes** |
| `styles.css` | | | `.case-*` | **many rules** | game-over panel | `.developer-*` | | quick bar, viewer |
| `index.html` | | | case trigger | overlays | game-over panel | | | quick bar |
| `sites/main/public/*` | | | | | | | **only this** | |
| `tools/*` | audio-lint | validate-story | | perf | | font lint | | all |

| `js/casefile.js`, `js/board-ui.js` | | | 4 rework | | | | | |

(Phase 4b, added 2026-10-15, edits `casefile.js`, `board-ui.js`, `hacking-commands.js`/`commands.js`, story data and the `.case-*` CSS region; run it after phase 4 and before or apart from 5.)

## What can run at the same time

- **Phase 8 (main site)** only touches `sites/main`; it can run any time, in parallel with anything.
- **Phases 2 and 3** can run in parallel, but both touch `story.js` and `level01.js` (2 only at cue call sites, 3 restructures them). **Merge phase 3 first** if both are ready (it moves the code the call sites live in); the phase 2 Claude then merges `origin/main` into its branch and fixes the call sites. A conflict in those files that is not trivial: stop and ask the owner.
- **Phases 4 and 5** touch different logic, but both edit `styles.css` (`.case-*` vs animations) and 4 also uses the board reveal CSS that 5 animates. They can run in parallel if each keeps its CSS in its own region and merges `main` before the PR.
- **Phase 6** needs 1, 2, 3 and 5 merged. **Phase 7** is best after 2-6 (it previews their sounds, scenes and effects). **Phase 9** goes last.

## Rules for parallel work

1. Branch from the latest `main`, and merge (never rebase) `origin/main` into your branch before opening the PR.
2. Keep edits in a shared file small and local; do not reformat or move code you do not need to change.
3. After the first of two overlapping PRs is merged, the second one gets re-checked with the full smoke test and a review-only pass.
4. Record the merge order in the progress tracker in the master README.
