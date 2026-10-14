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
import { rand } from './util.js';
import { renderChoices } from './choices.js';
import { createRain } from './rain.js';
import { chooseOption } from './story-choices.js';
import { story as storyData } from './story-data/index.js';
import { VOICES } from './story-data/voices.js';
import { TRACE } from './story-data/constants.js';
import { createScreenFx } from './fx-screen.js';
import { createLogo } from './logo.js';
import { createEndings } from './endings.js';
import { createReveal } from './reveal.js';

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
  fx.reset();
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

// Screen effects, the logo, the two failure endings and the identity reveal live in their own modules.
const fx = createScreenFx({ out, screen, audio, getPace: () => pace, motionReduced, setRain });
const { gfx, flash, staticBurst, corrupt, blackout, glitchHello } = fx;
const logo = createLogo({
  out, audio, getSession: () => session, wait, motionReduced, scroll,
  onAmbient: (id) => ambientIntervals.add(id),
});
const { gameOver, watcherTakeover } = createEndings({
  screen, line, audio, wait, caseFile, closePrompt, stopAmbient, setRain, openModal,
});
const reveal = createReveal({
  out, screen, audio, getSession: () => session, sleep, motionReduced, setRain, gfx, staticBurst, scroll, helloSlots,
});

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
  wipe: () => fx.wipe([...out.children]),
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
  screenClass: (name, on) => screen.classList.toggle(name, on),
  glitchHello: (element) => glitchHello(element),
  reveal,
  // MIGRATION: removed in 3.8.
  get ghost() { return ghost(); },
  legacy: { level: (trusted) => legacyLevel(trusted) },
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
    await engine.run({ from: 'reveal', state: { trusted } });
  } else if (route === 'logo') {
    await logo(['FSOCIETY']);
  } else if (route === 'ghosted') {
    audio.setScene('ghost');
    const row = line('4097  ████████     PENDING', 'pending-record warn');
    audio.play('ghost-scan');
    await wait(900);
    audio.play('ghosted-stamp');
    reveal.stampGhosted(row);
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
