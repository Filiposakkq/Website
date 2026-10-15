// The bad endings: the shutdown sequence after a game over and the watcher's takeover. Text and timing are story
// data (story-data/endings.js); this module drives the overlays. Created once per page.

import { pad2 } from './util.js';
import { GAME_OVER, TAKEOVER } from './story-data/endings.js';
import { TRACE } from './story-data/constants.js';

/**
 * @param {object} deps
 * @param {HTMLElement} deps.screen
 * @param {(text?: string, cls?: string) => HTMLElement} deps.line
 * @param {{ play: (cue: string) => void, setScene: (scene: string) => void }} deps.audio
 * @param {(ms: number) => Promise<void>} deps.wait
 * @param {{ setFailureOutcome: (reason: string) => void }} deps.caseFile
 * @param {() => void} deps.closePrompt
 * @param {() => void} deps.stopAmbient
 * @param {(opacity: number, immediate?: boolean) => void} deps.setRain
 * @param {(dialog: HTMLDialogElement) => void} deps.openModal
 */
export function createEndings({ screen, line, audio, wait, caseFile, closePrompt, stopAmbient, setRain, openModal }) {
  const byId = (id) => document.getElementById(id);
  const powerPanel = byId('powerPanel');
  const restartControl = byId('restartControl');
  const sequence = byId('shutdownSequence');
  const kicker = byId('shutdownKicker');
  const title = byId('shutdownTitle');
  const phaseLabel = byId('shutdownPhase');
  const counter = byId('shutdownCounter');
  const meter = byId('shutdownMeter');
  const events = byId('shutdownEvents');

  /** The remote session ends; the local terminal then powers down. */
  async function gameOver(trace, reason) {
    caseFile.setFailureOutcome(reason);
    closePrompt();
    stopAmbient();
    const data = reason === GAME_OVER.traceExpired.reason ? GAME_OVER.traceExpired : GAME_OVER.closed;
    const traceExpired = data === GAME_OVER.traceExpired;
    audio.setScene('shutdown');
    audio.play(data.cue);
    trace.halt(!traceExpired);
    document.body.classList.add('powering-down');
    setRain(0, true);
    line();
    line(`*** ${reason} ***`, 'warn');
    line(data.statusLine, 'warn');

    sequence.classList.toggle('trace-expired', traceExpired);
    kicker.textContent = data.kicker;
    title.replaceChildren(...data.title.map((word) => {
      const span = document.createElement('span');
      span.textContent = word;
      return span;
    }));
    events.replaceChildren();
    sequence.hidden = false;
    for (let index = 0; index < data.phases.length; index++) {
      audio.play(index === data.phases.length - 1 ? 'power-cut' : 'shutdown-stage');
      const [phase, event] = data.phases[index];
      sequence.dataset.phase = String(index + 1);
      phaseLabel.textContent = phase;
      counter.textContent = `${pad2(index + 1)} / ${pad2(data.phases.length)}`;
      meter.style.setProperty('--shutdown-progress', String((index + 1) / data.phases.length));
      const entry = document.createElement('div');
      entry.className = 'shutdown-event';
      entry.textContent = `> ${event}`;
      events.appendChild(entry);
      await wait(data.stepMs);
    }

    sequence.hidden = true;
    const powerDown = line(GAME_OVER.powerDownLine, 'big powering-down-line');
    await wait(900);
    powerDown.classList.add('powering-down-line-active');
    screen.classList.add('shutdown');
    await wait(1350);
    openModal(powerPanel);
    restartControl.focus();
  }

  /** The watcher takes over the guest shell (the `abort` trap on his route). The player is left with a short clock. */
  async function watcherTakeover(trace) {
    audio.setScene('intrusion');
    audio.play('intrusion');
    const overlay = document.createElement('div');
    overlay.className = 'breach-sequence';
    overlay.setAttribute('role', 'alert');
    const frame = document.createElement('div');
    frame.className = 'breach-frame';
    const kickerLine = document.createElement('div');
    kickerLine.className = 'breach-kicker';
    kickerLine.textContent = TAKEOVER.kicker;
    const heading = document.createElement('div');
    heading.className = 'breach-title';
    heading.append(TAKEOVER.title[0], document.createElement('br'), TAKEOVER.title[1]);
    const feed = document.createElement('div');
    feed.className = 'breach-feed';
    feed.setAttribute('aria-live', 'assertive');
    const track = document.createElement('div');
    track.className = 'breach-track';
    const progress = document.createElement('span');
    track.appendChild(progress);
    frame.append(kickerLine, heading, feed, track);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    screen.classList.add('intrusion');
    trace.set(TRACE.takeover);
    trace.boost(TRACE.takeoverRate);

    const stages = TAKEOVER.stages;
    for (const [index, stage] of stages.entries()) {
      const entry = document.createElement('div');
      entry.textContent = `> ${stage}`;
      feed.appendChild(entry);
      audio.play(index === stages.length - 1 ? 'disconnect' : 'signal');
      progress.style.transform = `scaleX(${(stages.length - index - 1) / stages.length})`;
      setRain(0.75);
      await wait(TAKEOVER.stageMs);
    }
    overlay.remove();
    screen.classList.remove('intrusion');
    audio.setScene('puzzle');
    setRain(0.22);
    TAKEOVER.afterLines.forEach((text) => line(text, 'warn'));
    await wait(300);
  }

  return { gameOver, watcherTakeover };
}
