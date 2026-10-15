// The ghost route's two interactive pieces: the `./ghost.sh` prompt (tap or type; inspecting the script is
// optional) and the panel that shows the script's four steps. The text, the timing and the order of the sequence
// are story data (story-data/ghost.js); this module only holds the DOM and the input loop.
//
// Built once per session from the GameContext (like level01.js).

import { renderChoices } from './choices.js';
import { GHOST_PANEL, GHOST_PROMPT } from './story-data/ghost.js';

/** @param {import('./context.js').GameContext} ctx */
export function createGhost(ctx) {
  const { out, line, cmd, wait, audio, caseFile, session, gameOver } = ctx;
  const { readCommand, abort: abortPrompt, close: closePrompt } = ctx.terminal;

  /**
   * Waits for the player to run ghost.sh while the trace keeps running. Resolves true when it is run, false when
   * the trace ran out first (the game over has been played).
   */
  async function prompt() {
    const trace = ctx.trace.current();
    const state = { over: null };
    trace.onEnd = () => { state.over = 'TRACE COMPLETE'; abortPrompt(); };

    let tapped = false;
    const choices = renderChoices({
      container: out,
      options: [{ key: '1', label: GHOST_PROMPT.button }],
      onPick: () => {
        if (tapped) return;
        tapped = true;
        abortPrompt();
      },
    });

    let ok = false;
    while (!ok && !state.over) {
      const raw = tapped ? null : await readCommand();
      if (tapped) {
        // A tap "types" the command into the terminal by itself.
        closePrompt();
        choices.lock();
        await cmd(GHOST_PROMPT.button, 40);
        caseFile.decide('ghost-run', ...GHOST_PROMPT.decisions.tapped);
        ok = true;
      } else if (raw === null) {
        break;
      } else {
        const typed = raw.trim().toLowerCase();
        if (GHOST_PROMPT.runs.includes(typed)) {
          closePrompt();
          choices.lock();
          caseFile.decide('ghost-run', ...GHOST_PROMPT.decisions.typed);
          ok = true;
        } else if (typed === 'ls') {
          line(GHOST_PROMPT.listing);
        } else if (GHOST_PROMPT.catCommands.includes(typed)) {
          caseFile.inspectGhostScript();
          GHOST_PROMPT.script.forEach((text, index) => line(text, index < 2 ? 'dim' : ''));
          line(GHOST_PROMPT.inspected, 'ok');
        } else if (typed) {
          line(`command not found: ${raw.trim()}`, 'warn');
          line(GHOST_PROMPT.hint, 'dim');
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

  // ---- the panel ----------------------------------------------------------------------------------

  let sequence = null;
  let stepRows = [];
  let lastAudioStep = -1;
  const steps = GHOST_PANEL.steps;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function open() {
    sequence = element('div', 'ghost-sequence');
    sequence.setAttribute('role', 'status');
    sequence.setAttribute('aria-live', 'polite');
    const panel = element('div', 'ghost-panel');
    const list = element('div', 'ghost-steps');
    stepRows = steps.map((text, index) => {
      const row = element('div', 'ghost-step');
      const state = element('span', 'ghost-step-state', 'WAIT');
      row.append(element('span', 'ghost-step-number', `0${index + 1}`), element('span', 'ghost-step-name', text), state);
      list.appendChild(row);
      return { row, state };
    });
    const progress = element('div', 'ghost-progress');
    progress.appendChild(document.createElement('span'));
    panel.append(element('div', 'ghost-label', GHOST_PANEL.label), element('div', 'ghost-title', GHOST_PANEL.title),
      element('div', 'ghost-subtitle', GHOST_PANEL.subtitle), list, progress);
    sequence.appendChild(panel);
    document.body.appendChild(sequence);
    lastAudioStep = -1;
    session.onAbort(() => sequence?.remove());
  }

  function setStep(active) {
    if (!sequence) return;
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
  }

  async function finish() {
    setStep(steps.length);
    sequence?.classList.add('complete');
    await wait(700);
    sequence?.remove();
    sequence = null;
  }

  return { prompt, panel: { open, setStep, finish } };
}
