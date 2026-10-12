## What changed

<!-- Phase number and the Checkpoint-log rows this PR completes -->

## How it was tested

- [ ] `tools/smoke.mjs` passes (desktop, 390x844, reduced motion, both trust routes, victory, game over + reboot)
- [ ] Other tools for this phase pass (`check-fonts.sh`, `audio-lint.mjs`, `perf.mjs`, `validate-story.mjs`, ...)
- [ ] The three-layer key puzzle still works

## Definition of done (docs/overhaul/README.md)

- [ ] Every Checkpoint-log row is `done` (or skipped with a reason) and everything is pushed
- [ ] Tracker table and the phase file's Implementation notes updated
- [ ] No new console errors, no new `window.*` globals, no font size under 11px

## Owner must check by hand

<!-- Things headless tests cannot judge: audio, animation feel, real phone layout. Use the Cloudflare preview URL. -->

## Decisions made without the owner

<!-- Defaults chosen, copied to the Decisions log in docs/overhaul/README.md -->

## Screenshots

<!-- 390x844 and 1280x800 for visual changes -->
