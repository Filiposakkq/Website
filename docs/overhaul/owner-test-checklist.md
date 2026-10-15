# Owner test checklist (for the owner, not for Claude agents)

Agents run `node tools/smoke.mjs`; it cannot judge looks, sound, touch or real devices. This is what **you** test on the Cloudflare **preview URL** of a pull request before merging it. Copy the checklist into the PR description, tick it, and write down anything odd (device, browser, what you did, a screenshot). About 10-15 minutes per device.

Tip: for a real "first visit" test use a private/incognito tab, so nothing is cached.

## A. Phone (real device, preview URL)

Portrait first, then once in landscape.

- [ ] **Launch:** the opening screen fits without horizontal scrolling; tapping the button starts the game. **No sound before the tap.**
- [ ] **Boot:** text is readable (nothing below a comfortable size), nothing is cut off, the rain does not stutter. Screen stays responsive.
- [ ] **Skip control (lower right):** hold it about 3 seconds; it skips the BIOS, then (later) the intro. It does not cover the text you need to read.
- [ ] **Glitches / hello-friend message / logo reveal:** play without freezing; the logo is readable (the FSOCIETY text is legible).
- [ ] **Trust choice:** you can tap `trust <unknown>` or `trust <watcher>` (and also type `1`/`2`).
- [ ] **Puzzle:** the on-screen keyboard opens; the prompt line stays visible above it; `help`, `ls`, `cat inbox/001.msg` (or the watcher log), `hint`, `trace`, `board`, `source map` work.
- [ ] **`unlock`:** a wrong key counts an attempt; the correct key (found from the three layers in the page) unlocks. Three wrong keys give LOCKED OUT.
- [ ] **Trace:** the timer counts down and docks to the corner; letting it run out gives TRACE COMPLETE and the power panel with `[ REBOOT SYSTEM ]`.
- [ ] **Victory path:** `./ghost.sh`, the erased list, the identity reveal, LEVEL 01 COMPLETE.
- [ ] **Reboot** from the power panel returns to a clean start (no doubled text, no stuck timer, no old sound).
- [ ] **Case board:** opens and closes; text readable.
- [ ] **Edge cases:** rotate the phone mid-game; switch to another app and back (the trace keeps running, the rain pauses); lock and unlock the screen; the page does not zoom when you tap the prompt.
- [ ] **Reduce motion** (iOS Settings, Accessibility, Motion, Reduce Motion / Android, Remove animations): the game still plays, the effects are calmer.
- [ ] **Sound** (volume up): cues play after the tap; no harsh clipping or very loud peaks; muting the phone stops it.

## B. Desktop (Chrome, and also Firefox or Safari when you can)

- [ ] **Launch and audio:** no sound before the click; fullscreen works (`F11` or the browser button).
- [ ] **Full playthrough** of both trust routes, one ending each (victory, TRACE COMPLETE, LOCKED OUT; on the watcher route `abort` gives SESSION COMPROMISED).
- [ ] **Keyboard only:** Tab moves between the buttons and dialogs, there is a visible focus ring, no keyboard trap, Escape closes dialogs, typing goes to the prompt without clicking.
- [ ] **The three key layers can still be found:** view-source for the `<meta>`, DevTools for the CSS custom property, the DevTools console for the third part; `cat page/index.html`, `cat page/styles.css`, `cat page/js/source.js` and the hints in the game show them.
- [ ] **Window:** resize the window during the boot and the puzzle (narrow to phone width and back); nothing breaks.
- [ ] **Reduced motion:** DevTools, Rendering, "Emulate CSS prefers-reduced-motion: reduce"; the game plays with calmer effects.
- [ ] **Background tab:** switch tabs for a minute and come back; the trace kept running.
- [ ] **Console:** no red errors during a full playthrough (the intentional `[sdb9]` whisper is expected).
- [ ] **DEV button:** visible on `localhost` and on the preview URL (once phase 7 has merged; before that only on `localhost`), **never on the live sites** (`filiposakkq.dev`, `fsociety.filiposakkq.dev`).
- [ ] **Performance feel:** the rain and the effects stay smooth on your PC; if you have a slow laptop, test there too.

## Phase 2 only: the audio listening checklist

Agents cannot hear. Use headphones first, then the phone speaker, and play boot, intro, trust choice, puzzle, victory, and once the failure path (let the trace run out). Put "heard it, fine" or what sounded wrong in the PR.

- [ ] Boot beeps, drive seek and the memory sound like old PC hardware, not like a game
- [ ] Typing clicks are subtle, and there is no machine-gun effect when you type fast or hold a key
- [ ] Auto-typed story text ticks softly and not on every letter
- [ ] The trace tick gets higher and faster as time drops (first noticeable around 2 minutes, doubles at 30 seconds); the critical state is unmistakable but not painful
- [ ] "hello, friend." plays at the right moment and the bed does not mask it
- [ ] The beds change smoothly between scenes: boot, story, ghost, puzzle, shutdown. No clicks or pops
- [ ] Nothing is louder than the voice clip, and nothing clips or distorts by accident (the intended glitch and alarm sounds are meant to be harsh)
- [ ] After REBOOT there is no leftover sound
- [ ] No sound at all before the first click on the launch screen
- [ ] New cues that nothing plays yet (boot-fail, trust-choice, traced-alert, system-takeover, ...) are listed in `docs/overhaul/audio-cues.md`; phase 7's sound preview panel will let you hear them

## Phase 4 only: the evidence board and the hacking commands

Play once on a phone and once on a desktop on the preview. Agents did not hear any sound and did not use a real touch screen or screen reader.

- [ ] In the shell type `help`: `scan`, `intercept`, `dump`, `decrypt`, `connect`, `trace` are listed
- [ ] `scan` and `intercept` run for a few seconds with a progress line and a sound, the clock keeps counting, and you can still solve the key afterwards
- [ ] `decrypt e13` blocks the prompt for about 8 s; letting the trace run out during it ends the game cleanly and REBOOT works
- [ ] `trace --status` shows a path with relays and a redacted target that fits the phone screen without wrapping
- [ ] CASE FILE opens as a dialog; Escape and CLOSE close it and focus returns to the CASE FILE button
- [ ] Desktop: four panes at once. Phone: four tabs (EVIDENCE, MAP, INTERCEPT, TRACE), big enough to tap, no sideways scrolling of the page
- [ ] Map: drag, wheel or two-finger pinch zoom, FIT button, nodes tappable; selecting a row highlights the node and the other way round
- [ ] CONNECT: select a readable record, press CONNECT TO ..., pick a second one: a good pair reveals an INTEL record, a bad pair costs 3 s of trace
- [ ] Evidence you did not read yet turns `AT RISK` and then `LOST` (scrambled) as the trace runs down (try waiting after `scan` without decrypting)
- [ ] The other trust route's signal shows as `SEALED // OTHER BRANCH`, not as text
- [ ] The board text is readable on the phone (nothing below about 11 px) and the sounds (`board-open`, node select, packets, decrypt progress, breach alert) fit the scene: note which ones are too loud or annoying
- [ ] Tuning feel: could a careful player finish and still use one decrypt; does a lazy player feel the pressure? Numbers are `CASE` in `js/story-data/constants.js`

## Phase 4b only: the case file introduction, the board command line and the 5-minute window

- [ ] **The window:** after you choose who to trust, the clock reads about `05:00` and the voice says "five minutes. no extensions." Does it still feel like pressure? (It is easier than before: tell me if it is too easy. The numbers are `TRACE` and `CASE` in `js/story-data/constants.js`.)
- [ ] **The introduction (4b.1, 4b.2):** right after the inbox message a blue `<???>` says five short lines, and the CASE FILE button appears in the corner with its first line. Does it feel natural? Is the wording right (it is a draft, cryptic on purpose, and never says who it is)? Does anything contradict what `unknown` or the watcher say?
- [ ] **Its typing sound (nobody has heard it yet):** `key-tick-mystery` should sound clearly different from the clicks of every other voice (a soft, round blip), quiet, not annoying. Is the typing speed right (it is the same as `unknown`)?
- [ ] **Skip:** hold the skip control through the intro: the button still appears (you just do not see the lines).
- [ ] **Trace sounds:** with the longer window the first three minutes only tick; the first warning comes at two minutes left, the critical one at one minute. Does that build well?

## C. Report format

For each problem: device and OS, browser and version, the steps, what you expected, what happened, screenshot or screen recording. Put it in the PR as a comment or give it to the Claude that fixes it with prompt 4 in `prompts.md`.
