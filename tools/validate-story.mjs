#!/usr/bin/env node
// Validates the story data and the narrative engine without a browser (phase 3). See tools/README.md.
//
//   node tools/validate-story.mjs            # self-test of the engine, then validate + dry-run the real story
//   node tools/validate-story.mjs --verbose  # also print the cues and labels the story uses
//
// 1. Self-test: small fixture stories prove that the validator reports what it must and that the engine's
//    control flow and skip rules behave.
// 2. Validation: every `goto` / `choice.next` target exists, every `sfx` cue exists in the audio registry
//    (js/audio/patches.js), every audio scene, glitch and case file call exists, no node has unknown fields,
//    and every developer route points at a real label.
// 3. Dry runs: the whole story is walked with a recording host (no DOM, no timers) once per combination of choices.
//    `run` nodes (bespoke visual beats) are not called, so a dry run proves the node graph, not the visuals.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// session.js was written for the browser; these stubs are enough for a dry run (no frames are ever requested).
globalThis.requestAnimationFrame ??= (fn) => setTimeout(() => fn(performance.now()), 16);
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = (file) => path.join(root, 'sites/fsociety00/public/js', file);
const verbose = process.argv.includes('--verbose');

const { createEngine, compileStory, validateStory } = await import(js('engine.js'));
const { createSession } = await import(js('session.js'));
const { createPace } = await import(js('pace.js'));
const { CUES, ALIASES, SCENES, BEDS } = await import(js('audio/patches.js'));

const known = {
  cues: [...Object.keys(CUES), ...Object.keys(ALIASES)],
  scenes: [...Object.keys(SCENES), ...Object.keys(BEDS)],
};
{
  // The case file calls a story node may make = the keys of the object createCaseFile returns.
  const source = await readFile(js('casefile.js'), 'utf8');
  const block = source.slice(source.lastIndexOf('return {'));
  known.caseCalls = [...block.matchAll(/^\s{4}([a-zA-Z]+)(?:,|:)/gm)].map((m) => m[1]);
}

let failures = 0;
const fail = (message) => { failures++; console.log(`  FAIL  ${message}`); };
const pass = (message) => console.log(`  ok    ${message}`);
const expect = (condition, message) => (condition ? pass(message) : fail(message));

// ------------------------------------------------------------ recording host

/** A host with no DOM: records what the story would do. `picks` answers `choice` nodes by id. */
function createRecordingHost({ picks = {}, onRun = null } = {}) {
  const log = [];
  const cues = new Set();
  const note = (entry) => log.push(entry);
  const host = {
    line: (text = '') => { note(`line:${text}`); return { fake: 'element' }; },
    type: async (text) => note(`type:${text}`),
    say: async (text, options) => {
      note(`say:${options.who}:${typeof text === 'string' ? text : text.map((part) => part.t).join('')}`);
      return { fake: 'element' };
    },
    typingFor: async (ms, who) => note(`typing:${who}`),
    cmd: async (text) => note(`cmd:${text}`),
    bar: async (label) => note(`bar:${label}`),
    klog: async (text) => note(`klog:${text}`),
    svc: async (text, state = 'OK') => note(`svc:${state}:${text}`),
    memtest: async () => note('memtest'),
    probe: async (text, result) => note(`probe:${text}${result}`),
    wait: async () => note('wait'),
    sfx: (cue) => { cues.add(cue); note(`sfx:${cue}`); },
    setScene: (name) => note(`scene:${name}`),
    gfx: async (name) => note(`gfx:${name}`),
    flash: async () => note('flash'),
    staticBurst: async () => note('static'),
    corrupt: async () => note('corrupt'),
    blackout: async () => note('blackout'),
    setRain: (opacity) => note(`rain:${opacity}`),
    screenClass: (name, on) => note(`class:${name}:${on}`),
    logo: async (words) => note(`logo:${words.join(' ')}`),
    wipe: async () => note('wipe'),
    trace: (action) => note(`trace:${action.do}${action.secs !== undefined ? `:${action.secs}` : ''}${action.mode ? `:${action.mode}` : ''}`),
    choose: async (node) => {
      const picked = picks[node.id] ?? node.options[0].id;
      note(`choice:${node.id}:${picked}`);
      return picked;
    },
    caseFile: new Proxy({}, { get: (_t, name) => (...args) => note(`case:${String(name)}:${args.join(',')}`) }),
    skipNow: () => {},
  };
  if (onRun) host.onRun = onRun;
  return { host, log, cues };
}

async function dryRun(story, picks, { skipAt = null, executeRun = false } = {}) {
  const session = createSession();
  const pace = createPace({ session, motionReduced: () => false });
  const { host, log, cues } = createRecordingHost({ picks });
  const segmentsSeen = [];
  const engine = createEngine({
    story, host, session, pace, executeRun,
    events: { onSegment: (segment) => segmentsSeen.push(segment?.id ?? null) },
  });
  if (skipAt) host.skipNow = () => engine.skip();
  await engine.run();
  session.abort('dry run done');
  return { log, cues, segmentsSeen, stats: engine.stats(), state: engine.getState() };
}

// ----------------------------------------------------------------- self-test

console.log('engine self-test');

const fixture = () => ({
  initialState: { trusted: null },
  segments: [
    {
      id: 'boot', skippable: 'boot', announce: false, nodes: [
        { type: 'line', text: 'boot one' },
        { type: 'sfx', cue: 'boot-prompt' },
        { type: 'wait', ms: 500 },
        { type: 'scene', name: 'boot' },
        { type: 'line', text: 'boot two' },
        { type: 'run', fn: (host) => host.skipNow() },
        { type: 'sfx', cue: 'boot-checkpoint' },
        { type: 'gfx', name: 'rgb' },
        { type: 'scene', name: 'story' },
        { type: 'line', text: 'boot three' },
      ],
    },
    {
      id: 'story', skippable: 'intro', nodes: [
        { type: 'sfx', cue: 'message' },
        { type: 'say', who: 'unknown', text: 'hello' },
        { type: 'choice', id: 'trust', options: [{ id: 'unknown' }, { id: 'watcher' }], set: 'trusted', next: { unknown: 'route-u', watcher: 'route-w' } },
        { type: 'label', name: 'route-u' },
        { type: 'line', text: 'u route' },
        { type: 'goto', to: 'after' },
        { type: 'label', name: 'route-w' },
        { type: 'line', text: 'w route' },
        { type: 'label', name: 'after' },
        { type: 'branch', when: (s) => s.trusted === 'watcher', then: [{ type: 'line', text: 'extra for watcher' }], else: [{ type: 'line', text: 'extra for unknown' }] },
        { type: 'trace', do: 'set', secs: 120 },
        { type: 'state', set: { done: true } },
        { type: 'end' },
        { type: 'line', text: 'never printed' },
      ],
    },
  ],
});

{
  const story = fixture();
  expect(validateStory(story, known).length === 0, `a valid fixture has no problems (${validateStory(story, known).join('; ') || 'none'})`);

  const unknownRun = await dryRun(fixture(), { trust: 'unknown' }, { executeRun: true });
  const text = unknownRun.log.filter((entry) => entry.startsWith('line:')).map((entry) => entry.slice(5));
  expect(text.join('|') === 'boot one|boot two|boot three|u route|extra for unknown', `the unknown route prints the right lines (${text.join('|')})`);
  expect(unknownRun.state.trusted === 'unknown' && unknownRun.state.done === true, 'choice.set and state nodes update the state');
  expect(!unknownRun.log.includes('line:never printed'), 'an `end` node stops the run');

  const watcherRun = await dryRun(fixture(), { trust: 'watcher' }, { executeRun: true });
  const watcherText = watcherRun.log.filter((entry) => entry.startsWith('line:')).map((entry) => entry.slice(5));
  expect(watcherText.join('|') === 'boot one|boot two|boot three|w route|extra for watcher', `the watcher route branches (${watcherText.join('|')})`);

  // Skip: a `run` node starts it after "boot two". sfx, wait and gfx that follow are dropped, the scene change
  // still happens, text still appears, and the next segment (story) is not fast-forwarded.
  const skipped = await dryRun(fixture(), { trust: 'unknown' }, { skipAt: true, executeRun: true });
  const sfxPlayed = skipped.log.filter((entry) => entry.startsWith('sfx:'));
  expect(sfxPlayed.join(',') === 'sfx:boot-prompt,sfx:message', `a skip drops later cues in the segment but not in the next one (${sfxPlayed.join(',')})`);
  expect(skipped.log.filter((entry) => entry === 'wait').length === 1 && !skipped.log.includes('gfx:rgb'), 'a skip drops later waits and glitches');
  expect(skipped.log.includes('scene:story') && skipped.log.includes('line:boot three'), 'a skip still applies state changes and text');
  expect(skipped.segmentsSeen.map(String).join(',') === 'boot,story,null', `segments are entered in order and the run reports its end (${skipped.segmentsSeen.map(String).join(',')})`);
}

{
  const cases = [
    ['an unknown node type', (s) => { s.segments[0].nodes.push({ type: 'shout', text: 'x' }); }, 'unknown node type'],
    ['a missing required field', (s) => { s.segments[0].nodes.push({ type: 'line' }); }, 'missing "text"'],
    ['a misspelled field', (s) => { s.segments[0].nodes.push({ type: 'line', text: 'x', stlye: 'dim' }); }, 'unknown field "stlye"'],
    ['an unknown audio cue', (s) => { s.segments[0].nodes.push({ type: 'sfx', cue: 'no-such-cue' }); }, 'unknown audio cue "no-such-cue"'],
    ['an unknown audio scene', (s) => { s.segments[0].nodes.push({ type: 'scene', name: 'nowhere' }); }, 'unknown audio scene "nowhere"'],
    ['an unknown glitch', (s) => { s.segments[0].nodes.push({ type: 'gfx', name: 'wobble' }); }, 'unknown glitch "wobble"'],
    ['an unknown case file call', (s) => { s.segments[0].nodes.push({ type: 'case', call: 'burn' }); }, 'unknown case file call "burn"'],
    ['a goto to a missing label', (s) => { s.segments[0].nodes.push({ type: 'goto', to: 'nowhere' }); }, 'target "nowhere" does not exist'],
    ['a choice that goes to a missing label', (s) => { s.segments[1].nodes[2].next.watcher = 'nowhere'; }, 'missing label "nowhere"'],
    ['a choice option without a next entry', (s) => { delete s.segments[1].nodes[2].next.watcher; }, 'option "watcher" has no "next" entry'],
    ['a duplicate label', (s) => { s.segments[1].nodes.push({ type: 'label', name: 'after' }); }, 'duplicate label "after"'],
    ['a branch without a condition function', (s) => { s.segments[1].nodes.find((n) => n.type === 'branch').when = 'yes'; }, '"when" must be a function'],
    ['a bad skippable value', (s) => { s.segments[0].skippable = 'always'; }, 'skippable must be one of'],
    ['a trace set without secs', (s) => { s.segments[0].nodes.push({ type: 'trace', do: 'set' }); }, 'needs "secs"'],
    ['a bad trace mode', (s) => { s.segments[0].nodes.push({ type: 'trace', do: 'mode', mode: 'sleepy' }); }, 'trace mode must be one of'],
    ['a svc state that is not OK or FAILED', (s) => { s.segments[0].nodes.push({ type: 'svc', text: 'x', state: 'MAYBE' }); }, 'svc state must be OK or FAILED'],
  ];
  for (const [name, mutate, needle] of cases) {
    const story = fixture();
    mutate(story);
    const problems = validateStory(story, known);
    expect(problems.some((p) => p.includes(needle)), `the validator reports ${name}`);
  }
  expect(validateStory({ segments: [] }, known).some((p) => p.includes('no segments')), 'the validator reports an empty story');
  let threw = false;
  try { await dryRun({ segments: [{ id: 's', nodes: [{ type: 'goto', to: 'nowhere' }] }] }, {}); } catch { threw = true; }
  expect(threw, 'the engine refuses to run an invalid story');
}

// -------------------------------------------------------------- the real story

console.log('\nstory data');
let story = null;
try {
  ({ story } = await import(js('story-data/index.js')));
} catch (error) {
  if (error.code === 'ERR_MODULE_NOT_FOUND' && /story-data/.test(error.message)) console.log('  (no story data yet: js/story-data/index.js does not exist)');
  else { fail(`js/story-data/index.js could not be loaded: ${error.message}`); }
}

if (story) {
  const problems = validateStory(story, known);
  problems.forEach((problem) => fail(problem));
  if (!problems.length) pass(`valid: ${story.segments.length} segment(s), ${compileStory(story).program.length} instruction(s)`);

  const { labels } = compileStory(story);
  for (const [name, route] of Object.entries(story.routes ?? {})) {
    expect(labels.has(route.from), `developer route "${name}" starts at label "${route.from}"`);
  }

  if (!problems.length) {
    // Every combination of choices (the product of the option ids of each choice node, in order of first use).
    const choices = new Map();
    const collect = (nodes) => (nodes ?? []).forEach((node) => {
      if (node.type === 'choice') choices.set(node.id, node.options.map((option) => option.id));
      collect(node.then);
      collect(node.else);
    });
    story.segments.forEach((segment) => collect(segment.nodes));
    let combos = [{}];
    for (const [id, options] of choices) combos = combos.flatMap((combo) => options.map((option) => ({ ...combo, [id]: option })));
    const allCues = new Set();
    for (const picks of combos) {
      const label = Object.entries(picks).map(([id, option]) => `${id}=${option}`).join(' ') || 'no choices';
      try {
        const result = await dryRun(story, picks);
        result.cues.forEach((cue) => allCues.add(cue));
        const lines = result.log.filter((entry) => /^(line|type|say|cmd):/.test(entry)).length;
        pass(`dry run (${label}): ${result.stats.steps} steps, ${lines} text nodes, ends in segment "${result.segmentsSeen.at(-2)}"`);
      } catch (error) {
        fail(`dry run (${label}) threw: ${error.message}`);
      }
    }
    if (verbose) {
      console.log(`  cues used by nodes: ${[...allCues].sort().join(', ')}`);
      console.log(`  labels: ${[...labels.keys()].filter((name) => !name.startsWith('@')).join(', ')}`);
    }
  }
}

// ---- the case file introduction in the story (phase 4b.1, 4b.2)
if (story) {
  console.log('\ncase file introduction');
  const flat = story.segments.flatMap((segment) => segment.nodes);
  const at = (test) => flat.findIndex(test);
  const inbox = at((node) => node.type === 'cmd' && /inbox\/001\.msg/.test(node.text));
  const available = flat.map((node, index) => (node.type === 'case' && node.call === 'makeAvailable' ? index : -1)).filter((index) => index >= 0);
  const traceStart = at((node) => node.type === 'trace' && node.do === 'start');
  expect(inbox >= 0 && traceStart >= 0, 'the inbox message and the trace start are in the story');
  expect(available.length === 1, `the story makes the case file available exactly once (${available.length})`);
  expect(available[0] > inbox && available[0] < traceStart, 'the case file becomes available after the inbox message and before the trace starts');

  // 4b.2: the third voice. Every voice a node names exists; a voice's own typing cue exists and is not the default one.
  const { VOICES } = await import(js('story-data/voices.js'));
  const everyNode = (nodes) => nodes.flatMap((node) => [node, ...everyNode(node.then ?? []), ...everyNode(node.else ?? [])]);
  const all = story.segments.flatMap((segment) => everyNode(segment.nodes));
  const named = [...new Set(all.filter((node) => node.type === 'say' || (node.type === 'typing' && node.who)).map((node) => node.who))];
  expect(named.every((who) => VOICES[who]), `every voice a node names exists (${named.join(', ')})`);
  expect(Object.values(VOICES).every((voice) => voice.name && typeof voice.nameCls === 'string' && typeof voice.cls === 'string' && typeof voice.quiet === 'boolean'),
    'every voice has a name, two classes and the quiet flag');
  expect(Object.entries(VOICES).every(([, voice]) => voice.tick === undefined || known.cues.includes(voice.tick)), 'every voice tick names a registered cue');
  expect(VOICES.mystery?.name === '???' && VOICES.mystery.nameCls === 'voice-blue' && VOICES.mystery.tick && VOICES.mystery.tick !== 'key-tick',
    'the third voice is <???> in blue with its own typing cue');

  const lines = flat.map((node, index) => ({ node, index })).filter(({ node }) => node.type === 'say' && node.who === 'mystery');
  const spoken = lines.map(({ node }) => node.text);
  expect(lines.length >= 2 && lines.length <= 5, `the third voice has 2 to 5 lines (${lines.length})`);
  expect(spoken.every((text) => typeof text === 'string'), 'its lines are plain text');
  const text = spoken.filter((entry) => typeof entry === 'string');
  expect(text.every((entry) => entry === entry.toLowerCase() && !entry.includes('!')), 'its lines are lowercase and have no exclamation marks');
  expect(!text.some((entry) => /sdb9-part|--sdb9|ghost|shell|1337|key layer|meta|\bcss\b|console/i.test(entry)), 'its lines do not touch the key or its layers');
  expect(!text.some((entry) => /robot|elliot|unknown|watcher/i.test(entry)), 'its lines name no other character and no real name');
  expect(lines.every(({ index }) => index > inbox && index < traceStart), 'the third voice speaks only between the inbox message and the trace start');
  expect(all.filter((node) => (node.type === 'say' || node.type === 'typing') && node.who === 'mystery').length === lines.length + all.filter((node) => node.type === 'typing' && node.who === 'mystery').length,
    'nothing but its lines and its typing indicator names the third voice');
  expect(lines.length > 0 && lines[0].index < available[0] && available[0] - lines[0].index <= 2, 'the board appears with the first mention: the case file node follows the first line');
  expect(lines.length > 0 && flat[lines[0].index - 1]?.type === 'typing' && flat[lines[0].index - 1].who === 'mystery', 'the first line is preceded by its typing indicator');
}

// ---- what a voice looks and sounds like (phase 4b.2): output.js with a tiny DOM stand-in
{
  console.log('\nvoices in the output');
  const { createOutput } = await import(js('output.js'));
  const { VOICES } = await import(js('story-data/voices.js'));
  const node = () => ({
    className: '',
    textContent: '',
    children: [],
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); return item; },
    remove() {},
    get firstElementChild() { return this.children[0]; },
  });
  const realDocument = globalThis.document;
  const realWindow = globalThis.window;
  globalThis.document = { createElement: node, body: { scrollHeight: 0 } };
  globalThis.window = { scrollTo() {} };
  try {
    const run = async (who, text) => {
      const played = [];
      const out = node();
      const announcer = node();
      const output = createOutput({
        out,
        announcer,
        audio: { play: (cue) => played.push(cue) },
        getPace: () => ({ wait: async () => {}, isSkipping: () => false }),
        motionReduced: () => true,
        isAnnouncing: () => true,
        voices: VOICES,
      });
      await output.say(text, { who, speed: 1 });
      const [tag, body] = out.children[0].children;
      return { played, tag, body, spoken: announcer.children.map((entry) => entry.textContent) };
    };
    const mystery = await run('mystery', 'the case file is in the corner.');
    expect(mystery.tag.textContent === '<???> ' && mystery.tag.className === 'voice-blue' && mystery.body.className === 'voice-blue', 'the third voice is shown as <???> in blue (name and text)');
    expect(mystery.played.includes('key-tick-mystery') && !mystery.played.includes('key-tick'), 'the third voice types with its own tick and not the default one');
    expect(mystery.played[0] === 'message', 'the third voice plays the message cue first, like the other voices');
    expect(mystery.spoken.join() === '??? says: the case file is in the corner.', 'a screen reader hears "??? says: ..."');
    const other = await run('unknown', 'you are early.');
    expect(other.played.includes('key-tick') && !other.played.includes('key-tick-mystery'), 'the other voices keep the default tick');
    const quiet = await run('robot', 'bonsoir.');
    expect(!quiet.played.includes('key-tick') && !quiet.played.includes('message'), 'a quiet voice still makes no sound');
  } finally {
    globalThis.document = realDocument;
    globalThis.window = realWindow;
    if (realDocument === undefined) delete globalThis.document;
    if (realWindow === undefined) delete globalThis.window;
  }
}

// ---- the command registry and the system commands (phase 3.8 / 3.9)
{
  console.log('\ncommands');
  const { createRegistry } = await import('../sites/fsociety00/public/js/commands.js');
  const { registerSystemCommands } = await import('../sites/fsociety00/public/js/system-commands.js');
  const systemData = await import('../sites/fsociety00/public/js/story-data/system.js');
  const registry = createRegistry();
  const printed = [];
  const line = (text, cls) => printed.push([text, cls]);
  registerSystemCommands(registry, { line, audio: { play() {} }, out: { replaceChildren() {} }, scrollTop() {} });
  let duplicate = false;
  try { registry.register({ name: 'ps', run() {} }); } catch { duplicate = true; }
  expect(duplicate, 'a command word cannot be registered twice');
  let badName = false;
  try { registry.register({ name: 'Mixed', run() {} }); } catch { badName = true; }
  expect(badName, 'a command name must be lower case');
  const helpText = registry.helpLines({ trusted: 'unknown' }).map(([text]) => text).join('\n');
  expect(/system:\n\s+whoami/.test(helpText) && /uname -a/.test(helpText), 'help lists the system group');
  expect(!/\bsudo\b|\becho\b|\bpwd\b/.test(helpText), 'denied and tiny commands stay out of help');
  for (const word of ['whoami', 'uname', 'ps', 'netstat', 'ifconfig', 'history', 'pwd', 'date', 'echo', 'clear', 'sudo', 'cd']) {
    printed.length = 0;
    await registry.dispatch(`${word} -a`, { trusted: 'unknown' }, line);
    expect(printed.length > 0 || word === 'clear', `"${word}" prints something`);
  }
  printed.length = 0;
  await registry.dispatch('definitely-not-a-command', { trusted: 'unknown' }, line);
  expect(printed[0]?.[0] === 'command not found: definitely-not-a-command', 'an unknown word is "command not found"');

  // World facts and invariants of the flavor text.
  const all = [...Object.values(systemData.SYSTEM_OUTPUT).flat(), ...Object.values(systemData.SYSTEM_FILES).flatMap((file) => file())].join('\n');
  const addresses = all.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
  const documentation = (address) => /^(192\.0\.2|198\.51\.100|203\.0\.113|10\.0\.2|127\.0\.0|0\.0\.0|255\.)/.test(address);
  expect(addresses.every(documentation), `only documentation-range addresses appear (${addresses.filter((a) => !documentation(a)).join(', ') || 'none outside'})`);
  expect(/1337/.test(systemData.SYSTEM_OUTPUT.ps.join('\n')) && /ghost\.sh/.test(systemData.SYSTEM_OUTPUT.ps.join('\n')), 'ps shows ghost.sh as PID 1337');
  expect(/eth0:1/.test(systemData.SYSTEM_OUTPUT.ifconfig.join('\n')), 'ifconfig shows the rogue eth0:1 adapter');
  expect(/:4444\b/.test(systemData.SYSTEM_OUTPUT.netstat.join('\n')) && /███/.test(systemData.SYSTEM_OUTPUT.netstat.join('\n')), 'netstat has the redacted outbound connection on port 4444');
  expect(/03:14/.test(systemData.SYSTEM_FILES['var/log/auth.log']().join('\n')), 'auth.log has the guest login at 03:14');
  const level = await import('../sites/fsociety00/public/js/story-data/level01.js');
  expect(Object.values(level.LEVEL01_FILES).every((file) => file({ attempts: 3 }).every((row) => !/sdb9-part|--sdb9/.test(row))), 'no file text prints a key layer');
}

// ---- the evidence data of the case file (phase 4.1)
{
  console.log('\nevidence');
  const { readdir } = await import('node:fs/promises');
  const data = await import(js('story-data/evidence.js'));
  const { CASE } = await import(js('story-data/constants.js'));
  const level = await import(js('story-data/level01.js'));
  const ROUTES = ['unknown', 'watcher'];
  const KEY_LEAK = /sdb9-part|--sdb9|ghost[-\s]+shell|shell[-\s]+1337/i;

  /** Problems in a list of evidence records (see the schema at the top of js/story-data/evidence.js). */
  function validateEvidence(records, { types, found, traceWindow }) {
    const problems = [];
    const byId = new Map();
    const codes = new Set();
    const files = new Set();
    for (const item of records) {
      const name = `evidence "${item.id}"`;
      if (!/^[a-z0-9-]+$/.test(item.id ?? '')) problems.push(`${name}: the id must be lower case letters, digits and dashes`);
      if (byId.has(item.id)) problems.push(`${name}: duplicate id`);
      byId.set(item.id, item);
      if (!/^e\d+$/.test(item.code ?? '')) problems.push(`${name}: the code must look like e12`);
      if (codes.has(item.code)) problems.push(`${name}: duplicate code "${item.code}"`);
      codes.add(item.code);
    }
    const ids = new Set(byId.keys());
    for (const item of records) {
      const name = `evidence "${item.id}"`;
      if (!types.includes(item.type)) problems.push(`${name}: unknown type "${item.type}"`);
      if (!found.includes(item.found)) problems.push(`${name}: unknown "found" value "${item.found}"`);
      if (item.route !== undefined && !ROUTES.includes(item.route)) problems.push(`${name}: unknown route "${item.route}"`);
      for (const field of ['group', 'title', 'source', 'summary', 'detail']) {
        if (typeof item[field] !== 'string' || !item[field].trim()) problems.push(`${name}: missing "${field}"`);
      }
      for (const field of ['title', 'source', 'summary', 'detail']) {
        if (KEY_LEAK.test(item[field] ?? '')) problems.push(`${name}: "${field}" prints a key layer`);
      }
      const isIntel = item.type === 'INTEL';
      const placed = Number.isFinite(item.x) && Number.isFinite(item.y);
      if (isIntel && (item.x !== undefined || item.y !== undefined)) problems.push(`${name}: an INTEL record has no position (it sits between the pair that unlocks it)`);
      if (!isIntel && (!placed || item.x < 0 || item.x > 100 || item.y < 0 || item.y > 100)) problems.push(`${name}: x and y must be numbers from 0 to 100`);
      for (const field of ['links', 'requires']) {
        for (const target of item[field] ?? []) {
          if (!ids.has(target)) problems.push(`${name}: ${field} refers to unknown id "${target}"`);
          if (target === item.id) problems.push(`${name}: ${field} refers to itself`);
        }
      }
      if (!Array.isArray(item.links)) problems.push(`${name}: "links" must be an array (it may be empty)`);
      if (isIntel !== (item.found === 'connect')) problems.push(`${name}: an INTEL record is found by "connect" and nothing else is`);
      if (item.found === 'connect' || item.connects) {
        if (!Array.isArray(item.connects) || !item.connects.length) problems.push(`${name}: an INTEL record needs at least one pair in "connects"`);
        for (const pair of item.connects ?? []) {
          if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1]) { problems.push(`${name}: a connects entry must be two different ids`); continue; }
          for (const target of pair) {
            if (!ids.has(target)) problems.push(`${name}: connects refers to unknown id "${target}"`);
            else if (byId.get(target).type === 'INTEL') problems.push(`${name}: connects "${target}", an INTEL record (connect chains are not supported)`);
            else if (item.route && byId.get(target).route && byId.get(target).route !== item.route) problems.push(`${name}: connects "${target}", which belongs to the other route`);
          }
        }
      }
      if (item.found === 'scan' || item.found === 'intercept') {
        if (!Number.isInteger(item.tier) || item.tier < 1) problems.push(`${name}: a ${item.found} record needs a "tier" of 1 or more`);
      } else if (item.tier !== undefined) problems.push(`${name}: "tier" only belongs to scan and intercept records`);
      if (item.found === 'scan') {
        if (typeof item.file !== 'string' || !/^[a-z0-9._/-]+$/.test(item.file)) problems.push(`${name}: a scan record needs a "file" path for dump`);
        else if (files.has(item.file)) problems.push(`${name}: duplicate file "${item.file}"`);
        files.add(item.file);
      } else if (item.file !== undefined) problems.push(`${name}: "file" only belongs to scan records`);
      if (item.encrypted) {
        if (!(item.decryptSeconds > 0)) problems.push(`${name}: an encrypted record needs a positive "decryptSeconds"`);
        if (item.found === 'cat' || item.found === 'story' || item.found === 'echo' || item.found === 'connect') problems.push(`${name}: only scan and intercept records can be encrypted (the original puzzle path must stay open)`);
      } else if (item.decryptSeconds !== undefined) problems.push(`${name}: "decryptSeconds" without "encrypted"`);
      if (item.compromiseAtTrace !== undefined) {
        if (!(item.compromiseAtTrace > 0 && item.compromiseAtTrace <= traceWindow)) problems.push(`${name}: compromiseAtTrace must be above 0 and at most the trace window (${traceWindow})`);
        if (item.found === 'cat' || item.found === 'story' || item.found === 'echo') problems.push(`${name}: the original puzzle records are never lost`);
      } else if (item.type === 'COMPROMISED') problems.push(`${name}: a COMPROMISED record needs "compromiseAtTrace"`);
    }
    // "requires" must not contain a cycle (the records would never appear).
    const visiting = new Set();
    const done = new Set();
    const walk = (id, trail) => {
      if (done.has(id) || !byId.has(id)) return;
      if (visiting.has(id)) { problems.push(`evidence "requires" cycle: ${[...trail, id].join(' -> ')}`); return; }
      visiting.add(id);
      for (const next of byId.get(id).requires ?? []) walk(next, [...trail, id]);
      visiting.delete(id);
      done.add(id);
    };
    for (const id of ids) walk(id, []);
    // Tiers of one command must be contiguous, or a tier could never be reached.
    for (const kind of ['scan', 'intercept']) {
      const tiers = [...new Set(records.filter((item) => item.found === kind).map((item) => item.tier))].sort((a, b) => a - b);
      tiers.forEach((tier, index) => { if (tier !== index + 1) problems.push(`evidence ${kind} tiers must be 1, 2, 3 ... without gaps (found ${tiers.join(',')})`); });
    }
    // Reachability, per route: every record can be obtained by someone who follows the rules.
    if (!problems.length) {
      const reachable = new Set();
      for (const route of ROUTES) {
        const visible = records.filter((item) => !item.route || item.route === route);
        const have = new Set();
        for (let progress = true; progress;) {
          progress = false;
          for (const item of visible) {
            if (have.has(item.id) || !(item.requires ?? []).every((id) => have.has(id))) continue;
            const ok = item.found === 'connect' ? item.connects.some(([a, b]) => have.has(a) && have.has(b)) : true;
            if (ok) { have.add(item.id); progress = true; }
          }
        }
        for (const item of visible) {
          if (!have.has(item.id)) problems.push(`evidence "${item.id}" can never be obtained on the ${route} route`);
          else reachable.add(item.id);
        }
      }
    }
    return problems;
  }

  const options = { types: data.EVIDENCE_TYPES, found: data.EVIDENCE_FOUND, traceWindow: CASE.traceWindow };
  const clone = () => structuredClone(data.EVIDENCE);
  const real = validateEvidence(data.EVIDENCE, options);
  real.forEach((problem) => fail(problem));
  if (!real.length) pass(`valid: ${data.EVIDENCE.length} records (${data.EVIDENCE.filter((item) => item.type === 'INTEL').length} INTEL), codes ${data.EVIDENCE[0].code}..${data.EVIDENCE.at(-1).code}`);

  // The validator itself: each mutation of the real data must be reported.
  const mutations = [
    ['a duplicate id', (r) => { r[1].id = r[0].id; }, 'duplicate id'],
    ['a duplicate code', (r) => { r[1].code = r[0].code; }, 'duplicate code'],
    ['a link to an unknown id', (r) => { r[0].links.push('nowhere'); }, 'unknown id "nowhere"'],
    ['a connects entry with an unknown id', (r) => { r.find((i) => i.id === 'intel-chain').connects[0][1] = 'nowhere'; }, 'unknown id "nowhere"'],
    ['an INTEL record without pairs', (r) => { delete r.find((i) => i.id === 'intel-chain').connects; }, 'at least one pair'],
    ['a requires cycle', (r) => { r.find((i) => i.id === 'net-beacon').requires = ['net-relay-chain']; }, 'cycle'],
    ['an encrypted record without a duration', (r) => { delete r.find((i) => i.id === 'srv-ledger').decryptSeconds; }, 'positive "decryptSeconds"'],
    ['an encrypted original record', (r) => { Object.assign(r.find((i) => i.id === 'page-markup'), { encrypted: true, decryptSeconds: 4 }); }, 'original puzzle path'],
    ['a fragile original record', (r) => { r.find((i) => i.id === 'page-style').compromiseAtTrace = 30; }, 'never lost'],
    ['a COMPROMISED record without a threshold', (r) => { delete r.find((i) => i.id === 'ram-residue').compromiseAtTrace; }, 'needs "compromiseAtTrace"'],
    ['a threshold beyond the trace window', (r) => { r.find((i) => i.id === 'srv-ledger').compromiseAtTrace = 9999; }, 'at most the trace window'],
    ['a scan tier gap', (r) => { r.find((i) => i.id === 'ram-residue').tier = 3; }, 'tiers must be 1, 2, 3'],
    ['a record that can never appear', (r) => { r.find((i) => i.id === 'net-relay-chain').requires = ['intel-chain']; }, 'can never be obtained'],
    ['an INTEL pair across the routes', (r) => { r.find((i) => i.id === 'intel-cleanup-unknown').connects = [['watcher-log', 'ghost-script']]; }, 'other route'],
    ['a text that prints a key layer', (r) => { r[0].detail = 'the second part is --sdb9-part-two'; }, 'prints a key layer'],
    ['an unknown type', (r) => { r[0].type = 'RUMOUR'; }, 'unknown type'],
    ['a position outside the map', (r) => { r[0].x = 140; }, 'x and y must be numbers'],
  ];
  for (const [name, mutate, needle] of mutations) {
    const records = clone();
    mutate(records);
    expect(validateEvidence(records, options).some((problem) => problem.includes(needle)), `the validator reports ${name}`);
  }

  // Every place the code names an evidence id must point at a record the original path can really reach.
  const ids = new Set(data.EVIDENCE.map((item) => item.id));
  const original = new Map(data.EVIDENCE.filter((item) => ['cat', 'story', 'echo'].includes(item.found)).map((item) => [item.id, item]));
  const references = new Map(); // id -> where
  const add = (id, where) => references.set(`${id}\u0000${where}`, { id, where });
  for (const file of (await readdir(js(''), { recursive: true })).filter((name) => name.endsWith('.js')).sort()) {
    if (file === path.join('story-data', 'evidence.js')) continue;
    const text = await readFile(js(file), 'utf8');
    for (const match of text.matchAll(/\bdiscover\(\s*['"]([\w-]+)['"]/g)) add(match[1], `${file} discover(...)`);
    for (const match of text.matchAll(/caseFile\(\s*['"]discover['"]\s*,\s*['"]([\w-]+)['"]/g)) add(match[1], `${file} caseFile('discover', ...)`);
  }
  Object.entries(level.LEVEL01_FILE_EVIDENCE).forEach(([file, id]) => add(id, `LEVEL01_FILE_EVIDENCE "${file}"`));
  Object.entries(level.LEVEL01_SOURCE_FILES).forEach(([file, entry]) => add(entry.evidence, `LEVEL01_SOURCE_FILES "${file}"`));
  let badReference = 0;
  for (const { id, where } of references.values()) {
    if (!ids.has(id)) { fail(`${where} names the evidence id "${id}", which does not exist`); badReference++; }
    else if (!original.has(id)) { fail(`${where} discovers "${id}", which is found by ${data.EVIDENCE.find((item) => item.id === id).found}, not by a plain discover`); badReference++; }
  }
  if (!badReference) pass(`${references.size} evidence reference(s) in the code name existing, plainly discoverable records`);
  expect(!KEY_LEAK.test(JSON.stringify(data.EVIDENCE)), 'no evidence text prints a key layer');
  expect(ids.size === data.EVIDENCE.length && data.ORIGINAL_IDS.every((id) => ids.has(id)), 'the original nine records are still there');
}

// ---- the evidence state machine of the case file (phase 4.2), without a DOM
{
  console.log('\ncase file state machine');
  const { createCaseFile } = await import(js('casefile.js'));
  const { CASE: CASEQ } = await import(js('story-data/constants.js'));
  const cues = [];
  let secs = CASEQ.traceWindow;
  const trigger = {
    hidden: true, offsetWidth: 0, classList: { add() {}, remove() {} }, querySelector: () => ({ textContent: '' }), setAttribute() {}, addEventListener() {},
  };
  const make = (route) => {
    const file = createCaseFile({ trigger, getTraceLeft: () => secs, audio: { play: (cue) => cues.push(cue) } });
    file.start(route);
    file.chooseTrust(route);
    secs = CASEQ.traceWindow;
    cues.length = 0;
    return file;
  };
  const codes = (list) => list.map((item) => item.code).join(',');

  {
    const file = make('unknown');
    expect(file.discover('lock-header') === true && file.discover('lock-header') === false, 'discover returns true once, then false');
    expect(trigger.hidden === false, 'the first evidence reveals the CASE FILE trigger');
    expect(file.discover('watcher-log') === false, 'the other route\'s record cannot be discovered');
    expect(file.discover('net-beacon') === false && file.discover('srv-ledger') === false, 'a plain discover cannot open intercept or scan records');
    expect(file.snapshot().discoveries.join() === 'lock-header' && cues.join() === 'evidence-unlock', 'a discovery is readable and plays evidence-unlock once');

    const first = file.scan();
    expect(first.tier === 1 && codes(first.found) === 'e12,e13', `scan 1 reveals the relay files (${codes(first.found)})`);
    expect(file.snapshot().evidence['srv-handshake'] === 'locked' && file.snapshot().evidence['srv-ledger'] === 'locked' && !('ram-residue' in file.snapshot().evidence), 'scan 1 leaves them locked and the deep record hidden');
    const second = file.scan();
    expect(codes(second.found) === 'e14' && file.scan().found.length === 0, 'scan 2 (deep) reveals the volatile record, scan 3 finds nothing');
    expect(file.find('e13')?.id === 'srv-ledger' && file.find('SRV-LEDGER')?.code === 'e13' && file.find('ram-res')?.id === 'ram-residue', 'find accepts a code, an id in any case and a unique prefix');
    expect(file.find('net-beacon') === null && file.find('e10') === null, 'a record that is still hidden cannot be named');

    expect(codes(file.intercept().found) === 'e10' && file.snapshot().evidence['net-beacon'] === 'unlocked', 'intercept 1 captures the beacon (readable)');
    const frame = file.intercept();
    expect(codes(frame.found) === 'e11' && file.snapshot().evidence['net-relay-chain'] === 'locked', 'intercept 2 captures the encrypted frame (locked)');
    expect(file.intercept().found.length === 0, 'intercept 3 finds nothing');

    expect(file.dump('relay/ledger.enc').reason === 'encrypted' && file.dump('nope.txt').reason === 'unknown', 'dump refuses an encrypted file and an unknown path');
    const dumped = file.dump('relay/handshake.log');
    expect(dumped.ok && file.snapshot().evidence['srv-handshake'] === 'unlocked' && file.dump('relay/handshake.log').reason === 'already', 'dump reads a plain scan file once');

    expect(file.startDecrypt('e10').reason === 'not-encrypted', 'decrypt refuses a record that is not encrypted');
    const job = file.startDecrypt('e11');
    expect(job.ok && job.seconds === CASEQ.decryptSeconds.relayChain, `decrypt starts with the configured duration (${job.seconds} s)`);
    expect(file.startDecrypt('e13').reason === 'busy' && file.jobStatus()?.id === 'net-relay-chain', 'only one decrypt runs at a time');
    expect(file.finishDecrypt()?.id === 'net-relay-chain' && file.snapshot().evidence['net-relay-chain'] === 'decrypted' && file.jobStatus() === null, 'finishDecrypt makes the record decrypted and ends the job');
    expect(file.startDecrypt('e11').reason === 'done', 'a decrypted record cannot be decrypted again');

    expect(file.connect('e10', 'e11').ok && file.snapshot().evidence['intel-chain'] === 'unlocked', 'connect reveals the INTEL record of a related pair');
    expect(file.connect('e11', 'e10').reason === 'already', 'connecting the same pair again says so');
    expect(file.connect('e10', 'e12').reason === 'none', 'unrelated records have no relation');
    expect(file.connect('e1', 'e2').reason === 'locked' || file.connect('e1', 'e2').reason === 'unknown', 'a pair with a record the player does not hold is refused');
    file.discover('page-markup');
    expect(file.connect('lock-header', 'page-markup').ok && file.connect('e1', 'e3').reason === 'unknown', 'connect accepts the original records (and refuses one that was not found yet)');
    expect(file.connect('e13', 'e12').reason === 'locked', 'a locked record cannot be connected until it is opened');
    expect(file.connect('route-note', 'ghost-script').reason === 'unknown', 'the other route\'s records cannot be named');
    expect(cues.includes('relay-connect') && cues.includes('evidence-decrypt'), 'connect and decrypt play their cues');
    file.start('unknown');
    expect(Object.keys(file.snapshot().evidence).length === 0 && file.snapshot().scans === 0 && file.jobStatus() === null, 'start() resets the evidence, the counters and the job');
  }

  {
    const file = make('unknown');
    file.discover('route-note');
    file.discover('ghost-script');
    expect(file.connect('e5', 'e7').ok && file.snapshot().evidence['intel-cleanup-unknown'] === 'unlocked', 'the unknown route gets its own intel');
    const watcher = make('watcher');
    watcher.discover('watcher-log');
    watcher.discover('ghost-script');
    expect(watcher.connect('e6', 'e7').ok && watcher.snapshot().evidence['intel-cleanup-watcher'] === 'unlocked' && watcher.find('route-note') === null, 'the watcher route gets its own intel and cannot see the other route\'s');
  }

  {
    // Evidence the player does not hold yet is lost at its threshold; evidence they hold never is.
    const file = make('unknown');
    file.scan();
    file.tick(CASEQ.compromiseAt.residue + 1);
    expect(!('ram-residue' in file.snapshot().evidence), 'nothing is lost above the first threshold');
    file.tick(CASEQ.compromiseAt.residue);
    expect(file.snapshot().evidence['ram-residue'] === 'compromised' && cues.includes('breach-alert'), 'the volatile record is lost at its threshold (even though it was never seen) with a breach-alert');
    expect(file.scan().found.length === 0 && file.dump('mem/trace-agent.bin').reason === 'compromised', 'a lost record is not revealed by a later scan and cannot be dumped');
    file.intercept();
    file.intercept();
    secs = CASEQ.compromiseAt.ledger + 10;
    const started = file.startDecrypt('e13');
    expect(started.ok, 'a decrypt can start before the threshold');
    file.tick(CASEQ.compromiseAt.relayChain);
    expect(file.snapshot().evidence['net-relay-chain'] === 'compromised', 'the locked relay frame is lost at its threshold');
    file.tick(CASEQ.compromiseAt.ledger);
    expect(file.jobStatus()?.lost === true && file.finishDecrypt() === null && file.snapshot().evidence['srv-ledger'] === 'compromised', 'a decrypt of a record that is lost meanwhile fails and the record is compromised');
    expect(file.startDecrypt('e13').reason === 'compromised' && file.connect('e13', 'e12').reason === 'compromised' || file.connect('e13', 'e12').reason === 'locked', 'a lost record cannot be decrypted or connected');

    const keep = make('unknown');
    keep.scan();
    secs = 100;
    keep.startDecrypt('e13');
    expect(keep.finishDecrypt()?.id === 'srv-ledger', 'a record decrypted in time is kept');
    keep.tick(1);
    expect(keep.snapshot().evidence['srv-ledger'] === 'decrypted', 'a record the player holds is never taken away');
    expect(keep.compromiseCheck(Number.NaN).length === 0 && keep.compromiseCheck(null).length === 0, 'compromiseCheck ignores a missing trace');
    // The original puzzle records are never fragile: a tick at 1 s changes none of them.
    const orig = make('unknown');
    ['lock-header', 'page-markup', 'page-style', 'page-script'].forEach((id) => orig.discover(id));
    orig.tick(1);
    expect(['lock-header', 'page-markup', 'page-style', 'page-script'].every((id) => orig.snapshot().evidence[id] === 'unlocked'), 'the key layer records stay readable at 1 s');
  }

  {
    // Phase 4b.1: the story's first mention opens the board; before it the button stays hidden.
    const file = make('unknown');
    expect(trigger.hidden === true, 'after start() the CASE FILE button is hidden');
    expect(file.makeAvailable() === true && trigger.hidden === false, 'makeAvailable reveals the CASE FILE button');
    expect(file.makeAvailable() === false, 'makeAvailable is safe to call twice (false the second time)');
    expect(file.getView().events.some((entry) => entry.title === 'CASE FILE AVAILABLE'), 'the timeline records that the board became available');
    expect(file.snapshot().discoveries.length === 0, 'making the board available discovers no evidence');
    file.start('unknown');
    expect(trigger.hidden === true, 'start() (a reboot) hides the button again');
  }

  {
    // What the board is given (phase 4.5/4.6): getView() is plain data and never carries text the player may not read.
    for (const [route, other] of [['unknown', 'watcher-log'], ['watcher', 'route-note']]) {
      const file = make(route);
      file.scan();
      secs = CASEQ.compromiseAt.ledger + 10;
      const view = file.getView();
      const stub = view.items.find((item) => item.id === other);
      expect(stub?.state === 'sealed' && !stub.title && !stub.summary && !stub.detail && stub.code === '--', `route ${route}: the other branch shows as a sealed stub without text`);
      expect(!view.items.some((item) => item.type === 'INTEL' && item.state === 'sealed'), `route ${route}: INTEL of the other branch is not shown at all`);
      expect(view.total === view.items.filter((item) => item.state !== 'sealed').length, `route ${route}: sealed stubs are not counted`);
      const locked = view.items.find((item) => item.id === 'srv-ledger');
      expect(locked.state === 'locked' && !locked.summary && !locked.detail && !locked.source && locked.title, 'a locked record shows its title and no content');
      const hidden = view.items.find((item) => item.id === 'page-markup');
      expect(hidden.state === 'hidden' && !hidden.title && !hidden.detail, 'a story record that was not found shows as an unobserved placeholder');
      expect(!view.items.some((item) => item.id === 'net-beacon' || item.id === 'intel-layers'), 'scan and intel records appear only once seen');
    }
    const file = make('unknown');
    file.scan();
    secs = CASEQ.compromiseAt.ledger + 25;
    expect(file.getView().items.find((item) => item.id === 'srv-ledger').atRisk === false, 'a record far from its threshold is not at risk');
    secs = CASEQ.compromiseAt.ledger + 15;
    expect(file.getView().items.find((item) => item.id === 'srv-ledger').atRisk === true, 'a locked record within 20 s of its threshold is at risk');
    file.tick(CASEQ.compromiseAt.ledger);
    const lost = file.getView().items.find((item) => item.id === 'srv-ledger');
    const real = (await import(js('story-data/evidence.js'))).EVIDENCE.find((item) => item.id === 'srv-ledger');
    expect(lost.state === 'compromised' && lost.atRisk === false && lost.detail && lost.detail !== real.detail && lost.title !== real.title, 'a lost record is shown scrambled, not as its real text');
    expect(lost.source === '', 'a lost record shows no provenance');
  }
}

// ---- the hacking commands (phase 4.3), driven with a fake clock and the real registry and case file
{
  console.log('\nhacking commands');
  const { registerHackingCommands } = await import(js('hacking-commands.js'));
  const { createCaseFile } = await import(js('casefile.js'));
  const { createRegistry } = await import(js('commands.js'));
  const hackingData = await import(js('story-data/hacking.js'));
  const { CASE: TUNING } = await import(js('story-data/constants.js'));

  let clock = 1000; // ms; casefile.js and hacking-commands.js read performance.now()
  const realNow = performance.now.bind(performance);
  performance.now = () => clock;
  try {
    const rows = [];
    const played = [];
    const line = (text = '', cls = '') => { const row = { textContent: text, cls }; rows.push(row); return row; };
    const output = () => rows.map((row) => row.textContent).join('\n');
    let secs = TUNING.traceWindow;
    let onSleep = () => {};
    const trigger = {
      hidden: true, offsetWidth: 0, classList: { add() {}, remove() {} }, querySelector: () => ({ textContent: '' }), setAttribute() {}, addEventListener() {},
    };
    const setup = (route) => {
      secs = TUNING.traceWindow;
      clock = 1000;
      rows.length = 0;
      played.length = 0;
      onSleep = () => {};
      const caseFile = createCaseFile({ trigger, getTraceLeft: () => secs, audio: { play: (cue) => played.push(cue) } });
      caseFile.start(route);
      caseFile.chooseTrust(route);
      const session = {
        async sleep(ms) { clock += ms; secs -= ms / 1000; caseFile.tick(secs); onSleep(); },
      };
      const registry = createRegistry();
      registerHackingCommands(registry, {
        line, audio: { play: (cue) => played.push(cue) }, session, caseFile, motionReduced: () => false, terminal: { close() {} },
      });
      const env = { trusted: route, trace: { left: () => secs, set: (n) => { secs = n; } }, play: { over: null } };
      const run = (command) => { rows.length = 0; return registry.dispatch(command, env, line); };
      return { caseFile, registry, env, run, startedAt: clock };
    };

    {
      const { caseFile, registry, env, run } = setup('unknown');
      const help = registry.helpLines(env).map(([text]) => text).join('\n');
      expect(['scan', 'intercept', 'dump <file>', 'decrypt <id>', 'connect <a> <b>'].every((usage) => help.includes(usage)), 'help lists scan, intercept, dump, decrypt and connect');

      const before = clock;
      await run('scan');
      expect(output().includes('scan: 10.0.2.0/24') && output().includes('new nodes: 2') && /e12 {2}relay\/handshake\.log/.test(output()) && /e13 {2}relay\/ledger\.enc {2}\[enc\]/.test(output()), `scan 1 lists the two relay files (${rows.length} lines)`);
      expect(clock - before >= TUNING.scanSeconds[0] * 1000 && caseFile.snapshot().scans === 1, `scan 1 takes ${TUNING.scanSeconds[0]} s of real time and counts`);
      expect(played.includes('decrypt-progress') && played.includes('cmd-run'), 'scan plays cmd-run and the decrypt-progress ticks');
      await run('scan');
      expect(output().includes('deep scan') && output().includes('trace-agent page') && output().includes('new nodes: 1'), 'scan 2 is the deep scan and finds the volatile page');
      await run('scan');
      expect(output().includes('nothing new') && caseFile.snapshot().scans === 2, 'scan 3 is instant and changes nothing');

      played.length = 0;
      await run('intercept');
      expect(output().includes('capture: eth0') && output().includes('captured: e10') && played.filter((cue) => cue === 'packet-intercept').length === 3, 'intercept 1 trickles three packets and captures the beacon');
      await run('intercept');
      expect(/captured: e11 {2}Relay handshake frame {2}\[enc\]/.test(output()) && output().includes('read with: decrypt <id>'), 'intercept 2 captures the encrypted frame');
      await run('intercept');
      expect(output().includes('nothing of interest'), 'intercept 3 finds nothing');

      await run('dump');
      expect(output().includes('relay/handshake.log  e12') && output().includes('relay/ledger.enc  e13 [enc]'), 'dump without an argument lists the files a scan found');
      await run('dump relay/handshake.log');
      expect(output().includes('03:14:08 REGISTER guest=4097') && output().includes('[evidence] e12'), 'dump prints the file and the evidence line');
      await run('dump ./relay/ledger.enc');
      expect(output().includes('encrypted. use decrypt e13'), 'dump points an encrypted file at decrypt');
      await run('dump nothing.txt');
      expect(output().includes('no such file'), 'dump says "no such file" for an unknown path');

      await run('decrypt');
      expect(output().includes('e13') && !output().includes('e10'), 'decrypt without an argument lists the locked encrypted nodes');
      await run('decrypt e10');
      expect(output().includes('e10 is not encrypted'), 'decrypt refuses a node that is not encrypted');
      await run('decrypt zz9');
      expect(output().includes('zz9: no such node'), 'decrypt says "no such node" for an unknown name');
      const t0 = clock;
      await run('decrypt e11');
      expect(output().includes('[ok] decrypted: Relay handshake frame') && output().includes('relay 4') && clock - t0 >= TUNING.decryptSeconds.relayChain * 1000, `decrypt prints the frame after ${TUNING.decryptSeconds.relayChain} s of real time`);
      expect(caseFile.snapshot().evidence['net-relay-chain'] === 'decrypted' && caseFile.snapshot().job === null && played.includes('evidence-decrypt'), 'decrypt leaves the record decrypted and no job behind');
      await run('decrypt e11');
      expect(output().includes('already decrypted'), 'decrypting twice is refused');

      await run('connect');
      expect(output().includes('usage: connect <id> <id>') && output().includes('readable: e10 e11 e12'), 'connect without arguments lists what can be connected');
      await run('connect e10 e11');
      expect(output().includes('intel: One exit') && output().includes('[evidence] e16') && played.includes('relay-connect'), 'connect reveals the INTEL record');
      secs = 100;
      await run('connect e10 e12');
      expect(output().includes('no relation between e10 and e12') && secs === 100 - TUNING.connectMissCost, `a connect with no relation costs ${TUNING.connectMissCost} trace seconds`);
      await run('connect e13 e12');
      expect(output().includes('e13 is not readable yet'), 'connect refuses a locked node');
      await run('connect e10 e10');
      expect(output().includes('pick two different nodes'), 'connect refuses one node twice');
    }

    {
      // The trace ends in the middle of a decrypt: the job stops, nothing is left behind.
      const { caseFile, env, run } = setup('unknown');
      await run('scan');
      let sleeps = 0;
      onSleep = () => { if (++sleeps === 3) env.play.over = 'TRACE COMPLETE'; };
      await run('decrypt e13');
      expect(output().includes('decrypt: interrupted') && caseFile.snapshot().job === null && caseFile.snapshot().evidence['srv-ledger'] === 'locked', 'a decrypt stops when the trace ends and leaves the record locked');
    }

    {
      // The record is overwritten by the trace while it is being decrypted.
      const { caseFile, run } = setup('unknown');
      await run('scan');
      secs = TUNING.compromiseAt.ledger + 3;
      await run('decrypt e13');
      expect(output().includes('overwritten by the trace') && caseFile.snapshot().evidence['srv-ledger'] === 'compromised' && caseFile.snapshot().job === null, 'a decrypt of a record the trace overwrites meanwhile fails');
    }

    {
      // A record decrypted too late is lost before the player can start; the shell says so.
      const { run } = setup('watcher');
      await run('scan');
      secs = TUNING.compromiseAt.ledger - 1;
      await run('decrypt e13');
      expect(output().includes('data corrupted, cannot recover'), 'decrypt refuses a record that is already lost');
    }

    // The words: documentation addresses only, no key, every message used exists.
    const text = JSON.stringify(hackingData);
    const addresses = text.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
    const documentation = (address) => /^(192\.0\.2|198\.51\.100|203\.0\.113|10\.0\.2|127\.0\.0)/.test(address);
    expect(addresses.every(documentation), `only documentation-range addresses appear in the command text (${addresses.filter((a) => !documentation(a)).join(', ') || 'none outside'})`);
    expect(!/sdb9-part|--sdb9|ghost[-\s]+shell|shell[-\s]+1337/i.test(text), 'no command text prints a key layer');
    const source = await readFile(js('hacking-commands.js'), 'utf8');
    const used = [...source.matchAll(/msg\('(\w+)'/g)].map((match) => match[1]);
    expect(used.every((key) => key in hackingData.MESSAGES), `every message the commands use exists (${used.filter((key) => !(key in hackingData.MESSAGES)).join(', ') || 'all'})`);
    expect(Object.keys(hackingData.DUMP_FILES).every((file) => hackingData.DUMP_FILES[file].length) && Object.keys(hackingData.DECRYPTED).length === 2, 'every dumped file and decrypted record has text');
  } finally {
    performance.now = realNow;
  }
}

// ---- the trace window after the trust choice (phase 4b.0b)
{
  console.log('\ntrace window');
  const { TRACE, CASE: WINDOW } = await import(js('story-data/constants.js'));
  const { routes } = await import(js('story-data/routes.js'));
  expect(WINDOW.traceWindow === TRACE.afterTrust, 'the map window follows the window after the trust choice');
  expect(Object.keys(WINDOW.compromiseShare).every((key) => WINDOW.compromiseAt[key] === Math.round(WINDOW.compromiseShare[key] * TRACE.afterTrust)),
    'the loss thresholds are a share of the window, not absolute seconds');
  expect(Object.values(WINDOW.compromiseAt).every((secs) => secs > 10 && secs < TRACE.afterTrust),
    'every loss threshold lies inside the window and above the TRACE PENDING floor');
  // The spoken line must say what the constant says ("five minutes. no extensions." for 300 s).
  const words = { two: 120, three: 180, four: 240, five: 300, six: 360 };
  const spoken = routes.filter((node) => node.type === 'say' && /minutes\. no extensions\.$/.test(node.text))
    .map((node) => words[node.text.split(' ')[0]]);
  expect(spoken.length === 1 && spoken[0] === TRACE.afterTrust, `the line "N minutes. no extensions." names the real window (${TRACE.afterTrust} s)`);
}

// ---- the trace topology (phase 4.4)
{
  console.log('\ntrace topology');
  const { topologyState, topologyLines } = await import(js('topology.js'));
  const { TOPOLOGY_NODES } = await import(js('story-data/hacking.js'));
  const { CASE: TUNING } = await import(js('story-data/constants.js'));
  expect(TOPOLOGY_NODES.length === TUNING.hops + 2, `the path has you, ${TUNING.hops} relays and the target`);
  expect(TOPOLOGY_NODES.every((node) => /^(10\.0\.2\.|198\.51\.100\.|203\.0\.113\.|\[REDACTED\])/.test(node.address)), 'only documentation addresses on the path');
  expect(/█|REDACTED/.test(TOPOLOGY_NODES.at(-1).address) && /█/.test(TOPOLOGY_NODES.at(-2).address), 'the last relay and the target are redacted');
  const at = (secs) => topologyState(secs);
  expect(at(TUNING.traceWindow).reached === 0 && at(TUNING.traceWindow).hopsLeft === TUNING.hops + 1 && at(480).percent === 0, 'before the window nothing is reached');
  expect(at(0).reached === TUNING.hops + 1 && at(0).hopsLeft === 0 && at(0).percent === 100, 'at 0 s the target is reached');
  let previous = -1;
  let monotonic = true;
  for (let secs = TUNING.traceWindow; secs >= 0; secs--) {
    const { reached } = at(secs);
    if (reached < previous) monotonic = false;
    previous = reached;
  }
  expect(monotonic, 'the reached count never goes down as time runs out');
  expect(at(-5).percent === 100 && at(9999).percent === 0, 'out-of-range seconds are clamped');
  const lines = topologyLines(TUNING.traceWindow / 2);
  expect(lines.every((row) => row.length <= 34), `every status line fits a phone (longest ${Math.max(...lines.map((row) => row.length))})`);
  expect(lines[0].startsWith('trace [') && lines.at(-1).startsWith('hops remaining: '), 'bar first, hops last');
  expect(lines.filter((row) => row.startsWith('[x]')).length === at(TUNING.traceWindow / 2).reached + 1, 'rows marked reached = you + reached nodes');
  expect(!lines.some((row) => /\[?x\]? .*REDACTED/.test(row)) || at(TUNING.traceWindow / 2).reached === TUNING.hops + 1, 'the target stays unmarked until reached');
}

console.log(failures ? `\n${failures} problem(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
