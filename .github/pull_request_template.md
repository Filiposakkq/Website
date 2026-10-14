## What changed

<!-- Phase number and the Checkpoint-log rows this PR completes -->

## How it was tested

- [ ] `tools/smoke.mjs` passes (desktop, 390x844, reduced motion, both trust routes, victory, game over + reboot)
- [ ] Other tools for this phase pass (`check-fonts.sh`, `audio-lint.mjs`, `perf.mjs`, `validate-story.mjs`, ...)
- [ ] The three-layer key puzzle still works
- [ ] A **review-only pass** by a different Claude (or the owner) was done and has no open Critical findings (`docs/overhaul/prompts.md`, prompt 3)
- [ ] Cloudflare preview builds are green for both Workers (`docs/overhaul/deploy.md`)

## Definition of done (docs/overhaul/README.md)

- [ ] Every Checkpoint-log row is `done` (or skipped with a reason) and everything is pushed
- [ ] Tracker table and the phase file's Implementation notes updated
- [ ] No new console errors, no new `window.*` globals, no font size under 11px
- [ ] Every document that describes changed code, tooling or config was updated in the same commits; anything not verified is marked "unverified"
- [ ] "Known issues carried over" in `docs/overhaul/README.md` updated (new issues added, fixed ones removed)
- [ ] The affected files in `docs/state/` are updated and their "Valid after" line is current (docs sync)
- [ ] The phase file's "Resume point" block is rewritten (or marked `(historical)`) and the handoff report is written
- [ ] `CHANGELOG.md` has a line for this phase

## Owner must check by hand

<!-- Copy the relevant parts of docs/overhaul/owner-test-checklist.md here and tick them on the Cloudflare preview URL (phone and desktop). Things headless tests cannot judge: audio, animation feel, real phone layout. -->

## Decisions made without the owner

<!-- Defaults chosen, copied to the Decisions log in docs/overhaul/README.md -->

## Screenshots

<!-- 390x844 and 1280x800 for visual changes -->
