#!/usr/bin/env node
// End-to-end smoke test for the fsociety00 game. See tools/README.md.
//
//   node tools/smoke.mjs [--only=<substring>] [--list] [--serial] [--jobs=<n>] [--headed]

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
  // The ghost script closed the trace request (phase 3.5): the HUD says so and the clock is stopped.
  const closed = await page.evaluate(() => document.querySelector('#hud .lbl')?.textContent);
  if (closed !== 'TRACE CLOSED') throw new Error(`after ghost.sh the HUD should read TRACE CLOSED, reads ${closed}`);
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
      bios: count('FSOC-BIOS v3.1.4'),
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
    await waitOutput(page, 'FSOC-BIOS v3.1.4');
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

// Phase 4b.0b: the real window after the trust choice is five minutes (the other scenarios run with TEST_WINDOW).
scenarios.push({
  name: 'reduced: the shipped trace window after the trust choice is five minutes',
  contextOptions: REDUCED,
  shippedWindow: true,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await waitOutput(page, 'ETA RESET: 05:00');
    await waitOutput(page, 'five minutes. no extensions.');
    const clock = await page.evaluate(() => document.querySelector('#hud .num')?.textContent ?? '');
    const [minutes, seconds] = clock.split(':').map(Number);
    const left = minutes * 60 + seconds;
    if (!(left >= 285 && left <= 300)) throw new Error(`the HUD should read about 05:00 right after the trust choice, reads ${clock}`);
  },
});

// Phase 4b.1: the CASE FILE button stays hidden until the story mentions the case file (right after the inbox message)
// and is available from then on, on both routes. The real-time run proves it is hidden at the start and that the
// node still runs when the intro is skipped; the reduced-motion run is the quick check of the whole path.
for (const who of ['unknown', 'watcher']) {
  scenarios.push({
    name: `desktop: the CASE FILE button is hidden at the start and available after the skipped intro (trust ${who})`,
    contextOptions: DESKTOP,
    async run({ page }) {
      await initialize(page);
      const triggerHidden = () => page.evaluate(() => document.getElementById('caseTrigger').hidden);
      if (!(await triggerHidden())) throw new Error('the CASE FILE button must be hidden before the story mentions the case file');
      await reachTrustChoice(page, { reduced: false });
      if (await triggerHidden()) throw new Error('the CASE FILE button must be visible once the intro (skipped) has passed the inbox message');
      await chooseTrust(page, who, 'click');
      await reachPuzzle(page);
      await sendCommand(page, 'board');
      await page.waitForSelector('dialog.case-dialog[open]');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    },
  });
}
scenarios.push({
  name: 'reduced: the CASE FILE button is available at the trust choice and opens the board',
  contextOptions: REDUCED,
  async run({ page }) {
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    const shown = await page.evaluate(() => {
      const button = document.getElementById('caseTrigger');
      return !button.hidden && button.getAttribute('aria-label');
    });
    if (!shown) throw new Error('the CASE FILE button should be visible at the trust choice');
    await page.locator('#caseTrigger').click();
    await page.waitForSelector('dialog.case-dialog[open]');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    await chooseTrust(page, 'unknown', 'click');
    await reachPuzzle(page);
  },
});
scenarios.push({
  name: 'desktop: a developer jump into the puzzle makes the case file available',
  contextOptions: DESKTOP,
  async run({ page }) {
    await initialize(page);
    await devRoute(page, 'puzzle');
    await waitShown(page, '#caseTrigger', 30000);
    await sendCommand(page, 'board');
    await page.waitForSelector('dialog.case-dialog[open]');
    await page.keyboard.press('Escape');
  },
});

// Phase 4b.2: the third voice explains the case file right after the inbox message, in blue, as <???>.
scenarios.push({
  name: 'reduced: the third voice <???> explains the case file after the inbox message',
  contextOptions: REDUCED,
  async run({ page }) {
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    const log = await page.evaluate(() => {
      const rows = [...document.getElementById('output').children];
      const texts = rows.map((row) => row.textContent.trim());
      const first = rows.find((row) => row.textContent.startsWith('<???> '));
      const tag = first?.children[0];
      return {
        texts,
        tagClass: tag?.className ?? '',
        tagColor: tag ? getComputedStyle(tag).color : '',
        textColor: first ? getComputedStyle(first.children[1]).color : '',
      };
    });
    const at = (needle) => log.texts.findIndex((text) => text.includes(needle));
    const lines = [
      '<???> the case file is in the corner.',
      '<???> open it. record what you find.',
      '<???> every record is a piece. none of them is the whole.',
      '<???> two pieces that belong together will say so. connect them.',
      '<???> evidence is not identity.',
      '<???> a name on a screen is only a name.',
      '<???> scan finds what is hidden. decrypt opens what is sealed.',
      '<???> both cost time. the trace does not wait.',
      '<???> what you do not hold, the trace will take.',
      '<???> this line is encrypted. the agency logs it anyway.',
      '<???> the board has a line of its own. type help.',
      '<???> it is optional. use it.',
    ];
    const order = [at('cat ~/inbox/001.msg'), at('*** new connection: ??? ***'), ...lines.map((text) => at(text)), at('*** ??? disconnected ***'), at('=== LEVEL 01 :: THE KEY ===')];
    if (order.some((index) => index < 0) || order.some((index, i) => i > 0 && index <= order[i - 1])) {
      throw new Error(`the third voice should speak in order between the inbox message and the level brief: ${JSON.stringify(order)}`);
    }
    if (log.tagClass !== 'voice-blue' || log.tagColor !== 'rgb(77, 166, 255)' || log.textColor !== 'rgb(77, 166, 255)') {
      throw new Error(`the <???> tag and text should be blue: ${JSON.stringify({ tagClass: log.tagClass, tagColor: log.tagColor, textColor: log.textColor })}`);
    }
  },
});

// Phase 4.3: the hacking commands build the case file in real time and the key is still solved afterwards.
scenarios.push({
  name: 'desktop: scan, intercept, dump, decrypt, connect -> victory',
  contextOptions: DESKTOP,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'type', reduced: false });
    await sendCommand(page, 'scan');
    await waitOutput(page, 'new nodes: 2', 30000);
    await sleep(500);
    await sendCommand(page, 'intercept');
    await waitOutput(page, 'captured: e10', 30000);
    await sleep(500);
    await sendCommand(page, 'dump relay/handshake.log');
    await waitOutput(page, '[evidence] e12');
    await sendCommand(page, 'connect e10 e12');
    await waitOutput(page, 'no relation between e10 and e12');
    await sendCommand(page, 'trace --status');
    await waitOutput(page, 'hops remaining:');
    const leaked = await page.evaluate(() => /sdb9-part|ghost[-\s]shell|shell[-\s]1337/i.test(document.getElementById('output').textContent.replace(/unlock ghost shell 1337/g, '')));
    if (leaked) throw new Error('a hacking command printed a key layer');
    await winGame(page);
  },
});

// Phase 4.3: a decrypt runs to the end, then the trace ends -> clean game over; reboot leaves no job or timer behind.
// (The trace ending in the middle of a decrypt is covered in tools/validate-story.mjs: a record cannot be decrypted
// late enough in the UI because the volatile records are overwritten before the last seconds.)
scenarios.push({
  name: 'desktop: decrypt, then trace expiry -> game over -> reboot',
  contextOptions: DESKTOP,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'type', reduced: false });
    await sendCommand(page, 'scan');
    await waitOutput(page, 'new nodes: 2', 30000);
    await sleep(500);
    await sendCommand(page, 'decrypt e13');
    await waitOutput(page, '[ok] decrypted: ', 30000);
    await sleep(500);
    await loseByTraceExpiry(page);
    await rebootAndVerify(page, { reduced: false });
    await sleep(500);
    const pending = await page.evaluate(async () => (await import('/js/session.js')).currentSession().pending());
    if (pending > 6) throw new Error(`${pending} timer handle(s) look too many after the reboot`);
  },
});

// Phase 4b.3: the board command line.
const cmdLog = (page) => page.evaluate(() => document.querySelector('.case-cmd-log')?.textContent ?? '');
const waitCmd = (page, text, timeout = 20000) => page.waitForFunction((needle) => (document.querySelector('.case-cmd-log')?.textContent ?? '').includes(needle), text, { timeout })
  .catch(async () => { throw new Error(`the board log never showed "${text}": ${JSON.stringify((await cmdLog(page)).slice(-600))}`); });
async function boardCmd(page, text) {
  const input = page.locator('#caseCmdInput');
  await input.fill(text);
  await input.press('Enter');
}
const openBoardFromButton = async (page) => {
  await page.locator('#caseTrigger').click();
  await page.waitForSelector('dialog.case-dialog[open]');
};

scenarios.push({
  name: 'reduced: the board command line works with a pending trace and shares its state with the shell',
  contextOptions: REDUCED,
  async run({ page }) {
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    await openBoardFromButton(page);
    await waitCmd(page, 'type help for the board commands.');
    const trace = await page.locator('.case-trace-time').textContent();
    if (trace !== 'TRACE PENDING') throw new Error(`a pending trace must read TRACE PENDING on the board, reads "${trace}"`);
    await boardCmd(page, 'help');
    await waitCmd(page, 'board commands:');
    await boardCmd(page, 'cat ghost.sh');
    await waitCmd(page, 'use the shell for that');
    await boardCmd(page, 'list');
    await waitCmd(page, 'no records yet.');
    await boardCmd(page, 'scan');
    await page.waitForFunction(() => document.getElementById('caseCmdInput').readOnly, null, { timeout: 5000 });
    await waitCmd(page, 'new nodes: 2');
    await page.waitForFunction(() => !document.getElementById('caseCmdInput').readOnly, null, { timeout: 5000 });
    await boardCmd(page, 'close');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'caseTrigger') throw new Error(`closing the board from its command line should return focus to the CASE FILE button, is on ${focus}`);
    await chooseTrust(page, 'unknown', 'click');
    await reachPuzzle(page);
    await sendCommand(page, 'scan');
    await waitOutput(page, 'deep scan', 30000);
  },
});

scenarios.push({
  name: 'desktop: before the trace exists the evidence commands answer "no active link yet."',
  contextOptions: DESKTOP,
  async run({ page }) {
    await initialize(page);
    await holdSkip(page, 'BOOT');
    await waitShown(page, '#caseTrigger', 90000);
    if (await page.evaluate(() => !!document.getElementById('hud'))) throw new Error('the trace already exists: the check must run between the mention and the level brief');
    await openBoardFromButton(page);
    const trace = await page.locator('.case-trace-time').textContent();
    if (trace !== 'NO TRACE YET') throw new Error(`with no trace the board must say NO TRACE YET, says "${trace}"`);
    await boardCmd(page, 'scan');
    await waitCmd(page, 'no active link yet.');
    await boardCmd(page, 'connect e10 e11');
    await boardCmd(page, 'list');
    await waitCmd(page, 'no records yet.');
    const log = await cmdLog(page);
    if ((log.match(/no active link yet\./g) ?? []).length !== 2) throw new Error(`scan and connect should both be refused: ${JSON.stringify(log)}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
  },
});

scenarios.push({
  name: 'reduced: phone board command line, open selects a record, input stays visible',
  contextOptions: { ...MOBILE, reducedMotion: 'reduce' },
  async run({ page }) {
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    await openBoardFromButton(page);
    await page.locator('#caseTab-commands').click();
    await page.waitForSelector('#casePane-commands:not([hidden])');
    const tab = await page.locator('#caseTab-commands').boundingBox();
    if (tab.height < 44) throw new Error(`the COMMANDS tab is ${tab.height}px high, below 44px`);
    await boardCmd(page, 'scan');
    await waitCmd(page, 'new nodes: 2');
    await boardCmd(page, 'dump relay/handshake.log');
    await waitCmd(page, '[evidence] e12');
    await boardCmd(page, 'open e12');
    await waitCmd(page, 'selected e12');
    await page.waitForSelector('#casePane-evidence:not([hidden])');
    const selected = await page.evaluate(() => document.querySelector('.case-row[aria-current="true"]')?.textContent ?? '');
    if (!selected.includes('e12')) throw new Error(`open e12 should select the row, selected: ${JSON.stringify(selected)}`);
    await page.locator('#caseTab-commands').click();
    const logBox = await page.locator('.case-cmd-log').boundingBox();
    if (!logBox || logBox.height < 120) throw new Error(`the command output area is ${logBox?.height}px high on a phone: the output must be visible`);
    const box = await page.locator('#caseCmdInput').boundingBox();
    const view = await page.evaluate(() => ({ height: window.innerHeight, width: window.innerWidth, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    if (!box || box.y < 0 || box.y + box.height > view.height || box.x < 0 || box.x + box.width > view.width) throw new Error(`the command input is not fully visible: ${JSON.stringify({ box, view })}`);
    if (box.height < 44) throw new Error(`the command input is ${box.height}px high, below 44px`);
    const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.case-pane--commands *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize))));
    if (smallest < 11 || view.overflow) throw new Error(`command pane text ${smallest}px, page overflow ${view.overflow}`);
  },
});

scenarios.push({
  name: 'reduced: board command line works with the keyboard only (history, close, focus return)',
  contextOptions: REDUCED,
  async run({ page }) {
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    await page.locator('#caseTrigger').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.case-dialog[open]');
    let reached = false;
    for (let i = 0; i < 60 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.id === 'caseCmdInput');
    }
    if (!reached) throw new Error('the command input cannot be reached with the Tab key');
    await page.keyboard.type('list');
    await page.keyboard.press('Enter');
    await waitCmd(page, 'no records yet.');
    await page.keyboard.press('ArrowUp');
    const recalled = await page.locator('#caseCmdInput').inputValue();
    if (recalled !== 'list') throw new Error(`ArrowUp should recall the last command, input is "${recalled}"`);
    await page.keyboard.press('Control+A');
    await page.keyboard.type('close');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'caseTrigger') throw new Error(`focus should return to the CASE FILE button, is on ${focus}`);
    const live = await page.evaluate(() => { const board = document.querySelector('.case-cmd-log'); return board; });
    if (live) throw new Error('the board (and its command pane) should be gone after close');
  },
});

scenarios.push({
  name: 'reduced: a reboot during a board decrypt leaves no job, timer or log behind',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await sendCommand(page, 'board');
    await page.waitForSelector('dialog.case-dialog[open]');
    await boardCmd(page, 'scan');
    await waitCmd(page, 'new nodes: 2');
    await boardCmd(page, 'decrypt e13');
    await page.waitForFunction(() => document.getElementById('caseCmdInput').readOnly, null, { timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    await devRoute(page, 'puzzle');
    await waitShown(page, '#promptLine', 30000);
    await page.locator('#caseTrigger').click();
    await page.waitForSelector('dialog.case-dialog[open]');
    const log = await cmdLog(page);
    if (log.includes('decrypting') || log.includes('new nodes')) throw new Error(`the new run kept the old board log: ${JSON.stringify(log)}`);
    const busy = await page.evaluate(() => document.getElementById('caseCmdInput').readOnly);
    if (busy) throw new Error('the board input is still locked after the reboot');
    await boardCmd(page, 'scan');
    await waitCmd(page, 'new nodes: 2');
  },
});

// Phase 4.5: the evidence board is a native dialog with four panes (wide) or four tabs (phone); phase 4b.3 adds the
// board command line as a fifth pane (wide) or tab (phone).
async function buildBoardEvidence(page) {
  await sendCommand(page, 'scan');
  await waitOutput(page, 'new nodes: 2', 30000);
  await sendCommand(page, 'dump relay/handshake.log');
  await waitOutput(page, '[evidence] e12');
  await sendCommand(page, 'decrypt e13');
  await waitOutput(page, '[ok] decrypted:', 30000);
}

const boardState = (page) => page.evaluate(() => {
  const dialog = document.querySelector('dialog.case-dialog');
  const visible = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
  return {
    open: !!dialog?.open,
    legacyDialogs: document.querySelectorAll('div[role="dialog"]').length,
    panes: [...document.querySelectorAll('.case-pane')].filter(visible).map((el) => el.id),
    tabsVisible: visible(document.querySelector('.case-tabs')),
    nodes: document.querySelectorAll('.case-node').length,
    rows: [...document.querySelectorAll('.case-row')].map((el) => el.textContent),
    live: dialog?.querySelector('[role="status"]')?.textContent ?? '',
    focusInside: !!dialog?.contains(document.activeElement),
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    paneOverflow: [...document.querySelectorAll('.case-pane-body')].filter(visible).some((el) => el.scrollWidth > el.clientWidth + 1),
    smallest: Math.min(...[...dialog?.querySelectorAll('*') ?? []].filter((el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).map((el) => parseFloat(getComputedStyle(el).fontSize))),
  };
});

for (const [label, contextOptions] of [['desktop', REDUCED], ['mobile', { ...MOBILE, reducedMotion: 'reduce' }]]) {
  scenarios.push({
    name: `reduced: ${label === 'mobile' ? 'phone ' : ''}evidence board dialog, map, connect, escape`,
    contextOptions,
    async run({ page }) {
      await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
      await buildBoardEvidence(page);
      await sleep(300);
      await page.locator('#caseTrigger').click();
      await page.waitForSelector('dialog.case-dialog[open]');
      let board = await boardState(page);
      if (!board.open || board.legacyDialogs !== 0) throw new Error(`board should be one native dialog: ${JSON.stringify(board)}`);
      if (!board.focusInside) throw new Error('focus should move into the board');
      if (board.pageOverflow || board.paneOverflow) throw new Error(`the board overflows horizontally: ${JSON.stringify(board)}`);
      if (board.smallest < 11) throw new Error(`board text below 11px: ${board.smallest}`);
      if (!board.rows.some((row) => row.includes('e13') && row.includes('DECRYPTED'))) throw new Error(`e13 should be listed as decrypted: ${JSON.stringify(board.rows)}`);
      await page.locator('.case-row', { hasText: 'e12' }).click();
      if (label === 'desktop') {
        if (board.panes.length !== 5 || board.tabsVisible) throw new Error(`wide layout shows five panes (four panels and the command line) and no tabs: ${JSON.stringify(board)}`);
      } else {
        if (board.panes.length !== 1 || !board.tabsVisible) throw new Error(`phone layout shows one pane and the tabs: ${JSON.stringify(board)}`);
        await page.locator('#caseTab-trace').click();
        await page.waitForSelector('#casePane-trace:not([hidden])');
        const topo = await page.evaluate(() => document.querySelectorAll('.topo-node').length);
        if (topo !== 6) throw new Error(`the trace pane should show six path nodes, shows ${topo}`);
        await page.locator('#caseTab-map').click();
        await page.waitForSelector('#casePane-map:not([hidden])');
        const inside = await page.evaluate(() => {
          const net = document.querySelector('.case-network').getBoundingClientRect();
          const node = [...document.querySelectorAll('.case-node')].find((n) => n.textContent.includes('e12')).getBoundingClientRect();
          return node.left >= net.left - 1 && node.right <= net.right + 1 && node.top >= net.top - 1 && node.bottom <= net.bottom + 1;
        });
        if (!inside) throw new Error('the selected node should be panned fully into the phone map');
        await page.locator('#caseTab-evidence').click();
        await page.waitForSelector('#casePane-evidence:not([hidden])');
      }
      if (process.env.SMOKE_SHOTS) await page.screenshot({ path: path.join(process.env.SMOKE_SHOTS, `board-${label}.png`) });
      // Connect on the board: handshake log + decrypted ledger -> intel (rows on the phone, nodes on a wide screen).
      await page.locator('.case-action').click();
      await page.locator(label === 'desktop' ? '.case-node' : '.case-row', { hasText: 'e13' }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.case-row')].some((el) => el.textContent.includes('e17')));
      board = await boardState(page);
      if (!board.live.includes('Intel')) throw new Error(`the live region should announce the intel: "${board.live}"`);
      if (board.legacyDialogs !== 0) throw new Error('a role=dialog div appeared');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
      const focus = await page.evaluate(() => document.activeElement?.id);
      if (focus !== 'caseTrigger') throw new Error(`focus should return to the CASE FILE button, is on ${focus}`);
      // Reopen from the keyboard, close with the close button.
      await page.locator('#caseTrigger').press('Enter');
      await page.waitForSelector('dialog.case-dialog[open]');
      await page.locator('.case-close').click();
      await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
      await winGame(page);
    },
  });
}

// Phase 4.6: evidence the trace overwrites is shown corrupted; the branch not taken stays as a sealed stub.
scenarios.push({
  name: 'reduced: board shows lost evidence and the sealed branch',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await sendCommand(page, 'scan');
    await waitOutput(page, 'new nodes: 2', 30000);
    await sendCommand(page, 'hint'); // -30 s: the volatile memory record (threshold 90 s) is overwritten
    await waitOutput(page, 'markup, styles, and script.', 30000);
    await sleep(1500);
    await page.locator('#caseTrigger').click();
    await page.waitForSelector('dialog.case-dialog[open]');
    const rows = await page.evaluate(() => [...document.querySelectorAll('.case-row')].map((el) => el.textContent));
    if (!rows.some((row) => row.includes('LOST'))) throw new Error(`a lost record should be listed: ${JSON.stringify(rows)}`);
    if (!rows.some((row) => row.includes('SEALED // OTHER BRANCH'))) throw new Error(`the other branch should show as a sealed stub: ${JSON.stringify(rows)}`);
    await page.locator('.case-row', { hasText: 'LOST' }).first().click();
    const detail = await page.evaluate(() => ({
      text: document.querySelector('.case-detail').textContent,
      hiddenCopy: document.querySelector('.case-lost')?.getAttribute('aria-hidden'),
      spoken: document.querySelector('.case-detail .sr-only')?.textContent,
    }));
    if (!detail.text.includes('DATA CORRUPTED') || detail.hiddenCopy !== 'true' || !detail.spoken) throw new Error(`a lost record must say so and hide its scrambled text from screen readers: ${JSON.stringify(detail)}`);
    await page.locator('.case-row', { hasText: 'SEALED' }).first().click();
    const sealed = await page.evaluate(() => document.querySelector('.case-detail').textContent);
    if (!sealed.includes('branch you did not take')) throw new Error(`the sealed stub should explain itself: ${sealed}`);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
  },
});

// Phase 4.7: the board can be used with the keyboard alone, and its accessibility tree names the dialog, list and map.
scenarios.push({
  name: 'reduced: board keyboard-only run and accessibility tree',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await buildBoardEvidence(page);
    await sleep(300);
    await page.locator('#caseTrigger').focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('dialog.case-dialog[open]');
    const focusKind = () => page.evaluate(() => {
      const el = document.activeElement;
      return el?.className?.split?.(' ')[0] || el?.tagName;
    });
    // Tab from the close button to a list row, select the second row with Enter.
    for (let i = 0; i < 6 && (await focusKind()) !== 'case-row'; i++) await page.keyboard.press('Tab');
    if ((await focusKind()) !== 'case-row') throw new Error(`Tab should reach the evidence list, is on ${await focusKind()}`);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const selected = await page.evaluate(() => document.querySelector('.case-row[aria-current="true"]')?.textContent ?? '');
    if (!selected.includes('e13')) throw new Error(`Enter on the second row should select e13, selected: "${selected}"`);
    const synced = await page.evaluate(() => document.querySelector('.case-node.is-selected')?.textContent ?? '');
    if (!synced.includes('e13')) throw new Error(`the map node should follow the list selection: "${synced}"`);
    // The map: arrows pan, + and - zoom, Home fits.
    await page.locator('.case-network').focus();
    const transform = () => page.evaluate(() => document.querySelector('.case-map-world').style.transform);
    const before = await transform();
    await page.keyboard.press('+');
    const zoomed = await transform();
    if (zoomed === before) throw new Error('+ should zoom the map');
    await page.keyboard.press('ArrowLeft');
    if ((await transform()) === zoomed) throw new Error('ArrowLeft should pan the zoomed map');
    await page.keyboard.press('Home');
    if ((await transform()) !== before) throw new Error('Home should fit the map again');
    // The accessibility tree (when this Playwright has ariaSnapshot).
    const dialog = page.locator('dialog.case-dialog');
    if (typeof dialog.ariaSnapshot === 'function') {
      const tree = await dialog.ariaSnapshot();
      for (const needle of ['dialog', 'heading "CASE FILE // INTELLIGENCE DASHBOARD"', 'button "Close the evidence board"', 'list', 'group "Evidence map']) {
        if (!tree.includes(needle)) throw new Error(`the accessibility tree misses ${needle}:\n${tree.slice(0, 600)}`);
      }
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('dialog.case-dialog'));
    const focus = await page.evaluate(() => document.activeElement?.id);
    if (focus !== 'caseTrigger') throw new Error(`focus should return to the CASE FILE button, is on ${focus}`);
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

// Phase 3.8 / 3.9: the command registry. The flavor commands answer in the story world and `clear` empties the terminal.
scenarios.push({
  name: 'reduced: registry commands, flavor commands and clear',
  contextOptions: REDUCED,
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await sendCommand(page, 'help');
    await waitOutput(page, 'commands:');
    // Phase 3.9: the registry's flavor commands answer in the story world, and `clear` empties the terminal.
    await waitOutput(page, 'system:');
    await sendCommand(page, 'ps aux');
    await waitOutput(page, '/root/ghost.sh');
    await sendCommand(page, 'cat /var/log/auth.log');
    await waitOutput(page, 'session opened for user guest');
    await sendCommand(page, 'sudo ls');
    await waitOutput(page, 'bash: sudo: permission denied');
    // `clear` removes its own echo, so sendCommand (which waits for the echo) cannot be used.
    await page.locator('.tty-input').fill('clear');
    await page.locator('.tty-input').press('Enter');
    await page.waitForFunction(() => !document.getElementById('output').textContent.includes('ghost.sh --hold'));
    await sendCommand(page, 'whoami'); // still alive after clear
    await waitOutput(page, 'guest (uid=1000)');
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

// Audio smoke: play every registered synth cue (and every scene) in an OfflineAudioContext, then render.
// Catches throwing cues, unknown cue names (console.warn fails any scenario) and NaN samples. The deep checks
// (levels, tails, crossfades, rate limits, stopAll) live in tools/audio-lint.mjs.
// The voice clip is a file, not a synth, so the registry marks it `synth: false`.
scenarios.push({
  name: 'reduced: every audio cue renders offline without errors',
  contextOptions: REDUCED,
  async run({ page }) {
    const result = await page.evaluate(async () => {
      const { createAudioController } = await import('/js/audio.js');
      const failures = [];
      const rate = 22050;
      const offline = new OfflineAudioContext(1, rate * 6, rate);
      const audio = createAudioController({ context: offline });
      audio.prepare();
      const registry = audio.list();
      const cues = registry.filter((entry) => entry.kind !== 'bed' && entry.synth);
      for (const entry of cues) {
        for (const params of entry.samples?.length ? entry.samples : [{}]) {
          try { audio.play(entry.name, params); } catch (error) { failures.push(`${entry.name}: ${error.message}`); }
        }
      }
      for (const scene of ['boot', 'story', 'puzzle', 'ghost', 'reveal', 'shutdown', 'intrusion', 'idle']) {
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
      return { count: cues.length, beds: registry.filter((entry) => entry.kind === 'bed').length, failures, bad, peak };
    });
    if (result.count < 60) throw new Error(`expected 60+ synth cues in audio.list(), found ${result.count}`);
    if (result.beds < 4) throw new Error(`expected 4 ambient beds in audio.list(), found ${result.beds}`);
    if (result.failures.length) throw new Error(`cues failed: ${result.failures.join('; ')}`);
    if (result.bad) throw new Error(`${result.bad} non-finite samples in the rendered audio`);
    if (result.peak === 0) throw new Error('rendered audio is silent');
    if (result.peak > 0.89) throw new Error(`rendered audio peaks at ${result.peak.toFixed(3)}, over the -1 dBFS ceiling`);
  },
});

// Test-only probe, installed before any game script runs. It counts AudioContexts and tracks every started
// source node until it ends, so a scenario can see what is still sounding without the game exposing anything.
function installAudioProbe() {
  const probe = { contexts: 0, started: 0, noise: 0, nodes: new Set() };
  window.__audioProbe = probe;
  const Base = window.AudioContext;
  window.AudioContext = class extends Base {
    constructor(...options) {
      super(...options);
      probe.contexts++;
    }
  };
  for (const Type of [OscillatorNode, AudioBufferSourceNode, ConstantSourceNode]) {
    const start = Type.prototype.start;
    Type.prototype.start = function probedStart(...parameters) {
      const entry = { at: performance.now() };
      probe.started++;
      if (Type === AudioBufferSourceNode) probe.noise++; // key clicks are noise bursts; trace pings are plain oscillators
      probe.nodes.add(entry);
      this.addEventListener('ended', () => probe.nodes.delete(entry), { once: true });
      return start.apply(this, parameters);
    };
  }
}

// Audio must not exist before the launch click (autoplay policy and the project rule).
scenarios.push({
  name: 'reduced: no AudioContext exists before the launch click',
  contextOptions: REDUCED,
  async beforeLoad({ page }) { await page.addInitScript(installAudioProbe); },
  async run({ page }) {
    await page.waitForFunction(() => document.getElementById('launch').open, null, { timeout: 10000 });
    await sleep(1200);
    const before = await page.evaluate(() => ({ contexts: window.__audioProbe.contexts, nodes: window.__audioProbe.nodes.size }));
    if (before.contexts !== 0 || before.nodes !== 0) throw new Error(`audio started before the click: ${JSON.stringify(before)}`);
    await initialize(page);
    await page.waitForFunction(() => window.__audioProbe.contexts === 1, null, { timeout: 5000 })
      .catch(() => { throw new Error('the launch click did not create exactly one AudioContext'); });
  },
});

// body.quiet-motion is an app-level switch that must work on its own, without the media query.
scenarios.push({
  name: 'desktop: quiet-motion class alone fast-forwards the story and flattens animations',
  contextOptions: DESKTOP,
  async run({ page }) {
    const media = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (media) throw new Error('this scenario needs the reduced-motion media query to be off');
    await page.evaluate(() => document.body.classList.add('quiet-motion'));
    const flattened = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.animation = 'probe-spin 5s linear infinite';
      document.body.appendChild(probe);
      const style = getComputedStyle(probe);
      const result = { duration: parseFloat(style.animationDuration), iterations: style.animationIterationCount };
      probe.remove();
      return result;
    });
    if (flattened.duration > 0.001 || flattened.iterations !== '1') {
      throw new Error(`quiet-motion did not flatten animations: ${JSON.stringify(flattened)}`);
    }
    // The story's wait() helper resolves immediately under quiet-motion, so the trust choice appears
    // without holding the skip control (a real-time boot takes minutes).
    await initialize(page);
    await reachTrustChoice(page, { reduced: true });
    await chooseTrust(page, 'unknown', 'click');
    await reachPuzzle(page);
    const stillMedia = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (stillMedia) throw new Error('the media query turned on during the scenario');
  },
});

// Typing sounds (extra 6): real keystrokes tick, but never faster than the cue's limit, and keys that are not
// typing (Shift, arrows, Tab, shortcuts, held-down repeats) do not tick at all. Only noise-buffer sources are
// counted: every key-tick has one or two, while the once-per-second trace ping is a plain oscillator.
scenarios.push({
  name: 'reduced: typing ticks are rate limited and ignore modifier and navigation keys',
  contextOptions: REDUCED,
  async beforeLoad({ page }) { await page.addInitScript(installAudioProbe); },
  async run({ page }) {
    await playToShell(page, { who: 'unknown', how: 'click', reduced: true });
    await sleep(1500); // let the story's own sounds finish
    const input = page.locator('.tty-input');
    await input.focus();
    const clicks = () => page.evaluate(() => window.__audioProbe.noise);
    const quiet = await clicks();
    for (const key of ['Shift', 'Control', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) await page.keyboard.press(key);
    for (const shortcut of ['Control+a', 'Control+c', 'Alt+x']) await page.keyboard.press(shortcut);
    await sleep(200);
    if ((await clicks()) !== quiet) throw new Error('modifier keys, navigation keys or shortcuts made typing sounds');
    await page.keyboard.down('a');
    for (let i = 0; i < 20; i++) await page.keyboard.down('a'); // auto-repeat: event.repeat is true
    await page.keyboard.up('a');
    await sleep(200);
    const afterOne = (await clicks()) - quiet;
    if (afterOne > 2) throw new Error(`key repeat made sound: ${afterOne} click nodes for one real keystroke`);
    if (afterOne < 1) throw new Error('a real keystroke made no sound');
    await input.fill('');
    await sleep(500);
    const before = await clicks();
    await page.keyboard.type('abcdefghijklmnopqrstuvwxyz0123', { delay: 0 }); // 30 keys in a few ms
    await sleep(200);
    const burst = (await clicks()) - before;
    // A key-tick is 1 or 2 click nodes and the limit is 15 per second: a burst of about 100 ms admits a handful.
    if (burst > 8) throw new Error(`30 instant keystrokes started ${burst} click nodes: the rate limit is not working`);
    if (burst < 1) throw new Error('typing a burst made no sound');
  },
});

// Rebooting must silence the old run: every source node that was started before the click has ended soon after.
scenarios.push({
  name: 'reduced: reboot leaves no sound from the previous run',
  contextOptions: REDUCED,
  async beforeLoad({ page }) { await page.addInitScript(installAudioProbe); },
  async run({ page }) {
    await playToShell(page, { who: 'watcher', how: 'type', reduced: true });
    await loseByLockout(page);
    const during = await page.evaluate(() => window.__audioProbe.nodes.size);
    if (during === 0) throw new Error('no source nodes were live before the reboot (the probe is broken)');
    const clickedAt = await page.evaluate(() => performance.now());
    await page.click('#restartControl');
    await sleep(1500);
    const leftover = await page.evaluate((limit) => [...window.__audioProbe.nodes].filter((entry) => entry.at < limit).length, clickedAt);
    if (leftover !== 0) throw new Error(`${leftover} source node(s) from the previous run are still live 1.5 s after the reboot click`);
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
    // The shutdown sequence can lag on a loaded machine: wait until the panel is open before pressing Escape.
    await page.waitForFunction(() => document.getElementById('powerPanel').open, null, { timeout: 30000 });
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

// ---------------------------------------------------------------- the trace window in tests
//
// The shipped window after the trust choice is `TRACE.afterTrust` (300 s since phase 4b.0b). The timing scenarios (trace
// expiry, lost evidence, hints) were written for 120 s and would need minutes of real time at 300 s, so the page is
// served a `story-data/constants.js` whose `afterTrust` is TEST_WINDOW. Every other number follows from it
// (`CASE.traceWindow`, the loss thresholds as a share of the window, `ETA RESET`). The shipped code has no test hook.
// A scenario with `shippedWindow: true` is served the real file and checks the real value.
const TEST_WINDOW = 120;
const AFTER_TRUST = /afterTrust: \d+,/;

async function serveTestWindow(page) {
  await page.route('**/js/story-data/constants.js', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(AFTER_TRUST, `afterTrust: ${TEST_WINDOW},`);
    await route.fulfill({ response, body });
  });
}

// --------------------------------------------------------------------- runner

async function runScenario(browser, server, scenario) {
  const started = Date.now();
  const problems = [];
  const context = await browser.newContext(scenario.contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  watch(page, problems, scenario.allowConsole);
  try {
    if (!scenario.shippedWindow) await serveTestWindow(page);
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

if (!AFTER_TRUST.test(await readFile(path.join(siteDir, 'js/story-data/constants.js'), 'utf8'))) {
  console.error('smoke: story-data/constants.js has no `afterTrust: <number>,` line: the test window cannot be applied.');
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
  // A pool of at most `--jobs` (default 14) scenarios at a time: with 27 in parallel the audio device and the CPU
  // run out (AudioContext errors, real-time scenarios past their timeouts), which is load, not a regression.
  const jobs = Math.max(1, Number(option('jobs')) || 14);
  results = new Array(selected.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, selected.length) }, async () => {
    while (next < selected.length) {
      const index = next++;
      results[index] = await runScenario(browser, server, selected[index]);
    }
  }));
}
await browser.close();
server.close();

const failed = results.filter((ok) => !ok).length;
console.log(`\n${failed ? `${failed} of ${results.length} scenario(s) FAILED` : `all ${results.length} scenario(s) passed`}`);
process.exit(failed ? 1 : 0);
