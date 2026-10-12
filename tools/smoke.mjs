#!/usr/bin/env node
// End-to-end smoke test for the fsociety00 game. See tools/README.md.
//
//   node tools/smoke.mjs [--only=<substring>] [--list] [--serial] [--headed]

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// SMOKE_SITE_DIR lets a run use a snapshot copy, so editing the sources during a long run is safe.
const siteDir = path.resolve(process.env.SMOKE_SITE_DIR ?? path.join(root, 'sites/fsociety00/public'));
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

// ---------------------------------------------------------------- playwright

function loadPlaywright() {
  const bases = [process.env.PLAYWRIGHT_MODULE_PATH, process.cwd(),
    '/opt/npm-tools/node_modules', '/opt/node-tools/node_modules'];
  try { bases.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch { /* no npm */ }
  const require = createRequire(import.meta.url);
  for (const base of bases.filter(Boolean)) {
    try { return require(require.resolve('playwright', { paths: [base] })); } catch { /* try next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE_PATH or see tools/README.md.');
}

// -------------------------------------------------------------------- server

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json',
};

function startServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
    const file = path.join(siteDir, rel);
    if (!file.startsWith(siteDir)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() });
    });
  });
}

// ------------------------------------------------------------------- helpers

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Headless Chromium builds may lack the codec for the voice clip: not a game bug.
const ALLOWED_CONSOLE = [/hello friend voice clip/i];

function watch(page, problems, allow = []) {
  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = msg.text();
    if ([...ALLOWED_CONSOLE, ...allow].some((rx) => rx.test(text))) return;
    problems.push(`console.${type}: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? '';
    if (/ERR_ABORTED/.test(reason) && request.resourceType() === 'media') return;
    problems.push(`request failed: ${request.url()} (${reason})`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
}

const waitOutput = (page, text, timeout = 90000) => page.waitForFunction(
  (needle) => document.getElementById('output').textContent.includes(needle), text, { timeout },
);

// "Shown" works for both the hidden-attribute panels and native <dialog> elements.
const waitShown = (page, selector, timeout = 30000) => page.waitForFunction((sel) => {
  const el = document.querySelector(sel);
  return !!el && !el.hidden && (el.tagName !== 'DIALOG' || el.open);
}, selector, { timeout });

const waitGone = (page, selector, timeout = 30000) => page.waitForFunction((sel) => {
  const el = document.querySelector(sel);
  return !el || el.hidden || (el.tagName === 'DIALOG' && !el.open);
}, selector, { timeout });

async function initialize(page) {
  await page.click('#initialize');
  await waitGone(page, '#launch');
}

// Hold the skip control for 3 s with the keyboard. (A synthetic pointerdown would throw in
// setPointerCapture, so real input is required.)
async function holdSkip(page, label) {
  await page.waitForFunction((word) => {
    const hint = document.getElementById('skipHint');
    return !hint.hidden && hint.querySelector('.skip-label').textContent.includes(word);
  }, label, { timeout: 60000 });
  await page.locator('#skipHint').focus();
  await page.keyboard.down('Space');
  await sleep(3300);
  await page.keyboard.up('Space');
}

async function reachTrustChoice(page, { reduced }) {
  if (!reduced) {
    await holdSkip(page, 'BOOT');
    await holdSkip(page, 'INTRO');
  }
  await page.waitForSelector('.choices .choice', { timeout: 90000 });
}

async function chooseTrust(page, who, how) {
  if (how === 'click') {
    await page.click(`.choices .choice[data-id="${who}"]`);
  } else {
    const input = page.locator('.tty-input');
    await input.fill(who);
    await input.press('Enter');
  }
}

// The terminal only accepts input while a readCommand() is pending, so a command sent during an
// effect (gfx, a typed hint ...) is silently dropped. Verify the echo line appeared and retry.
async function sendCommand(page, text) {
  const input = page.locator('.tty-input');
  const echoCount = () => page.evaluate((command) => [...document.getElementById('output').children]
    .filter((el) => el.textContent === `guest@fsociety00:~$ ${command}`).length, text);
  const before = await echoCount();
  for (let attempt = 0; attempt < 60; attempt++) {
    await input.fill(text);
    await input.press('Enter');
    const accepted = await page.waitForFunction(([command, previous]) => [...document.getElementById('output').children]
      .filter((el) => el.textContent === `guest@fsociety00:~$ ${command}`).length > previous,
    [text, before], { timeout: 600 }).then(() => true, () => false);
    if (accepted) return;
  }
  throw new Error(`terminal never accepted "${text}"`);
}

async function reachPuzzle(page) {
  await waitOutput(page, 'type help.');
  await waitShown(page, '#promptLine');
}

async function playToShell(page, { who, how, reduced }) {
  await initialize(page);
  await reachTrustChoice(page, { reduced });
  await chooseTrust(page, who, how);
  await reachPuzzle(page);
}

async function winGame(page) {
  await sendCommand(page, 'unlock ghost shell 1337');
  await waitOutput(page, 'unlocking /dev/sdb9');
  const ghost = page.locator('button.choice:not(.locked)');
  await ghost.waitFor({ timeout: 90000 });
  await ghost.click();
  await waitOutput(page, 'this is where the signal ends.', 240000);
  // Victory is an exit path too: the logo's ambient jitter and every other timer must be gone.
  await sleep(500);
  const pending = await page.evaluate(async () => (await import('/js/session.js')).currentSession().pending());
  if (pending !== 0) throw new Error(`${pending} timer handle(s) still live after victory`);
}

async function loseByLockout(page) {
  for (let left = 2; left >= 0; left--) {
    await sendCommand(page, 'unlock wrong-key-000');
    await waitOutput(page, `attempts left: ${left}`);
  }
  await waitOutput(page, '*** LOCKED OUT ***');
  await waitShown(page, '#powerPanel', 60000);
}

async function loseByTraceExpiry(page) {
  // Each hint costs 30 s and is typed out slowly; commands sent while it types are dropped,
  // so wait for the full hint text before sending the next one.
  // (Two hints only: the third one reveals the console part and has its own scenario.)
  const hints = [
    'markup, styles, and script.',
    'then read each listed file.',
  ];
  for (const tail of hints) {
    await sendCommand(page, 'hint');
    await waitOutput(page, tail, 30000);
    await sleep(500);
  }
  await waitOutput(page, '*** TRACE COMPLETE ***', 150000);
  await waitShown(page, '#powerPanel', 60000);
}

// Reboot and check that the new run is clean: one BIOS stream, one HUD, no leftovers.
async function snapshotRun(page) {
  return page.evaluate(() => {
    const text = document.getElementById('output').textContent;
    const count = (needle) => text.split(needle).length - 1;
    const power = document.getElementById('powerPanel');
    return {
      bios: count('FSOC-BIOS v0.0.1'),
      restored: count('LOCAL CONSOLE RESTORED'),
      cpu: count('CPU: Intel(R)'),
      trustPrompts: count('who do you trust?'),
      streams: document.querySelectorAll('#output').length,
      huds: document.querySelectorAll('#hud').length,
      choiceBoxes: document.querySelectorAll('.choices').length,
      overlays: document.querySelectorAll('.ghost-sequence, .breach-sequence, .identity-surge, .hello-flight-layer, .elliot-echo').length,
      powerShown: !power.hidden && (power.tagName !== 'DIALOG' || power.open),
    };
  });
}

function expectClean(state, checks) {
  for (const [ok, message] of checks) {
    if (!ok) throw new Error(`reboot not clean: ${message} ${JSON.stringify(state)}`);
  }
}

async function rebootAndVerify(page, { reduced }) {
  await page.click('#restartControl');
  await waitGone(page, '#powerPanel', 60000);
  if (!reduced) {
    // Real-time run: the BIOS is still printing, so one stream means exactly one header.
    await waitOutput(page, 'FSOC-BIOS v0.0.1');
    await sleep(6500);
    const early = await snapshotRun(page);
    expectClean(early, [
      [early.bios === 1, 'BIOS header should appear exactly once'],
      [early.restored === 1, 'restore line should appear exactly once'],
      [early.cpu <= 1, 'CPU line duplicated (two boot() streams?)'],
      [early.streams === 1, 'more than one #output'],
      [early.huds === 0, 'HUD survived the reboot'],
      [early.overlays === 0, 'overlay leftovers'],
      [!early.powerShown, 'power panel still showing'],
    ]);
  }
  await reachTrustChoice(page, { reduced });
  await sleep(reduced ? 300 : 1500);
  const late = await snapshotRun(page);
  expectClean(late, [
    [late.trustPrompts === 1, 'the story should have reached the trust prompt exactly once'],
    [late.choiceBoxes === 1, 'expected exactly one choice box'],
    [late.streams === 1, 'more than one #output'],
    [late.huds === 1, 'expected exactly one HUD at the trust choice'],
    [late.overlays === 0, 'overlay leftovers'],
    [!late.powerShown, 'power panel still showing'],
  ]);
}

// ----------------------------------------------------------------- scenarios

const DESKTOP = { viewport: { width: 1280, height: 800 } };
const MOBILE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const REDUCED = { ...DESKTOP, reducedMotion: 'reduce' };

const variants = [
  ['desktop', DESKTOP, false],
  ['mobile', MOBILE, false],
  ['reduced', REDUCED, true],
];

const scenarios = [];
for (const [label, contextOptions, reduced] of variants) {
  scenarios.push({
    name: `${label}: trust unknown -> victory`,
    contextOptions,
    async run({ page }) {
      await playToShell(page, { who: 'unknown', how: 'click', reduced });
      await winGame(page);
    },
  });
  scenarios.push({
    name: `${label}: trust watcher -> lock-out -> reboot`,
    contextOptions,
    async run({ page }) {
      await playToShell(page, { who: 'watcher', how: 'type', reduced });
      await loseByLockout(page);
      await rebootAndVerify(page, { reduced });
    },
  });
}
// Trace expiry while the prompt is waiting must end in game over (it used to hang the shell).
scenarios.push({
  name: 'desktop: trace expiry -> game over',
  contextOptions: DESKTOP,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'type', reduced: false });
    await loseByTraceExpiry(page);
    const hud = await page.evaluate(() => ({
      text: document.querySelector('#hud .num')?.textContent,
      label: document.querySelector('#hud .lbl')?.textContent,
    }));
    if (hud.text !== '00:00' || hud.label !== 'TRACE COMPLETE') {
      throw new Error(`expired HUD should read 00:00 / TRACE COMPLETE, got ${JSON.stringify(hud)}`);
    }
  },
});

// The third hint reveals the console part. It used to throw (revealSourcePart was never passed in).
scenarios.push({
  name: 'reduced: third hint whispers the console part',
  contextOptions: REDUCED,
  async run({ page }) {
    const logs = [];
    page.on('console', (message) => { if (message.type() === 'log') logs.push(message.text()); });
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    for (let i = 0; i < 3; i++) await sendCommand(page, 'hint');
    await waitOutput(page, 'each hold one part.');
    if (!logs.some((text) => text.includes('layer 3/3') && text.includes('1337'))) {
      throw new Error(`console did not show the third key part: ${JSON.stringify(logs)}`);
    }
    await sendCommand(page, 'help'); // the shell must still be alive
    await waitOutput(page, 'commands:');
    await winGame(page);
  },
});

// Removing the page-source key material must not crash the game.
scenarios.push({
  name: 'reduced: missing key material -> sealed key fallback',
  contextOptions: REDUCED,
  allowConsole: [/Level 01 key material/],
  async beforeLoad({ page }) {
    await page.route(/\/(index\.html)?$/, async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<meta name="sdb9-part-one"[^>]*>/, '');
      await route.fulfill({ response, body });
    });
  },
  async run({ page }) {
    const present = await page.evaluate(() => !!document.querySelector('meta[name="sdb9-part-one"]'));
    if (present) throw new Error('test setup: the meta tag should have been removed');
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await waitOutput(page, 'sdb9: integrity check failed, using sealed key');
    await winGame(page);
  },
});

// Keyboard focus (review item 11): the terminal must not steal focus from controls.
scenarios.push({
  name: 'reduced: keyboard focus is not hijacked by the terminal',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    const active = () => page.evaluate(() => {
      const el = document.activeElement;
      return el?.id || el?.className || el?.tagName;
    });
    await sendCommand(page, 'cat sdb9.lock'); // the first discovery reveals the CASE FILE trigger
    await waitOutput(page, 'status:   LOCKED');
    const caseVisible = await page.evaluate(() => !document.getElementById('caseTrigger').hidden);
    if (!caseVisible) throw new Error('test setup: the CASE FILE trigger should be visible in the shell');

    // Tab reaches the CASE FILE and DEV triggers.
    await page.evaluate(() => document.activeElement?.blur());
    const reached = new Set();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      reached.add(await active());
    }
    for (const needed of ['caseTrigger', 'developer-trigger']) {
      if (![...reached].some((name) => name.includes(needed))) {
        throw new Error(`Tab never reached ${needed}; reached ${JSON.stringify([...reached])}`);
      }
    }

    // Keys that are not typing must leave a focused control alone.
    await page.locator('#caseTrigger').focus();
    for (const key of ['Shift', 'ArrowRight', 'ArrowDown', 'Escape']) await page.keyboard.press(key);
    if ((await active()) !== 'caseTrigger') throw new Error(`focus was stolen from the CASE FILE button: ${await active()}`);
    // Even a printable key pressed on a control stays on that control (Space/Enter activate it).
    await page.keyboard.press('x');
    if ((await active()) !== 'caseTrigger') throw new Error(`typing on a control moved focus to ${await active()}`);

    // Typing with nothing focused still goes to the terminal.
    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.type('help');
    await page.keyboard.press('Enter');
    await waitOutput(page, 'commands:');

    // No modal is open here, so while one is, the terminal must stay out of the way.
    await page.evaluate(() => {
      const dialog = document.createElement('dialog');
      dialog.id = 'probeDialog';
      dialog.innerHTML = '<button id="probeButton" type="button">ok</button>';
      document.body.appendChild(dialog);
      dialog.showModal();
    });
    await page.keyboard.press('q');
    if ((await active()) === 'tty-input') throw new Error('the terminal stole focus while a modal dialog was open');
    await page.evaluate(() => document.getElementById('probeDialog').remove());
  },
});

// Rain (review items 8 and 20): a page loaded with reduced motion must start the rain when the user
// later turns reduced motion off. The old fx.js decided once, at load, and never started.
scenarios.push({
  name: 'reduced: rain starts after reduced motion is switched off',
  contextOptions: REDUCED,
  async run({ page }) {
    const globals = await page.evaluate(() => ['setRain', 'syncRainMotion'].filter((name) => name in window));
    if (globals.length) throw new Error(`rain globals still on window: ${globals}`);
    const probe = () => page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.id = 'rainProbe';
      canvas.style.cssText = 'position:fixed;inset:0;width:200px;height:200px;opacity:0';
      document.body.appendChild(canvas);
      canvas.getContext('2d', { willReadFrequently: true }); // the test reads pixels repeatedly
      const { createRain } = await import('/js/rain.js');
      const rain = createRain(canvas);
      window.__rainProbe = rain; // test-only handle, lives in the test page
      rain.setOpacity(0.5);
      return canvas.style.opacity;
    });
    const whileReduced = await probe();
    if (whileReduced !== '0') throw new Error(`rain must be hidden while reduced motion is on, opacity=${whileReduced}`);
    const painted = () => page.evaluate(() => {
      const canvas = document.getElementById('rainProbe');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    });
    await sleep(400);
    if (await painted()) throw new Error('rain drew frames while reduced motion was on');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.getElementById('rainProbe').style.opacity === '0.5', null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const canvas = document.getElementById('rainProbe');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    }, null, { timeout: 5000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.getElementById('rainProbe').style.opacity === '0', null, { timeout: 5000 });
    await page.evaluate(() => window.__rainProbe.destroy());
  },
});

// Audio lint: play every synthesized cue (and every ambient bed) in an OfflineAudioContext, then render.
// Catches throwing cues, unknown cue names and NaN samples. (Voice clip excluded: it is a file, not a synth.)
scenarios.push({
  name: 'reduced: every audio cue renders offline without errors',
  contextOptions: REDUCED,
  async run({ page }) {
    const result = await page.evaluate(async () => {
      const source = await (await fetch('/js/audio.js')).text();
      const cues = [...new Set([...source.matchAll(/case '([a-z0-9-]+)':/g)].map((m) => m[1]))]
        .filter((name) => name !== 'hello-friend');
      const { createAudioController } = await import('/js/audio.js');
      const failures = [];
      const rate = 22050;
      const offline = new OfflineAudioContext(1, rate * 6, rate);
      const audio = createAudioController({ context: offline });
      audio.prepare();
      for (const cue of cues) {
        try { audio.play(cue); } catch (error) { failures.push(`${cue}: ${error.message}`); }
      }
      for (const scene of ['boot', 'story', 'puzzle', 'ghost', 'reveal', 'shutdown', 'idle']) {
        try { audio.setScene(scene); } catch (error) { failures.push(`scene ${scene}: ${error.message}`); }
      }
      const buffer = await offline.startRendering();
      const samples = buffer.getChannelData(0);
      let bad = 0;
      let peak = 0;
      for (const value of samples) {
        if (!Number.isFinite(value)) bad++;
        else peak = Math.max(peak, Math.abs(value));
      }
      return { count: cues.length, failures, bad, peak };
    });
    if (result.count < 50) throw new Error(`expected 50+ cues, found ${result.count} (did the regex stop matching?)`);
    if (result.failures.length) throw new Error(`cues failed: ${result.failures.join('; ')}`);
    if (result.bad) throw new Error(`${result.bad} non-finite samples in the rendered audio`);
    if (result.peak === 0) throw new Error('rendered audio is silent');
  },
});

// The Elliot echo has nested timers; aborting must remove the element and cancel both of them.
scenarios.push({
  name: 'reduced: aborting removes the Elliot echo and its timers',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await sendCommand(page, 'unlock elliot');
    await page.waitForSelector('.elliot-echo', { timeout: 5000 });
    await devRoute(page, 'logo');
    const left = await page.evaluate(() => ({
      echo: document.querySelectorAll('.elliot-echo').length,
      present: document.getElementById('screen').classList.contains('elliot-present'),
    }));
    if (left.echo || left.present) throw new Error(`echo left behind after abort: ${JSON.stringify(left)}`);
  },
});

// Accessibility basics (review items 13, 14, 15): log role, hidden canvas, native modal dialogs
// that Escape cannot dismiss.
scenarios.push({
  name: 'reduced: log role, hidden canvas and non-dismissable native dialogs',
  contextOptions: REDUCED,
  async run({ page }) {
    const markup = await page.evaluate(() => ({
      canvasHidden: document.getElementById('rain').getAttribute('aria-hidden'),
      logRole: document.getElementById('output').getAttribute('role'),
      logLive: document.getElementById('output').getAttribute('aria-live'),
      launchIsDialog: document.getElementById('launch').tagName,
      powerIsDialog: document.getElementById('powerPanel').tagName,
      launchOpen: document.getElementById('launch').open,
      powerOpen: document.getElementById('powerPanel').open,
      hasRoleDialogDivs: document.querySelectorAll('div[role="dialog"]').length,
    }));
    const expected = { canvasHidden: 'true', logRole: 'log', logLive: 'off', launchIsDialog: 'DIALOG',
      powerIsDialog: 'DIALOG', launchOpen: true, powerOpen: false, hasRoleDialogDivs: 0 };
    for (const [key, value] of Object.entries(expected)) {
      if (markup[key] !== value) throw new Error(`markup ${key}: expected ${value}, got ${markup[key]} (${JSON.stringify(markup)})`);
    }
    // The launch screen is modal: the page behind it is inert, and Escape (even twice) does not close it.
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(150); }
    // Chrome may close the dialog on a repeated Escape; the page must reopen it right away (poll, do not
    // sample once: the reopen is a queued task and can lag on a loaded machine).
    await page.waitForFunction(() => document.getElementById('launch').open, null, { timeout: 3000 })
      .catch(() => { throw new Error('Escape closed the launch dialog and it did not reopen'); });
    const focused = await page.evaluate(() => document.activeElement?.id);
    if (focused !== 'initialize') throw new Error(`initial focus should be the initialize button, got ${focused}`);
    await playToShell(page, { who: 'watcher', how: 'type', reduced: true });
    await loseByLockout(page);
    for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(150); }
    await page.waitForFunction(() => document.getElementById('powerPanel').open, null, { timeout: 3000 })
      .catch(() => { throw new Error('Escape closed the power panel and it did not reopen'); });
    const power = await page.evaluate(() => ({
      open: document.getElementById('powerPanel').open,
      focus: document.activeElement?.id,
    }));
    if (!power.open) throw new Error('Escape closed the power panel');
    if (power.focus !== 'restartControl') throw new Error(`power panel focus should be the reboot button, got ${power.focus}`);
    await rebootAndVerify(page, { reduced: true });
  },
});

// Screen-reader announcements: completed story lines are announced, boot spam and half-typed text are not.
scenarios.push({
  name: 'reduced: screen-reader announcer gets finished lines only',
  contextOptions: REDUCED,
  async run({ page }) {
    const entries = () => page.evaluate(() => [...document.getElementById('srAnnouncer').children].map((el) => el.textContent));
    await initialize(page);
    // Nothing from the BIOS may be announced.
    await sleep(300);
    const early = await entries();
    if (early.some((text) => /FSOC-BIOS|Linux version|BIOS-e820|\[\s+\d+\.\d+\]/.test(text))) {
      throw new Error(`boot spam was announced: ${JSON.stringify(early.slice(0, 5))}`);
    }
    await reachTrustChoice(page, { reduced: true });
    await chooseTrust(page, 'unknown', 'click');
    await reachPuzzle(page);
    const live = await page.evaluate(() => {
      const region = document.getElementById('srAnnouncer');
      return { live: region.getAttribute('aria-live'), srOnly: region.classList.contains('sr-only') };
    });
    if (live.live !== 'polite' || !live.srOnly) throw new Error(`announcer must be a polite sr-only region: ${JSON.stringify(live)}`);
    const afterStory = await entries();
    if (!afterStory.includes('unknown says: type help.')) throw new Error(`dialogue line not announced: ${JSON.stringify(afterStory)}`);
    if (afterStory.length > 12) throw new Error(`announcer is not capped: ${afterStory.length} entries`);
    if (afterStory.some((text) => text.length < 3)) throw new Error(`fragments announced: ${JSON.stringify(afterStory)}`);
    await sendCommand(page, 'nonsense');
    await waitOutput(page, 'command not found: nonsense');
    if (!(await entries()).includes('command not found: nonsense')) throw new Error('command result not announced');
    // A new run starts with a clean region.
    await devRoute(page, 'logo');
    if ((await entries()).includes('unknown says: type help.')) throw new Error('announcer kept messages from the aborted run');
  },
});

// --- aborting the story at four different moments ---------------------------------------------

async function currentSessionHandle(page) {
  return page.evaluateHandle(async () => (await import('/js/session.js')).currentSession());
}

// Starts a developer route (which aborts the running story) and checks the old session is gone.
async function devRoute(page, action) {
  const old = await currentSessionHandle(page);
  await page.click('.developer-trigger');
  await page.click(`.developer-action[data-action="${action}"]`);
  await page.waitForFunction((session) => session.isAborted(), old, { timeout: 15000 });
  await sleep(250);
  const pending = await old.evaluate((session) => session.pending());
  if (pending !== 0) throw new Error(`aborted session still has ${pending} live handle(s)`);
  const replaced = await page.evaluate(async (previous) => (await import('/js/session.js')).currentSession() !== previous, old);
  if (!replaced) throw new Error('no fresh session after the developer route');
}

async function expectSingleStream(page, label) {
  await sleep(1200);
  const state = await snapshotRun(page);
  expectClean(state, [
    [state.streams === 1, `${label}: more than one #output`],
    [state.bios <= 1, `${label}: BIOS header duplicated`],
    [state.cpu <= 1, `${label}: boot lines duplicated (two story streams?)`],
    [state.overlays === 0, `${label}: overlay leftovers`],
    [state.huds <= 1, `${label}: more than one HUD`],
  ]);
}

scenarios.push({
  name: 'desktop: abort at BIOS, intro, trust choice and mid-puzzle',
  contextOptions: DESKTOP,
  async run({ page }) {
    await initialize(page);

    await sleep(2500); // 1) during the BIOS
    // The BIOS is printing right now: none of it may reach the screen-reader region.
    const biosAnnounced = await page.evaluate(() => document.getElementById('srAnnouncer').children.length);
    if (biosAnnounced !== 0) throw new Error(`${biosAnnounced} BIOS line(s) were announced to screen readers`);
    await devRoute(page, 'boot');
    await expectSingleStream(page, 'after aborting the BIOS');

    await holdSkip(page, 'BOOT'); // 2) during the intro
    await waitOutput(page, '*** INCOMING TRANSMISSION ***', 60000);
    await sleep(1500);
    // The story's rain is on (setRain(0.22) just ran) and the live canvas is painting.
    await page.waitForFunction(() => document.getElementById('rain').style.opacity === '0.22', null, { timeout: 5000 });
    await page.waitForFunction(() => {
      const canvas = document.getElementById('rain');
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
      return false;
    }, null, { timeout: 5000 });
    await devRoute(page, 'boot');
    await expectSingleStream(page, 'after aborting the intro');

    await reachTrustChoice(page, { reduced: false }); // 3) at the trust choice
    await devRoute(page, 'boot');
    await expectSingleStream(page, 'after aborting the trust choice');

    await devRoute(page, 'puzzle'); // 4) mid-puzzle
    await waitOutput(page, 'LOCAL TEST ROUTE');
    await waitShown(page, '#promptLine');
    await sendCommand(page, 'help');
    await devRoute(page, 'boot');
    await expectSingleStream(page, 'after aborting the puzzle');

    // The final run must still play through normally.
    await reachTrustChoice(page, { reduced: false });
    await chooseTrust(page, 'watcher', 'type');
    await reachPuzzle(page);
    await loseByLockout(page);
  },
});

// --------------------------------------------------------------------- runner

async function runScenario(browser, server, scenario) {
  const started = Date.now();
  const problems = [];
  const context = await browser.newContext(scenario.contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  watch(page, problems, scenario.allowConsole);
  try {
    if (scenario.beforeLoad) await scenario.beforeLoad({ page, context });
    await page.goto(server.url);
    await scenario.run({ page, context, server });
    await sleep(300);
  } catch (error) {
    problems.unshift(`scenario failed: ${error.message.split('\n')[0]}`);
    const stack = (error.stack ?? '').split('\n').find((l) => l.includes('smoke.mjs') && !l.includes('waitOutput'));
    if (stack) problems.push(`at ${stack.trim()}`);
    try {
      const tail = await page.evaluate(() => {
        const rows = [...document.getElementById('output').children].map((el) => el.textContent.trim()).filter(Boolean);
        return rows.slice(-8);
      });
      problems.push(`last output lines: ${JSON.stringify(tail)}`);
      if (process.env.SMOKE_SHOTS) {
        const file = path.join(process.env.SMOKE_SHOTS, `${scenario.name.replace(/\W+/g, '-')}.png`);
        await page.screenshot({ path: file });
        problems.push(`screenshot: ${file}`);
      }
    } catch { /* page already gone */ }
  }
  await context.close();
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${scenario.name}  (${seconds}s)`);
  for (const problem of problems) console.log(`      - ${problem}`);
  return problems.length === 0;
}

if (flag('list')) {
  scenarios.forEach((s) => console.log(s.name));
  process.exit(0);
}

const only = option('only');
const selected = scenarios.filter((s) => !only || s.name.includes(only));
if (!selected.length) {
  console.error(`No scenario matches "${only}".`);
  process.exit(2);
}

const { chromium } = loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--autoplay-policy=no-user-gesture-required'],
});
console.log(`serving ${siteDir} at ${server.url}\nrunning ${selected.length} scenario(s)${flag('serial') ? ' serially' : ' in parallel'}\n`);

let results;
if (flag('serial')) {
  results = [];
  for (const scenario of selected) results.push(await runScenario(browser, server, scenario));
} else {
  results = await Promise.all(selected.map((scenario) => runScenario(browser, server, scenario)));
}
await browser.close();
server.close();

const failed = results.filter((ok) => !ok).length;
console.log(`\n${failed ? `${failed} of ${results.length} scenario(s) FAILED` : `all ${results.length} scenario(s) passed`}`);
process.exit(failed ? 1 : 0);
