# Tools and tests

Valid after: phase 3.10 (handoff) (branch `overhaul/phase-3-story`; smoke as of `main` `2a9abad`), verified 2026-10-14. Details, options and cost notes: [`../../tools/README.md`](../../tools/README.md).

- `node tools/smoke.mjs` (21 scenarios; it expects the boot header `FSOC-BIOS v3.1.4`, ~3 min in parallel): both trust routes, abort at every stage, trace expiry, reduced and quiet motion, audio cues and no AudioContext before the click, developer routes. Two scenarios were flaky once in a parallel run (see tools/README.md). It cannot judge looks or sound.
- `node tools/transcript.mjs --out=<dir>` / `--diff=<a>,<b>`: records the terminal text of four scripted playthroughs (reduced motion) and compares two recordings; used to prove a refactor kept the story text.
- `node tools/validate-story.mjs`: self-test of the narrative engine, then validation and dry runs of the story data (targets, cues, scenes, fields, developer routes). No browser needed, runs in about a second.
- `node tools/audio-lint.mjs`: renders every cue and bed offline, checks NaN, silence, peak, headroom, crossfade clicks, trace-sound logic.
- `bash tools/check-fonts.sh`: no font-size below 11px (`--all` includes `.case-*`/`.developer-*`).
- `node tools/contrast.mjs`: WCAG contrast calculator and CSS audit.
- Owner tests on the preview: `../overhaul/owner-test-checklist.md`.
