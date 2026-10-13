# Changelog

What changed for players and for the project, one section per merged change. Newest first. Keep entries short and factual; the details live in the phase files under `docs/overhaul/`. Add a line to this file in every phase PR.

## Unreleased

- Phase 2 (audio, in review): the sound engine is data-driven (`js/audio/patches.js`, one table for 83 cues and 4 ambient beds) instead of a 300-line switch. Typing now ticks softly (rate limited, quieter for auto-typed text), the trace ticks once per second and gets higher and faster as time runs out (warning at 2 minutes, critical at 1 minute), ambient beds stop on the audio clock, and a reboot or scene jump silences everything that was playing. 21 new cues are registered for the next phases. New `tools/audio-lint.mjs`; three new smoke scenarios (no audio before the click, `quiet-motion` alone, no sound after reboot). Sounds need the owner's ears: see the listening checklist.
- "hello, friend." in the Mr. Robot reveal now appears in the middle of the window in the real playthrough (it was positioned against the long log and ended up off-screen). Cause: an animated filter on the terminal made it the containing block of the fixed text.
- Ghost panel is readable: it was painted *under* the terminal text (stacking order), so the log showed through it; it is now above the terminal and solid on phones.
- Skip control (lower right) is smaller and has a more transparent background, so it covers less text on phones. (Docs PR after phase 1.)
- Documentation: state after phase 1, prompts, phase conflict map, deploy and merge procedures, owner test checklist, story bible.

## Phase 1: foundation and bug fixes (PR #4, squash `841cad0`, 2026-10-13)

- Third `hint` no longer crashes the shell.
- When the trace runs out while the prompt is open, the game now ends with the TRACE COMPLETE sequence (it used to hang at 00:00).
- Rebooting or jumping scenes cancels the previous run completely (no leftover timers, text or sounds).
- Mobile: logo padding fixed, skip control readable, text and contrast fixes, fonts at least 11px outside the case board and dev panel.
- Accessibility: the terminal output is a `log` region with a screen-reader announcer, dialogs are native `<dialog>`s, keyboard focus is no longer hijacked from controls.
- Digital rain is an ES module, pauses when the tab is hidden and reacts live to reduced motion.
- New dev tools in `tools/` (smoke test, font lint, contrast); Cloudflare Worker names and the `previews` block fixed in both `wrangler.jsonc`.

## Before the overhaul

- Git tag `pre-overhaul` (commit `454309a` on `main`; the game code is unchanged from `8ea680b`).
