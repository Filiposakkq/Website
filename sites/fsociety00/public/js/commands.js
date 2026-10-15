// The command registry: every command the player can type is one definition here. The level shell (level01.js)
// registers the game commands, system-commands.js registers the flavor commands (whoami, ps, ...), and `help` is
// generated from what is registered, so a command cannot exist without being listed (or being deliberately hidden).
//
// A definition:
//   name       the lower-case command word
//   aliases    other words for the same command
//   group      'game' | 'system' | 'board' (the order and headings of `help`). 'board' is the board command line
//              (board-commands.js), a registry of its own: its `help` lists only that group.
//   needs      optional: 'link' = the command needs a trace to exist (documentation and a validator check; the command
//              itself answers "no active link yet", see hacking-commands.js)
//   usage      what `help` prints on the left, e.g. 'cat <file>'
//   summary    what `help` prints on the right
//   available  (env) => boolean   false: the word is "command not found" (a command of the other route)
//   listed     (env) => boolean   false: not shown in `help` although it works (default: same as available)
//   run        async (args, env) => void
//
// `env` is whatever the caller passes to `dispatch`/`help` (the level gives it the route, the trace and its state).

const GROUPS = ['game', 'system', 'board'];
const GROUP_HEADING = { game: 'commands:', system: 'system:', board: 'board commands:' };
const NEEDS = ['link'];

export function createRegistry() {
  /** @type {Map<string, object>} */
  const byWord = new Map();
  /** @type {object[]} */
  const defs = [];

  function register(def) {
    if (!def?.name || typeof def.run !== 'function') throw new TypeError('A command needs a name and a run function.');
    if (def.name !== def.name.toLowerCase()) throw new TypeError(`Command name "${def.name}" must be lower case.`);
    const group = def.group ?? 'game';
    if (!GROUPS.includes(group)) throw new TypeError(`Command "${def.name}": unknown group "${group}".`);
    if (def.needs !== undefined && !NEEDS.includes(def.needs)) throw new TypeError(`Command "${def.name}": unknown needs "${def.needs}".`);
    const entry = { aliases: [], available: () => true, group, ...def };
    entry.listed ??= entry.available;
    for (const word of [entry.name, ...entry.aliases]) {
      if (byWord.has(word)) throw new Error(`Command word "${word}" is registered twice.`);
      byWord.set(word, entry);
    }
    defs.push(entry);
    return entry;
  }

  /** The definition for a typed word, or null. */
  const find = (word) => byWord.get(word.toLowerCase()) ?? null;

  /**
   * Runs one typed line. Returns false for an empty line, true otherwise. `line(text, cls)` prints the
   * "not found" message.
   */
  async function dispatch(raw, env, line) {
    const [word, ...args] = raw.trim().split(/\s+/);
    if (!word) return false;
    const def = find(word);
    if (!def) {
      line(`command not found: ${word}`, 'warn');
      line('type help', 'dim');
      return true;
    }
    if (!def.available(env)) {
      line(`command not found: ${word}`, 'warn');
      return true;
    }
    await def.run(args, { ...env, name: word });
    return true;
  }

  /** The `help` text as [text, cls] pairs, grouped. */
  function helpLines(env) {
    const rows = [];
    const listed = defs.filter((def) => def.listed(env) && def.usage);
    const width = Math.max(15, ...listed.map((def) => def.usage.length + 3));
    for (const group of GROUPS) {
      const inGroup = listed.filter((def) => def.group === group);
      if (!inGroup.length) continue;
      rows.push([GROUP_HEADING[group], 'dim']);
      for (const def of inGroup) rows.push([`  ${def.usage.padEnd(width)}${def.summary}`, '']);
    }
    return rows;
  }

  /** The registered definitions (name, group, needs, ...), in order: for tests and the validator. */
  const definitions = () => defs.map((def) => ({ ...def }));

  return { register, find, definitions, dispatch, helpLines, names: () => [...byWord.keys()] };
}
