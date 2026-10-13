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

## C. Report format

For each problem: device and OS, browser and version, the steps, what you expected, what happened, screenshot or screen recording. Put it in the PR as a comment or give it to the Claude that fixes it with prompt 4 in `prompts.md`.
