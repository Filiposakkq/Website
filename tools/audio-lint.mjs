#!/usr/bin/env node
// Audio lint for the fsociety00 game. See tools/README.md.
//
//   node tools/audio-lint.mjs [--only=<substring>] [--json]
//
// Loads js/audio.js in headless Chromium and renders every registered cue (and alias, and each sample
// parameter set of a reactive cue) and every ambient bed through an OfflineAudioContext, then checks:
//   - no exception, no unknown-cue warning, no NaN/Infinity in the samples
//   - not silent (RMS above a floor)
//   - at least 9 dB under full scale (so nothing relies on the output limiter)
//   - peak at or below the output ceiling (-1 dBFS) and never above 1.0
//   - silent after the cue's declared duration (it does not play longer than `audio.duration()` says)
//   - beds: audible while running, silent after setScene('idle'), no click when crossfading between scenes
//   - rate-limited cues admit at most `rate` plays per second
//   - stopAll() leaves no source node pending and no sound after the fade
// The voice clip (hello-friend) is a file, not a synth, and is skipped. Exit code 1 on any failure.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDir = path.resolve(process.env.SMOKE_SITE_DIR ?? path.join(root, 'sites/fsociety00/public'));
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const asJson = args.includes('--json');

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mp3': 'audio/mpeg' };

function startServer() {
  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/__blank.html') {
      res.writeHead(200, { 'content-type': MIME['.html'] }).end('<!doctype html><title>audio lint</title>');
      return;
    }
    const file = path.join(siteDir, path.normalize(pathname).replace(/^([/\\])+/, ''));
    if (!file.startsWith(siteDir)) { res.writeHead(403).end(); return; }
    try {
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }));
  });
}

// Everything below runs inside the page.
async function lintInPage({ only: filter }) {
  const RATE = 44100;
  const CEILING = 0.89; // -1 dBFS
  const HEADROOM_DB = -9; // cues must stay this far under full scale, so the output limiter never has to clip them
  const RMS_FLOOR = 1e-4;
  const TAIL_LIMIT = 1e-3;
  const GUARD = 0.7;
  const BED_SECONDS = 3;

  const mulberry32 = (seed) => () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const db = (value) => (value > 0 ? 20 * Math.log10(value) : -Infinity);
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...parts) => { warnings.push(parts.join(' ')); };

  const { createAudioController } = await import('/js/audio.js');
  const rows = [];
  const failures = [];
  const fail = (message) => failures.push(message);

  // ---- 1. cues, aliases and reactive samples, one slot each on a single offline timeline
  const probe = createAudioController({ context: new OfflineAudioContext(1, RATE, RATE), random: mulberry32(1) });
  const registry = probe.list();
  const wanted = registry.filter((entry) => entry.kind !== 'bed' && entry.synth && (!filter || entry.name.includes(filter)));
  const slots = [];
  let cursor = 0.1;
  for (const entry of wanted) {
    const sets = entry.samples?.length ? entry.samples : [{}];
    for (const params of sets) {
      const declared = probe.duration(entry.name, params);
      slots.push({ entry, params, declared, start: cursor, window: declared + GUARD });
      cursor += declared + GUARD;
    }
  }
  const cueEnd = cursor;

  // ---- 2. beds: each scene alone for BED_SECONDS then idle, plus one crossfade chain
  const sceneNames = ['idle', 'boot', 'story', 'reveal', 'ghost', 'puzzle', 'shutdown', 'intrusion',
    ...registry.filter((entry) => entry.kind === 'bed').map((entry) => entry.name)]
    .filter((name) => !filter || name.includes(filter) || name === 'idle');
  const bedSlots = [];
  for (const scene of sceneNames) {
    bedSlots.push({ scene, start: cursor, stopAt: cursor + BED_SECONDS, window: BED_SECONDS + GUARD });
    cursor += BED_SECONDS + GUARD;
  }
  const chain = ['boot', 'story', 'puzzle', 'ghost', 'reveal', 'shutdown'];
  const chainStart = cursor + 0.2;
  const chainStep = 2;
  cursor = chainStart + chain.length * chainStep + 1.2;

  const frames = Math.ceil((cursor + 0.2) * RATE);
  const offline = new OfflineAudioContext(1, frames, RATE);
  const audio = createAudioController({ context: offline, random: mulberry32(7) });
  audio.prepare();

  const events = [];
  for (const slot of slots) {
    events.push({ time: slot.start, run: () => {
      slot.actual = offline.currentTime;
      try { audio.play(slot.entry.name, slot.params); } catch (error) { slot.error = error.message; }
    } });
  }
  for (const slot of bedSlots) {
    events.push({ time: slot.start, run: () => {
      slot.actual = offline.currentTime;
      try { audio.setScene(slot.scene); } catch (error) { slot.error = error.message; }
    } });
    events.push({ time: slot.stopAt, run: () => {
      slot.stopActual = offline.currentTime;
      try { audio.setScene('idle'); } catch (error) { slot.error = error.message; }
    } });
  }
  chain.forEach((scene, index) => {
    events.push({ time: chainStart + index * chainStep, run: () => { audio.setScene(scene); } });
  });
  events.push({ time: chainStart + chain.length * chainStep, run: () => { audio.setScene('idle'); } });

  events.sort((a, b) => a.time - b.time);
  const used = new Set();
  for (const event of events) {
    // Suspend times are rounded to the render quantum and must be unique.
    let time = Math.round(event.time * RATE / 128) * 128 / RATE;
    while (used.has(time)) time += 128 / RATE;
    used.add(time);
    offline.suspend(time).then(() => { event.run(); offline.resume(); });
  }
  const buffer = await offline.startRendering();
  const samples = buffer.getChannelData(0);

  const measure = (from, to) => {
    const a = Math.max(0, Math.floor(from * RATE));
    const b = Math.min(samples.length, Math.ceil(to * RATE));
    let peak = 0;
    let sum = 0;
    let bad = 0;
    for (let i = a; i < b; i++) {
      const v = samples[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      peak = Math.max(peak, Math.abs(v));
      sum += v * v;
    }
    return { peak, rms: b > a ? Math.sqrt(sum / (b - a)) : 0, bad };
  };

  for (const slot of slots) {
    const label = slot.entry.reactive || slot.entry.samples?.length
      ? `${slot.entry.name} ${JSON.stringify(slot.params)}` : slot.entry.name;
    const problems = [];
    if (slot.error) problems.push(`threw: ${slot.error}`);
    const t0 = slot.actual ?? slot.start;
    const active = measure(t0, t0 + slot.declared + 0.03);
    const tail = measure(t0 + slot.declared + 0.08, slot.start + slot.window);
    const whole = measure(t0, slot.start + slot.window);
    if (whole.bad) problems.push(`${whole.bad} non-finite samples`);
    if (active.rms < RMS_FLOOR) problems.push(`silent (RMS ${db(active.rms).toFixed(1)} dB)`);
    if (whole.peak > CEILING + 1e-6) problems.push(`peak ${db(whole.peak).toFixed(2)} dBFS is over the -1 dBFS ceiling`);
    else if (db(whole.peak) > HEADROOM_DB) problems.push(`peak ${db(whole.peak).toFixed(1)} dBFS leaves less than ${-HEADROOM_DB} dB of headroom (the limiter would be shaping it)`);
    if (tail.peak > TAIL_LIMIT) problems.push(`still sounding ${(tail.peak > 0 ? db(tail.peak) : -Infinity).toFixed(1)} dBFS after the declared ${slot.declared.toFixed(2)} s`);
    rows.push({ name: label, kind: slot.entry.kind, category: slot.entry.category, declared: slot.declared, peak: db(whole.peak), rms: db(active.rms), tail: db(tail.peak), problems });
  }

  for (const slot of bedSlots) {
    const problems = [];
    if (slot.error) problems.push(`threw: ${slot.error}`);
    const t0 = slot.actual ?? slot.start;
    const running = measure(t0 + 1.2, (slot.stopActual ?? slot.stopAt) - 0.05);
    const after = measure((slot.stopActual ?? slot.stopAt) + 0.7, slot.start + slot.window);
    const silentScene = slot.scene === 'idle';
    if (running.bad) problems.push(`${running.bad} non-finite samples`);
    if (silentScene && running.rms > RMS_FLOOR) problems.push('idle is not silent');
    if (!silentScene && running.rms < RMS_FLOOR) problems.push(`silent bed (RMS ${db(running.rms).toFixed(1)} dB)`);
    if (running.peak > CEILING + 1e-6) problems.push(`peak ${db(running.peak).toFixed(2)} dBFS is over the ceiling`);
    if (after.peak > TAIL_LIMIT) problems.push(`bed still sounding ${db(after.peak).toFixed(1)} dBFS after idle (nodes not stopped on the audio clock?)`);
    rows.push({ name: `scene ${slot.scene}`, kind: 'scene', category: 'ambient', declared: null, peak: db(running.peak), rms: db(running.rms), tail: db(after.peak), problems });
  }

  // Crossfade: the largest sample-to-sample step around a scene change must not stand out from the steady
  // state of the two beds involved (beds differ: a bright hiss legitimately has bigger steps than a rumble).
  let lastStepAt = 0;
  const stepMax = (from, to) => {
    let max = 0;
    for (let i = Math.floor(from * RATE) + 1; i < Math.floor(to * RATE); i++) {
      const step = Math.abs(samples[i] - samples[i - 1]);
      if (step > max) { max = step; lastStepAt = i / RATE; }
    }
    return max;
  };
  const crossProblems = [];
  for (let index = 1; index < chain.length; index++) {
    const at = chainStart + index * chainStep;
    const before = stepMax(at - 0.8, at - 0.1); // previous bed, fully faded in
    const after = stepMax(at + 1.2, at + 1.9); // new bed, fully faded in
    const jump = stepMax(at - 0.02, at + 0.25);
    const allowed = Math.max(before, after) * 1.5 + 0.002;
    if (jump > allowed) crossProblems.push(`click going ${chain[index - 1]} -> ${chain[index]}: step ${jump.toFixed(4)} vs allowed ${allowed.toFixed(4)} (before ${before.toFixed(4)}, after ${after.toFixed(4)}, at ${((lastStepAt - at) * 1000).toFixed(0)} ms)`);
  }
  rows.push({ name: 'bed crossfades', kind: 'check', category: 'ambient', declared: null, peak: null, rms: null, tail: null, problems: crossProblems });

  const pending = audio.pendingNodes();
  rows.push({ name: 'no pending nodes after render', kind: 'check', category: 'engine', declared: null, peak: null, rms: null, tail: null, problems: pending === 0 ? [] : [`${pending} source nodes still pending`] });

  // ---- 3. rate limits: hammer each rate-limited cue with a fake clock
  for (const entry of registry.filter((e) => e.kind === 'cue' && e.rate && (!filter || e.name.includes(filter)))) {
    let fake = 0;
    const ctx = new OfflineAudioContext(1, RATE, RATE);
    const limited = createAudioController({ context: ctx, random: mulberry32(3), now: () => fake });
    limited.prepare();
    limited.play(entry.name);
    const perPlay = limited.pendingNodes();
    fake += 1000; // a fresh second
    const before = limited.pendingNodes();
    for (let i = 0; i < 100; i++) { limited.play(entry.name); fake += 10; } // 100 attempts in one second
    const admitted = Math.round((limited.pendingNodes() - before) / perPlay);
    const problems = admitted > entry.rate + 1 ? [`${admitted} plays admitted in one second, limit is ${entry.rate}`] : [];
    if (admitted < Math.floor(entry.rate / 2)) problems.push(`only ${admitted} plays admitted in one second, limit is ${entry.rate}`);
    rows.push({ name: `rate limit ${entry.name} (${admitted}/s of ${entry.rate})`, kind: 'check', category: 'engine', declared: null, peak: null, rms: null, tail: null, problems });
  }

  // ---- 4. stopAll(): nothing pending afterwards and silence after the short fade
  {
    const ctx = new OfflineAudioContext(1, RATE * 2, RATE);
    const stopper = createAudioController({ context: ctx, random: mulberry32(5) });
    stopper.prepare();
    stopper.setScene('puzzle');
    for (const name of ['intrusion', 'shutdown', 'identity', 'ghosted-stamp', 'failure']) stopper.play(name);
    const before = stopper.pendingNodes();
    stopper.stopAll();
    const out = (await ctx.startRendering()).getChannelData(0);
    let late = 0;
    for (let i = Math.floor(0.25 * RATE); i < out.length; i++) late = Math.max(late, Math.abs(out[i]));
    const problems = [];
    if (before === 0) problems.push('nothing was scheduled before stopAll (test is broken)');
    if (stopper.pendingNodes() !== 0) problems.push(`${stopper.pendingNodes()} nodes pending after stopAll`);
    if (late > TAIL_LIMIT) problems.push(`sound after stopAll: ${db(late).toFixed(1)} dBFS`);
    rows.push({ name: 'stopAll silences everything', kind: 'check', category: 'engine', declared: null, peak: null, rms: null, tail: db(late), problems });
  }

  // ---- 4b. stopAll({ beds: false }) stops cues but lets the bed carry on (the session abort path fades it itself)
  {
    const ctx = new OfflineAudioContext(1, RATE * 3, RATE);
    const keeper = createAudioController({ context: ctx, random: mulberry32(9) });
    keeper.prepare();
    keeper.setScene('puzzle');
    keeper.play('shutdown');
    const cueNodes = keeper.pendingNodes();
    keeper.stopAll({ beds: false });
    const out = (await ctx.startRendering()).getChannelData(0);
    const bed = (() => { let sum = 0; for (let i = Math.floor(2 * RATE); i < Math.floor(2.9 * RATE); i++) sum += out[i] * out[i]; return Math.sqrt(sum / (0.9 * RATE)); })();
    const problems = [];
    if (cueNodes < 3) problems.push('the test did not schedule a cue');
    if (bed < RMS_FLOOR) problems.push('stopAll({ beds: false }) silenced the bed');
    rows.push({ name: 'stopAll({ beds: false }) keeps the bed', kind: 'check', category: 'engine', declared: null, peak: null, rms: db(bed), tail: null, problems });
  }

  // ---- 5. trace sound: thresholds, reactive parameters and re-arming (fake audio, no rendering)
  {
    const { createTraceSound } = await import('/js/trace-sound.js');
    const heard = [];
    const sound = createTraceSound({ play: (name, params) => heard.push({ name, params }) });
    for (let left = 480; left >= 0; left--) sound(left);
    const count = (name) => heard.filter((entry) => entry.name === name).length;
    const problems = [];
    if (count('trace-tick') !== 480) problems.push(`expected 480 ticks (480 s down to 1 s), got ${count('trace-tick')}`);
    if (count('trace-warn') !== 1) problems.push(`trace-warn should play once, played ${count('trace-warn')}`);
    if (count('trace-critical') !== 2) problems.push(`trace-critical should play twice (60 s and 10 s), played ${count('trace-critical')}`);
    const warnAt = heard.find((entry) => entry.name === 'trace-warn');
    const firstTick = heard.find((entry) => entry.name === 'trace-tick');
    if (firstTick?.params?.secondsLeft !== 480) problems.push('trace-tick is not given secondsLeft');
    if (heard.some((entry) => entry.name === 'trace-tick' && !(entry.params.secondsLeft > 0))) problems.push('a tick played at 0 s');
    if (!warnAt) problems.push('no trace-warn at all');
    else if (heard.indexOf(warnAt) !== heard.findIndex((entry) => entry.name === 'trace-tick' && entry.params.secondsLeft === 120) - 1) {
      problems.push('trace-warn should come right before the 120 s tick');
    }
    // A trace set back to a larger value re-arms the thresholds.
    const again = [];
    const resound = createTraceSound({ play: (name) => again.push(name) });
    resound(50); resound(49); resound(300); resound(110); resound(55);
    if (again.filter((name) => name === 'trace-critical').length !== 2 || again.filter((name) => name === 'trace-warn').length !== 1) {
      problems.push(`thresholds did not re-arm after a jump up: ${again.join(',')}`);
    }
    // The reactive tick gets higher and denser as time drops.
    const zeroCrossings = async (secondsLeft) => {
      const ctx = new OfflineAudioContext(1, RATE, RATE);
      const probeAudio = createAudioController({ context: ctx, random: mulberry32(11) });
      probeAudio.prepare();
      probeAudio.play('trace-tick', { secondsLeft });
      const out = (await ctx.startRendering()).getChannelData(0);
      let crossings = 0;
      let last = 0;
      let peaks = 0;
      for (let index = 0; index < out.length; index++) {
        if (out[index] * last < 0) crossings++;
        if (Math.abs(out[index]) > 1e-4) last = out[index];
        peaks = Math.max(peaks, Math.abs(out[index]));
      }
      return { crossings, peaks, duration: probeAudio.duration('trace-tick', { secondsLeft }) };
    };
    const far = await zeroCrossings(400);
    const near = await zeroCrossings(100);
    const last = await zeroCrossings(10);
    if (!(far.peaks < near.peaks && near.peaks < last.peaks)) problems.push('trace-tick does not get louder as time drops');
    if (!(last.duration > far.duration + 0.3)) problems.push('trace-tick does not double its rate at 30 s and below');
    rows.push({ name: 'trace sound: thresholds, ticks, re-arm, reactive', kind: 'check', category: 'trace', declared: null, peak: null, rms: null, tail: null, problems });
  }

  console.warn = originalWarn;
  for (const warning of warnings) fail(`console.warn: ${warning}`);
  for (const row of rows) for (const problem of row.problems) fail(`${row.name}: ${problem}`);
  return { rows, failures, registrySize: registry.length };
}

const { chromium } = loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let result;
const pageProblems = [];
try {
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageProblems.push(`pageerror: ${error.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/hello friend voice clip|Failed to load resource/i.test(msg.text())) pageProblems.push(`console.error: ${msg.text()}`);
  });
  await page.goto(`${server.url}/__blank.html`);
  result = await page.evaluate(lintInPage, { only });
} finally {
  await browser.close();
  server.close();
}

const failures = [...pageProblems, ...result.failures];
if (asJson) {
  console.log(JSON.stringify({ ...result, failures }, null, 2));
} else {
  const fmt = (value, digits = 1) => (value === null ? '' : Number.isFinite(value) ? value.toFixed(digits) : '-inf');
  const pad = (text, width) => String(text).padEnd(width);
  console.log(`${pad('item', 46)}${pad('category', 10)}${pad('dur s', 8)}${pad('peak dB', 9)}${pad('rms dB', 9)}${pad('tail dB', 9)}status`);
  for (const row of result.rows) {
    console.log(`${pad(row.name, 46)}${pad(row.category, 10)}${pad(fmt(row.declared, 2), 8)}${pad(fmt(row.peak), 9)}${pad(fmt(row.rms), 9)}${pad(fmt(row.tail), 9)}${row.problems.length ? 'FAIL' : 'ok'}`);
  }
  console.log(`\n${result.rows.length} rows from ${result.registrySize} registry entries; ${failures.length} problem(s)`);
  for (const failure of failures) console.log(`  - ${failure}`);
}
process.exit(failures.length ? 1 : 0);
