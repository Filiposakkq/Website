# Changelog

What changed for players and for the project, one section per merged change. Newest first. Keep entries short and factual; the details live in the phase files under `docs/overhaul/`. Add a line to this file in every phase PR.

## Unreleased

- Phase 4b (case file from the first mention, branch `overhaul/phase-4b-case-file`, in review): the CASE FILE button appears right after the inbox message, introduced by a third voice `<???>` (blue, its own typing sound) that explains it in twelve short lines; the board has its own command line (`help list open scan intercept dump decrypt connect close`, a fifth pane, or the COMMANDS tab on a phone) that runs the same evidence commands as the shell, and shell-only words answer "use the shell for that". The trace rules: before the trace exists the evidence commands answer "no active link yet."; while it is pending nothing is charged or lost; only a lethal trace overwrites unread evidence or charges a wrong `connect`; the board says NO TRACE YET / TRACE PENDING instead of a false countdown. The window after the trust choice is now 5 minutes (was 2), with the loss thresholds as a share of the window. One timed command at a time, from either place. Unverified: the feel of the 5 minutes, the sound of the third voice, the wording of its lines, the phone keyboard and screen readers.
- Phase 4 (evidence board, branch `overhaul/phase-4-evidence`, in review): the CASE FILE board is a native dialog with four panes (evidence list, network map, packet intercept log, trace status) or tabs on a phone; new commands `scan`, `intercept`, `dump`, `decrypt`, `connect` and `trace --status` build the case file while the trace runs; unread evidence can be overwritten by the trace; the other trust route's signals show as sealed stubs; an ASCII trace path (`js/topology.js`) shows the real hop count; the evidence is data (`js/story-data/evidence.js`) checked by `tools/validate-story.mjs`; the board text is at least 11 px. The key puzzle is unchanged.
- Phase 3 (story and boot, PR #10, squash `1bbc40d`): the story is data run by a narrative engine (`js/engine.js`, `js/story-data/`, checked by `tools/validate-story.mjs`); `story.js` went from 1658 to about 300 lines. The boot is a realistic Linux sequence (BIOS, GRUB, kernel log, services with one FAILED firewall, the `sdb9` hook, masked login). The trace now has a policy: it cannot expire before the trust choice (TRACE PENDING), turns lethal after it, and reads TRACE CLOSED once `ghost.sh` closes the request. The skip control follows the engine (hold 3 s: boot, then intro) and skipping drops sounds. A command registry builds `help`; new commands `whoami`, `uname`, `ps aux`, `netstat -an`, `ifconfig`, `history`, `pwd`, `date`, `echo`, `clear`, `cat /var/log/auth.log` and restricted-shell answers. Story text is unchanged except the boot and one watcher line ("he cannot say it. he does not trust you."). New tools: `tools/validate-story.mjs`, `tools/transcript.mjs`; smoke is 21 scenarios. Unverified by ear and on a phone: all new sounds, boot length.
- Phase 2 (audio, PR #7, squash `b0ea8ee`): the sound engine is data-driven (`js/audio/patches.js`, one table for 83 cues and 4 ambient beds) instead of a 300-line switch. Typing now ticks softly (rate limited, quieter for auto-typed text), the trace ticks once per second and gets higher and faster as time runs out (warning at 2 minutes, critical at 1 minute), ambient beds stop on the audio clock, and a reboot or scene jump silences everything that was playing. 21 new cues are registered for the next phases. New `tools/audio-lint.mjs`; four new smoke scenarios (no audio before the click, `quiet-motion` alone, typing limits, no sound after reboot). Sounds need the owner's ears: see the listening checklist.
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
