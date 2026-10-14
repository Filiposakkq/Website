# Prompts for the owner

Copy-paste prompts for giving work to a Claude chat. Replace `N`, `<slug>` and the phase file name. The repo is `Filiposakkq/Website` (formerly `fsociety00-dat`). **Never paste tokens or passwords into a chat or a file**; the Claude GitHub connection is enough. If a chat says it cannot push, see "Working in a cloud chat session" in the master README.

## 1. Start a phase

```text
The project is the GitHub repository Filiposakkq/Website. Attach it through your GitHub
connection and clone it first (see "Working in a cloud chat session" in
docs/overhaul/README.md; if you cannot access the repo, stop and tell me).
Read CLAUDE.md, docs/overhaul/README.md completely, docs/state/README.md (then only the docs/state files for your areas)
(the older "current state" sections in the phase files are stale, verify against the code),
then docs/overhaul/phase-0N-<slug>.md. Do phase N and nothing else.
Work only on branch overhaul/phase-N-<slug> created from the latest main. Never push to main,
never force-push, never merge your own pull request. Commit and push after every sub-step and
after every coherent chunk (wip(phase-N.M): ... for unfinished chunks), keep the phase file's
Checkpoint log and its "Resume point" block current, and update every affected document in
the same commit. Run the full node tools/smoke.mjs when a sub-step is done and record
"last green commit". Mark anything you did not verify as "unverified".
When the phase is done, write the handoff report into the phase file, push it, and open a PR
to main with the PR template. Do not merge it.
```

## 2. Resume a phase another Claude started (limit ran out)

```text
The project is the GitHub repository Filiposakkq/Website. Attach and clone it (see "Working in
a cloud chat session"; if you cannot access it, stop and tell me).
Read CLAUDE.md, docs/overhaul/README.md ("Checkpoints", "Resuming a phase") and
docs/overhaul/phase-0N-<slug>.md. Another Claude started this phase and stopped.
1. git fetch origin '+refs/heads/*:refs/remotes/origin/*'; check out
   overhaul/phase-N-<slug> from origin.
2. Re-derive the state from git log, git status, the Checkpoint log and a fresh
   node tools/smoke.mjs. The "Resume point" block is only a hint and may be stale: the code and
   the tests win. Rewrite the block with the real state and mark the old one (historical).
3. Continue at the first row that is not done; verify the last "done" row quickly instead of
   redoing it.
Commit and push after every sub-step and coherent chunk. Never push to main, never force-push,
never merge your own PR.
```

## 3. Review-only pass (before a PR is merged)

```text
REVIEW-ONLY TASK. Do NOT change any file, commit, push, merge, or touch pull requests. Be
economical: grep instead of re-reading whole files.
Attach and clone Filiposakkq/Website, fetch all branches, check out
origin/overhaul/phase-N-<slug> detached. Read CLAUDE.md and the phase file's Checkpoint log.
1. Run node tools/smoke.mjs (save full output to a file, show me the pass/fail summary and
   failing scenario names), bash tools/check-fonts.sh and node tools/contrast.mjs.
2. Verify the "Do not break" list in CLAUDE.md with evidence (file:line): three-layer Level 01
   key and unlock (do not print the full key), audio only after the launch click,
   reduced-motion and quiet-motion, dev panel only on localhost/preview, never production, no real IP/location, 11px
   minimum, only transform/opacity animations, wrangler names and previews block.
3. Grep for leftovers (removed files/globals), timers or listeners not owned by the session,
   duplicated helpers, and docs that contradict the code.
4. For every Checkpoint row say whether code and tests support "done"; mark what you could
   not verify as "unverified".
Report: ranked problems (Critical / Major / Minor) with file:line and how to verify, then a
short "verified OK" list, then one line: safe to merge after the owner tests the preview?
(yes / yes with caveats / no). No fixes, no speculation.
```

## 4. Fix only one thing

```text
Attach and clone Filiposakkq/Website. Read CLAUDE.md. On branch <branch> make exactly this
change and nothing else: <describe the change>. Run node --check on changed JS and the
relevant smoke scenarios, update any document that describes it in the same commit, commit,
push, and verify the push with git ls-remote. Do not touch main or open/merge PRs.
```

## 5. A phase that runs in parallel with another

Add to prompt 1: "Phase M is being done by another Claude on branch overhaul/phase-M-<slug> and also touches `<file>`. Keep your changes there small and local, merge `origin/main` into your branch (never rebase) before the PR, and if a merge conflict is not trivial stop and tell me instead of resolving it blindly." The file-level overlaps are in `phase-conflicts.md`.
