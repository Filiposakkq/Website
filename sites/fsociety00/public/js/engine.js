// Narrative engine. A story is an array of SEGMENTS; a segment is an array of NODES (plain objects, see
// NODE_SPECS). The engine compiles them into one flat program, walks it with a pointer, and asks the HOST
// (story.js builds it) to do the visible work: print a line, play a cue, run a glitch. The engine itself knows
// nothing about the DOM, so everything that is not visual can be tested in Node (tools/validate-story.mjs).
//
//   story = { initialState: { trusted: null }, segments: [{ id, skippable, announce, nodes: [...] }] }
//
// - Segments carry the SKIP policy. `skippable: 'boot' | 'intro'` makes the skip control available while the
//   pointer is inside the segment. A skip fast-forwards to the segment's end: waits collapse, cues, glitches and
//   typing sounds are dropped, text still appears (instantly) and state changes (scene, trace, state, case file)
//   still happen. Entering the next segment ends the fast-forward.
// - `announce: false` keeps screen readers quiet for decorative output (the BIOS).
// - Any field of a node may be a function `(state, host) => value`, resolved when the node runs.
// - Control flow: `label`, `goto`, `branch { when, then, else }`, `choice { id, options, next }`, `end`.
// - `run { fn(host, flow) }` is the escape hatch for a bespoke beat. `flow` offers `state` (read only), `set(patch)`,
//   `refs`, `jump(label)` and `end()`.
// - Timers belong to the session; an abort rejects every wait and the run unwinds with an AbortError.

/** Node types and their fields: `req` must be present, `opt` may be. Unknown fields are reported by validateStory. */
const spec = (req = [], opt = []) => ({ req, opt });

export const NODE_SPECS = {
  line: spec(['text'], ['style', 'silent']),
  blank: spec(),
  type: spec(['text'], ['style', 'speed', 'silent']),
  say: spec(['who', 'text'], ['speed', 'typoAt', 'cls', 'floating', 'ref']),
  typing: spec(['ms'], ['who']),
  cmd: spec(['text'], ['speed', 'pause']),
  bar: spec(['label'], ['ms']),
  klog: spec(['text'], ['style', 't']),
  svc: spec(['text'], ['state', 'ms']),
  memtest: spec([], ['total']),
  wait: spec(['ms']),
  sfx: spec(['cue'], ['params']),
  scene: spec(['name']),
  gfx: spec(['name']),
  flash: spec(),
  static: spec([], ['ms']),
  corrupt: spec([], ['rounds']),
  blackout: spec([], ['ms']),
  rain: spec(['opacity'], ['immediate']),
  logo: spec(['words']),
  wipe: spec(),
  trace: spec(['do'], ['secs', 'rate', 'mode']),
  state: spec(['set']),
  case: spec(['call'], ['args']),
  label: spec(['name']),
  goto: spec(['to']),
  branch: spec(['when', 'then'], ['else']),
  choice: spec(['id', 'options', 'next'], ['set']),
  run: spec(['fn']),
  end: spec(),
};

const COMMON_FIELDS = ['type', 'note'];
export const GFX_NAMES = ['rgb', 'slice', 'roll', 'invert', 'zoom'];
export const TRACE_ACTIONS = ['start', 'dock', 'boost', 'slow', 'set', 'mode', 'close'];
export const TRACE_MODES = ['running', 'frozen', 'lethal'];
export const SKIP_TARGETS = [false, 'boot', 'intro'];
// Nodes that are only presentation: a skip drops them entirely.
const DROPPED_WHEN_SKIPPING = new Set(['sfx', 'gfx', 'flash', 'static', 'corrupt', 'wait']);

// ----------------------------------------------------------------- compile

/**
 * Flattens segments into one program (branches become jumps) and resolves labels.
 * Structural problems are returned, not thrown, so the validator can list all of them.
 *
 * @returns {{ program: object[], labels: Map<string, number>, segments: object[], problems: string[] }}
 */
export function compileStory(story) {
  const problems = [];
  const program = [];
  const labels = new Map();
  const segments = Array.isArray(story?.segments) ? story.segments : [];
  if (!segments.length) problems.push('story has no segments');
  let auto = 0;

  const defineLabel = (name, where) => {
    if (labels.has(name)) problems.push(`${where}: duplicate label "${name}"`);
    else labels.set(name, program.length);
  };

  const walk = (nodes, seg, where) => {
    if (!Array.isArray(nodes)) { problems.push(`${where}: nodes must be an array`); return; }
    nodes.forEach((node, index) => {
      const at = `${where}[${index}]`;
      if (!node || typeof node !== 'object' || typeof node.type !== 'string') {
        problems.push(`${at}: not a node (missing "type")`);
        return;
      }
      if (node.type === 'label') {
        defineLabel(node.name, at);
        return;
      }
      if (node.type === 'branch') {
        const id = auto++;
        const elseLabel = `@else${id}`;
        const endLabel = `@end${id}`;
        program.push({ node, seg, op: '@jumpUnless', to: elseLabel, at });
        walk(node.then, seg, `${at}.then`);
        if (node.else) {
          program.push({ node, seg, op: '@jump', to: endLabel, at });
          defineLabel(elseLabel, at);
          walk(node.else, seg, `${at}.else`);
          defineLabel(endLabel, at);
        } else {
          defineLabel(elseLabel, at);
        }
        return;
      }
      program.push({ node, seg, op: node.type, at });
    });
  };

  segments.forEach((segment, seg) => {
    const where = `segment "${segment?.id ?? seg}"`;
    if (!segment?.id) problems.push(`${where}: missing id`);
    walk(segment?.nodes, seg, where);
  });

  // Jump targets (compiled and written by hand) must exist.
  program.forEach((ins) => {
    const target = ins.op === '@jump' || ins.op === '@jumpUnless' ? ins.to
      : ins.op === 'goto' ? ins.node.to : null;
    if (target !== null && !labels.has(target)) problems.push(`${ins.at}: goto/jump target "${target}" does not exist`);
    if (ins.op === 'choice') {
      Object.entries(ins.node.next ?? {}).forEach(([optionId, label]) => {
        if (!labels.has(label)) problems.push(`${ins.at}: choice "${ins.node.id}" option "${optionId}" goes to missing label "${label}"`);
      });
    }
  });

  return { program, labels, segments, problems };
}

/**
 * Checks a story without running it. `known` supplies the registries that live outside the engine:
 * `{ cues: Iterable<string>, scenes: Iterable<string>, caseCalls: Iterable<string> }` (each optional).
 *
 * @returns {string[]} problems (empty when the story is valid)
 */
export function validateStory(story, known = {}) {
  const { program, problems } = compileStory(story);
  const cues = known.cues ? new Set(known.cues) : null;
  const scenes = known.scenes ? new Set(known.scenes) : null;
  const caseCalls = known.caseCalls ? new Set(known.caseCalls) : null;
  const dynamic = (value) => typeof value === 'function';

  (story?.segments ?? []).forEach((segment) => {
    if (!SKIP_TARGETS.includes(segment.skippable ?? false)) {
      problems.push(`segment "${segment.id}": skippable must be one of ${SKIP_TARGETS.map(String).join(', ')}`);
    }
  });

  // Check every authored node once (branches were flattened, so walk the source tree).
  const check = (nodes, where) => {
    (nodes ?? []).forEach((node, index) => {
      if (!node || typeof node.type !== 'string') return;
      const at = `${where}[${index}] (${node.type})`;
      const nodeSpec = NODE_SPECS[node.type];
      if (!nodeSpec) { problems.push(`${at}: unknown node type`); return; }
      nodeSpec.req.forEach((field) => {
        if (node[field] === undefined) problems.push(`${at}: missing "${field}"`);
      });
      Object.keys(node).forEach((field) => {
        if (!COMMON_FIELDS.includes(field) && !nodeSpec.req.includes(field) && !nodeSpec.opt.includes(field)) {
          problems.push(`${at}: unknown field "${field}"`);
        }
      });
      if (node.type === 'sfx' && cues && !dynamic(node.cue) && !cues.has(node.cue)) problems.push(`${at}: unknown audio cue "${node.cue}"`);
      if (node.type === 'scene' && scenes && !dynamic(node.name) && !scenes.has(node.name)) problems.push(`${at}: unknown audio scene "${node.name}"`);
      if (node.type === 'gfx' && !dynamic(node.name) && !GFX_NAMES.includes(node.name)) problems.push(`${at}: unknown glitch "${node.name}"`);
      if (node.type === 'svc' && node.state !== undefined && !dynamic(node.state) && !['OK', 'FAILED'].includes(node.state)) problems.push(`${at}: svc state must be OK or FAILED`);
      if (node.type === 'trace') {
        if (!dynamic(node.do) && !TRACE_ACTIONS.includes(node.do)) problems.push(`${at}: unknown trace action "${node.do}"`);
        if (node.do === 'mode' && !dynamic(node.mode) && !TRACE_MODES.includes(node.mode)) problems.push(`${at}: trace mode must be one of ${TRACE_MODES.join(', ')}`);
        if (['start', 'set'].includes(node.do) && node.secs === undefined) problems.push(`${at}: trace ${node.do} needs "secs"`);
      }
      if (node.type === 'case' && caseCalls && !dynamic(node.call) && !caseCalls.has(node.call)) problems.push(`${at}: unknown case file call "${node.call}"`);
      if (node.type === 'say' && typeof node.who !== 'string') problems.push(`${at}: "who" must be a voice name`);
      if (node.type === 'branch') {
        if (typeof node.when !== 'function') problems.push(`${at}: "when" must be a function of the state`);
        check(node.then, `${at}.then`);
        check(node.else, `${at}.else`);
      }
      if (node.type === 'choice') {
        if (!Array.isArray(node.options) || !node.options.length) problems.push(`${at}: options must be a non-empty array`);
        (node.options ?? []).forEach((option) => {
          if (!option?.id) problems.push(`${at}: every option needs an id`);
          else if (node.next && !(option.id in node.next)) problems.push(`${at}: option "${option.id}" has no "next" entry`);
        });
      }
      if (node.type === 'run' && typeof node.fn !== 'function') problems.push(`${at}: "fn" must be a function`);
    });
  };
  (story?.segments ?? []).forEach((segment) => check(segment.nodes, `segment "${segment.id}"`));

  if (!program.length && !problems.length) problems.push('story compiles to an empty program');
  return problems;
}

// ----------------------------------------------------------------- engine

/**
 * @typedef {object} EngineHost  Everything visible. story.js builds it from the GameContext.
 * @property {(text?: string, cls?: string, options?: object) => unknown} line
 * @property {(text: string, cls?: string, speed?: number, options?: object) => Promise<unknown>} type
 * @property {(text: string|object[], options: object) => Promise<unknown>} say   options.who names a voice
 * @property {(ms: number, who?: string) => Promise<void>} typingFor
 * @property {(text: string, speed?: number, pause?: number) => Promise<void>} cmd
 * @property {(label: string, ms?: number) => Promise<void>} bar
 * @property {(text: string, cls?: string, t?: number) => Promise<void>} klog
 * @property {(text: string, state?: string, ms?: number) => Promise<void>} svc
 * @property {(total?: number) => Promise<void>} memtest
 * @property {(cue: string, params?: object) => void} sfx
 * @property {(name: string) => void} setScene
 * @property {(name: string) => Promise<void>} gfx
 * @property {() => Promise<void>} flash
 * @property {(ms?: number) => Promise<void>} staticBurst
 * @property {(rounds?: number) => Promise<void>} corrupt
 * @property {(ms?: number) => Promise<void>} blackout
 * @property {(opacity: number, immediate?: boolean) => void} setRain
 * @property {(words: string[]) => Promise<void>} logo
 * @property {() => Promise<void>} wipe
 * @property {(action: object) => void} trace
 * @property {(node: object) => Promise<string>} choose   resolves with the picked option id
 * @property {object} caseFile
 */

/**
 * @param {object} options
 * @param {{ initialState?: object, segments: object[] }} options.story
 * @param {EngineHost} options.host
 * @param {ReturnType<typeof import('./session.js').createSession>} options.session
 * @param {ReturnType<typeof import('./pace.js').createPace>} options.pace
 * @param {{ onSegment?: (segment: object|null) => void, onSkip?: (segment: object) => void }} [options.events]
 * @param {boolean} [options.executeRun=true]  false in dry runs: `run` nodes are not called
 */
export function createEngine({ story, host, session, pace, events = {}, executeRun = true }) {
  const { program, labels, segments, problems } = compileStory(story);
  if (problems.length) throw new Error(`Invalid story:\n  ${problems.join('\n  ')}`);

  const state = { ...(story.initialState ?? {}) };
  const refs = {};
  let pc = 0;
  let currentSegment = -1;
  let running = false;
  let ended = false;
  let jumpTo = null;
  const visited = { steps: 0 };

  const readState = () => Object.freeze({ ...state });
  const val = (value) => (typeof value === 'function' ? value(readState(), host) : value);
  const resolveFields = (node, fields) => Object.fromEntries(fields.map((f) => [f, val(node[f])]));

  const flow = {
    get state() { return readState(); },
    refs,
    set(patch) { Object.assign(state, patch); },
    jump(label) {
      if (!labels.has(label)) throw new Error(`jump to unknown label "${label}"`);
      jumpTo = label;
    },
    end() { ended = true; },
  };

  function enter(index) {
    currentSegment = index;
    pace.setFast(false);
    events.onSegment?.(segments[index] ?? null);
  }

  const EXEC = {
    line: (n) => host.line(val(n.text), val(n.style) ?? '', { silent: Boolean(n.silent) }),
    blank: () => host.line(),
    type: (n) => host.type(val(n.text), val(n.style) ?? '', val(n.speed) ?? 35, { silent: Boolean(n.silent) }),
    say: async (n) => {
      const element = await host.say(val(n.text), {
        who: n.who, cls: val(n.cls), speed: val(n.speed), typoAt: val(n.typoAt), floating: Boolean(n.floating),
      });
      if (n.ref) refs[n.ref] = element;
    },
    typing: (n) => host.typingFor(val(n.ms), n.who ?? 'unknown'),
    cmd: (n) => host.cmd(val(n.text), val(n.speed), val(n.pause)),
    bar: (n) => host.bar(val(n.label), val(n.ms)),
    klog: (n) => host.klog(val(n.text), val(n.style), val(n.t)),
    svc: (n) => host.svc(val(n.text), val(n.state), val(n.ms)),
    memtest: (n) => host.memtest(val(n.total)),
    wait: (n) => host.wait(val(n.ms)),
    sfx: (n) => host.sfx(val(n.cue), val(n.params)),
    scene: (n) => host.setScene(val(n.name)),
    gfx: (n) => host.gfx(val(n.name)),
    flash: () => host.flash(),
    static: (n) => host.staticBurst(val(n.ms)),
    corrupt: (n) => host.corrupt(val(n.rounds)),
    blackout: (n) => host.blackout(val(n.ms)),
    rain: (n) => host.setRain(val(n.opacity), Boolean(n.immediate)),
    logo: (n) => host.logo(val(n.words)),
    wipe: () => host.wipe(),
    trace: (n) => host.trace(resolveFields(n, ['do', 'secs', 'rate', 'mode'])),
    state: (n) => { Object.assign(state, val(n.set)); },
    case: (n) => {
      const fn = host.caseFile?.[val(n.call)];
      if (typeof fn !== 'function') throw new Error(`case file has no "${n.call}"`);
      return fn.apply(host.caseFile, (n.args ?? []).map(val));
    },
    goto: (n) => { jumpTo = n.to; },
    choice: async (n) => {
      const picked = await host.choose(n);
      if (n.set) state[n.set] = picked;
      const label = n.next?.[picked];
      if (!label) throw new Error(`choice "${n.id}" has no "next" for "${picked}"`);
      jumpTo = label;
    },
    run: (n) => (executeRun ? n.fn(host, flow) : undefined),
    end: () => { ended = true; },
    '@jump': (ins) => { jumpTo = ins.to; },
    '@jumpUnless': (ins) => { if (!ins.node.when(readState())) jumpTo = ins.to; },
  };

  async function exec(ins) {
    if (pace.isSkipping() && DROPPED_WHEN_SKIPPING.has(ins.op)) return;
    const fn = EXEC[ins.op];
    if (!fn) throw new Error(`${ins.at}: unknown node type "${ins.op}"`);
    await fn(ins.op.startsWith('@') ? ins : ins.node);
  }

  /**
   * Walks the program from the start, or from `from` (a label). `state` is merged into the story state first
   * (developer routes use it to pre-set who the player trusts). Resolves when the pointer falls off the end or a
   * node ends the run; rejects with an AbortError when the session aborts.
   */
  async function run({ from = null, state: patch = null } = {}) {
    if (running) throw new Error('the engine is already running; abort the session first');
    if (patch) Object.assign(state, patch);
    if (from !== null && !labels.has(from)) throw new Error(`unknown start label "${from}"`);
    pc = from === null ? 0 : labels.get(from);
    currentSegment = -1;
    running = true;
    ended = false;
    jumpTo = null;
    try {
      while (pc < program.length && !ended) {
        const ins = program[pc];
        if (ins.seg !== currentSegment) enter(ins.seg);
        session.throwIfAborted();
        visited.steps++;
        await exec(ins);
        if (jumpTo !== null) {
          pc = labels.get(jumpTo);
          jumpTo = null;
        } else pc += 1;
      }
    } finally {
      running = false;
      pace.setFast(false);
      events.onSegment?.(null);
    }
  }

  return {
    run,
    /** Starts a skip in the current segment. Returns false when it is not skippable or already skipping. */
    skip() {
      const segment = segments[currentSegment];
      if (!running || !segment?.skippable || pace.isSkipping()) return false;
      pace.setFast(true);
      events.onSkip?.(segment);
      return true;
    },
    /** 'boot' | 'intro' while a skip can be started, otherwise null. */
    skipTarget() {
      const segment = segments[currentSegment];
      return running && segment?.skippable && !pace.isSkipping() ? segment.skippable : null;
    },
    /** Whether screen readers should hear the current segment. */
    announces: () => segments[currentSegment]?.announce !== false,
    getState: () => ({
      ...readState(),
      pointer: { segment: segments[currentSegment]?.id ?? null, index: pc, label: program[pc]?.at ?? null },
    }),
    labels: () => [...labels.keys()].filter((name) => !name.startsWith('@')),
    isRunning: () => running,
    stats: () => ({ ...visited, program: program.length }),
  };
}
