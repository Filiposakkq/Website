import { startTrace } from './trace.js';
import { createLevel01, revealLevel01SourcePart } from './level01.js';
import { createSession, isAbortError, swallowAbort } from './session.js';
import { createGameContext } from './context.js';
import { createTerminal } from './tty.js';
import { installDeveloperMenu } from './developer-menu.js';
import { createAudioController } from './audio.js';
import { createCaseFile } from './casefile.js';
import { rand, pad2, scrambleText } from './util.js';
import { renderChoices } from './choices.js';
import { createRain } from './rain.js';
import { chooseTrust } from './story-choices.js';

const out = document.getElementById('output');
const screen = document.getElementById('screen');
const promptLine = document.getElementById('promptLine');
const skipHint = document.getElementById('skipHint');
const launch = document.getElementById('launch');
const initialize = document.getElementById('initialize');
const initializeLabel = initialize.querySelector('.initialize-label');
const launchStatus = document.getElementById('launchStatus');
const powerPanel = document.getElementById('powerPanel');
const restartControl = document.getElementById('restartControl');
const powerTitle = document.getElementById('powerTitle');
const powerStatus = document.getElementById('powerStatus');
const powerBootLog = document.getElementById('powerBootLog');
const shutdownSequence = document.getElementById('shutdownSequence');
const shutdownKicker = document.getElementById('shutdownKicker');
const shutdownTitle = document.getElementById('shutdownTitle');
const shutdownPhase = document.getElementById('shutdownPhase');
const shutdownCounter = document.getElementById('shutdownCounter');
const shutdownMeter = document.getElementById('shutdownMeter');
const shutdownEvents = document.getElementById('shutdownEvents');
const skipLabel = skipHint.querySelector('.skip-label');
const audio = createAudioController();
// The rain reacts to prefers-reduced-motion / body.quiet-motion changes by itself (see rain.js).
const rain = createRain(document.getElementById('rain'));
const setRain = (opacity, immediate = false) => rain.setOpacity(opacity, immediate);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const ambientIntervals = new Set();
const SKIP_HOLD_MS = 3000;

const motionReduced = () => motionPreference.matches || document.body.classList.contains('quiet-motion');
let activeTrace = null;
const caseFile = createCaseFile({
  trigger: document.getElementById('caseTrigger'),
  getTraceLeft: () => activeTrace?.left() ?? null,
});
const createTrace = (seconds) => {
  activeTrace?.halt(true);
  audio.play('trace-appear');
  activeTrace = startTrace(seconds, { session });
  return activeTrace;
};
document.body.classList.toggle('quiet-motion', motionPreference.matches);
motionPreference.addEventListener('change', () => {
  document.body.classList.toggle('quiet-motion', motionPreference.matches);
});

// One session per run of the story (see session.js). Aborting it stops every timer, sleep and
// listener the run started, so a reboot or developer jump cannot leak into the next run.
let session = createSession();
const newRunState = () => ({
  skip: false,
  skippable: true,
  skipToChoice: false,
  skipToChoiceArmed: true,
});
// Hold the on-screen control to skip boot or advance to the trust choice. Reset for every session.
let run = newRunState();
let holdStartedAt = 0;
let holdTarget = null;
let holdFrame = 0;

function setSkipHint(mode, visible = true) {
  skipLabel.textContent = `HOLD 3S // SKIP ${mode}`;
  skipHint.setAttribute('aria-label', `Hold for 3 seconds to skip the ${mode === 'BOOT' ? 'boot sequence' : 'story intro'}`);
  skipHint.hidden = !visible;
  skipHint.classList.remove('done');
  skipHint.style.setProperty('--hold-progress', '0');
}

function cancelSkipHold() {
  if (holdFrame) cancelAnimationFrame(holdFrame);
  holdFrame = 0;
  holdStartedAt = 0;
  holdTarget = null;
  skipHint.classList.remove('holding');
  skipHint.style.setProperty('--hold-progress', '0');
}

function advanceSkipHold(now) {
  const progress = Math.min((now - holdStartedAt) / SKIP_HOLD_MS, 1);
  skipHint.style.setProperty('--hold-progress', String(progress));
  if (progress < 1) {
    holdFrame = requestAnimationFrame(advanceSkipHold);
    return;
  }

  const target = holdTarget;
  cancelSkipHold();
  if (target === 'boot' && run.skippable) {
    run.skip = true;
    skipHint.classList.add('done');
  } else if (target === 'intro' && !run.skippable && run.skipToChoiceArmed) {
    run.skipToChoice = true;
    skipHint.hidden = true;
  }
}

function beginSkipHold() {
  if (holdStartedAt || skipHint.hidden || skipHint.disabled) return;
  holdTarget = run.skippable ? 'boot' : run.skipToChoiceArmed ? 'intro' : null;
  if (!holdTarget) return;
  holdStartedAt = performance.now();
  skipHint.classList.add('holding');
  holdFrame = requestAnimationFrame(advanceSkipHold);
}

skipHint.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  skipHint.setPointerCapture(event.pointerId);
  beginSkipHold();
});
skipHint.addEventListener('pointerup', cancelSkipHold);
skipHint.addEventListener('pointercancel', cancelSkipHold);
skipHint.addEventListener('lostpointercapture', cancelSkipHold);
skipHint.addEventListener('pointermove', (event) => {
  if (!holdStartedAt) return;
  const bounds = skipHint.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right
    || event.clientY < bounds.top || event.clientY > bounds.bottom) cancelSkipHold();
});
skipHint.addEventListener('keydown', (event) => {
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    beginSkipHold();
  } else if (event.key === 'Escape') cancelSkipHold();
});
skipHint.addEventListener('keyup', (event) => {
  if (event.key === ' ' || event.key === 'Enter') cancelSkipHold();
});
skipHint.addEventListener('click', (event) => event.preventDefault());
addEventListener('blur', cancelSkipHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelSkipHold();
});

const isSkipping = () => run.skip || run.skipToChoice;

// Everything sleeps through the *current* session, so aborting it wakes every awaiting chain at once.
const sleep = (ms) => session.sleep(ms);
const wait = (ms) => (isSkipping() || motionReduced() || ms <= 0 ? session.wait(0) : session.sleep(ms));
const ip = () => `203.0.113.${rand(1, 254)}`;
const scroll = () => window.scrollTo(0, document.body.scrollHeight);
const terminal = createTerminal({
  out,
  promptLine,
  scroll,
  onKeyPress: (key) => audio.play(key === 'Enter' ? 'command-submit' : 'key-tap'),
});
const { abort: ttyAbort, close: closePrompt } = terminal;
// Rejects with the abort error when the session aborts mid-prompt (no leaked promise).
const readCommand = () => terminal.readCommand({ signal: session.signal });
const sessionTerminal = { readCommand, abort: ttyAbort, close: closePrompt };

// The launch screen and the power panel are native modal <dialog>s (focus trap, inert page behind them).
// Neither may be dismissed with Escape: the launch screen needs the initialize gesture, and the power
// panel only closes through REBOOT. Chrome closes a dialog on a second Escape even when `cancel` was
// prevented, so an unexpected close reopens it.
function lockModal(dialog) {
  dialog.addEventListener('cancel', (event) => event.preventDefault());
  dialog.addEventListener('close', () => {
    if (dialog.dataset.closing) {
      delete dialog.dataset.closing;
      return;
    }
    dialog.showModal();
  });
}
function openModal(dialog) {
  if (!dialog.open) dialog.showModal();
}
function closeModal(dialog) {
  if (!dialog.open) return;
  dialog.dataset.closing = '1';
  dialog.close();
}
lockModal(launch);
lockModal(powerPanel);

function stopAmbient() {
  ambientIntervals.forEach((id) => session.clearInterval(id));
  ambientIntervals.clear();
}

// Removes the transient overlays and effect classes a run may leave behind when it is cut short.
function sweepStage() {
  document.querySelectorAll('.elliot-echo, .ghost-sequence, .breach-sequence, .identity-surge, .hello-flight-layer')
    .forEach((element) => element.remove());
  screen.classList.remove('glitch', 'flash', 'g-rgb', 'g-slice', 'g-roll', 'g-invert', 'g-zoom', 'intrusion',
    'identity-lock', 'ghosted-hit', 'elliot-present', 'boot-entry', 'shutdown');
  noiseEl.classList.remove('on');
  shutdownSequence.hidden = true;
  screen.style.opacity = '1';
}

// What has to stop when a session aborts.
function armSession(target) {
  target.onAbort(() => {
    cancelSkipHold();
    closePrompt();
    activeTrace?.halt(true);
    activeTrace = null;
    stopAmbient();
    caseFile.close();
    audio.setScene('idle');
    sweepStage();
  });
}

function beginSession(reason) {
  session.abort(reason);
  session = createSession();
  run = newRunState();
  armSession(session);
}
armSession(session);

function line(text = '', cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text || '\u00a0';
  out.appendChild(d);
  scroll();
  return d;
}

async function type(text, cls = '', speed = 35) {
  audio.play('typewriter-start');
  const d = line('', cls);
  d.textContent = '';
  for (const [index, ch] of [...text].entries()) {
    if (index % 5 === 0 && ch.trim()) audio.play('key-tap');
    d.textContent += ch;
    await wait(motionReduced() ? 0 : speed * 0.78);
  }
  return d;
}

async function bar(label, ms = 1500) {
  audio.play('progress-start');
  const d = line();
  if (motionReduced()) {
    d.textContent = `${label} [################] 100%`;
    audio.play('progress-complete');
    return;
  }
  const total = 16;
  for (let i = 0; i <= total; i++) {
    if (i > 0 && i % 4 === 0) audio.play('progress-tick');
    const pct = Math.round((i / total) * 100);
    d.textContent = `${label} [${'#'.repeat(i)}${'.'.repeat(total - i)}] ${pct}%`;
    await wait((ms * 0.82) / total);
  }
  audio.play('progress-complete');
}

// kernel log s časovým razítkem
let kt = 0;
let kernelLogCount = 0;
async function klog(text, cls = 'dim') {
  if (kernelLogCount++ % 3 === 0) audio.play('kernel-tick');
  kt += Math.random() * 0.35;
  line(`[${kt.toFixed(3).padStart(7)}] ${text}`, cls);
  await wait(rand(24, 88));
}

// systemd styl: [ OK ] služba
async function svc(text, state = 'OK', ms) {
  audio.play('service');
  const d = document.createElement('div');
  const tag = document.createElement('span');
  tag.className = 'dim';
  tag.textContent = '[ .... ] ';
  d.append(tag, text);
  out.appendChild(d);
  scroll();
  await wait((ms ?? rand(150, 550)) * 0.78);
  tag.textContent = state === 'OK' ? '[  OK  ] ' : '[FAILED] ';
  tag.className = state === 'OK' ? '' : 'warn';
  audio.play(state === 'OK' ? 'service-ready' : 'failure');
  await wait(40);
}

async function memtest() {
  audio.play('boot-memory');
  const d = line();
  const total = 16384;
  if (motionReduced()) {
    d.textContent = `Memory test: ${total} MB OK`;
    return;
  }
  for (let mb = 0; mb <= total; mb += 512) {
    d.textContent = `Memory test: ${mb} MB`;
    await wait(22);
  }
  d.textContent = `Memory test: ${total} MB OK`;
}

async function glitch() {
  if (isSkipping() || motionReduced()) return;
  audio.play('static');
  screen.classList.add('glitch');
  await sleep(500);
  screen.classList.remove('glitch');
}

async function blackout(ms = 1400) {
  if (motionReduced()) {
    out.innerHTML = '';
    window.scrollTo(0, 0);
    return;
  }
  screen.style.opacity = '0';
  await wait(ms * 0.78);
  out.innerHTML = '';
  window.scrollTo(0, 0);
  screen.style.opacity = '1';
}

async function flash() {
  if (isSkipping() || motionReduced()) return;
  audio.play('static');
  screen.classList.add('flash');
  await sleep(180);
  screen.classList.remove('flash');
}

// ---------- glitch efekty: každý je jiný ----------
const FX_MS = { rgb: 420, slice: 460, roll: 580, invert: 460, zoom: 460 };

async function gfx(name) {
  if (isSkipping() || motionReduced()) return;
  audio.play(`glitch-${name}`);
  const cls = 'g-' + name;
  screen.classList.add(cls);
  await sleep(FX_MS[name]);
  screen.classList.remove(cls);
}

// šum jako ztracený signál
const noiseEl = document.createElement('div');
noiseEl.id = 'noise';
(function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const img = x.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand(0, 255);
    img.data[i] = 0;
    img.data[i + 1] = v;
    img.data[i + 2] = Math.floor(v * 0.4);
    img.data[i + 3] = rand(60, 255);
  }
  x.putImageData(img, 0, 0);
  noiseEl.style.backgroundImage = `url(${c.toDataURL()})`;
  document.body.appendChild(noiseEl);
})();

async function staticBurst(ms = 350) {
  if (isSkipping() || motionReduced()) return;
  audio.play('static');
  noiseEl.classList.add('on');
  await sleep(ms);
  noiseEl.classList.remove('on');
}

// poškození dat: na chvíli se zničí náhodné znaky po celé obrazovce
async function corrupt(rounds = 6) {
  if (isSkipping() || motionReduced()) return;
  audio.play('corrupt');
  const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const orig = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
    orig.push(walker.currentNode.nodeValue);
  }
  for (let r = 0; r < rounds; r++) {
    nodes.forEach((n, i) => {
      n.nodeValue = scrambleText(orig[i], { intensity: 0.18 });
    });
    await wait(70);
  }
  nodes.forEach((n, i) => { n.nodeValue = orig[i]; });
}

// dramatický glitch pro "hello, friend.": text se láme, šum, řez, roll, strobe
async function glitchHello(el) {
  if (motionReduced()) return;
  const orig = el.textContent;
  const scr = () => scrambleText(orig, { intensity: 0.42, eligible: (ch) => /[a-z]/i.test(ch) });
  for (let i = 0; i < 4; i++) {
    el.textContent = scr();
    await wait(55);
    el.textContent = orig;
    await wait(55);
  }
  await gfx('rgb');
  await staticBurst(180);
  await gfx('slice');
  el.textContent = orig;
}

// napsání příkazu za prompt, jako v opravdovém terminálu
async function cmd(text, speed = 55, pause = 450) {
  audio.play('terminal-open');
  const d = document.createElement('div');
  const p = document.createElement('span');
  p.className = 'dim';
  p.textContent = 'guest@fsociety00:~$ ';
  const t = document.createElement('span');
  d.append(p, t);
  out.appendChild(d);
  for (const [index, ch] of [...text].entries()) {
    if (index % 3 === 0 && ch.trim()) audio.play('key-tap');
    t.textContent += ch;
    scroll();
    await wait(motionReduced() ? 0 : speed * 0.78);
  }
  await wait(pause);
}

const GLYPHS = {
  F: ['#####', '#....', '####.', '#....', '#....'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
};

async function logo(words) {
  audio.play('logo');
  const box = document.createElement('div');
  box.className = 'logo';
  box.setAttribute('aria-label', words.join(' '));
  box.dataset.word = words.join(' ');
  out.appendChild(box);
  const header = document.createElement('div');
  header.className = 'logo-header';
  header.setAttribute('aria-hidden', 'true');
  const mark = document.createElement('span');
  mark.className = 'logo-mark';
  mark.textContent = 'FS/00';
  const relay = document.createElement('span');
  relay.className = 'logo-relay';
  relay.textContent = 'RELAY ID // 0515';
  header.append(mark, relay);
  box.appendChild(header);
  const glyphs = [];
  for (const word of words) {
    const row = document.createElement('div');
    row.className = 'logo-row';
    box.appendChild(row);
    for (const ch of word) {
      const g = document.createElement('div');
      g.className = 'glyph';
      const cells = [];
      const pattern = [];
      GLYPHS[ch].forEach((r) => {
        for (const px of r) {
          const c = document.createElement('i');
          g.appendChild(c);
          cells.push(c);
          pattern.push(px === '#');
        }
      });
      row.appendChild(g);
      glyphs.push({ g, cells, pattern, locked: false });
    }
  }
  const caption = document.createElement('div');
  caption.className = 'logo-caption';
  caption.textContent = 'PRIVATE RELAY // TRUST NO ROUTE';
  box.appendChild(caption);
  scroll();

  if (motionReduced()) {
    glyphs.forEach((glyph) => {
      glyph.cells.forEach((cell, index) => cell.classList.toggle('on', glyph.pattern[index]));
      glyph.g.classList.add('lock');
    });
    box.classList.add('done');
    return;
  }

  // 1) šum: všechny buňky náhodně blikají, jako když se signál dešifruje
  const noise = motionReduced() ? null : session.setInterval(() => {
    glyphs.forEach((o) => {
      if (!o.locked) o.cells.forEach((c) => c.classList.toggle('on', Math.random() < 0.45));
    });
  }, 60);
  await wait(1100);

  // 2) písmena se postupně zamknou do správného tvaru
  for (const o of glyphs) {
    o.locked = true;
    o.cells.forEach((c, i) => c.classList.toggle('on', o.pattern[i]));
    o.g.classList.add('lock');
    await wait(190);
  }
  if (noise !== null) session.clearInterval(noise);

  // 3) sken přejede přes hotové logo
  box.classList.add('done');
  await wait(900);

  // 4) logo zůstane "živé": občas se jedno písmeno na chvíli zkroutí
  if (!motionReduced()) {
    const interval = session.setInterval(() => {
      const o = glyphs[rand(0, glyphs.length - 1)];
      o.g.style.setProperty('--j', `${rand(-3, 3)}px`);
      o.g.classList.add('jit');
      session.setTimeout(() => o.g.classList.remove('jit'), 140);
    }, 2600);
    ambientIntervals.add(interval);
  }
}

// animovaná "píše..." bublina (tři pulzující tečky)
async function typingFor(ms, name = 'unknown', nameCls = 'dim') {
  audio.play('incoming-call');
  const d = document.createElement('div');
  d.innerHTML = `<span class="${nameCls}">&lt;${name}&gt; </span><span class="dots"><i></i><i></i><i></i></span>`;
  out.appendChild(d);
  scroll();
  await wait(ms * 0.78);
  d.remove();
}

// zpráva od "někoho" psaná po lidsku: nepravidelné tempo, pauzy, překlep
// text je řetězec, nebo pole částí [{ t: 'text', cls: 'ok' }, ...]
// (část s cls 'ok' se vypíše zeleně i uvnitř červené řeči watchera)
async function say(text, { cls = '', speed = 70, typoAt = -1, name = 'unknown', nameCls = 'dim' } = {}) {
  if (name !== 'Mr. Robot') audio.play('message');
  const parts = typeof text === 'string' ? [{ t: text }] : text;
  const d = document.createElement('div');
  const who = document.createElement('span');
  who.className = nameCls;
  who.textContent = `<${name}> `;
  const t = document.createElement('span');
  if (cls) t.className = cls;
  d.append(who, t);
  out.appendChild(d);
  let i = 0;
  for (const part of parts) {
    const seg = document.createElement('span');
    if (part.cls) seg.className = part.cls;
    t.appendChild(seg);
    for (const ch of part.t) {
      if (i === typoAt && !motionReduced()) {
        seg.textContent += 'x';
        scroll();
        await wait(180);
        seg.textContent = seg.textContent.slice(0, -1);
        await wait(140);
      }
      if (name !== 'Mr. Robot' && i % 6 === 0 && ch.trim()) audio.play('key-tap');
      seg.textContent += ch;
      scroll();
      let ms = motionReduced() ? 0 : (speed + rand(-20, 40)) * 0.78;
      if (',.'.includes(ch)) ms += 220;
      await wait(ms);
      i++;
    }
  }
  return t;
}

// vzdálené smazání: text zčervená, rozpadne se na šum a "zhltne se" řádek po řádku
async function wipe(els) {
  if (!motionReduced()) setRain(0.7);
  els.forEach((element, index) => {
    element.classList.add('purging');
    element.style.setProperty('--purge-delay', `${Math.min(index, 6) * 20}ms`);
  });
  if (!motionReduced()) {
    await sleep(520);
  }
  els.forEach((element) => element.remove());
  setRain(0.22);
}

// The remote session ends; the local terminal then powers down.
async function gameOver(trace, reason) {
  caseFile.setFailureOutcome(reason);
  closePrompt();
  stopAmbient();
  const traceExpired = reason === 'TRACE COMPLETE';
  audio.setScene('shutdown');
  audio.play(traceExpired ? 'trace-expired' : 'shutdown');
  trace.halt(!traceExpired);
  document.body.classList.add('powering-down');
  setRain(0, true);
  line();
  line(`*** ${reason} ***`, 'warn');
  line(traceExpired ? 'TRACE WINDOW EXPIRED // 00:00' : 'REMOTE SESSION CLOSED', 'warn');

  const phases = traceExpired
    ? [
      ['LAST RELAY RESPONDED', 'REMOTE MONITOR ACKNOWLEDGED THE TRACE'],
      ['GUEST ROUTE IDENTIFIED', 'SESSION METADATA ASSOCIATED'],
      ['ACCESS REVOKED', 'REMOTE SHELL CLOSED'],
      ['DISPLAY POWER CUT', 'LOCAL CONSOLE DISCONNECTED'],
    ]
    : [
      ['FLUSHING LOCAL STATE', 'ACTIVE SESSION DETACHED'],
      ['CLOSING REMOTE CHANNEL', 'TRACE HANDLE RELEASED'],
      ['CLEARING DISPLAY BUFFER', 'LOCAL CONSOLE SUSPENDED'],
      ['DISPLAY POWER CUT', 'LOCAL CONSOLE DISCONNECTED'],
    ];

  shutdownSequence.classList.toggle('trace-expired', traceExpired);
  shutdownKicker.textContent = traceExpired ? 'TRACE WINDOW // 00:00' : 'LOCAL DISPLAY // POWER DOWN';
  shutdownTitle.innerHTML = traceExpired
    ? '<span>SIGNAL</span><span>LOCATED</span>'
    : '<span>CLOSING</span><span>SESSION</span>';
  shutdownEvents.replaceChildren();
  shutdownSequence.hidden = false;
  for (let index = 0; index < phases.length; index++) {
    audio.play(index === phases.length - 1 ? 'power-cut' : 'shutdown-stage');
    const [phase, event] = phases[index];
    shutdownSequence.dataset.phase = String(index + 1);
    shutdownPhase.textContent = phase;
    shutdownCounter.textContent = `${pad2(index + 1)} / ${pad2(phases.length)}`;
    shutdownMeter.style.setProperty('--shutdown-progress', String((index + 1) / phases.length));
    const entry = document.createElement('div');
    entry.className = 'shutdown-event';
    entry.textContent = `> ${event}`;
    shutdownEvents.appendChild(entry);
    await wait(traceExpired ? 850 : 760);
  }

  shutdownSequence.hidden = true;
  const shutdownLine = line('POWERING DOWN DISPLAY...', 'big powering-down-line');
  await wait(900);
  shutdownLine.classList.add('powering-down-line-active');
  screen.classList.add('shutdown');
  await wait(1350);
  openModal(powerPanel);
  restartControl.focus();
}

async function watcherTakeover(trace) {
  audio.setScene('intrusion');
  audio.play('intrusion');
  const overlay = document.createElement('div');
  overlay.className = 'breach-sequence';
  overlay.setAttribute('role', 'alert');
  const frame = document.createElement('div');
  frame.className = 'breach-frame';
  frame.innerHTML = '<div class="breach-kicker">REMOTE OPERATOR // SESSION CONTROL</div><div class="breach-title">ACCESS<br>REVOKED</div><div class="breach-feed" aria-live="assertive"></div><div class="breach-track"><span></span></div>';
  overlay.appendChild(frame);
  document.body.appendChild(overlay);
  screen.classList.add('intrusion');
  trace.set(60);
  trace.boost(8);

  const feed = frame.querySelector('.breach-feed');
  const progress = frame.querySelector('.breach-track span');
  const stages = [
    'REMOTE CONSOLE // OPERATOR VERIFIED',
    'GUEST SHELL // ACCESS REVOKED',
    'TRACE REQUEST // EVENT LOGGED',
    'SESSION CHANNEL // CLOSED',
  ];
  for (const [index, stage] of stages.entries()) {
    const entry = document.createElement('div');
    entry.textContent = `> ${stage}`;
    feed.appendChild(entry);
    audio.play(index === stages.length - 1 ? 'disconnect' : 'signal');
    progress.style.transform = `scaleX(${(stages.length - index - 1) / stages.length})`;
    setRain(0.75);
    await wait(1050);
  }
  overlay.remove();
  screen.classList.remove('intrusion');
  audio.setScene('puzzle');
  setRain(0.22);
  line('[WATCHER] your shell has been closed.', 'warn');
  line('[WATCHER] you should have stayed out.', 'warn');
  await wait(300);
}

async function resetGame() {
  restartControl.disabled = true;
  beginSession('reboot'); // abort the previous run for good, then start a fresh session
  await Promise.resolve(); // let the aborted chains unwind before touching the DOM
  audio.setScene('idle');
  audio.play('reboot');
  restartControl.disabled = true;
  powerPanel.classList.add('rebooting');
  screen.classList.remove('shutdown', 'intrusion');
  screen.style.opacity = '1';
  out.replaceChildren();
  powerTitle.innerHTML = 'RESTORING<br>CONSOLE';
  powerStatus.innerHTML = 'LOCAL DISPLAY <span>///</span> LINK INITIALIZATION';
  restartControl.textContent = '[ REINITIALIZING... ]';
  const bootStages = [
    'DISPLAY RAILS ONLINE',
    'FRAME BUFFER SYNCHRONIZED',
    'LOCAL CONSOLE MOUNTED',
    'GUEST SESSION READY',
    'LINK STABLE',
  ];
  for (const stage of bootStages) {
    powerBootLog.textContent = stage;
    await wait(680);
  }
  await wait(800);
  powerPanel.classList.remove('rebooting');
  closeModal(powerPanel);
  screen.classList.add('recovering');
  powerTitle.innerHTML = 'SESSION<br>TERMINATED';
  powerStatus.innerHTML = 'REMOTE SESSION CLOSED <span>///</span> LOCAL DISPLAY OFFLINE';
  powerBootLog.textContent = 'AWAITING LOCAL INPUT';
  restartControl.textContent = '[ REBOOT SYSTEM ]';
  restartControl.disabled = false;
  document.body.classList.remove('powering-down');
  setRain(0, true);
  window.scrollTo(0, 0);
  document.getElementById('hud')?.remove();
  cancelSkipHold();
  caseFile.start();
  setSkipHint('BOOT');
  line('LOCAL CONSOLE RESTORED', 'dim');
  audio.setScene('boot');
  void startStory();
  await wait(1900);
  screen.classList.remove('recovering');
}

// přepíše všechny výskyty jména na obrazovce: nejdřív se rozpadne na šum,
// pak se šum po písmenech zamkne do nového jména
async function renameEverywhere(from, to, { restoreRain = 0.22 } = {}) {
  const targets = [];
  const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeValue.includes(from)) targets.push({ n, base: n.nodeValue });
  }
  if (motionReduced()) {
    targets.forEach((target) => {
      target.n.nodeValue = target.base.split(from).join(to);
    });
    return;
  }
  const everyChar = () => true;
  const decayFrames = 6;
  const lockFrames = 10;
  setRain(0.8);
  screen.classList.add('g-rgb');
  for (let f = 0; f <= decayFrames + lockFrames; f++) {
    let mid;
    if (f < decayFrames) {
      mid = scrambleText(from, { intensity: (f + 1) / decayFrames, eligible: everyChar });
    } else {
      const locked = Math.floor(((f - decayFrames) / lockFrames) * to.length);
      const chars = [...to];
      mid = chars.slice(0, locked).join('') + scrambleText(chars.slice(locked).join(''), { intensity: 1, eligible: everyChar });
    }
    targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(mid); });
    if (f === 3) staticBurst(500).catch(swallowAbort); // fire-and-forget: an abort is expected here
    await sleep(80);
  }
  screen.classList.remove('g-rgb');
  targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(to); });
  await gfx('slice');
  await gfx('invert');
  setRain(restoreRain);
}

// po odemčení sdb9 hráč spustí ghost.sh (napsat, nebo klepnout). Čas běží dál.
async function promptGhost(trace) {
  const state = { over: null };
  trace.onEnd = () => { state.over = 'TRACE COMPLETE'; ttyAbort(); };

  let tapped = false;
  const choices = renderChoices({
    container: out,
    options: [{ key: '1', label: './ghost.sh' }],
    onPick: () => {
      if (tapped) return;
      tapped = true;
      ttyAbort();
    },
  });

  const runs = ['1', './ghost.sh', 'ghost.sh', 'sh ghost.sh', 'sh ./ghost.sh', 'bash ghost.sh',
    'bash ./ghost.sh', 'run ghost.sh', 'ghost'];
  let ok = false;
  while (!ok && !state.over) {
    const raw = tapped ? null : await readCommand();
    if (tapped) {
      // klepnutí: příkaz se "napíše" do terminálu sám
      closePrompt();
      choices.lock();
      await cmd('./ghost.sh', 40);
      caseFile.decide('ghost-run', 'CONTAINMENT SCRIPT EXECUTED', 'The cleanup script was launched from the branch prompt.');
      ok = true;
    } else if (raw === null) {
      break;
    } else {
      const c = raw.trim().toLowerCase();
      if (runs.includes(c)) {
        closePrompt();
        choices.lock();
        caseFile.decide('ghost-run', 'CONTAINMENT SCRIPT EXECUTED', 'The cleanup script was launched from the terminal.');
        ok = true;
      } else if (c === 'ls') {
        line('erased.list   ghost.sh');
      } else if (c === 'cat ghost.sh' || c === 'cat ./ghost.sh') {
        caseFile.inspectGhostScript();
        line('#!/bin/sh', 'dim');
        line('# ghost :: by the one who cannot say his name', 'dim');
        line('close_trace');
        line('disconnect_peer watcher');
        line('invalidate_guest_session');
        line('[inspection] three cleanup actions; no key material requested.', 'ok');
      } else if (c) {
        line(`command not found: ${raw.trim()}`, 'warn');
        line('run ghost.sh', 'dim');
      }
    }
  }
  trace.onEnd = null;
  if (state.over) {
    await gameOver(trace, state.over);
    return false;
  }
  return true;
}

// ghost.sh closes the active trace request and remote guest session in this fictional system.
async function runGhost(trace) {
  audio.setScene('ghost');
  audio.play('ghost-transition');
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  const sequence = document.createElement('div');
  sequence.className = 'ghost-sequence';
  sequence.setAttribute('role', 'status');
  sequence.setAttribute('aria-live', 'polite');
  const panel = document.createElement('div');
  panel.className = 'ghost-panel';
  const label = document.createElement('div');
  label.className = 'ghost-label';
  label.textContent = 'FSOCIETY // CONTAINMENT ROUTINE';
  const title = document.createElement('div');
  title.className = 'ghost-title';
  title.textContent = 'GHOST';
  const subtitle = document.createElement('div');
  subtitle.className = 'ghost-subtitle';
  subtitle.textContent = 'LOCAL SESSION CLEANUP';
  const steps = ['CLOSE TRACE REQUEST', 'END REMOTE SESSION', 'REVOKE GUEST TOKEN', 'CLOSE LOCAL SHELL'];
  const list = document.createElement('div');
  list.className = 'ghost-steps';
  const stepRows = steps.map((text, index) => {
    const row = document.createElement('div');
    row.className = 'ghost-step';
    const number = document.createElement('span');
    number.className = 'ghost-step-number';
    number.textContent = `0${index + 1}`;
    const name = document.createElement('span');
    name.className = 'ghost-step-name';
    name.textContent = text;
    const state = document.createElement('span');
    state.className = 'ghost-step-state';
    state.textContent = 'WAIT';
    row.append(number, name, state);
    list.appendChild(row);
    return { row, state };
  });
  const progress = document.createElement('div');
  progress.className = 'ghost-progress';
  progress.appendChild(document.createElement('span'));
  panel.append(label, title, subtitle, list, progress);
  sequence.appendChild(panel);
  document.body.appendChild(sequence);

  let lastAudioStep = -1;
  const setStep = (active) => {
    if (active !== lastAudioStep) {
      audio.play(active === steps.length ? 'success' : 'ghost-step');
      lastAudioStep = active;
    }
    stepRows.forEach(({ row, state }, index) => {
      const status = index < active ? 'DONE' : index === active ? 'ACTIVE' : 'WAIT';
      row.dataset.state = status.toLowerCase();
      state.textContent = status;
    });
    sequence.style.setProperty('--ghost-progress', String(active / steps.length));
  };
  const finishSequence = async () => {
    setStep(steps.length);
    sequence.classList.add('complete');
    await wait(700);
    sequence.remove();
  };

  setStep(0);
  line('[ghost] script started', 'dim');
  await wait(600);
  line('[ghost] checking active sessions...', 'dim');
  await wait(800);
  line('  SESSION   USER      STATE', 'dim');
  line('  pts/0     guest     ACTIVE');
  line('  pts/1     watcher   ACTIVE', 'warn');
  line('  relay     monitor   TRACING', 'warn');
  audio.play('ghost-scan');
  await wait(1300);
  setStep(0);
  await bar('[ghost] refreshing relay route', 1800);
  await wait(500);

  // Close the trace request before ending the remote operator's session.
  setStep(0);
  line('[ghost] closing trace request', 'dim');
  await wait(400);
  audio.play('ghost-command');
  await cmd('close_trace --session relay', 40, 300);
  line('monitor: trace request closed');
  trace.kill();
  audio.play('signal');
  setStep(1);
  await flash();
  await staticBurst(300);
  line('=== TRACE REQUEST CLOSED ===');
  await wait(1200);

  // The watcher remains connected until its session is explicitly closed.
  line();
  line('[ghost] closing remote session: pts/1', 'dim');
  await wait(500);
  await typingFor(900, 'watcher', 'warn');
  line('DIRECT CHANNEL // SESSION KEY VERIFIED', 'secure-channel');
  await say('i opened a private line. listen before he cuts it.', {
    ...W,
    cls: 'secure-message',
    speed: 38,
  });
  await wait(700);
  await say('he is not trying to save you. he needs you to open it.', {
    ...W,
    cls: 'secure-message',
    speed: 38,
  });
  await wait(600);
  await say('when it opens, the list has your name too.', {
    ...W,
    cls: 'secure-message',
    speed: 38,
  });
  await wait(500);
  await say('wait. you do not understand what he-', { ...W, speed: 35 });
  setStep(1);
  audio.play('ghost-command');
  await cmd('disconnect_peer watcher', 40, 300);
  audio.play('intrusion');
  line('watcher: remote session closed', 'warn');
  setStep(2);
  await gfx('slice');
  await staticBurst(500);
  line(`[ghost] peer address ${ip()} added to the local deny list`, 'dim');
  await wait(300);
  line('[ghost] guest session token invalidated', 'dim');
  line('*** watcher disconnected ***', 'warn');
  setStep(3);
  await gfx('roll');
  await wait(900);

  // End the local guest shell after the remote session is closed.
  line();
  await bar('[ghost] closing guest shell', 1200);
  line('[ghost] done. you are a ghost.');
  await finishSequence();
  audio.setScene('puzzle');
  await wait(700);
}

// After sdb9 is unlocked, ghost.sh closes the trace request and the watcher's
// remote session before the erased-user list and unknown's identity are revealed.
async function playIdentityReveal(trusted) {
  const R = { name: 'Mr. Robot' };
  audio.setScene('reveal');
  await say('you came here looking for a name.', { speed: 55 });
  await wait(700);
  setRain(0.26, true);
  await say('names are how they keep track of us.', { speed: 52 });
  await wait(850);
  await say('but you already know the one they gave me-', { speed: 70 });
  setRain(0, true);

  await renameEverywhere('unknown', 'Mr. Robot', { restoreRain: 0 });
  await wait(1250);

  audio.play('identity');
  const surge = document.createElement('div');
  surge.className = 'identity-surge';
  surge.setAttribute('aria-hidden', 'true');
  document.body.appendChild(surge);
  screen.classList.add('identity-lock');
  audio.play('identity-hit');
  audio.play('hello-friend');
  const hello = await say('hello, friend.', { ...R, cls: 'big mr-hello mr-hello-center', speed: 112 });
  await glitchHello(hello);
  await wait(900);
  await moveHelloIntoChat(hello);
  await wait(800);
  surge.remove();
  screen.classList.remove('identity-lock');
  setRain(0.12);
  audio.setScene('story');
  await say('bonsoir.', { ...R, cls: 'mr-reference', speed: 65 });
  await wait(1300);
  await say('this time you can see who is talking.', { ...R, speed: 60 });
  await wait(1300);
  await say('i threw the watcher out of the session.', { ...R, speed: 55 });
  await wait(1400);
  await say('he will find a way back. he always does.', { ...R, speed: 60 });
  await wait(1300);
  line();
  line('=== LEVEL 01 COMPLETE ===');
  await gfx('zoom');
  line('sdb9: access granted for this session', 'dim');
  await wait(900);
  line('[ALERT] watcher connection: retry attempt detected', 'warn');
  await wait(900);
  line('// you are a ghost. this is where the signal ends.', 'dim');
}

async function moveHelloIntoChat(hello) {
  const targetSlot = document.createElement('span');
  targetSlot.className = 'mr-hello-chat mr-hello-placeholder';
  targetSlot.textContent = hello.textContent;
  hello.replaceWith(targetSlot);
  scroll();
  const target = targetSlot.getBoundingClientRect();

  const flightLayer = document.createElement('div');
  flightLayer.className = 'hello-flight-layer';
  flightLayer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(flightLayer);
  flightLayer.appendChild(hello);

  if (!motionReduced()) {
    const start = hello.getBoundingClientRect();
    const dx = target.left + target.width / 2 - (start.left + start.width / 2);
    const dy = target.top + target.height / 2 - (start.top + start.height / 2);
    const scaleX = target.width / Math.max(start.width, 1);
    const scaleY = target.height / Math.max(start.height, 1);
    audio.play('hello-move');
    const flight = hello.animate([
      { transform: 'translate(-50%, -50%) scale(1, 1)' },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scaleX}, ${scaleY})` },
    ], {
      duration: 1200,
      easing: 'cubic-bezier(.22, .75, .18, 1)',
      transformOrigin: 'top left',
      fill: 'forwards',
    });
    const owner = session;
    owner.onAbort(() => flight.cancel()); // cancelling rejects `finished` with an AbortError
    await flight.finished;
    owner.throwIfAborted();
    flight.cancel();
  }
  targetSlot.replaceWith(hello);
  hello.classList.remove('mr-hello-center');
  hello.classList.add('mr-hello-chat');
  flightLayer.remove();
}

async function revealName(trace, trusted) {
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  await bar('unlocking /dev/sdb9', 2200);
  await svc('Mounted /dev/sdb9.');
  await flash();
  await staticBurst(400);
  line();
  line('/dev/sdb9: 2 files', 'dim');
  line('owner: unknown', 'dim');
  await wait(1000);
  await cmd('ls /mnt/sdb9');
  line('erased.list   ghost.sh');
  await wait(1200);
  line();

  // watcher je pořád ve session (vložil se dřív) a snaží se zabránit
  line('*** watcher: session still active ***', 'warn');
  await staticBurst(400);
  await typingFor(1100, 'watcher', 'warn');
  await say('close it.', { ...W, speed: 60 });
  await wait(700);
  await say('you do not know what is in there.', { ...W, speed: 40 });
  await wait(600);
  line('[ALERT] watcher remote session still active (pts/1)', 'warn');
  line('[ALERT] trace request ETA 02:00', 'warn');
  trace.slow();
  trace.set(120);
  await gfx('rgb');
  await wait(800);
  await say('he is still on the line.', { speed: 45 });
  await wait(700);
  await say('he had a session here before you arrived.', { speed: 45 });
  await wait(700);
  await say('there is a script on sdb9. ghost.sh.', { speed: 45 });
  await wait(700);
  await staticBurst(180);
  await say('run it.', { cls: 'urgent-command', speed: 115 });
  await wait(240);
  await say('NOW.', { cls: 'urgent-command', speed: 155 });
  await wait(500);
  line();

  if (!(await promptGhost(trace))) return;
  line();
  await runGhost(trace);
  line();

  await cmd('cat /mnt/sdb9/erased.list');
  const redact = () => '█'.repeat(rand(5, 11));
  for (let i = 1; i <= 9; i++) {
    line(`${String(i).padStart(4, '0')}  ${redact()}  ERASED`, 'dim');
    await wait(110);
  }
  line('  ...', 'dim');
  await wait(500);
  line('4096  ████████  ERASED', 'dim');
  await wait(900);
  const mine = line('4097  ████████     PENDING', 'warn');
  mine.classList.add('pending-record');
  await gfx('invert');
  await wait(1600);
  line();

  await typingFor(2200);
  await say('it worked.', { speed: 80 });
  await wait(1100);
  await say('the trace is quiet. the watcher is gone.', { speed: 55 });
  await wait(1300);
  await say('but look at the list.', { speed: 70 });
  caseFile.discover('erased-list');
  await wait(1200);
  await say('4097. that is you.', { cls: 'warn', speed: 80 });
  await wait(1400);
  await say('that is how they find people.', { speed: 55 });
  await wait(1500);
  audio.play('ghosted-stamp');
  mine.classList.remove('pending-record');
  mine.className = 'ghosted-record';
  const ghostedId = document.createElement('span');
  ghostedId.className = 'ghosted-id';
  ghostedId.textContent = '4097';
  const ghostedGuest = document.createElement('span');
  ghostedGuest.className = 'ghosted-user';
  ghostedGuest.textContent = '████████';
  const ghosted = document.createElement('span');
  ghosted.className = 'ghosted-word';
  ghosted.textContent = 'GHOSTED';
  mine.replaceChildren(ghostedId, document.createTextNode('  '), ghostedGuest, document.createTextNode('         '), ghosted);
  screen.classList.add('ghosted-hit');
  await gfx('rgb');
  await wait(700);
  screen.classList.remove('ghosted-hit');
  await wait(900);
  await say('ghost.sh took you off it. for now.', { speed: 55 });
  await wait(1500);
  await say(trusted === 'unknown'
    ? 'you chose the voice that warned you about the abort command.'
    : branchDialogueForWatcher(caseFile.snapshot()),
  { speed: 55 });
  await wait(1500);
  const branch = caseFile.snapshot();
  const outcome = trusted === 'unknown'
    ? branch.relayVerified && branch.ghostScriptInspected ? 'verified-handoff' : 'unverified-handoff'
    : branch.watcherIsolated ? 'contained-exit' : 'open-relay-exit';
  caseFile.setOutcome(outcome);
  const assessment = {
    'verified-handoff': 'you checked the relay. you read the script. then you ran it.',
    'unverified-handoff': 'you trusted the relay. the trace is closed, but the script was never verified.',
    'contained-exit': 'you read his session log. pts/1 was isolated before the cleanup.',
    'open-relay-exit': 'the script closed the session. you left the watcher channel open until then.',
  }[outcome];
  await say(assessment, { cls: outcome.includes('verified') || outcome === 'contained-exit' ? 'ok' : 'warn', speed: 52 });
  await wait(1100);
  await playIdentityReveal(trusted);
}

function branchDialogueForWatcher(investigation) {
  return investigation.watcherIsolated
    ? 'you read the log. you cut my connection before the cleanup.'
    : 'you chose the watcher. his channel stayed open until the script closed it.';
}

async function runStory() {
  let trusted = null; // who the player chose: 'unknown' | 'watcher'
  await wait(600);

  // 1) BIOS / POST
  audio.play('boot-prompt');
  line('FSOC-BIOS v0.0.1  (c) 2015 E Corp', 'dim');
  line('Build 15-05-2015 03:14:07', 'dim');
  line();
  await wait(300);
  line('CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz');
  audio.play('boot-checkpoint');
  await wait(200);
  await memtest();
  await wait(200);
  line('Detecting drives...');
  await wait(500);
  audio.play('drive-seek');
  line('  sda  512GB  SSD  OK', 'dim');
  await wait(180);
  line('  sdb  2TB    HDD  OK', 'dim');
  await wait(180);
  line('  sdc  ----   no media', 'dim');
  await wait(600);
  line();

  // 2) bootloader
  line('GNU GRUB  version 2.02');
  await wait(400);
  line('Loading Linux 4.19.0-fsoc ...');
  await wait(700);
  line('Loading initial ramdisk ...');
  await wait(900);
  audio.play('kernel-start');
  line();

  // 3) kernel log
  await klog('Linux version 4.19.0-fsoc (root@fsociety00) (gcc 8.3.0)');
  await klog('Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1 ro quiet');
  await klog('x86/fpu: Supporting XSAVE feature 0x001: x87 floating point');
  await klog('BIOS-provided physical RAM map:');
  await klog('BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable');
  await klog('BIOS-e820: [mem 0x0000000000100000-0x00000003ffffffff] usable');
  await klog('NX (Execute Disable) protection: active');
  await klog('DMI: E Corp / FSOC-MB 1.0.3, BIOS 0.0.1');
  await klog('tsc: Detected 3600.000 MHz processor');
  await klog('ACPI: Core revision 20180810');
  await klog('PCI: Using configuration type 1 for base access');
  await klog('NET: Registered protocol family 2');
  await klog('TCP: Hash tables configured (established 131072)');
  await klog('usb 1-1: new high-speed USB device number 2');
  await klog('usb 1-1: device descriptor read/64, error -71', 'warn');
  await klog('usb 1-1: Product: unknown');
  await klog('EXT4-fs (sda1): mounted filesystem with ordered data mode');
  await klog('random: crng init done');
  line();
  await wait(400);

  // 4) služby
  await svc('Started Journal Service.');
  await svc('Mounted /boot.');
  await svc('Started udev Kernel Device Manager.');
  await svc('Reached target Local File Systems.');
  await svc('Started Network Manager.');
  await svc('Started OpenSSH server daemon.');
  await svc('Started Tor anonymity daemon.');
  await svc('Started fsociety00 relay service.');
  line();

  // 5) kontrola disku
  await bar('fsck /dev/sda1', 1300);
  line('/dev/sda1: clean, 41392/3276800 files', 'dim');
  await wait(300);
  line();

  // 6) síť
  line('Bringing up network...', 'dim');
  audio.play('network-lock');
  await wait(400);
  line(`eth0: link up, 1000Mbps full duplex`);
  await wait(300);
  line(`eth0: inet ${ip()}  (documentation range)`, 'dim');
  await wait(500);
  line('Negotiating encrypted relay circuit...', 'dim');
  await wait(300);
  for (let i = 1; i <= 5; i++) {
    audio.play('relay-hop');
    line(`  relay ${i}: ${ip()}   ${rand(18, 210)}ms`, 'dim');
    await wait(rand(250, 500));
  }
  line('Tunnel established.');
  await wait(500);
  line();

  // 7) šifrovaný disk
  await svc('Starting cryptsetup for /dev/sdb1...', 'OK', 700);
  audio.play('disk-unseal');
  await bar('unlocking /dev/sdb1', 1800);
  await svc('Mounted /dev/sdb1.');
  await wait(500);
  line();
  line('scanning for partitions...', 'dim');
  await wait(900);
  line('found unlisted partition: /dev/sdb9', 'warn');
  await wait(500);
  line('contents: encrypted', 'dim');
  await wait(250);
  line('owner: unknown', 'dim');
  await wait(900);
  line();

  // 8) něco je špatně
  line('WARNING: unauthorized access detected', 'warn');
  audio.play('trace-warning');
  await wait(700);
  line('source: unknown', 'warn');
  await wait(800);
  line('tracing connection...', 'dim');
  await wait(1300);
  line('trace request failed.', 'warn');
  await wait(700);

  // The BIOS can no longer be skipped once the story intro begins.
  run.skip = false;
  run.skippable = false;
  cancelSkipHold();
  setSkipHint('INTRO', !run.skipToChoice);

  await flash();
  await staticBurst(500);
  await gfx('roll');
  await blackout(1500);
  setRain(0.22);
  audio.setScene('story');

  // 9) příběh
  await wait(900);
  line('*** INCOMING TRANSMISSION ***', 'warn');
  audio.play('transmission');
  await wait(700);
  line('source: unknown', 'dim');
  await wait(500);
  line('direct line open.', 'dim');
  await wait(1800);
  line();

  const story = [];
  await typingFor(2600);

  const hello = await say("you're right on time.", { cls: 'big', speed: 150 });
  story.push(hello);
  await wait(1500);
  await glitchHello(hello);
  await wait(1400);

  await typingFor(1800);
  story.push(await say('i\'ve been waiting for you.', { speed: 80 }));
  await wait(1800);
  story.push(await say('you shouldn\'t be here.', { speed: 75, typoAt: 4 }));
  await wait(1300);
  story.push(await say('but you are.', { cls: 'warn', speed: 100 }));
  await wait(1700);
  story.push(await say('there is something hidden in this system.', { speed: 55 }));
  await wait(1100);
  story.push(await say('find it before they do.', { speed: 55 }));
  await wait(1500);
  story.push(await say('they are already looking for you.', { cls: 'warn', speed: 70 }));
  await gfx('invert');
  await corrupt(8);
  await wait(1200);
  line();
  line('*** unknown disconnected ***', 'warn');
  await wait(1000);
  line('wiping session...', 'dim');
  await wait(900);
  await wipe([...out.children]); // smaže celou obrazovku, ne jen část
  await wait(400);
  await flash();
  await blackout(1600);

  await logo(['FSOCIETY']);
  await gfx('zoom');
  line('//  access level: GUEST  //', 'dim');
  await wait(900);
  line();

  // pokračování
  await svc('Opening guest session.');
  await svc('Checking inbox...', 'OK', 900);
  line();
  line('1 unread message', '');
  audio.play('mail-arrive');
  await wait(600);
  line('from:    unknown', 'dim');
  await wait(300);
  line('subject: sdb9', 'dim');
  await wait(1000);
  line();
  await cmd('cat ~/inbox/001.msg');
  line();
  await type('the partition is not empty.', '', 35);
  await wait(1000);
  await type('it is locked.', '', 35);
  await wait(1200);
  await type('the key is not in this system.', '', 35);
  await wait(1000);
  await type('it is hidden in the page itself.', 'warn', 40);
  await wait(1200);
  await type('look closer.', 'warn', 90);
  await wait(1200);
  line();

  // zadání první úrovně
  line('=== LEVEL 01 :: THE KEY ===');
  audio.play('puzzle-start');
  await gfx('rgb');
  await wait(500);
  line('target:    /dev/sdb9', 'dim');
  await wait(250);
  line('status:    LOCKED', 'warn');
  await wait(250);
  line('attempts:  3', 'dim');
  await wait(250);
  line('key:       ????????', 'dim');
  await wait(1100);
  line();
  await typingFor(2200);
  await say('you have 8 minutes.', { speed: 80 });
  await wait(1300);
  await say('make them count.', { cls: 'warn', speed: 110 });
  await wait(1100);
  line();
  // odpočet se ukáže uprostřed obrazovky, chvíli tam visí a pak se přesune do rohu
  const trace = createTrace(480);
  audio.setScene('puzzle');
  await wait(2800);
  await gfx('rgb');
  await wait(600);
  trace.dock();
  await wait(1500);

  // pokračování: přerušená zpráva, poplach, ztráta spojení
  await typingFor(2000);
  audio.play('disconnect');
  await say('listen carefully.', { speed: 80 });
  await wait(1300);
  await say('sdb9 holds a list.', { speed: 70 });
  await wait(1200);
  await say('everyone they have erased.', { speed: 70 });
  await wait(1400);
  await say('and the key to open it is-', { speed: 95 });
  await gfx('rgb');
  await staticBurst(600);
  line();
  line('*** connection lost ***', 'warn');
  await wait(1200);
  line('[ALERT] IDS: unexpected outbound session observed', 'warn');
  await wait(500);
  line(`[ALERT] ${ip()} flagged`, 'warn');
  await wait(500);
  line('[ALERT] trace rate doubled', 'warn');
  trace.boost();
  await corrupt(6);
  await gfx('roll');
  await wait(900);
  line();
  line('reconnecting...', 'dim');
  await wait(1800);
  line('reconnect failed.', 'warn');
  await wait(1200);
  line();
  await type('you are on your own now.', '', 45);
  await wait(1000);
  await type('hint: not everything is visible.', 'dim', 35);
  await wait(500);
  await type('hint: inspect everything.', 'dim', 35);
  await wait(1200);
  line();

  // otočka: na linku se vlomí někdo jiný
  await wait(1200);
  line('*** new connection: watcher ***', 'warn');
  await staticBurst(350);
  await wait(900);
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  await typingFor(1500, 'watcher', 'warn');
  await say('i see you.', { ...W, speed: 60 });
  await wait(1100);
  await say([{ t: '<unknown>', cls: 'ok' }, { t: ' has been lying to you.' }], { ...W, speed: 45 });
  await wait(1000);
  await say('there is no key.', { ...W, speed: 70 });
  await wait(1200);
  await say('there is only the trace.', { ...W, speed: 70 });
  await gfx('slice');
  trace.boost(3);
  line('[ALERT] second remote login detected: watcher', 'warn');
  await wait(900);
  line('*** unknown reconnected ***', 'dim');
  await staticBurst(300);
  await wait(600);
  await say('don\'t listen to him.', { speed: 55, typoAt: 3 });
  await wait(900);
  await say('he wants you to stop looking.', { speed: 55 });
  await wait(1000);
  await say('keep going.', { cls: 'warn', speed: 90 });
  await wait(900);
  await say('the answer is in the page.', { speed: 70 });
  await gfx('rgb');
  await corrupt(6);
  await wait(1000);
  line();
  await type('who do you trust?', 'dim', 60);
  await wait(1200);
  line();

  // Stop offering skip before the trust choice.
  run.skipToChoice = false;
  run.skipToChoiceArmed = false;
  setSkipHint('INTRO', false);

  // výběr: klepnutí na možnost, nebo napsat příkaz přímo do terminálu
  trusted = await chooseTrust({ out, line, cmd, terminal: sessionTerminal });
  caseFile.chooseTrust(trusted);
  line();
  await wait(700);

  if (trusted === 'unknown') {
    await say('good.', { speed: 90 });
    await wait(900);
    await say('i wasn\'t sure you would.', { speed: 60 });
    await wait(900);
    await say('i can\'t tell you my name yet.', { speed: 60 });
    await wait(900);
    await say('they listen for it.', { speed: 70 });
    await wait(1000);
    line('[ALERT] watcher: connection hostile', 'warn');
    await gfx('slice');
    await typingFor(1200, 'watcher', 'warn');
    await say('he can\'t say it because he does not trust you.', { ...W, speed: 45 });
    await wait(900);
    await say('ignore him.', { speed: 55 });
  } else {
    await say('smart.', { ...W, speed: 80 });
    await wait(900);
    await say([{ t: '<unknown>', cls: 'ok' }, { t: ' wants you inside sdb9.' }], { ...W, speed: 55 });
    await wait(1000);
    await say('ask yourself why.', { ...W, speed: 70 });
    await wait(1100);
    await say('type abort. close the session before it logs you.', { ...W, speed: 50 });
    await wait(900);
    await gfx('rgb');
    await staticBurst(500);
    line('*** unknown reconnected ***', 'dim');
    await wait(700);
    await say('don\'t-', { speed: 120 });
    await gfx('slice');
    await say('he is lying. read the readme.', { speed: 45 });
  }

  await wait(1200);
  line();
  line('[ALERT] monitoring interval recalculated', 'warn');
  await wait(600);
  trace.slow();
  trace.set(120);
  line('ETA RESET: 02:00', 'dim');
  await wait(900);
  await typingFor(1500);
  await say('two minutes. no extensions.', { cls: 'warn', speed: 70 });
  await wait(900);
  await say('type help.', { speed: 90 });
  await wait(600);
  line();

  const opened = await level01()(trace, trusted);
  if (!opened) return;
  await revealName(trace, trusted);
}

function buildContext() {
  return createGameContext({
    out,
    screen,
    line,
    type,
    say,
    cmd,
    wait,
    session,
    gfx,
    flash,
    staticBurst,
    corrupt,
    audio,
    caseFile,
    trace: { create: createTrace, current: () => activeTrace },
    terminal: sessionTerminal,
    gameOver,
    takeover: watcherTakeover,
    revealSourcePart: revealLevel01SourcePart,
    motionReduced,
    isSkipping,
  });
}

// The level is built once per session, from that session's context.
let levelSession = null;
let levelShell = null;
function level01() {
  if (levelSession !== session) {
    levelSession = session;
    levelShell = createLevel01(buildContext());
  }
  return levelShell;
}

// Runs the story in the current session. An abort (reboot, developer jump) is the only error
// swallowed here; anything else is a real bug and must surface.
async function startStory() {
  const owner = session;
  try {
    await runStory();
  } catch (error) {
    swallowAbort(error);
  } finally {
    if (!owner.isAborted()) stopAmbient(); // victory / game-over exits leave no jittering logo behind
  }
}

async function runDeveloperRoute(route) {
  beginSession('developer route'); // stops the previous run completely, with a fresh session and skip state
  await Promise.resolve();
  closePrompt();
  closeModal(launch);
  out.replaceChildren();
  document.getElementById('hud')?.remove();
  document.querySelectorAll('.elliot-echo, .ghost-sequence, .breach-sequence, .identity-surge, .hello-flight-layer')
    .forEach((element) => element.remove());
  screen.classList.remove('shutdown', 'intrusion', 'boot-entry', 'recovering', 'ghosted-hit');
  screen.classList.remove('identity-lock');
  screen.style.opacity = '1';
  document.body.classList.remove('powering-down');
  shutdownSequence.hidden = true;
  closeModal(powerPanel);
  setSkipHint('BOOT', route === 'boot'); // only the full boot has anything to skip; also resets a stale label
  const trusted = route === 'puzzle-watcher' ? 'watcher' : 'unknown';
  caseFile.start(trusted);
  caseFile.chooseTrust(trusted);
  audio.setScene(route === 'boot' ? 'boot' : 'story');

  if (route === 'boot') {
    await runStory();
  } else if (route === 'puzzle' || route === 'puzzle-watcher') {
    audio.setScene('puzzle');
    line(`LOCAL TEST ROUTE // LEVEL 01 // ${trusted.toUpperCase()}`, 'dim');
    const trace = createTrace(120);
    trace.dock();
    const opened = await level01()(trace, trusted);
    if (opened) await revealName(trace, trusted);
  } else if (route === 'ending') {
    audio.setScene('ghost');
    const trace = createTrace(120);
    trace.dock();
    await revealName(trace, trusted);
  } else if (route === 'identity') {
    await playIdentityReveal(trusted);
  } else if (route === 'logo') {
    await logo(['FSOCIETY']);
  } else if (route === 'ghosted') {
    audio.setScene('ghost');
    const row = line();
    row.className = 'pending-record warn';
    row.textContent = '4097  ████████     PENDING';
    audio.play('ghost-scan');
    await wait(900);
    audio.play('ghosted-stamp');
    row.classList.remove('pending-record', 'warn');
    row.replaceChildren();
    row.className = 'ghosted-record';
    const id = document.createElement('span');
    id.className = 'ghosted-id';
    id.textContent = '4097';
    const user = document.createElement('span');
    user.className = 'ghosted-user';
    user.textContent = '████████';
    const stamp = document.createElement('span');
    stamp.className = 'ghosted-word';
    stamp.textContent = 'GHOSTED';
    row.append(id, document.createTextNode('  '), user, document.createTextNode('         '), stamp);
    screen.classList.add('ghosted-hit');
    audio.play('glitch-rgb');
    await wait(700);
    screen.classList.remove('ghosted-hit');
  } else if (route === 'glitches') {
    for (const effect of ['rgb', 'slice', 'roll', 'invert', 'zoom']) {
      await gfx(effect);
    }
  } else if (route === 'takeover') {
    audio.setScene('puzzle');
    const trace = createTrace(60);
    trace.dock();
    await watcherTakeover(trace);
    trace.halt(true);
  } else if (route === 'shutdown') {
    await gameOver({ halt() {} }, 'DEVELOPER SHUTDOWN TEST');
  }
}

openModal(launch);

async function launchStory() {
  if (initialize.disabled) return;
  audio.setScene('boot');
  void audio.unlock().then(() => {
    audio.play('power-on');
  }).catch((error) => {
    console.error('Scene audio could not be started from the initialize action.', error);
  });
  initialize.disabled = true;
  caseFile.start();
  launch.classList.add('initializing');
  const stages = ['NEGOTIATING DISPLAY MODE', 'VERIFYING LOCAL CONSOLE', 'OPENING GUEST SESSION'];
  for (const stage of stages) {
    launchStatus.textContent = stage;
    await wait(500);
  }
  await wait(250);
  launch.classList.add('departing');
  await wait(520);
  closeModal(launch);
  launch.classList.remove('initializing');
  launch.classList.remove('departing');
  initialize.disabled = false;
  initializeLabel.textContent = '[ INITIALIZE SYSTEM ]';
  launchStatus.textContent = '';
  screen.classList.add('boot-entry');
  setSkipHint('BOOT');
  void startStory();
  await wait(1050);
  screen.classList.remove('boot-entry');
}
initialize.addEventListener('click', () => { launchStory().catch(swallowAbort); });

restartControl.addEventListener('click', () => { resetGame().catch(swallowAbort); });
installDeveloperMenu((action) => {
  void audio.unlock()
    .then(() => runDeveloperRoute(action))
    .catch((error) => {
      if (isAbortError(error)) return; // a newer route / reboot replaced this one
      console.error(`Could not start audio for developer route "${action}".`, error);
    });
});
