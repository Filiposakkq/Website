// The board's command line (phase 4b.3): a small set of evidence commands typed inside the evidence board
// (`help list open scan intercept dump decrypt connect close`). It is not a second shell: the shell keeps the puzzle, and a
// shell-only word typed here answers `use the shell for that`.
//
// One implementation, two entry points: scan, intercept, dump, decrypt and connect are the very same definitions the
// Level 01 shell registers (hacking-commands.js); only the output goes to this log instead of the terminal. The state is the
// case file's, a timed command takes the case file's one job slot (so it can never overlap a shell command), and the trace
// decides the price (the commands need a link, and nothing is charged or lost until the trace is lethal).
//
// This file owns no timer and no DOM: commands wait with `session.sleep`, the pane (board-ui.js) subscribes while it is
// open, and a reboot (session abort) simply rejects the pending sleep. The log lives here, so closing the dialog during a
// `decrypt` loses nothing: the output is there when the board is opened again.

import { createRegistry } from './commands.js';
import { registerHackingCommands } from './hacking-commands.js';
import { BOARD_PROMPT, BOARD_USE_SHELL, BOARD_SHELL_WORDS, BOARD_HELP_HINT } from './story-data/hacking.js';

const MAX_LINES = 300;
const MAX_HISTORY = 50;
const STATE_WORD = { unlocked: 'read', decrypted: 'decrypted', locked: 'locked', compromised: 'lost' };

/**
 * @param {{ caseFile: object, audio: object, session: object, motionReduced: () => boolean, getTrace: () => (object|null) }} deps
 */
export function createBoardCommands({
  caseFile, audio, session, motionReduced, getTrace,
}) {
  /** @type {{ text: string, cls: string, silent: boolean }[]} */
  let entries = [];
  let history = [];
  let introduced = false;
  let running = false;
  const listeners = new Set();
  const notify = (kind, entry) => listeners.forEach((listener) => listener(kind, entry));

  /** Prints one line to the log. Returns an object whose `textContent` can be set later (the progress line). */
  function line(text = '', cls = '', options = {}) {
    const entry = { text: String(text), cls, silent: !!options.silent };
    entries.push(entry);
    if (entries.length > MAX_LINES) entries = entries.slice(-MAX_LINES);
    notify('line', entry);
    return {
      get textContent() { return entry.text; },
      set textContent(value) {
        entry.text = String(value);
        notify('update', entry);
      },
    };
  }

  const registry = createRegistry();
  registerHackingCommands(registry, {
    audio, session, caseFile, motionReduced,
  }, {
    line,
    hidePrompt: () => {},
    // The trace has ended (lethal and at zero): a running job stops. Before that the trace cannot end.
    over: () => {
      const trace = getTrace();
      return !!trace && trace.mode() === 'lethal' && trace.left() <= 0;
    },
    group: 'board',
  });

  registry.register({
    name: 'help', group: 'board', usage: 'help', summary: 'list the board commands',
    run() {
      audio.play('file-read');
      registry.helpLines({}).forEach(([text, cls]) => line(text, cls));
    },
  });

  registry.register({
    name: 'list', group: 'board', usage: 'list', summary: 'list the records and their state',
    run() {
      audio.play('file-read');
      const known = caseFile.getView().items.filter((item) => item.state !== 'hidden' && item.state !== 'sealed');
      if (!known.length) {
        line('no records yet.', 'dim');
        return;
      }
      known.forEach((item) => line(`${item.code.padEnd(4)} ${(STATE_WORD[item.state] ?? item.state).padEnd(10)} ${item.title}`, 'dim'));
    },
  });

  registry.register({
    name: 'open', group: 'board', usage: 'open <id>', summary: 'select a record in the board',
    run(args) {
      if (!args[0]) {
        audio.play('file-read');
        line('usage: open <id|code>', 'dim');
        return;
      }
      const item = caseFile.find(args[0]);
      if (!item) {
        audio.play('cmd-fail');
        line(`open: ${args[0]}: no such node`, 'warn');
        return;
      }
      caseFile.select(item.id);
      const shown = caseFile.getView().items.find((entry) => entry.id === item.id);
      line(`selected ${item.code}  ${shown?.title ?? ''}`.trimEnd(), 'ok');
    },
  });

  registry.register({
    name: 'close', group: 'board', usage: 'close', summary: 'close the board',
    run() {
      caseFile.close();
    },
  });

  /** Runs one typed line. Resolves when it has finished; an abort of the session is swallowed here. */
  async function submit(raw) {
    const text = String(raw ?? '').trim();
    if (!text || running) return;
    history = [...history.filter((item) => item !== text), text].slice(-MAX_HISTORY);
    line(`${BOARD_PROMPT}${text}`, 'cmd');
    running = true;
    notify('busy');
    try {
      const word = text.split(/\s+/)[0].toLowerCase();
      if (!registry.find(word) && BOARD_SHELL_WORDS.includes(word)) {
        audio.play('cmd-fail');
        line(BOARD_USE_SHELL, 'dim');
      } else {
        await registry.dispatch(text, {}, line);
      }
    } catch (error) {
      if (error?.name !== 'AbortError') {
        console.error('A board command failed.', error);
        line('that command failed.', 'warn');
      }
    } finally {
      running = false;
      notify('busy');
    }
  }

  return {
    submit,
    /** Is a command from this line still running (the pane keeps its input read-only meanwhile)? */
    isBusy: () => running,
    /** The live entries (the pane matches progress-line updates by identity; it must not change them). */
    entries: () => [...entries],
    history: () => [...history],
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** The one-line reminder the first time the board is opened in a run (no overlay, no tutorial). */
    introduce() {
      if (introduced) return;
      introduced = true;
      line(BOARD_HELP_HINT, 'dim');
    },
    /** A new run: the log, the history and the reminder start over. */
    reset() {
      entries = [];
      history = [];
      introduced = false;
      running = false;
      notify('reset');
    },
    /** For tests and the validator: the registered board commands. */
    definitions: () => registry.definitions(),
    wordsKnown: () => registry.names(),
  };
}
