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
    await devRoute(page, 'boot');
    await expectSingleStream(page, 'after aborting the BIOS');

    await holdSkip(page, 'BOOT'); // 2) during the intro
    await waitOutput(page, '*** INCOMING TRANSMISSION ***', 60000);
    await sleep(1500);
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
