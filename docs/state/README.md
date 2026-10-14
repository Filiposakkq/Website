# State of the code (living documents)

These files describe the code **as it is on `main` now**, split by area so that a Claude only reads what its phase touches. They replace the old `docs/overhaul/state-after-phase-1.md` (history stays in git, the phase files' handoff reports, `CHANGELOG.md` and the tracker in the master README).

| File | Read it when you touch |
|---|---|
| [`architecture.md`](architecture.md) | anything: session, GameContext, the rules all new code follows, Do-not-break |
| [`story.md`](story.md) | `story.js`, `level01.js`, `trace.js`, `casefile.js`, `story-choices.js` (phases 3, 4, 6) |
| [`audio.md`](audio.md) | `audio.js`, `audio/*`, `trace-sound.js` (phases 2, 6, 7) |
| [`ui-and-css.md`](ui-and-css.md) | `index.html`, `styles.css`, overlays, `developer-menu.js` (phases 5, 7, 9) |
| [`tools.md`](tools.md) | tests and lints (`tools/`) |

## Rules for keeping them true

1. **Every phase PR updates the files it affects, in the same commit as the code** (CLAUDE.md rule 7). Reviewers check this ("docs sync" in the PR template).
2. Each file starts with a line "Valid after: ... commit ...". Update it when you re-verify or change the file. Mark anything not verified as "unverified".
3. Describe **what is, not what was**: no "after phase N" sections. History belongs in the phase file, the CHANGELOG and git.
4. Never trust line numbers or line counts for long; find code with `grep`.
5. Spoilers: these files may name story mechanics but never print the Level 01 key.
