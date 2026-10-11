# Dev tools

Development-only scripts. They are **not deployed**: Wrangler publishes only `sites/*/public`.
Run everything from the repository root.

## `smoke.mjs` — end-to-end smoke test for the fsociety00 game

```sh
node tools/smoke.mjs                 # every scenario
node tools/smoke.mjs --only=victory  # scenarios whose name contains "victory"
node tools/smoke.mjs --list          # print scenario names
node tools/smoke.mjs --serial        # run one scenario at a time (easier to read logs)
```

Starts its own static server on a free port (serving `sites/fsociety00/public` on `127.0.0.1`,
so the localhost-only DEV panel is available), launches headless Chromium through Playwright,
and drives the game. Every scenario fails on any `console.error`, uncaught exception, failed
request or HTTP status >= 400.

Scenarios cover the README's *Standard smoke test*: both trust branches, victory, lock-out and
trace-expiry game overs, reboot, the desktop / 390x844 mobile / reduced-motion variants, keyboard
focus order, the missing-key-material fallback, and aborting the story at four different moments.

Notes:

- Playwright is not a dependency of this repo. The script looks for it in `$PLAYWRIGHT_MODULE_PATH`,
  the working directory, and the usual global locations (`/opt/npm-tools`, `/opt/node-tools`, the npm
  global root). Install it yourself if none is found: `npm i -D playwright` outside the repo.
- Chromium comes from `$PLAYWRIGHT_BROWSERS_PATH`. Never run `playwright install` in the cloud container.
- The skip control is held with a **real** mouse press (or keyboard), not a synthetic `pointerdown`:
  the game calls `setPointerCapture`, which throws for pointer ids that do not exist.
- Audio cannot be heard in headless runs. The script only checks that nothing throws.
- A full run takes a few minutes because the story runs in real time (scenarios run in parallel).

## `check-fonts.sh` — minimum font size

```sh
tools/check-fonts.sh          # ignores .case-* and .developer-* (phases 4 and 7 own those)
tools/check-fonts.sh --all    # whole file; required to pass from phase 7 on
```

Fails when a declaration can render below 11px: px values under 11, and em/rem values that fall under
11px at the smallest root size (18px). `max(11px, 0.6em)` floors are accepted.

## `contrast.mjs` — WCAG contrast

```sh
node tools/contrast.mjs '#1a8f3a' '#000'                 # one pair: foreground background
node tools/contrast.mjs '#1a8f3a/#000' '#7a7a7a/#000'    # several fg/bg pairs
node tools/contrast.mjs --audit [css-file] [background]  # every hex `color:` in a stylesheet
```

Prints the ratio and PASS/FAIL against 4.5:1 (AA, normal text). `--audit` ignores opacity and the real
background behind each rule, so treat it as a lead generator, not a verdict. Dark colors that are only used
as text on light hover fills (`#000`) show up as LOW and can be ignored.
