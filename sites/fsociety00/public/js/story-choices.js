// Story-level player choices. These used to live in tty.js, which made the generic terminal
// know about the plot. tty.js now only handles input; the narrative decisions are here.

import { renderChoices } from './choices.js';

const TRUST_OPTIONS = [
  { id: 'unknown', key: '1', label: 'trust <unknown>', match: ['1', 'unknown'] },
  { id: 'watcher', key: '2', label: 'trust <watcher>', match: ['2', 'watcher'] },
];

// Accepted answers: tap a button, `1`/`2`, `unknown`/`watcher`, and any of those after `trust `
// with or without angle brackets (`trust <watcher>`), in any letter case.
const normalize = (value) => value.trim().toLowerCase()
  .replace(/^trust\s+/, '').replace(/[<>]/g, '').trim();

/**
 * Asks who the player trusts. Resolves with 'unknown' or 'watcher'.
 *
 * @param {Pick<import('./context.js').GameContext, 'out' | 'line' | 'cmd' | 'terminal'>} ctx
 * @returns {Promise<'unknown' | 'watcher'>}
 */
export async function chooseTrust({ out, line, cmd, terminal }) {
  let tapped = null;
  const choices = renderChoices({
    container: out,
    options: TRUST_OPTIONS,
    onPick: (option) => {
      if (tapped) return;
      tapped = option;
      terminal.abort(); // wakes the pending readCommand()
    },
  });

  let choice = null;
  while (!choice) {
    const raw = tapped ? null : await terminal.readCommand();
    if (tapped) {
      choice = tapped;
      terminal.close();
      choices.lock(choice.id);
      // A tap "types" the command into the terminal so the transcript looks the same as typing it.
      await cmd(choice.label, 45);
    } else if (raw === null) {
      continue; // prompt was woken without a choice; ask again
    } else {
      const hit = TRUST_OPTIONS.find((option) => option.match.includes(normalize(raw)));
      if (hit) {
        choice = hit;
        terminal.close();
        choices.lock(choice.id);
      } else if (raw.trim()) {
        line(`command not found: ${raw.trim()}`, 'warn');
        line(`try: ${TRUST_OPTIONS.map((option) => option.label).join('  |  ')}`, 'dim');
      }
    }
  }
  return choice.id;
}
