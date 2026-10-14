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
    line: (text = '') => note(`line:${text}`),
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
    wait: async () => note('wait'),
    sfx: (cue) => { cues.add(cue); note(`sfx:${cue}`); },
    setScene: (name) => note(`scene:${name}`),
    gfx: async (name) => note(`gfx:${name}`),
    flash: async () => note('flash'),
    staticBurst: async () => note('static'),
    corrupt: async () => note('corrupt'),
    blackout: async () => note('blackout'),
    setRain: (opacity) => note(`rain:${opacity}`),
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

console.log(failures ? `\n${failures} problem(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);
