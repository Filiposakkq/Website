import { startTrace } from './trace.js';
import { createTraceSound } from './trace-sound.js';
import { createLevel01, revealLevel01SourcePart } from './level01.js';
import { createSession, isAbortError, swallowAbort } from './session.js';
import { createPace } from './pace.js';
import { createEngine } from './engine.js';
import { createOutput } from './output.js';
import { createSkipControl } from './skip-control.js';
import { createGhost } from './ghost.js';
import { createGameContext } from './context.js';
import { createTerminal } from './tty.js';
import { installDeveloperMenu } from './developer-menu.js';
import { createAudioController } from './audio.js';
import { createCaseFile } from './casefile.js';
import { rand, pad2, scrambleText } from './util.js';
import { renderChoices } from './choices.js';
import { createRain } from './rain.js';
import { chooseOption } from './story-choices.js';
import { story as storyData } from './story-data/index.js';
import { VOICES } from './story-data/voices.js';
import { TRACE } from './story-data/constants.js';

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
const srAnnouncer = document.getElementById('srAnnouncer');
const audio = createAudioController();
// The rain reacts to prefers-reduced-motion / body.quiet-motion changes by itself (see rain.js).
const rain = createRain(document.getElementById('rain'));
const setRain = (opacity, immediate = false) => rain.setOpacity(opacity, immediate);
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const ambientIntervals = new Set();

const motionReduced = () => motionPreference.matches || document.body.classList.contains('quiet-motion');
let activeTrace = null;
const caseFile = createCaseFile({
  trigger: document.getElementById('caseTrigger'),
  getTraceLeft: () => activeTrace?.left() ?? null,
});
// `mode` is the trace policy (trace.js): the story data starts it `running` (it cannot expire) and turns it
// `lethal` after the trust choice. Code that jumps straight into the puzzle asks for `lethal`.
const createTrace = (seconds, mode = 'running') => {
  activeTrace?.halt(true);
  audio.play('trace-appear');
  activeTrace = startTrace(seconds, { session, mode, onSecond: createTraceSound(audio) });
  return activeTrace;
};
document.body.classList.toggle('quiet-motion', motionPreference.matches);
motionPreference.addEventListener('change', () => {
  document.body.classList.toggle('quiet-motion', motionPreference.matches);
});

// One session per run of the story (see session.js). Aborting it stops every timer, sleep and
// listener the run started, so a reboot or developer jump cannot leak into the next run. Each session has its
// own pace (skip / reduced motion), engine and skip control, built by prepareRun().
let session = createSession();
let pace = createPace({ session, motionReduced });
let engine = null;

function prepareRun() {
  const skipControl = createSkipControl({ element: skipHint, session });
  engine = createEngine({
    story: storyData,
    host: engineHost,
    session,
    pace,
    events: { onSegment: skipControl.onSegment, onSkip: skipControl.onSkip },
  });
  skipControl.attach(engine);
  output.reset();
}

const isSkipping = () => pace.isSkipping();

// Everything sleeps through the *current* session, so aborting it wakes every awaiting chain at once.
const sleep = (ms) => pace.sleep(ms);
const wait = (ms) => pace.wait(ms);
const ip = () => `203.0.113.${rand(1, 254)}`;
const scroll = () => window.scrollTo(0, document.body.scrollHeight);
const terminal = createTerminal({
  out,
  promptLine,
  scroll,
  onKeyPress: (key) => audio.play(key === 'Enter' ? 'command-submit' : 'key-tick'),
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
  srAnnouncer.replaceChildren();
  shutdownSequence.hidden = true;
  screen.style.opacity = '1';
}

// What has to stop when a session aborts.
function armSession(target) {
  target.onAbort(() => {
    closePrompt();
    activeTrace?.halt(true);
    activeTrace = null;
    stopAmbient();
    caseFile.close();
    // Cues and the voice clip stop at once; the bed fades out smoothly (a reboot must not leave sound behind).
    audio.stopAll({ beds: false });
    audio.setScene('idle');
    sweepStage();
  });
}

function beginSession(reason) {
  session.abort(reason);
  session = createSession();
  pace = createPace({ session, motionReduced });
  armSession(session);
  prepareRun();
}
armSession(session);

// Output primitives (line, type, say, bar, klog, svc, ...) live in output.js. Screen readers hear finished lines
// only (see output.js); the engine says which segments are decorative.
const output = createOutput({
  out,
  announcer: srAnnouncer,
  audio,
  getPace: () => pace,
  motionReduced,
  isAnnouncing: () => engine?.announces() ?? true,
  voices: VOICES,
});
const {
  line, type, bar, klog, svc, memtest, probe, cmd, typingFor, say, helloSlots,
} = output;

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
  trace.set(TRACE.takeover);
  trace.boost(TRACE.takeoverRate);

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
  caseFile.start();
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
  const hello = await say('hello, friend.', { ...R, cls: 'big mr-hello mr-hello-center', speed: 112, floating: true });
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
  let targetSlot = helloSlots.get(hello);
  let flightLayer = hello.parentElement?.classList.contains('hello-flight-layer') ? hello.parentElement : null;
  if (!targetSlot) {
    targetSlot = document.createElement('span');
    targetSlot.className = 'mr-hello-chat mr-hello-placeholder';
    hello.replaceWith(targetSlot);
  }
  targetSlot.textContent = hello.textContent;
  scroll();
  const target = targetSlot.getBoundingClientRect();

  if (!flightLayer) {
    flightLayer = document.createElement('div');
    flightLayer.className = 'hello-flight-layer';
    flightLayer.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flightLayer);
    flightLayer.appendChild(hello);
  }

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

// MIGRATION (phase 3.7): the rest of the ending (the erased list, the GHOSTED stamp, the assessment and the reveal).
async function legacyEnding(trusted) {
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
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

// MIGRATION (phase 3): the boot and the intro are story data (story-data/). The rest still lives in legacyRest()
// until steps 3.5 to 3.7 turn it into nodes. The engine calls it through `host.legacy`.
// MIGRATION (phase 3.8): Level 01's shell still lives in level01.js. Resolves true when sdb9 was unlocked, false
// when the game is over (trace, lock-out, abort).
function legacyLevel(trusted) {
  return level01()(activeTrace, trusted);
}

// What the narrative engine can do on screen. Everything visible goes through here (engine.js never touches the DOM).
const engineHost = {
  line,
  type,
  say: (text, options) => say(text, options),
  typingFor,
  cmd,
  bar,
  klog,
  svc,
  memtest,
  probe,
  wait: (ms) => wait(ms),
  sfx: (cue, params) => audio.play(cue, params),
  setScene: (name) => audio.setScene(name),
  gfx: (name) => gfx(name),
  flash: () => flash(),
  staticBurst: (ms) => staticBurst(ms),
  corrupt: (rounds) => corrupt(rounds),
  blackout: (ms) => blackout(ms),
  setRain: (opacity, immediate) => setRain(opacity, immediate),
  logo: (words) => logo(words),
  wipe: () => wipe([...out.children]),
  trace: (action) => {
    switch (action.do) {
      case 'start': createTrace(action.secs, action.mode ?? 'running'); break;
      case 'dock': activeTrace?.dock(); break;
      case 'boost': activeTrace?.boost(action.rate); break;
      case 'slow': activeTrace?.slow(); break;
      case 'set': activeTrace?.set(action.secs); break;
      case 'mode':
        activeTrace?.setMode(action.mode);
        if (action.mode === 'lethal') audio.play('trace-start');
        break;
      case 'close': activeTrace?.close(); break;
      default: throw new Error(`trace action "${action.do}" is not implemented yet`);
    }
  },
  choose: (node) => chooseOption({ out, line, cmd, terminal: sessionTerminal }, node.options),
  get caseFile() { return caseFile; },
  // MIGRATION: removed step by step in 3.4 to 3.7.
  glitchHello: (element) => glitchHello(element),
  get ghost() { return ghost(); },
  legacy: { level: (trusted) => legacyLevel(trusted), ending: (trusted) => legacyEnding(trusted) },
};

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

// The ghost route's prompt and panel, also built once per session.
let ghostSession = null;
let ghostShell = null;
function ghost() {
  if (ghostSession !== session) {
    ghostSession = session;
    ghostShell = createGhost(buildContext());
  }
  return ghostShell;
}

// Runs the story in the current session. An abort (reboot, developer jump) is the only error
// swallowed here; anything else is a real bug and must surface.
async function startStory() {
  const owner = session;
  try {
    await engine.run();
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
  const trusted = route === 'puzzle-watcher' ? 'watcher' : 'unknown';
  caseFile.start(trusted);
  caseFile.chooseTrust(trusted);
  audio.setScene(route === 'boot' ? 'boot' : 'story');

  if (route === 'boot') {
    await engine.run();
  } else if (route === 'puzzle' || route === 'puzzle-watcher') {
    audio.setScene('puzzle');
    line(`LOCAL TEST ROUTE // LEVEL 01 // ${trusted.toUpperCase()}`, 'dim');
    const trace = createTrace(TRACE.afterTrust, 'lethal');
    trace.dock();
    const opened = await legacyLevel(trusted);
    if (opened) await engine.run({ from: 'unlock', state: { trusted } });
  } else if (route === 'ending') {
    audio.setScene('ghost');
    const trace = createTrace(TRACE.afterTrust, 'lethal');
    trace.dock();
    await engine.run({ from: 'unlock', state: { trusted } });
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
    const trace = createTrace(TRACE.takeover, 'lethal');
    trace.dock();
    await watcherTakeover(trace);
    trace.halt(true);
  } else if (route === 'shutdown') {
    await gameOver({ halt() {} }, 'DEVELOPER SHUTDOWN TEST');
  }
}

prepareRun();
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
