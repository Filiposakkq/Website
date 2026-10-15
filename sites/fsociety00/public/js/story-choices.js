// Story-level player choices. tty.js only handles input; the narrative decisions (what is offered, what each
// option leads to) are story data (story-data/routes.js, `choice` nodes). This module is the generic UI for one
// `choice` node: tappable buttons plus typing in the terminal.

import { renderChoices } from './choices.js';

// Accepted answers: tap a button, an option's `match` words (such as `1` / `unknown`), and any of those after a
// leading `trust ` with or without angle brackets (`trust <watcher>`), in any letter case.
const normalize = (value) => value.trim().toLowerCase()
  .replace(/^trust\s+/, '').replace(/[<>]/g, '').trim();

/**
 * Offers `options` and resolves with the id of the one the player picks.
 *
 * @param {Pick<import('./context.js').GameContext, 'out' | 'line' | 'cmd' | 'terminal'>} ctx
 * @param {Array<{ id: string, key?: string, label: string, match: string[] }>} options
 * @returns {Promise<string>}
 */
export async function chooseOption({ out, line, cmd, terminal }, options) {
  let tapped = null;
  const choices = renderChoices({
    container: out,
    options,
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
      const hit = options.find((option) => option.match.includes(normalize(raw)));
      if (hit) {
        choice = hit;
        terminal.close();
        choices.lock(choice.id);
      } else if (raw.trim()) {
        line(`command not found: ${raw.trim()}`, 'warn');
        line(`try: ${options.map((option) => option.label).join('  |  ')}`, 'dim');
      }
    }
  }
  return choice.id;
}
