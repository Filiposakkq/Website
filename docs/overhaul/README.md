# fsociety00 overhaul — master guide

> **Start here.** Every phase of the overhaul is its own document in this folder. A Claude (or a human) that picks up a phase must read **this file first**, then the phase file, then do the work.

- Baseline commit these docs were verified against: `8ea680b` ("A lot of editz"), 2026-10-11
- Source documents (the original request): [`source/code-review.md`](source/code-review.md) and [`source/overhaul-plan.md`](source/overhaul-plan.md)
- **Documents in this folder (2026-10-13):** [`../state/`](../state/README.md) (living docs of the code as it is now, split by area: read before the phase files' older "current state"), [`prompts.md`](prompts.md) (copy-paste prompts: start, resume, review-only, small fix, parallel phase), [`phase-conflicts.md`](phase-conflicts.md) (which phase touches which file, merge order), [`deploy.md`](deploy.md) (Cloudflare Workers, names, `previews`), [`merging.md`](merging.md) (merge procedure, protecting `main`), [`owner-test-checklist.md`](owner-test-checklist.md) (owner only: phone and PC test), and the story canon in [`../story/story-bible.md`](../story/story-bible.md).
- Scope decision by the owner: the full overhaul plan (sections 1–8) **plus extras 4, 5, 6 and 8 only** (see [Scope](#scope)).

---

## How to hand a phase to a Claude

Copy this prompt, change the phase number and slug:

```text
The project is the GitHub repository Filiposakkq/Website. Attach it through
your GitHub connection and clone it first (see "Working in a cloud chat session" in
the README; if you cannot access the repo, stop and tell me, do not recreate files).
Read docs/overhaul/README.md completely, then docs/overhaul/phase-0N-<slug>.md.
Implement that phase only, on a new branch named overhaul/phase-N-<slug> created
from the latest main (or from the branch of the phase it depends on, see its
"Depends on"). Push the branch immediately after creating it. Then COMMIT AND PUSH
after every numbered sub-step (see "Checkpoints" in the README) and keep the phase
file's Checkpoint log current, because your session can end at any moment.
Follow the Working rules and the Definition of done in the README.
Re-verify every "current state" claim against the code before changing anything:
the code may have moved since the docs were written. When finished, update the
tracker table in docs/overhaul/README.md and open a pull request. Do not merge it.
Do not push to main.
```

### Resuming a phase another Claude started (it ran out of usage)

```text
The project is the GitHub repository Filiposakkq/Website. Attach it through
your GitHub connection and clone it first (see "Working in a cloud chat session" in
the README; if you cannot access the repo, stop and tell me).
Read docs/overhaul/README.md completely (especially "Checkpoints" and "Resuming a
phase"), then docs/overhaul/phase-0N-<slug>.md. Another Claude started this phase and
stopped (usage limit). Resume it: fetch the remote, check out the existing branch
overhaul/phase-N-<slug> from origin, read the phase file's Checkpoint log and the
"Resume point" block in its Implementation notes (treat it as a hint, the code and tests win), run git log, git status and the smoke
test to see the real state, then continue at the first unfinished step. Do not redo
finished steps (verify them quickly instead). Commit and push after every sub-step.
Do not push to main and do not merge.
```

Phase files:

| # | File | One-line goal |
|---|---|---|
| 1 | [`phase-01-foundation-and-bugfixes.md`](phase-01-foundation-and-bugfixes.md) | Shared utilities, async cancellation, accessibility basics, all quick bug fixes |
| 2 | [`phase-02-audio.md`](phase-02-audio.md) | Data-driven audio engine and every new sound (incl. typing sounds, extra 6) |
| 3 | [`phase-03-story-and-boot.md`](phase-03-story-and-boot.md) | Data-driven story engine, realistic boot, realistic Linux commands |
| 4 | [`phase-04-evidence-board.md`](phase-04-evidence-board.md) | Evidence board becomes a live dashboard + new terminal mechanics + ASCII network map (extra 8) |
| 5 | [`phase-05-animations.md`](phase-05-animations.md) | GPU-only cinematic animations, trace-reactive effects, mobile performance budget |
| 6 | [`phase-06-traced-game-over.md`](phase-06-traced-game-over.md) | The "TRACED" game-over sequence |
| 7 | [`phase-07-developer-panel.md`](phase-07-developer-panel.md) | Fix and extend the developer panel (localhost + preview, never production) |
| 8 | [`phase-08-main-site.md`](phase-08-main-site.md) | Main site: tokens, accessibility, performance |
| 4b | [`phase-04b-case-file-intro.md`](phase-04b-case-file-intro.md) | Case file available from the first story mention, a character explains it, board command line |
| 9 | [`phase-09-extras-and-polish.md`](phase-09-extras-and-polish.md) | Mobile quick-actions (extra 4), source viewer (extra 5), final QA, docs |

---

## Progress tracker

Update this table in every phase's pull request. Status values: `todo`, `in progress`, `in review`, `merged`.

| # | Phase | Status | Depends on | Branch | PR / commit | Notes |
|---|---|---|---|---|---|---|
| 1 | Foundation & bug fixes | merged | — | `overhaul/phase-1-foundation` | PR #4, squash commit `841cad0` | all rows done, smoke 16/16, owner tested the preview on phone and PC; review findings carried over, see "Known issues carried over" |
| 2 | Audio | merged | 1 | `overhaul/phase-02-audio` | PR #7, squash commit `b0ea8ee` | all rows done, smoke 20/20, audio-lint 0 problems; **not yet listened to**: owner checklist "Phase 2 only" |
| 3 | Story & boot | merged | 1 | `overhaul/phase-3-story` | PR #10, squash commit `1bbc40d` | all rows 3.1–3.10 done, smoke 21/21, validate-story ok; **not heard/seen**: new boot sounds and length (~38 s est.), phone layout of the new boot; see the handoff report |
| 4 | Evidence board | merged | 1, 3 (2 optional) | `overhaul/phase-4-evidence` | PR #12, squash commit `c976821` | rows 4.1 to 4.7 done; handoff report in the phase file; owner test on the preview pending (touch, sounds, screen reader, tuning feel) |
| 5 | Animations | todo | 1 (3 recommended) | `overhaul/phase-5-animations` | | |
| 6 | TRACED game over | todo | 1, 2, 3, 5 | `overhaul/phase-6-traced` | | |
| 7 | Developer panel | todo | 1; best after 2–6 | `overhaul/phase-7-devpanel` | | |
| 8 | Main site | todo | — (independent) | `overhaul/phase-8-main-site` | | |
| 9 | Extras & polish | todo | all others | `overhaul/phase-9-polish` | | |
| 4b | Case file from the first story mention, explained by a character, with a board command line (owner request 2026-10-15) | in review | 1, 3, 4 | `overhaul/phase-4b-case-file` | PR #14 (open, not merged) | not part of the original plan; open questions in the phase file |

### Dependency graph and what can run in parallel

```text
            ┌─> 2 Audio ───────────────┐
1 Foundation┼─> 3 Story ─> 4 Evidence ─┼─> 6 TRACED ─> 7 Dev panel ─> 9 Polish
            └─> 5 Animations ──────────┘
8 Main site (independent, can be done at any time, in parallel with anything)
```

- **Can run in parallel** (different files, small merge conflict risk): 2 (`js/audio.js`) with 3 or 5; and 8 with everything.
- **Must be sequential**: 3 → 4 (both rewrite parts of `story.js` / `level01.js`), 5 → 6, everything before 9.
- 1 must be merged before any other fsociety00 phase starts. It changes helper signatures that all later phases rely on.

---

## Scope

**In scope:** everything in `source/overhaul-plan.md` sections 1–8, plus these extras from section 9:

- Extra 4: mobile experience (soft command palette / quick-action buttons) → phase 9
- Extra 5: `source` command stylized/redacted source viewer → phase 9
- Extra 6: typing sound feedback → phase 2
- Extra 8: ASCII network topology during the trace → phase 4

**Explicitly out of scope** (the owner declined them; do not build them unless asked): extra 1 Konami code, extra 2 session persistence, extra 3 sound toggle, extra 7 CRT curvature, and the optional "tiny live terminal preview on the project card" unless the owner revives it in phase 8.

---

## Project snapshot (baseline `8ea680b`)

The repository hosts **two independent static sites**, each deployed as its own Cloudflare Worker with static assets. There is **no build step, no bundler and no runtime dependencies**. Keep it that way.

```text
README.md                         # user-facing project README (update in phase 9)
sites/
  main/                           # personal site (filiposakkq.dev, Worker `filiposakkq`)
    wrangler.jsonc                # name: filiposakkq (must equal the Cloudflare Worker name), assets ./public
    public/ index.html (182) script.js (222) styles.css (946) favicon.svg
  fsociety00/                     # the terminal game (fsociety.filiposakkq.dev, Worker `fsociety`)
    wrangler.jsonc                # name: fsociety (must equal the Cloudflare Worker name), assets ./public
    public/
      index.html (70)             # launch screen, #screen/#output/#promptLine, case trigger, shutdown + power panels
      styles.css (2109)           # ALL game CSS, one file
      favicon.svg  elliot-echo.svg
      audio/hello-friend-mr-robot.mp3
      js/
        story.js (1658)           # entry module: DOM refs, helpers, effects, boot(), gameOver, resetGame, dev routes
        level01.js (341)          # the Level 01 puzzle shell + command switch, createLevel01({13 params})
        tty.js (146)              # terminal input + chooseTrust()
        trace.js (71)             # startTrace(): the HUD countdown
        audio.js (544)            # WebAudio engine, a ~300-line switch of procedural sounds, ambient beds
        casefile.js (705)         # evidence board; declarative EVIDENCE array at the top
        developer-menu.js (127)   # DEV panel (localhost + preview only)
        source.js (8)             # third part of the puzzle key (see invariants)
        rain.js, session.js, context.js, util.js, choices.js, story-choices.js   # added in phase 1 (rain canvas, abortable story session, GameContext, shared helpers)
```

Line counts are approximate and will drift. **Reference code by function name, not line number.**

### Tools you can rely on in the cloud container (details: "Working in a cloud chat session")

Chromium is preinstalled and Playwright is configured (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, never run `playwright install`). The container cannot reach arbitrary websites, so no external CDNs in tests. In the owner's VS Code environment the repository README describes running with `py -m http.server`.

---

## How the game works (so you do not break it)

Player flow in `story.js` `boot()` (find the numbered comments):

1. **Launch screen** (`#launch`): the player presses `[ INITIALIZE SYSTEM ]`. This gesture is what lets audio start. Nothing runs before it.
2. **BIOS/boot** (steps 1–8 in `boot()`): fake BIOS, GRUB, kernel log, services, fsck, network, encrypted disk, a rogue partition `/dev/sdb9`, then a "WARNING: unauthorized access" and a failed trace. Skippable by **holding the lower-right skip control for 3 seconds** (`SKIP_HOLD_MS`). After the story intro begins the BIOS can no longer be skipped; a second hold skips the intro text and jumps to the trust choice.
3. **Story intro**: an incoming transmission from `<unknown>` ("hello, friend." with an audio clip, typing indicator, glitches, a message that gets wiped), then the FSOCIETY logo, a LEVEL 01 brief, and the **trace HUD** appears centered and docks to the corner.
4. **Watcher interrupts**: a second voice `<watcher>` says `unknown` has been lying. The player makes the **trust choice** by tapping or typing `1`/`unknown` or `2`/`watcher` (`tty.js` `chooseTrust`).
5. **Branches**: trusting Unknown opens a backchannel note and the `verify relay` action; trusting Watcher opens a session log and the `isolate watcher` action. `ghost.sh` is a script the player can inspect or run (`promptGhost`, `runGhost`). Later there is an **identity reveal** (`revealName`, `playIdentityReveal`) where the display name `unknown` is renamed everywhere to `Mr. Robot` (`renameEverywhere`).
6. **Level 01 puzzle** (`level01.js`): a shell with commands `help ls cat board evidence verify isolate source view-source trace hint unlock abort` etc. The trace tightens from 8 minutes to 2 minutes when the puzzle starts. The goal is `unlock <key>`.
7. **Endings**: correct key → victory (story currently ends after Level 01). The player has **3 attempts** (`unlock <key>`; a wrong guess prints `[ok] [--] [ok]` per part). Failure reasons passed to `gameOver(trace, reason)` are `'TRACE COMPLETE'` (timer hit 0), `'LOCKED OUT'` (attempts exhausted), `'SESSION COMPROMISED'` (set by the `abort` command, which only exists on the Watcher route; read `level01.js` for the exact trigger) and `'DEVELOPER SHUTDOWN TEST'` (dev panel). Then → shutdown sequence → power panel with `[ REBOOT SYSTEM ]` → `resetGame()`. `unlock elliot` is an easter egg that shows a hooded silhouette and is not a key attempt.

### Invariants — never break these

- **The key is `ghost` + `shell` + `1337` and is split into three "layers" that the player must find by inspecting the page**:
  1. markup: `<meta name="sdb9-part-one" content="ghost">` in `index.html`
  2. styles: CSS custom property `--sdb9-part-two: "shell";` in `styles.css` `:root`
  3. script: `source.js` exports `sourcePartThree` (built from char codes) and `whisperSourcePart()` logs it to the **browser console**.
  `level01.js` `getLevel01Key()` reads layers 1 and 2 **from the live DOM/computed style**, so deleting or renaming those two items silently breaks the puzzle. Hints are in `level01Hints`.
- The hint chain on mobile: the terminal `source map` command lists the files and `cat page/index.html|styles.css|script` reveals each part and marks the evidence as discovered.
- **Audio only starts after the launch gesture.** Never autoplay.
- **`prefers-reduced-motion` must keep working**, plus the app's own `body.quiet-motion` class. The `wait()` helper resolves immediately when motion is reduced.
- **Developer tools run only on `localhost` and Cloudflare preview hostnames** (`isLocalDevelopment()` today, to be widened in phase 7.6); nothing in them may run on the production hostnames. A hostname check is not security (it only jumps scenes, so the risk is spoilers); real protection would be Cloudflare Access on the production Worker.
- The game must stay playable **without a server-side component** and without a build step, from a plain static host.
- The player's real IP/location/identity must **never** be fetched or displayed. Any "LOCATION" or "IP" in a story beat is fictional or redacted (see phase 6).
- UI language is **English**. (Existing code comments in `story.js` are a mix of Czech and English; keep new comments in English, translating nearby Czech comments is welcome but not required.)

### Glossary

| Term | Meaning |
|---|---|
| Unknown / `<unknown>` | The friendly mystery voice; later revealed as "Mr. Robot" (the display name is swapped by `renameEverywhere`). Until the reveal other characters must refer to this person indirectly (e.g. `[redacted]` / "your friend"), not by a fixed real name. |
| Watcher / `<watcher>` | The hostile voice that claims Unknown is lying. |
| `sdb9` | The locked rogue partition the puzzle is about. |
| Trace | The countdown (HUD) after which the player is "found" and the game ends. |
| Case file / evidence board | The `CASE FILE` panel (`casefile.js`). |
| Ghost / `ghost.sh` | The suspicious script. |
| quiet-motion | App-level class on `<body>` that turns motion effects down. |
| `gfx` cues | Named screen-glitch effects (`rgb`, `slice`, `roll`, `invert`, `zoom`). |

---

## Where every review item lands

Numbering follows `source/code-review.md`. "Verified" notes record what was found at `8ea680b`. **Re-check before fixing.**

| # | Review item | Phase | Verified at 8ea680b |
|---|---|---|---|
| 1 | CSS cascade: mobile `.logo` padding overridden | 1 | **Confirmed.** `@media (max-width: 520px)` rule for `.output .logo` precedes the later base `.output .logo` rule |
| 2 | Trace timer never stops | 1 | **Confirmed.** `trace.js` never clears the interval when `secs` hits 0 (see Phase 1 for the `set()` re-arm subtlety) |
| 3 | Web Audio envelope scheduling | 1 (minimal), 2 (replaced) | **Confirmed.** `envelope()` in `audio.js` still ramps to `start + 0.035` regardless of `duration` |
| 4 | Async reentrancy / no cancellation | 1 | **Confirmed.** `resetGame()` and `runDeveloperRoute()` both call `void boot()` without cancelling the previous run |
| 6 | `createLevel01` takes 13 loose parameters | 1 (introduce context), 3 (use it) | **Confirmed** (13 destructured params) |
| 7 | Narrative logic in `tty.js` (`chooseTrust`) | 1 | **Confirmed** |
| 8 | `window.setRain` / `syncRainMotion` globals | 1 | **Confirmed.** 12 lines in `story.js` reference `setRain` |
| 9 | Duplicated helpers (MM:SS, scramble, choice builder) | 1 | **Partly confirmed.** The scramble charset `'#%&@$*+=?01<>/\\|'` appears 3× in `story.js` |
| 10 | `audio.js` 300-line switch | 2 | Not re-verified; file is 544 lines |
| 11 | Global focus hijack in `tty.js` | 1 | **Confirmed.** `addEventListener('keydown', …)` refocuses the input on every key anywhere |
| 12 | `--dim` fails WCAG AA | 1 (verify only) | **Review is wrong for the fsociety00 game.** `#1a8f3a` on `#000` computes to **5.03:1** (passes AA 4.5:1). Do not "fix" it blindly; see Phase 1. The *main* site has real contrast failures (phase 8) |
| 13 | `#output` has no `role="log"` | 1 | **Confirmed** |
| 14 | Rain canvas not `aria-hidden` | 1 | **Confirmed** |
| 15 | Custom `<div role="dialog">` (no focus trap) | 1 (launch + power panel), 4 (case board), 7 (dev panel) | **Confirmed** for launch and power panel; the dev panel is also a `div role="dialog"` |
| 16 | `aria-pressed` on main-site tool chips | 8 | **Appears already fixed.** `script.js` sets `aria-pressed` on the tool chips; verify, then close |
| 17 | Fonts below 10px | 1 (everything except `.case-*` and `.developer-*`), 4 (`.case-*`), 7 (`.developer-*`) | **Confirmed.** Many `8px`/`9px` declarations, mostly in the case-board CSS |
| 18 | `shutdown-scan` animates `top` | 1 | **Confirmed.** Keyframes animate `top: 0` → `top: 100%` |
| 19 | Unthrottled `pointermove` on the project card | 8 | **Appears already fixed.** `script.js` caches bounds and writes inside `requestAnimationFrame`; verify, then close |
| 20 | Rain uses `setInterval` | 1 | **Confirmed**; also the reduced-motion restart bug in the "Timer risks" table (rain never starts if the page *loaded* with reduced motion and the user later turns it off) |
| 21 | Too many composited layers on mobile | 5 | Not measured; needs a performance pass |
| 22 | 35+ hardcoded colours on main site | 8 | **Partly addressed.** A token scale exists; ~23 distinct hex values remain in `styles.css`. Real contrast failures: see Phase 8 |
| 23 | Redundant breakpoint declarations (main) | 8 | Not re-verified |
| 24 | 3 separate `prefers-reduced-motion` blocks | 1 | **Confirmed** (3 blocks in `styles.css`) |
| 25 | Dead duplicate `.glyph i.on` | 1 | **Confirmed** (two identical selectors plus a `.logo.done .glyph i.on` variant) |

| Timer/leak risk (review table) | Phase |
|---|---|
| Orphaned nested `setTimeout` in `level01.js` (Elliot echo) | 1 — **confirmed**, inner 700 ms timeout is untracked |
| Logo ambient intervals not cleared on victory | 1 — `ambientIntervals` is cleared in `gameOver()` and the dev route; the victory path was not verified |
| `stopBed()` mixes audio clock and `setTimeout` | 2 — **confirmed** |
| Rain cannot restart after reduced-motion toggle | 1 — **confirmed** |

Extra item from the plan not in the review: "`level01.js` crash when DOM metadata missing" → phase 1 (`getLevel01Key()` throws if the meta tag or CSS variable is missing, and it is called when the level factory is created).

Plan sections 2–8 map 1:1 to phases 2–8. Section 5 ("Realistic hacker experience") is split: boot text and Linux commands → phase 3; `scan`/`intercept`/`decrypt`/`trace --status` → phase 4.

---

## Conventions

- **Vanilla JS, ES modules, no build, no npm dependencies shipped.** Dev-only scripts live in `tools/` (not deployed, because Wrangler only publishes `sites/*/public`).
- Prefer small modules with named exports. No new `window.*` globals.
- All animation uses `transform` and `opacity` only (never `top`, `left`, `width`, `height`, `background-position`, `box-shadow` animation on large elements).
- Every new animation, glow loop, glitch, noise and sound must respect `prefers-reduced-motion` and `body.quiet-motion`.
- Minimum font size **11px** everywhere (enforced by `tools/check-fonts.sh` from phase 1).
- Interactive elements need an accessible name, visible focus style, and ≥ 44×44 px touch target on mobile where practical.
- Do not rename existing audio cue names, CSS state classes (`quiet-motion`, `hot`, `corner`, `center`, …) or DOM ids that other code uses, unless the phase says so. Grep first.
- Commit messages: short imperative subject; body explains why. Reference the phase, e.g. `phase 1: stop trace interval at expiry`.

## Working rules for every phase

1. **Branch**: `overhaul/phase-N-slug`, created from latest `main` (or the dependency's branch if it is not merged yet; say so in the PR).
2. **Never push to `main` and never merge your own PR.** Pushes to `main` trigger production deploys on Cloudflare. Open a pull request; Cloudflare preview builds can be used by the owner to test on a phone.
3. **Re-verify** each "current state" claim in the phase file against the code. If it is already fixed or has changed, note that in the PR and skip or adapt the task.
4. Touch only what the phase needs. Do not reformat unrelated code (it makes later merges painful).
5. After each logical slice run the **smoke test** (below). Do not leave `main` of your branch broken between commits.
6. Keep an **"Implementation notes"** section at the bottom of your phase file (append, do not rewrite): what you did, what you skipped and why, follow-ups. The next Claude relies on it.
7. Update the tracker table in this README (status, branch, PR) in the same PR.
8. **Commit and push often** (next section). Work that is not pushed can be lost and cannot be continued by another Claude.

## Checkpoints: commit and push often, resume safely

Sessions end without warning: a usage limit, a closed tab, or a cloud container that is reclaimed. **Anything not pushed to GitHub can be lost**, and a different Claude can only continue from what is on the remote.

1. **Push the branch immediately** after creating it (before doing any work), so it exists on the remote. Set the phase's row in the tracker to `in progress` in your first commit.
2. **Commit and push after every numbered sub-step** (1.1, 1.2, …) once it is done and passed its quick check (run the smoke test when the step touches gameplay). In phases without numbering, use the rows of the phase file's Checkpoint log. If one step is big (for example phase 1's session/cancellation work), commit and push after each coherent piece instead of at the end of the step. Never wait until the whole phase is finished.
3. **Commit message format:** `phase N.x: short imperative summary` (for example `phase 1.1: add smoke test tooling`). Include the attribution lines your environment requires.
4. **After each push, update the phase file's Checkpoint log row** (status, short commit hash, one line of notes) and include that edit in the same or the next commit and push.
5. **When you might be about to run out** (a long session, tool errors, a usage warning, or you simply must stop): do not start a new step. Make the tree consistent, then commit **everything**, including unfinished work, as `wip(phase N.x): …`, and push. WIP commits may be incomplete or failing, but the commit message and the notes must say so. Then update the **"Resume point"** block at the top of the phase file's Implementation notes (mark the previous one `(historical)`): exact state, what is done and what is not, which files are half edited, which test is failing and why, and the next command to run.
6. **Never** push to `main`, force-push, or rewrite already pushed history (no rebase or squash of pushed commits). The next Claude relies on the commit list.
7. Do not leave work only in the working tree. If you cannot push (no access), say so clearly in your last message and list the changed files.

### Resuming a phase

1. Fetch **all** remote branches with an explicit refspec (a plain `git fetch` in a shallow cloud clone often only knows `main`): `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`. If `origin/overhaul/phase-N-<slug>` exists, check it out: `git checkout -B overhaul/phase-N-<slug> origin/overhaul/phase-N-<slug>`. If it does not exist, nothing was pushed: start the phase fresh from the latest `main`. If more than one branch exists for the same phase, stop and ask the owner which to use.
2. Read the phase file: the **Checkpoint log**, then the **Implementation notes** (especially the "Resume point" block, which may be stale). Run `git log --oneline origin/main..HEAD` and `git status` (it must be clean; if not, someone left uncommitted work, inspect it before touching anything).
3. Run the smoke test and any tool the phase added to see the **real** state. The log can be stale, so trust the code and the tests over the notes.
4. Continue at the first row that is not `done`. Verify the last `done` row quickly instead of redoing it.
5. If the previous branch is badly broken, say so and either fix forward on the same branch or ask the owner; do not delete it.

## Working in a cloud chat session

The owner works in claude.ai chat sessions, not in a local editor. Every session starts in a **fresh, ephemeral Linux container**: only what is pushed to GitHub survives. Read this before touching git.

1. **Get the repo.** Attach `Filiposakkq/Website` through the GitHub connection your session offers (an "add repo" style tool) and clone it **once**: `git clone --depth 1 https://github.com/Filiposakkq/Website /home/claude/fsociety00-dat` (the git proxy allows about 2 concurrent git operations; on an HTTP 429 wait 10 s and retry once, never in a loop). Give the clone a generous timeout. If you cannot access the repository, **stop and tell the owner** (the Claude GitHub app must be installed on the repo and the GitHub connection linked); never recreate the project from memory or from the docs.
2. **The clone is shallow and single-branch.** `git fetch --all` or `git checkout origin/<branch>` may not see other branches. Use `git fetch origin '+refs/heads/*:refs/remotes/origin/*'` (add `--depth=50` when you need history). To start work: `git checkout -b overhaul/phase-N-<slug>` then `git push -u origin overhaul/phase-N-<slug>`.
3. **After pushing a new branch the remote-tracking ref may be missing**, which makes git (and any stop hook checking for "unpushed commits") report that the branch has no remote even though the push worked. Check the truth with `git ls-remote --heads origin <branch>` (the hash must equal `git rev-parse HEAD`), then repair locally: `git fetch origin +refs/heads/<branch>:refs/remotes/origin/<branch>` and `git config branch.<branch>.remote origin && git config branch.<branch>.merge refs/heads/<branch>`.
4. **Commit identity:** if git has no `user.name`/`user.email`, use `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit …`, and add any attribution lines your environment asks for.
5. **Tools:** Chromium is preinstalled for Playwright (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; never run `playwright install`; launch with `executablePath: '/opt/pw-browsers/chromium'` if needed). npm and pip reach their registries; almost every other website is blocked from the shell, so tests must not depend on CDNs or external fonts (the game's CSS imports a Google Font; tests must tolerate that request failing). If the `playwright` npm package is missing, install it outside the deployed folders (`npm install --no-save playwright` in `tools/` or a scratch dir) and never commit `node_modules`.
6. **The owner tests on a phone through Cloudflare preview deploys** of your pushed branch/PR, not locally. You cannot hear audio or judge animation feel; say what the owner should check (the phase files list it).
7. **Usage limits.** The owner is on the free plan, so a session can end mid-phase. That is why the Checkpoints rules exist. Prefer finishing and pushing one numbered step over starting two.

## Merging, conflicts, questions, size

- **Catch up with `main` by merging, not rebasing:** `git fetch origin main && git merge origin/main` into your phase branch (a merge commit is fine), resolve conflicts, rerun the smoke test, push. Rebasing would rewrite pushed history, which the Checkpoints rules forbid.
- **Merge order matters.** Phases 2, 3 and 5 can run in parallel but they may touch the same files (`story.js`, `styles.css`). The owner merges one pull request at a time; the next phase merges `main` into its branch before its final push.
- **Do not stall on questions.** If the owner is not there to answer, pick the documented default (or the most conservative option), write the decision in the "Decisions and open questions log" below, mention it in the PR description, and keep going. Stop and ask only for things that cannot be undone or would change the story's meaning.
- **Rollback.** A merged phase that breaks the live site is reverted with the GitHub "Revert" button on its pull request (this creates a new revert PR), or by rolling back to the previous deployment in the Cloudflare dashboard. Phases are small PRs on purpose so a revert is cheap. The git tag `pre-overhaul` marks the state before the overhaul (`git checkout pre-overhaul` to inspect or restore from it); see also [`merging.md`](merging.md) and [`deploy.md`](deploy.md).
- **Spoiler note.** These docs spell out the puzzle key (`ghost` / `shell` / `1337`). The owner switches the repository between private and public, so assume the docs may be public at any time. The key in the page source is the puzzle itself and is already visible to players; before making the repo public, check that the docs still read acceptably (or remove the key from them).

### Phase size and suggested session splits

Sizes are rough. One session (before the limit) usually fits **2 to 4 Checkpoint-log rows**; split larger phases along these lines and push after each.

| Phase | Size | Suggested sessions |
|---|---|---|
| 1 Foundation | Large (12 rows) | 1.1–1.2 · 1.3a–1.3c · 1.4–1.6 · 1.7–1.10 |
| 2 Audio | Medium | 2.1–2.3 · 2.4–2.7 |
| 3 Story & boot | Large | 3.1–3.3 · 3.4–3.7 · 3.8–3.10 |
| 4 Evidence board | Large | 4.1–4.3 · 4.4–4.5 · 4.6–4.7 |
| 5 Animations | Medium | 5.1–5.3 · 5.4–5.7 |
| 6 TRACED | Medium | 6.1–6.3 · 6.4–6.6 |
| 7 Dev panel | Small–medium | 7.1–7.3 · 7.4–7.6 |
| 8 Main site | Small | one session |
| 9 Extras & polish | Medium–large | 9.1–9.2 · 9.3–9.4 · 9.5–9.7 |

## Running and testing

Serve the game locally (from the repository root):

```sh
python3 -m http.server 8001 --directory sites/fsociety00/public   # Linux/macOS/container
py -m http.server 8001 --directory sites/fsociety00/public        # Windows
python3 -m http.server 8000 --directory sites/main/public         # main site
```

ES modules need HTTP; `file://` does not work. `localhost` also turns on the `DEV` panel (so will Cloudflare preview URLs after phase 7.6).

### Standard smoke test (every phase must pass before opening a PR)

`tools/smoke.mjs` (added in phase 1, see `tools/README.md`) is a Playwright script that does the following headlessly. If it cannot run, do the same by hand:

1. Load the page. **No console errors, no failed network requests**, no uncaught exceptions.
2. Click `[ INITIALIZE SYSTEM ]`. The boot starts.
3. Hold the skip control for 3 s (or call the dev route) to reach the story, then the trust choice.
4. Pick `1`, then `2` in separate runs. Both branches complete.
5. Reach the Level 01 shell. Enter the correct key `unlock ghost shell 1337` (the command lowercases the argument and turns spaces/underscores into hyphens, so `ghost-shell-1337` is equivalent) → victory. In a second run let the trace expire, or enter 3 wrong keys → game over → `[ REBOOT SYSTEM ]` → the game restarts **cleanly with no leftover timers, no duplicated text, no overlapping sounds**.
6. Repeat steps 1–5 at a **390×844 mobile viewport** and with **reduced motion enabled** (`page.emulateMedia({ reducedMotion: 'reduce' })`).
7. Tab through the page: every interactive element is reachable and the terminal input still works.

For CSS/animation work also take screenshots at 390×844 and 1280×800 and look at them. **Audio cannot be heard in headless tests**; the owner must listen (phase 2 includes a listening checklist).

## Definition of done (all phases)

- [ ] Every task in the phase file is done, or explicitly marked skipped with a reason in the implementation notes.
- [ ] Smoke test passes (desktop, mobile viewport, reduced motion).
- [ ] No new console warnings/errors; no new `window.*` globals; no font size < 11px (`tools/check-fonts.sh`).
- [ ] The three-layer key puzzle still works (the three parts are still discoverable and `unlock` still accepts the key).
- [ ] Every Checkpoint log row in the phase file is `done` (or marked skipped with a reason), and everything is pushed.
- [ ] Tracker table and the phase file's implementation notes updated.
- [ ] Pull request opened with: what changed, how it was tested, screenshots if visual, anything the owner must check by hand (audio, feel).

## Rules learned in phase 1

- **Source of truth.** The Checkpoint log, `git log` and a fresh `node tools/smoke.mjs` run are the truth. A "Resume point" (formerly "Stopped at") or "State at handoff" block is only a hint and goes stale (a Claude cannot know when its limit ends). A Claude that resumes **re-derives the state from the code and tests first**, then rewrites that block and marks the old one `(historical)`.
- **Commits.** Commit and push after every sub-step and after every coherent chunk inside a large sub-step. Use `wip(phase-N.M): ...` for unfinished chunks. A wip commit must not break the game; if it must, write "broken until X" in the row's notes.
- **Verification budget.** Before a wip push run `node --check` on the changed JS files. Run the full `node tools/smoke.mjs` when a sub-step is finished and before the handoff, save its output to a file and show only the summary. Record `last green commit: <hash>` after each full run. A syntax check is not a functional test.
- **Documentation in the same commit.** When code, tooling, config or workflow changes, update every document that describes it in the same commit (README, phase file, checkpoint log, `CLAUDE.md`). Write "unverified" next to anything that was not verified. A task is done only when code, tests and docs agree.
- **Review-only pass.** Before a phase PR is merged, a different Claude (or the owner) runs a review-only pass: run the tools, check the "Do not break" list in `CLAUDE.md`, grep for leftovers (`fx.js`, `setRain`), timers outside the session, stale docs; report problems ranked, change nothing.
- **Cloudflare.** Each `wrangler.jsonc` needs `"name"` equal to the Worker name (`filiposakkq`, `fsociety`) and an empty `"previews": {}` block (preview builds run `npx wrangler preview`). Never rename either Worker in the config only.
- **Cloud container.** A "Stop hook: unpushed commit" message is often a stale local `origin/<branch>` record. Check with `git ls-remote --heads origin <branch>` before assuming a push failed.

## Why phase 5 comes before phase 6

Phase 5 builds the effects toolbox (compositor-only glitches, the trace HUD reactions); phase 6 composes the TRACED game over from those effects, the phase 2 sound cues and the phase 3 story engine. Building 6 first would mean building the effects twice. So the order is 5, then 6; both start from the latest `main`.

## Known issues carried over (phase 1 review, 2026-10-13)

None of these is a regression and none blocks the game; each has a home phase.

| Issue | Home |
|---|---|
| 41 of 73 `@keyframes` animate `filter`, `box-shadow`, `text-shadow`, `clip-path`, `letter-spacing`, colors, `background-position`, `top`; one transition animates `top`, `left`, `font-size` (rule: only `transform`/`opacity`) | Phase 5 |
| 5 font-size declarations below 11px in `.developer-*` (`tools/check-fonts.sh --all` lists them); `.case-*` was fixed in phase 4.5 | Phase 7 (`.developer-*`) |
| The DEV `boot` route calls `runStory()` directly, so the ambient-interval cleanup in `startStory`'s `finally` does not run when it ends normally (localhost only) | Phase 7 |
| Skip control (lower right) still covers text on small phones and its idle look is a compromise: rework it (HOLD TO SKIP label, circular hold progress, placed above the prompt, 3 s hold kept, smoke test keeps using a real mouse press). The hold state is per session since phase 3.2 (`js/skip-control.js`) | Phase 5 (visuals) |
| Trace times (480 / 300 / 120 / 60, `hint` 30 s; the window after the trust choice grew from 120 to 300 s in phase 4b.0b) are untuned: named constants in `story-data/constants.js`, to be tuned after the owner's phone tests. (The per-scene policy is done in phase 3.5: `running` floors at TRACE PENDING, `lethal` after the trust choice, `close` at the ghost script; HUD look is phase 5.4) | Owner tuning; phase 5 (HUD look, 5.4) |
| The board command line (phase 4b.3) is unverified with a real on-screen keyboard and with a screen reader; the trace sound thresholds (120 s / 60 s) are absolute and now come late in the 300 s window; `hint` (30 s) is a smaller share of it | Owner test, then tune (`owner-test-checklist.md`, phase 4b section) |
| Trace HUD overlaps the ghost panel label on phones (docks to the top right) | Phase 5 |
| More ways to be traced (noisy commands, honeypot file, unverified `ghost.sh`, watcher lockout) | Idea only: "Phase 10", see `docs/story/README.md`; needs owner canon decisions |
| Real-device checks not done: screen reader, audible output (phase 2 sounds have never been heard by anyone), 60 fps of the rain on weak phones | Owner, on the preview of each phase |
| Firefox/Safari fallback for `cancelAndHoldAtTime` in `audio/render.js` has never been executed | Owner or phase 9 QA |

## Decisions and open questions log

| Date | Decision / question | Status |
|---|---|---|
| 2026-10-15 | New phase 4b (owner request): the case file becomes available at the first mention in the story, a **character** explains it (not an overlay), and the board gets a command line with **board-only commands**. Answered 2026-10-15: a third mystery character speaks, right after the inbox message, board gets new evidence commands (trace-dependent rules in 4b.3), the trace window after the trust choice becomes 300 s (was 120 s). The voice is `<???>` in blue and all board commands are evidence commands. The voice is cryptic, neutral and commanding and has its own typing sound. It will likely return in a later level or chapter. Open: its typing speed | Decided by owner; details open |
| 2026-10-13 | Developer panel is available on `localhost` and on Cloudflare preview URLs, never on production. **Open:** the exact preview hostname pattern (assumed `*.workers.dev`, unverified) and whether the production Workers' own `workers.dev` URLs are disabled (otherwise the panel would show there too) | Decided by owner; pattern for the owner to confirm |
| 2026-10-13 | "hello, friend." was off-screen in the real reveal and the ghost panel was painted under the terminal text; fixed on branch `fix/hello-center-ghost-mobile` (not part of any phase) | Done, owner to merge |
| 2026-10-11 | Extras 1, 2, 3, 7 are out of scope; extras 4, 5, 6, 8 are in | Decided by owner |
| 2026-10-12 | The owner uses claude.ai chat sessions (no local editor); tests happen on Cloudflare preview deploys; see "Working in a cloud chat session" | Decided by owner |
| 2026-10-11 | Delivery: one branch + PR per phase (owner had not yet answered "PR vs straight to main"; PR is the safe default) | Default; confirm with owner |
| 2026-10-11 | Review item 12 (`--dim` contrast on fsociety00) is wrong: measured 5.03:1 | Verified |
| 2026-10-11 | Review items 16 and 19 (main site) appear already fixed in `8ea680b` | Verify in phase 8 |
| — | Real name of the first character is still unknown to the story. `renameEverywhere('unknown','Mr. Robot')` is the reveal. Other characters must refer to him indirectly before it | Open (story design) |
| 2026-10-13 | Cloudflare Worker names are `fsociety` (sites/fsociety00) and `filiposakkq` (sites/main); `wrangler.jsonc` `name` must match them or Workers Builds fail. Earlier docs said `fsociety00` / `filiposakkq-dev`, which was wrong | Decided by owner, fixed on `overhaul/phase-1-foundation` |
| 2026-10-13 | Cloudflare preview builds failed with "Your Wrangler configuration is missing a `previews` block" (they run `npx wrangler preview`). Added `"previews": {}` to both `wrangler.jsonc`. Cloudflare's docs do not say whether this changes `wrangler deploy` (production); the block is empty so it should not | Fixed on `overhaul/phase-1-foundation`; owner to confirm the preview and later the production build |
| 2026-10-13 | The repository was renamed to `Filiposakkq/Website` (the old name still redirects for git, but the `gh` API through the cloud proxy does not follow the redirect) | Done by owner |
| 2026-10-13 | Hostnames: Worker `fsociety` serves `fsociety.filiposakkq.dev`, Worker `filiposakkq` serves `filiposakkq.dev`. The project card link `https://fsociety.filiposakkq.dev/` is therefore correct | Decided by owner |
| 2026-10-13 | The owner tests every phase on a phone and on desktop on the Cloudflare preview before merging; PRs are merged with "Squash and merge" | Decided by owner |
| 2026-10-13 | The owner switches the repo between private and public; no rule about secrets in chat is added to the docs | Decided by owner |
| 2026-10-14 | Phase 2: no `audio.setMasterVolume()` (not trivial, volume UI is out of scope); brief names that match existing sounds are aliases; new cues are registered only, wired by phases 3, 4 and 6 | Default; see the phase 2 handoff report |
| 2026-10-13 | Skip control made smaller and with a more transparent background (not a lower text opacity, which fails 4.5:1) because it covered text on phones | Done in the post-phase-1 docs PR |
| 2026-10-13 | Phase 2 branch is `overhaul/phase-02-audio` (owner's instruction), not `overhaul/phase-2-audio` as the docs said | Decided by owner |
| 2026-10-15 | Phase 4 decisions (evidence as data, `decrypt` blocks the shell, loss thresholds, sealed stubs, board optional for the win, no timer in the case file): see "Decisions made in phase 4" in `phase-04-evidence-board.md` | Default; owner to confirm in review |
| 2026-10-15 | Phase 4b.0b decisions (defaults, owner to confirm): the evidence loss thresholds become shares of the window (3/8, 7/24, 3/4, i.e. 113 / 88 / 225 s left at 300 s) so the pressure keeps its shape; the trace sound thresholds stay absolute (warning at 120 s left, critical at 60 s and 10 s: the first three minutes are calm); `hint` stays 30 s; tests run with a 120 s window served through a route and one scenario checks the shipped 300 s | Default; owner to confirm by playing |
| 2026-10-15 | Phase 4b.3 decisions (defaults, owner to confirm): `dump` needs a link like the other evidence commands; a board command keeps running when the dialog closes (its output waits in the board log) and the input is read-only meanwhile; `pending` means the trace is `running` or `frozen`, and only `lethal` loses evidence or charges a wrong `connect`; `board`/`evidence` typed in the board answer "use the shell for that"; one job slot (`caseFile.claim`) is shared by the shell and the board. |
| 2026-10-15 | Owner requests during phase 4b (done, outside the original task list): the board command pane looks like a little terminal; `<???>` says twelve lines including a faint hint that it belongs to a secret agency ("this line is encrypted. the agency logs it anyway.", the agency is never named); `<???>` returns once in the scene where sdb9 opens (`story-data/ghost.js`, `mysteryReturns`) and talks to the watcher and the first voice. |
