# Project instructions

Two static sites (`sites/main`, `sites/fsociety00`), deployed to Cloudflare Workers. No build step, no runtime dependencies. fsociety00 is an interactive terminal puzzle game in vanilla JS.

## If you are asked to work on the overhaul

1. Read `docs/overhaul/README.md` completely, then the phase file you were given (`docs/overhaul/phase-0N-*.md`). Re-verify the "current state" claims against the code first.
2. Work only on a branch `overhaul/phase-N-<slug>`. **Never push to `main`, never force-push, never rewrite pushed history, never merge your own pull request.** Pushes to `main` deploy to production.
3. **Commit and push after every numbered sub-step** and keep the phase file's Checkpoint log current. Your session can end at any moment (usage limits) and unpushed work is lost. If you must stop, make a `wip(...)` commit, push it and update the "Resume point" block in the phase file.
4. Also read `docs/overhaul/state-after-phase-1.md` (the code as it is now) and, for any story work, `docs/story/story-bible.md`. Read "Working in a cloud chat session" in the README for the git quirks of the cloud container (shallow clone, missing remote-tracking refs, how to verify a push).
5. Source of truth is the Checkpoint log, `git log` and a fresh `node tools/smoke.mjs`, not the "Resume point" note (it goes stale). When resuming, re-derive the state first, then rewrite the note and mark the old one `(historical)`.
6. Use `wip(phase-N.M): ...` commits for unfinished chunks (the game must still run, or write "broken until X"). Run `node --check` before a wip push and the full smoke test when a sub-step is done; record `last green commit`.
7. Update every affected document in the same commit as the code. Mark anything you did not verify as "unverified". A task is done only when code, tests and docs agree.

## Do not break

- The `name` in each `wrangler.jsonc` must equal the Cloudflare Worker name (`sites/main` = `filiposakkq`, `sites/fsociety00` = `fsociety`). Never rename them.
- The Level 01 key is split into three layers read from the page (a `<meta>` in `index.html`, a CSS custom property, a console message from `js/source.js`). Keep all three discoverable and keep `unlock` working.
- Audio starts only after the launch click. `prefers-reduced-motion` and `body.quiet-motion` must keep working. The developer panel is available on `localhost` and on Cloudflare **preview** hostnames, never on production (`fsociety.filiposakkq.dev`, `filiposakkq.dev`). See "Developer panel hostnames" in `docs/overhaul/phase-07-developer-panel.md`.
- Never fetch or display a player's real IP, location or identity (all such text in the story is fictional or redacted).
- UI text is English. Font size minimum 11px. Animate only `transform` and `opacity`.
