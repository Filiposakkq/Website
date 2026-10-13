# Changelog

What changed for players and for the project, one section per merged change. Newest first. Keep entries short and factual; the details live in the phase files under `docs/overhaul/`. Add a line to this file in every phase PR.

## Unreleased

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
