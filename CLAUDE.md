# Project instructions

Two static sites (`sites/main`, `sites/fsociety00`), deployed to Cloudflare Workers. No build step, no runtime dependencies. fsociety00 is an interactive terminal puzzle game in vanilla JS.

## If you are asked to work on the overhaul

1. Read `docs/overhaul/README.md` completely, then the phase file you were given (`docs/overhaul/phase-0N-*.md`). Re-verify the "current state" claims against the code first.
2. Work only on a branch `overhaul/phase-N-<slug>`. **Never push to `main`, never force-push, never rewrite pushed history, never merge your own pull request.** Pushes to `main` deploy to production.
3. **Commit and push after every numbered sub-step** and keep the phase file's Checkpoint log current. Your session can end at any moment (usage limits) and unpushed work is lost. If you must stop, make a `wip(...)` commit, push it and write a "Stopped at" note.
4. Read "Working in a cloud chat session" in the README for the git quirks of the cloud container (shallow clone, missing remote-tracking refs, how to verify a push).

## Do not break

- The Level 01 key is split into three layers read from the page (a `<meta>` in `index.html`, a CSS custom property, a console message from `js/source.js`). Keep all three discoverable and keep `unlock` working.
- Audio starts only after the launch click. `prefers-reduced-motion` and `body.quiet-motion` must keep working. The developer panel is localhost-only.
- Never fetch or display a player's real IP, location or identity (all such text in the story is fictional or redacted).
- UI text is English. Font size minimum 11px. Animate only `transform` and `opacity`.
