# Phase 6 — Trace expiration: the "TRACED" game over

Read [`README.md`](README.md) first.

- **Branch:** `overhaul/phase-6-traced`
- **Depends on:** phases 1, 2, 3 and 5 merged (session/abort, the traced cues and `ambient-traced` bed, story engine, `cascade()` and glitch effects). Phase 4's topology module is reused if it is merged.
- **Plan section:** 6 (Trace expiration — "TRACED" game over)
- **Touches:** `js/story.js` or the story data for endings (`gameOver`, `watcherTakeover`), `js/trace.js` hook (`onEnd`), `index.html` + `styles.css` (power panel / game-over panel), `js/audio` cue wiring

## Goal

When the trace reaches `00:00` a full, dramatic, cinematic sequence plays: the system "identifies the source", a remote operator takes over the terminal, then everything corrupts, hard-cuts to black and a **GAME OVER — YOU WERE TRACED** panel offers `[ REBOOT SYSTEM ]`. This replaces the generic game over for the `'TRACE COMPLETE'` reason; other reasons (`LOCKED OUT`, `SESSION COMPROMISED`, dev tests) keep their own, shorter variants.

## Hard safety rule

The sequence mentions location, IP and coordinates for drama. **All of it is fictional or redacted. Never fetch, derive or display the player's real IP, location, device or any personal data** (no `fetch` to IP/geo services, no `navigator.geolocation`, no timezone-derived city, no user agent echo). Use documentation-range addresses (`203.0.113.x`, `198.51.100.x`, `192.0.2.x`) and `█` redaction bars. Add a test that fails the build if the sequence code references `geolocation`, `fetch(`/`XMLHttpRequest` or `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Current state (baseline `8ea680b`)

- `trace.js`: when `secs` hits 0 the HUD gets `expired`/`TRACE COMPLETE` and calls `api.onEnd` once (phase 1 also stops the interval).
- `level01.js` sets `state.over = 'TRACE COMPLETE'` when the trace ends and the loop calls `gameOver(trace, state.over)`; the story intro also uses the trace.
- `story.js`: `gameOver(trace, reason)` shows the shutdown sequence overlay (`#shutdownSequence`) and then the power panel (`#powerPanel`, dialog since phase 1) with `[ REBOOT SYSTEM ]` (`#restartControl`). `watcherTakeover(trace)` is a related takeover scene on the Watcher route. `caseFile.setFailureOutcome(reason)` records the outcome.
- Re-read these functions before designing: reuse what fits, do not duplicate.

## The sequence (from the plan; text can be polished, structure stays)

```text
[TRACE COMPLETE]

> CONNECTION SOURCE IDENTIFIED
> TRIANGULATING...

  ██████████████████████████ 100%

  LOCATION: ██████████, ██
  IP: 192.168.1.███ → [YOUR REAL NODE]     <- keep it fictional/redacted, see the safety rule
  COORDINATES LOCKED

> INITIATING REMOTE TAKEOVER...

[System control transferred to remote host]
[Keylogger deployed — PID 6667]
[Filesystem mounted read-only]
[Session recorded to /dev/null]

guest@fsociety00:~$ echo "I can see you."
> You don't type this.

guest@fsociety00:~$ cat /etc/shadow
> ACCESS GRANTED

CONNECTION SEVERED BY REMOTE HOST.
```

Then: **screen corruption cascade → hard cut to black → GAME OVER panel** with "YOU WERE TRACED" messaging and a REBOOT option.

### Beats and timing

| Beat | What happens | Cues (phase 2) / effects (phase 5) |
|---|---|---|
| 0. Expiry | HUD hits `00:00`, input is locked (`terminal.abort()` so the pending `readCommand` unwinds), ambient switches to `ambient-traced` | `trace-expire` (flatline + noise), `setScene('intrusion')` |
| 1. Identification | `[TRACE COMPLETE]`, then `CONNECTION SOURCE IDENTIFIED`, `TRIANGULATING...` with a progress bar that fills fast | `traced-alert` alarm, `progress-*` |
| 2. Lock-on | Fictional/redacted location + IP + `COORDINATES LOCKED`. Optionally render the phase 4 ASCII topology with every hop lit and the last node resolving to `[ YOUR NODE ]` | `breach-alert`, flash (≤ 3/s) |
| 3. Takeover | Status lines print one by one (`System control transferred…`, keylogger, read-only filesystem, `Session recorded to /dev/null`). The prompt becomes un-typeable | `system-takeover` |
| 4. The remote hand | The remote host **types on the player's prompt by itself**: `echo "I can see you."` appears character by character at an uneven human tempo, answer `> You don't type this.`; then `cat /etc/shadow` → `> ACCESS GRANTED`. The player's own keystrokes are ignored (show a subtle `input locked` flicker, but do not trap keyboard focus for assistive tech: the dialog/focus rules from phase 1 still apply) | `key-tick` variants, `cmd-fail`/`cmd-run` |
| 5. Severed | `CONNECTION SEVERED BY REMOTE HOST.` | `session-kill` |
| 6. Cascade | Corruption cascade: text breaks into scramble, RGB split, slice, roll, rain intensifies, then everything tears away | phase 5 `cascade()`, `corrupt`, `gfx('slice'/'roll'/'rgb')` |
| 7. Hard cut | Instant black. Silence for about 1.2 s (stop all audio abruptly; leave a faint bed tail only if it reads better). The silence is part of the effect | audio hard stop |
| 8. Aftermath | GAME OVER panel fades in: **YOU WERE TRACED**, short subtitle ("They found you."), session stats from `caseFile.snapshot()` (route, evidence found, hints used, time survived), and `[ REBOOT SYSTEM ]`. Keep the existing power-panel styling or evolve it | `ambient-traced` low bed or silence |

Total length: about 25–35 seconds. It must be **skippable after the first viewing within a session** (hold/tap to jump to the aftermath panel), because players will see it repeatedly.

### Variants for other failure reasons

Keep the existing shorter sequences for `LOCKED OUT`, `SESSION COMPROMISED` and `DEVELOPER SHUTDOWN TEST`, but route all of them through the same panel component so the aftermath screen looks consistent (different headline: e.g. `LOCKED OUT`, `SESSION COMPROMISED`). The new full sequence is **only** for `'TRACE COMPLETE'`.

### Evidence interplay (phase 4)

If the board is merged: at expiry, evidence not yet decrypted becomes `COMPROMISED` in the final snapshot (the aftermath stats can list "evidence lost").

## Tasks

- [ ] Sequence as story-engine data (phase 3 nodes) with `run` nodes for the typed-by-remote beats and the cascade; no ad-hoc timers (use the session)
- [ ] Input lock during the remote typing; `terminal.abort()` on expiry
- [ ] Cascade → hard cut → aftermath panel; reboot returns to a clean state (phase 1 abort model)
- [ ] Panel component shared by all failure reasons; stats from `caseFile.snapshot()`
- [ ] Skip-after-first-view
- [ ] Reduced-motion version: same text beats and timing of the *text*, but no flicker/cascade (replace with a simple fade to black); keep flashes ≤ 3/s
- [ ] Safety test (no geolocation/fetch/timezone use) in `tools/validate-story.mjs`
- [ ] Update `docs/overhaul/audio-cues.md` for the cues used

## Out of scope

Redesigning other endings, a sequel, the dev panel (phase 7 will add a jump to this scene; keep a stable route name like `traced` in `runDeveloperRoute`).

## Verification

- [ ] Smoke test passes; add a run that lets the trace expire (use the dev route or shorten the trace through the trace API in test mode) and asserts the sequence text order, the final panel, and a clean reboot.
- [ ] Reboot 5 times in a row: no duplicated sequences, no leftover audio, no timers (`session.pending() === 0`).
- [ ] 390×844 screenshots of each beat; text is readable and nothing overflows.
- [ ] Reduced motion run passes with the simplified visuals.
- [ ] The owner reviews the feel and audio (hard cut silence, alarm loudness).

## Done when

Letting the trace run out plays the full TRACED sequence from the plan with redacted/fictional data only, the aftermath panel and reboot work, and the other failure reasons share the same panel.

## Implementation notes

_(append here)_
