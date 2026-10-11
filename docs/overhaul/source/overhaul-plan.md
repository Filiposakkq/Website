# fsociety00-dat — Overhaul Plan

Everything from the 25-item code review **plus** the creative rework. Organized by workstream.

---

## 1. All 25 Code Review Fixes

Straight from the review — no design decisions needed:

- [ ] Fix CSS cascade bug (mobile `.logo` padding)
- [ ] Fix trace timer leak (`clearInterval`)
- [ ] Fix Web Audio envelope scheduling violation
- [ ] Add `AbortController` pattern through async story flow
- [ ] Fix global focus hijacking in `tty.js`
- [ ] Bump `--dim` color to WCAG AA (≥4.5:1)
- [ ] Add `role="log"` + `aria-live="polite"` to `#output`
- [ ] Add `aria-hidden="true"` to rain canvas
- [ ] Migrate custom `role="dialog"` divs to native `<dialog>`
- [ ] Add `aria-pressed` to tool chips (main site)
- [ ] Fix sub-10px font sizes
- [ ] Animate `transform` instead of `top` in shutdown-scan
- [ ] Throttle `pointermove` on project card (main site)
- [ ] Convert `fx.js` rain to `requestAnimationFrame` + proper module export
- [ ] Consolidate hardcoded colors on main site into CSS tokens
- [ ] Remove redundant breakpoint declarations (main site)
- [ ] Merge 3 `prefers-reduced-motion` blocks into 1
- [ ] Remove dead `.glyph i.on` duplicate
- [ ] Fix orphaned nested timeouts
- [ ] Clear ambient intervals on victory path
- [ ] Extract duplicate `MM:SS` formatting into shared util
- [ ] Extract duplicate text corruption into shared util
- [ ] Extract duplicate choice builder into shared util
- [ ] Move `chooseTrust` out of `tty.js` into story layer
- [ ] Fix `level01.js` crash when DOM metadata missing

---

## 2. Sound Effects Rework (`audio.js`)

### Current State
45 hardcoded oscillator patches in a giant switch statement. Many sound thin/generic.

### Plan
Refactor to a **data-driven patch table** and redesign the sounds to feel like you're actually in a hacker's terminal:

| Category | Sound Cues | Direction |
|---|---|---|
| **Boot** | `boot-prompt`, `boot-checkpoint`, `boot-complete` | POST beep → HDD seek chirps → hardware init tones. Grittier, lower-frequency. Add a `boot-memtest` sweep and `boot-fail` distortion burst. |
| **Terminal** | `key-tick`, `cmd-run`, `cmd-fail` | Mechanical key click (filtered noise burst). Command run = brief data-burst. Fail = low buzz + static crackle. |
| **Story/Tension** | `ghost-appear`, `trust-choice`, `identity-reveal` | Detuned pads, slow LFO sweeps. `trust-choice` gets a held drone with rising tension. |
| **Trace** | `trace-start`, `trace-tick`, `trace-warn`, `trace-critical`, `trace-expire` | Tick = cold radar ping. As time drops: pitch rises, tick rate doubles, add distortion. `trace-expire` = flatline tone + burst of noise. |
| **Evidence** | `evidence-unlock`, `evidence-decrypt`, `board-open`, `node-select` | Unlock = data chime. Decrypt = filtered sweep resolving. Board = panel slide. Node = soft click. |
| **Hacking** | `decrypt-progress`, `packet-intercept`, `relay-connect`, `breach-alert` | New cues for the reworked gameplay. Glitchy, lo-fi, digital. |
| **Game Over** | `traced-alert`, `system-takeover`, `session-kill` | Alarm → escalating corruption → hard cut. |
| **Ambient Beds** | `ambient-boot`, `ambient-story`, `ambient-puzzle`, `ambient-traced` | Evolving background drones. Puzzle bed adds tension. Traced bed = aggressive, distorted. |

### Architecture Change
```js
// Before: 300-line switch
case 'boot-prompt': { const o = ctx.createOscillator(); ... }

// After: patch table
const PATCHES = {
  'boot-prompt': { type: 'tone', wave: 'square', freq: 880, attack: 0.01, decay: 0.08, ... },
  'trace-tick':  { type: 'noise', filter: 'bandpass', freq: 2000, q: 12, ... },
  // ...
};
```

---

## 3. Animation Rework (`styles.css` + JS)

### Principles
- **GPU-only**: Everything via `transform` and `opacity` — no `top`, `left`, `background-position`
- **Cinematic pacing**: Ease curves that feel intentional, not default `linear`
- **Reactive**: Animations that respond to game state (trace timer, trust choice)

### Specific Changes

| Animation | Current | Proposed |
|---|---|---|
| **Boot sequence** | Simple text appear | Staggered reveal with CRT warm-up flicker, scanline intensity pulse |
| **Glitch effects** | Text character swaps | CSS `clip-path` slicing + `hue-rotate` + horizontal offset jitter (like real VHS tracking errors) |
| **Screen transitions** | Instant or basic fade | Brief screen tear (clip-path wipe) + static burst |
| **Ghost appearance** | Fade in | Interference pattern → resolve (opacity oscillation + horizontal shift) |
| **Shutdown sequence** | `top` animation (broken) | `translateY` scan + RGB channel split via `text-shadow` |
| **Trace HUD** | Static counter | Pulsing glow that intensifies → screen edge vignette turns red as time runs out |
| **Digital rain** | Fixed `setInterval` | `requestAnimationFrame`, speed/density responds to game state (faster during trace, stops on game over) |
| **Evidence board** | Slide in | Glitch-in with staggered node reveals |
| **Trust choice** | Basic button appear | Cards slide up from bottom with a slow dramatic timing |
| **Game over** | Basic text | Full screen corruption cascade → hard cut to black → aftermath |

---

## 4. Evidence Board — Complete Rework (`casefile.js`)

### Current State
A static evidence map with pre-placed nodes. Looks nice but has no real gameplay purpose.

### New Concept: **Live Intelligence Dashboard**

The board becomes a **central mechanic** — not just a reference panel, but something you actively use to progress:

#### Structure
```
┌──────────────────────────────────────────────────┐
│  CASE FILE // INTELLIGENCE DASHBOARD     [CLOSE] │
├──────────────┬───────────────────────────────────┤
│              │                                   │
│  EVIDENCE    │       NETWORK MAP                 │
│  LIST        │   (interactive node graph)        │
│              │                                   │
│  • Unlocked  │   [NODE] ──── [NODE]              │
│  • Locked 🔒 │      \                            │
│  • Decrypted │       [NODE] ──── [???]           │
│              │                                   │
├──────────────┼───────────────────────────────────┤
│  PACKET      │  TRACE STATUS                     │
│  INTERCEPT   │  ████████░░░░ 04:32               │
│  LOG         │  Source: [REDACTED]               │
│              │  Hops remaining: 3                │
└──────────────┴───────────────────────────────────┘
```

#### Key Mechanics
1. **Evidence Discovery**: Terminal commands (`scan`, `intercept`, `dump`) unlock evidence nodes on the board
2. **Decryption**: Some evidence is encrypted — run `decrypt <node-id>` to reveal it (takes time, trace keeps running)
3. **Connection Mapping**: Connecting two related evidence nodes reveals hidden intel and advances the story
4. **Trace Visualization**: The board shows the trace path closing in — you can see which network hops remain before you're found
5. **Ghost Trail**: Evidence of "Unknown" or "Watcher" appears contextually based on the trust choice

#### Evidence Types
- `INTERCEPT` — captured network packets (auto-collected during story)
- `ARTIFACT` — files discovered via terminal commands
- `SIGNAL` — mysterious transmissions from Unknown/Watcher
- `INTEL` — unlocked by connecting related evidence
- `COMPROMISED` — evidence that gets corrupted if the trace reaches certain thresholds

---

## 5. Realistic Hacker Experience

### Boot Sequence (complete rewrite)
Replace the current generic BIOS text with something that feels like booting a real compromised machine:

```
AMIBIOS (C) 2015 E Corp Systems
FSOC-BIOS v3.1.4 Release 09/23/2015

CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz
Memory Test: 16384MB OK
  Extended Memory: 16252MB
  L1 Cache: 256KB  L2 Cache: 1024KB  L3 Cache: 8192KB

Detecting Primary Master... WDC WD10EZEX-00W 931.5GB
Detecting Primary Slave...  None
Detecting Secondary Master... ATAPI DVD-ROM
PCI Device Listing:
  Bus 0, Dev 2:  Intel HD Graphics 4600
  Bus 0, Dev 26: Intel 9 Series USB EHCI
  Bus 0, Dev 31: Intel 9 Series LPC
  Bus 1, Dev 0:  Realtek RTL8168 GbE

Press DEL to enter Setup, F12 for Boot Menu...

Loading GRUB...
  GNU GRUB version 2.02

Booting 'fsociety-os (kernel 4.4.0-custom)'...

[    0.000000] Linux version 4.4.0-fsoc (root@fsociety)
[    0.000000] Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1
[    0.041523] ACPI: RSDP 0x00000000000F0490
[    0.126842] Initializing cgroup subsys cpu
[    0.284012] pid_max: default: 32768 minimum: 301
[    0.310511] Security Framework initialized
[    0.310515] SELinux: Disabled at boot.
[    0.493211] NET: Registered protocol family 2
[    1.012340] e1000: eth0 NIC Link is Up 1000 Mbps
[    1.234102] EXT4-fs (sda1): mounted filesystem
[    1.502831] systemd[1]: Detected architecture x86-64.

[  OK  ] Started Journal Service.
[  OK  ] Started Network Manager.
[  OK  ] Reached target Network.
[FAILED] Failed to start Firewall Service.    ← (ominous)
[  OK  ] Started OpenSSH Server.
[  OK  ] Reached target Multi-User System.

WARNING: Unauthorized network adapter detected on eth0:1
WARNING: Unknown process 'ghost.sh' running as PID 1337
WARNING: Outbound connection to [REDACTED] on port 4444

fsociety-os login: guest
Password: ********
Last login: Thu Sep 24 03:14:07 2015 from 192.168.1.???

guest@fsociety00:~$
```

### Terminal Commands — More Realistic
Add/improve commands to feel like a real Linux terminal:

| Command | Output |
|---|---|
| `whoami` | `guest (uid=1000) — restricted shell` |
| `uname -a` | `Linux fsociety-os 4.4.0-fsoc #1 SMP x86_64` |
| `ps aux` | Process list showing `ghost.sh`, suspicious PIDs |
| `netstat -an` | Active connections, one to a suspicious IP |
| `ifconfig` | Network interfaces with the rogue `eth0:1` |
| `cat /var/log/auth.log` | Failed login attempts from external IPs |
| `scan` | Scans local network, discovers evidence nodes |
| `intercept` | Captures packets, unlocks evidence |
| `decrypt <id>` | Decrypts locked evidence (time cost) |
| `trace --status` | Shows trace progress, hops remaining |
| `history` | Shows previous session's commands (story context) |

---

## 6. Trace Expiration — "TRACED" Game Over

When the timer hits 00:00, a full dramatic sequence plays:

```
[TRACE COMPLETE]

> CONNECTION SOURCE IDENTIFIED
> TRIANGULATING...

  ██████████████████████████ 100%

  LOCATION: ██████████, ██
  IP: 192.168.1.███ → [YOUR REAL NODE]
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

Then: screen corruption cascade → hard cut → **GAME OVER** panel with "YOU WERE TRACED" messaging and REBOOT option.

---

## 7. Developer Panel Fix

- Fix focus trapping (Tab stays inside panel when open)
- Scene jump buttons actually work with the new `AbortController` flow (cancel current scene → jump to target)
- Add animation preview that plays each animation in an isolated container
- Add sound preview (play any cue by name)
- Add state inspector showing current story stage, trace time, evidence unlocked, trust choice
- Style cleanup — bump font sizes above 10px

---

## 8. Main Site Improvements

- Consolidate 35+ color values into semantic tokens
- Fix all a11y issues (`aria-pressed`, `aria-label` on divs, external link indicator)
- Throttle pointermove, eliminate forced reflows
- Fix compounding reveal-item transforms
- Add `prefers-reduced-motion` support
- Consider: rotating project card visual that shows a tiny live terminal preview?

---

## 9. My Extra Ideas

> [!NOTE]
> These are optional — skip any you don't like.

1. **Konami Code Easter Egg** — Enter the sequence in the terminal to unlock an "admin mode" with a custom message
2. **Session Persistence** — Save progress to `localStorage` so refreshing doesn't reset; show "RESUMING SESSION..." on return
3. **Sound toggle** — Tiny mute/unmute control so players can silence audio without browser tab muting
4. **Mobile experience** — The game is keyboard-heavy; add a soft command palette / quick-action buttons for mobile users
5. **"Source code" command** — `view-source` in the terminal shows a stylized, redacted version of the actual page source with hidden clues
6. **Typing sound feedback** — Subtle key click sounds as the player types in the terminal
7. **Screen CRT curvature** — Subtle CSS `perspective` + border-radius to simulate a curved CRT monitor edge
8. **Network visualization** — During the trace, show an ASCII art network topology with the trace path lighting up node by node

---

## Execution Order

This is a large overhaul. Recommended sequence:

1. **Infrastructure first** — shared utils, `AbortController` pattern, module exports, bug fixes
2. **Audio engine** — data-driven patch table + all new sounds
3. **Story + boot rewrite** — data-driven narrative, realistic boot, dialogue polish
4. **Evidence board rework** — new layout, mechanics, integration with terminal commands
5. **Animation rework** — GPU-only, cinematic transitions, trace-reactive effects
6. **Trace expiration** — the "TRACED" game over sequence
7. **Dev panel** — fix and enhance
8. **Main site** — a11y, CSS cleanup, perf
9. **Polish** — extra ideas, testing, mobile
