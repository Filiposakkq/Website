# Merging a phase safely

Written 2026-10-13. The owner merges every pull request; Claude never merges its own PR and never pushes to `main` (pushes to `main` deploy to production).

## Before merging a phase PR

1. **Handoff report** is in the phase file and the Checkpoint log has no row left that is not `done` (or each skipped row says why).
2. **Review-only pass** by a different Claude (prompt 3 in `prompts.md`) or by you: tools run, "Do not break" list verified, leftovers grepped. No Critical findings. Major findings are either fixed or recorded in "Known issues carried over" with a home phase.
3. **Cloudflare preview build is green** for both Workers (if one is red, see `deploy.md`).
4. **You test the preview** on a phone and on desktop (`owner-test-checklist.md`). The smoke test cannot judge looks, sound or touch behaviour.
5. If another phase touching the same files was merged since the branch was created, the branch has `origin/main` merged in and the smoke test was re-run (`phase-conflicts.md`).

## Merging

- Use **Squash and merge** (one clean commit on `main`; the branch history stays visible in the PR).
- Title: `Phase N: <name>`. The PR description follows `.github/pull_request_template.md`.
- After the merge: watch the **production** Cloudflare builds for both Workers, open the live site once, then update the progress tracker in the master README (status `merged`, PR number and squash commit) in the next docs or phase PR.
- You may delete the merged branch on GitHub ("Delete branch"); the PR keeps the history.
- Start the next phase from the latest `main`.

## Protecting `main` (one-time setup)

In GitHub: Settings, Rules, Rulesets, new branch ruleset:

- Enforcement status **Active**; target the default branch (`main`).
- **Bypass list empty** (this is what stops everybody, including the account Claude pushes with, from bypassing; in the older "branch protection" screen the same thing is "Do not allow bypassing the above settings").
- Rules: restrict deletions, block force pushes, require a pull request before merging (0 approvals is fine for a solo owner).
- **Test it** from your own clone with a harmless empty commit: `git checkout main && git pull && git commit --allow-empty -m "ruleset test" && git push origin main`. It must be rejected. If it goes through, revert it on GitHub immediately and recheck the settings. Afterwards `git reset --hard origin/main`.
- Caveat: rulesets on a **private** repository need a paid GitHub plan to be enforced. The owner switches the repository between private and public, so repeat the test after a visibility change.

## If something breaks in production

1. Cloudflare dashboard, the Worker, Deployments: **roll back** to the previous deployment (fastest).
2. Then GitHub: open the merged PR and click **Revert** (creates a revert PR); merge it.
3. Write what happened in the decisions log in the master README.
