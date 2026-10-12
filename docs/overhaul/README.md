# fsociety00 overhaul — master guide

> **Start here.** Every phase of the overhaul is its own document in this folder. A Claude (or a human) that picks up a phase must read **this file first**, then the phase file, then do the work.

- Baseline commit these docs were verified against: `8ea680b` ("A lot of editz"), 2026-10-11
- Source documents (the original request): [`source/code-review.md`](source/code-review.md) and [`source/overhaul-plan.md`](source/overhaul-plan.md)
- Scope decision by the owner: the full overhaul plan (sections 1–8) **plus extras 4, 5, 6 and 8 only** (see [Scope](#scope)).

---

## How to hand a phase to a Claude

Copy this prompt, change the phase number and slug:

```text
The project is the GitHub repository Filiposakkq/fsociety00-dat. Attach it through
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
The project is the GitHub repository Filiposakkq/fsociety00-dat. Attach it through
your GitHub connection and clone it first (see "Working in a cloud chat session" in
the README; if you cannot access the repo, stop and tell me).
Read docs/overhaul/README.md completely (especially "Checkpoints" and "Resuming a
phase"), then docs/overhaul/phase-0N-<slug>.md. Another Claude started this phase and
stopped (usage limit). Resume it: fetch the remote, check out the existing branch
overhaul/phase-N-<slug> from origin, read the phase file's Checkpoint log and the
"Stopped at" block in its Implementation notes, run git log, git status and the smoke
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
| 7 | [`phase-07-developer-panel.md`](phase-07-developer-panel.md) | Fix and extend the localhost developer panel |
| 8 | [`phase-08-main-site.md`](phase-08-main-site.md) | Main site: tokens, accessibility, performance |
| 9 | [`phase-09-extras-and-polish.md`](phase-09-extras-and-polish.md) | Mobile quick-actions (extra 4), source viewer (extra 5), final QA, docs |

---

## Progress tracker

Update this table in every phase's pull request. Status values: `todo`, `in progress`, `in review`, `merged`.

| # | Phase | Status | Depends on | Branch | PR / commit | Notes |
|---|---|---|---|---|---|---|
| 1 | Foundation & bug fixes | in progress | — | `overhaul/phase-1-foundation` | | |
| 2 | Audio | todo | 1 | `overhaul/phase-2-audio` | | |
| 3 | Story & boot | todo | 1 | `overhaul/phase-3-story` | | |
| 4 | Evidence board | todo | 1, 3 (2 optional) | `overhaul/phase-4-evidence` | | |
| 5 | Animations | todo | 1 (3 recommended) | `overhaul/phase-5-animations` | | |
| 6 | TRACED game over | todo | 1, 2, 3, 5 | `overhaul/phase-6-traced` | | |
| 7 | Developer panel | todo | 1; best after 2–6 | `overhaul/phase-7-devpanel` | | |
| 8 | Main site | todo | — (independent) | `overhaul/phase-8-main-site` | | |
| 9 | Extras & polish | todo | all others | `overhaul/phase-9-polish` | | |

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
  main/                           # personal site (filiposakkq.dev)
    wrangler.jsonc                # name: filiposakkq-dev, assets ./public
    public/ index.html (182) script.js (222) styles.css (946) favicon.svg
  fsociety00/                     # the terminal game (fsociety00.filiposakkq.dev)
    wrangler.jsonc                # name: fsociety00, assets ./public
    public/
      index.html (70)             # launch screen, #screen/#output/#promptLine, case trigger, shutdown + power panels
      styles.css (2109)           # ALL game CSS, one file
      fx.js (47)                  # classic script: digital rain canvas, exposes window.setRain / window.syncRainMotion
      favicon.svg  elliot-echo.svg
      audio/hello-friend-mr-robot.mp3
      js/
        story.js (1658)           # entry module: DOM refs, helpers, effects, boot(), gameOver, resetGame, dev routes
        level01.js (341)          # the Level 01 puzzle shell + command switch, createLevel01({13 params})
        tty.js (146)              # terminal input + chooseTrust()
        trace.js (71)             # startTrace(): the HUD countdown
        audio.js (544)            # WebAudio engine, a ~300-line switch of procedural sounds, ambient beds
        casefile.js (705)         # evidence board; declarative EVIDENCE array at the top
        developer-menu.js (127)   # localhost-only DEV panel
        source.js (8)             # third part of the puzzle key (see invariants)
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
- **Developer tools are localhost-only** (`isLocalDevelopment()`); nothing in them may run in production.
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
| 5 | `story.js` is a 1.6k-line monolith | 3 | **Confirmed** (1658 lines) |
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
5. **When you might be about to run out** (a long session, tool errors, a usage warning, or you simply must stop): do not start a new step. Make the tree consistent, then commit **everything**, including unfinished work, as `wip(phase N.x): …`, and push. WIP commits may be incomplete or failing, but the commit message and the notes must say so. Then add a **"Stopped at"** block at the top of the phase file's Implementation notes: exact state, what is done and what is not, which files are half edited, which test is failing and why, and the next command to run.
6. **Never** push to `main`, force-push, or rewrite already pushed history (no rebase or squash of pushed commits). The next Claude relies on the commit list.
7. Do not leave work only in the working tree. If you cannot push (no access), say so clearly in your last message and list the changed files.

### Resuming a phase

1. Fetch **all** remote branches with an explicit refspec (a plain `git fetch` in a shallow cloud clone often only knows `main`): `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`. If `origin/overhaul/phase-N-<slug>` exists, check it out: `git checkout -B overhaul/phase-N-<slug> origin/overhaul/phase-N-<slug>`. If it does not exist, nothing was pushed: start the phase fresh from the latest `main`. If more than one branch exists for the same phase, stop and ask the owner which to use.
2. Read the phase file: the **Checkpoint log**, then the **Implementation notes** (especially a "Stopped at" block). Run `git log --oneline origin/main..HEAD` and `git status` (it must be clean; if not, someone left uncommitted work, inspect it before touching anything).
3. Run the smoke test and any tool the phase added to see the **real** state. The log can be stale, so trust the code and the tests over the notes.
4. Continue at the first row that is not `done`. Verify the last `done` row quickly instead of redoing it.
5. If the previous branch is badly broken, say so and either fix forward on the same branch or ask the owner; do not delete it.

## Working in a cloud chat session

The owner works in claude.ai chat sessions, not in a local editor. Every session starts in a **fresh, ephemeral Linux container**: only what is pushed to GitHub survives. Read this before touching git.

1. **Get the repo.** Attach `Filiposakkq/fsociety00-dat` through the GitHub connection your session offers (an "add repo" style tool) and clone it **once**: `git clone --depth 1 https://github.com/Filiposakkq/fsociety00-dat /home/claude/fsociety00-dat` (the git proxy allows about 2 concurrent git operations; on an HTTP 429 wait 10 s and retry once, never in a loop). Give the clone a generous timeout. If you cannot access the repository, **stop and tell the owner** (the Claude GitHub app must be installed on the repo and the GitHub connection linked); never recreate the project from memory or from the docs.
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
- **Rollback.** A merged phase that breaks the live site is reverted with the GitHub "Revert" button on its pull request (this creates a new revert PR), or by rolling back to the previous deployment in the Cloudflare dashboard. Phases are small PRs on purpose so a revert is cheap.
- **Spoiler note.** These docs spell out the puzzle key (`ghost` / `shell` / `1337`). That is fine while the repository is private. If the repo is ever made public, remove the key from the docs (the key in the page source is the puzzle itself and is already visible to players).

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

ES modules need HTTP; `file://` does not work. `localhost` also turns on the `DEV` panel.

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

## Decisions and open questions log

| Date | Decision / question | Status |
|---|---|---|
| 2026-10-11 | Extras 1, 2, 3, 7 are out of scope; extras 4, 5, 6, 8 are in | Decided by owner |
| 2026-10-12 | The owner uses claude.ai chat sessions (no local editor); tests happen on Cloudflare preview deploys; see "Working in a cloud chat session" | Decided by owner |
| 2026-10-11 | Delivery: one branch + PR per phase (owner had not yet answered "PR vs straight to main"; PR is the safe default) | Default; confirm with owner |
| 2026-10-11 | Review item 12 (`--dim` contrast on fsociety00) is wrong: measured 5.03:1 | Verified |
| 2026-10-11 | Review items 16 and 19 (main site) appear already fixed in `8ea680b` | Verify in phase 8 |
| — | Real name of the first character is still unknown to the story. `renameEverywhere('unknown','Mr. Robot')` is the reveal. Other characters must refer to him indirectly before it | Open (story design) |
