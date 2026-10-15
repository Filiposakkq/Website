#!/usr/bin/env node
// Records the terminal text of scripted playthroughs (reduced motion, so each takes seconds) so two builds of the
// game can be compared line by line. Added in phase 3 for the "full playthrough text diff" check.
//
//   node tools/transcript.mjs --out=<dir> [--site=<dir>]      # write <dir>/<scenario>.txt
//   node tools/transcript.mjs --diff=<dirA>,<dirB>             # show lines that differ between two recordings
//
// `--site` defaults to sites/fsociety00/public. Random parts (relay IPs, latencies, redaction blocks, kernel
// timestamps, memory counters) are normalized so that two runs of the same build produce identical files.

import http from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

if (option('diff')) {
  const [dirA, dirB] = option('diff').split(',');
  const files = (await readdir(dirA)).filter((f) => f.endsWith('.txt'));
  let different = 0;
  for (const file of files) {
    const a = (await readFile(path.join(dirA, file), 'utf8')).split('\n');
    let b;
    try { b = (await readFile(path.join(dirB, file), 'utf8')).split('\n'); } catch { console.log(`== ${file}: missing in ${dirB}`); different++; continue; }
    const inB = new Set(b);
    const inA = new Set(a);
    const removed = a.filter((l) => l.trim() && !inB.has(l));
    const added = b.filter((l) => l.trim() && !inA.has(l));
    console.log(`== ${file}: ${removed.length} line(s) only in A, ${added.length} only in B`);
    removed.forEach((l) => console.log(`  - ${l}`));
    added.forEach((l) => console.log(`  + ${l}`));
    if (removed.length || added.length) different++;
  }
  process.exit(different ? 1 : 0);
}

const siteDir = path.resolve(option('site') ?? path.join(root, 'sites/fsociety00/public'));
const outDir = path.resolve(option('out') ?? 'transcripts');

function loadPlaywright() {
  const bases = [process.env.PLAYWRIGHT_MODULE_PATH, process.cwd(), '/opt/npm-tools/node_modules', '/opt/node-tools/node_modules'];
  try { bases.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch { /* no npm */ }
  const require = createRequire(import.meta.url);
  for (const base of bases.filter(Boolean)) {
    try { return require(require.resolve('playwright', { paths: [base] })); } catch { /* try next */ }
  }
  throw new Error('Playwright not found. Set PLAYWRIGHT_MODULE_PATH or see tools/README.md.');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
function startServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^([/\\])+/, '');
    const file = path.join(siteDir, rel);
    if (!file.startsWith(siteDir)) { res.writeHead(403).end(); return; }
    try {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close() })));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitOutput = (page, text, timeout = 60000) => page.waitForFunction(
  (needle) => document.getElementById('output').textContent.includes(needle), text, { timeout });

async function sendCommand(page, text) {
  const input = page.locator('.tty-input');
  const echoCount = () => page.evaluate((command) => [...document.getElementById('output').children]
    .filter((el) => el.textContent === `guest@fsociety00:~$ ${command}`).length, text);
  const before = await echoCount();
  for (let attempt = 0; attempt < 80; attempt++) {
    await input.fill(text);
    await input.press('Enter');
    const accepted = await page.waitForFunction(([command, previous]) => [...document.getElementById('output').children]
      .filter((el) => el.textContent === `guest@fsociety00:~$ ${command}`).length > previous, [text, before], { timeout: 600 })
      .then(() => true, () => false);
    if (accepted) { await sleep(150); return; }
  }
  throw new Error(`terminal never accepted "${text}"`);
}

function normalize(line) {
  return line
    .replace(/203\.0\.113\.\d+/g, '203.0.113.N')
    .replace(/\b\d+ms\b/g, 'Nms')
    .replace(/█+/g, '█')
    .replace(/^eta:\s+\d\d:\d\d$/, 'eta:    MM:SS')
    .replace(/^\[\s*\d+\.\d+\]/, '[T]')
    .replace(/Memory [Tt]est: \d+ MB( OK)?/, (m) => (m.endsWith('OK') ? m : 'Memory test: N MB'));
}

async function dump(page) {
  const rows = await page.evaluate(() => [...document.getElementById('output').children].map((el) => el.textContent.replace(/ /g, ' ').trimEnd()));
  return rows.map(normalize).join('\n') + '\n';
}

async function boot(page, who, how) {
  await page.click('#initialize');
  await page.waitForFunction(() => !document.getElementById('launch').open, null, { timeout: 30000 });
  await page.waitForSelector('.choices .choice', { timeout: 60000 });
  if (how === 'click') await page.click(`.choices .choice[data-id="${who}"]`);
  else { await page.locator('.tty-input').fill(who); await page.locator('.tty-input').press('Enter'); }
  await waitOutput(page, 'type help.');
  await page.waitForFunction(() => !document.getElementById('promptLine').hidden, null, { timeout: 30000 });
}

async function shellTour(page, commands) {
  for (const command of commands) {
    await sendCommand(page, command);
    // `board` opens the case file overlay, which would block later clicks: close it again.
    if (command === 'board') { await page.waitForSelector('.case-overlay', { timeout: 5000 }); await page.keyboard.press('Escape'); await page.waitForSelector('.case-overlay', { state: 'detached', timeout: 5000 }); }
  }
}

const COMMON = ['help', 'ls', 'cat readme.txt', 'cat notes.txt', 'cat sdb9.lock', 'cat', 'cat nothing.txt',
  'source', 'source map', 'view-source', 'cat page/index.html', 'cat page/styles.css', 'trace', 'board', 'frobnicate',
  // phase 3.9: the flavor commands (`clear` is left out: it would wipe the recording)
  'whoami', 'uname', 'uname -a', 'ps aux', 'netstat -an', 'ifconfig', 'history', 'pwd', 'date', 'echo hello world',
  'cat /var/log/auth.log', 'sudo ls', 'cd /'];

// Reduced motion wipes the screen right after some lines, so capture the rows from inside the page the moment a
// marker line appears, then wait for it.
async function captureWhen(page, marker) {
  await page.evaluate((needle) => {
    const output = document.getElementById('output');
    new MutationObserver(() => {
      if (window.__rows || !output.textContent.includes(needle)) return;
      window.__rows = [...output.children].map((el) => el.textContent.replace(/\u00a0/g, ' ').trimEnd());
    }).observe(output, { childList: true, subtree: true, characterData: true });
  }, marker);
  await page.click('#initialize');
  await page.waitForFunction(() => window.__rows, null, { timeout: 90000 });
  return page.evaluate(() => window.__rows);
}

const scenarios = {
  // The BIOS is wiped from the screen by the story, so the end-of-run dumps never contain it.
  boot: (page) => captureWhen(page, 'trace request failed.'),
  transmission: (page) => captureWhen(page, 'wiping session...'),
  async 'unknown-victory'(page) {
    await boot(page, 'unknown', 'click');
    await shellTour(page, [...COMMON, 'cat inbox/001.msg', 'cat watcher/session.log', 'verify', 'verify relay', 'abort',
      'hint', 'hint', 'hint', 'hint', 'unlock', 'unlock elliot', 'unlock a-b-c', 'unlock ghost shell 1337']);
    await waitOutput(page, 'unlocking /dev/sdb9');
    const ghost = page.locator('button.choice:not(.locked)');
    await ghost.waitFor({ timeout: 60000 });
    await sleep(300);
    await shellTour(page, ['ls', 'cat ghost.sh', 'bogus']);
    await ghost.click();
    await waitOutput(page, 'this is where the signal ends.', 120000);
  },
  async 'watcher-victory'(page) {
    await boot(page, 'watcher', 'type');
    await shellTour(page, [...COMMON, 'cat inbox/001.msg', 'cat watcher/session.log', 'isolate', 'isolate watcher', 'verify relay',
      'unlock ghost shell 1337']);
    await waitOutput(page, 'unlocking /dev/sdb9');
    await page.locator('button.choice:not(.locked)').waitFor({ timeout: 60000 });
    await sleep(300);
    await shellTour(page, ['ls', 'cat ./ghost.sh', 'nope', './ghost.sh']);
    await waitOutput(page, 'this is where the signal ends.', 120000);
  },
  async 'watcher-abort'(page) {
    await boot(page, 'watcher', 'type');
    await shellTour(page, ['help', 'abort']);
    await waitOutput(page, '*** SESSION COMPROMISED ***', 60000);
  },
  async lockout(page) {
    await boot(page, 'unknown', 'type');
    await shellTour(page, ['unlock aaa-bbb-ccc', 'unlock ghost-shell-0000', 'unlock x']);
    await waitOutput(page, '*** LOCKED OUT ***', 60000);
  },
};

const { chromium } = loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
await mkdir(outDir, { recursive: true });
let failed = 0;
await Promise.all(Object.entries(scenarios).map(async ([name, run]) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => { if (msg.type() === 'error' && !/hello friend voice clip/i.test(msg.text())) problems.push(`console.error: ${msg.text()}`); });
  try {
    await page.goto(server.url);
    const captured = await run(page); // a scenario may return rows it captured itself
    await sleep(500);
    const text = captured ? `${captured.map(normalize).join('\n')}\n` : await dump(page);
    await writeFile(path.join(outDir, `${name}.txt`), text);
    console.log(`ok    ${name}${problems.length ? `  (${problems.length} problem(s): ${problems[0]})` : ''}`);
  } catch (error) {
    failed++;
    console.log(`FAIL  ${name}: ${error.message.split('\n')[0]}`);
    try { await writeFile(path.join(outDir, `${name}.FAILED.txt`), await dump(page)); } catch { /* page gone */ }
  }
  await context.close();
}));
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
