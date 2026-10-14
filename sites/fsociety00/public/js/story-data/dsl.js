// Small constructors for story nodes. They return the plain objects the engine runs (see NODE_SPECS in
// ../engine.js), so a story file reads like a script and stays easy to validate. DOM-free: importable in Node.

import { rand } from '../util.js';

const withStyle = (node, style) => (style ? { ...node, style } : node);

/** `extra`: `{ ref: 'name' }` keeps the printed element for later `run` nodes (flow.refs.name). */
export const line = (text, style, extra = {}) => ({ ...withStyle({ type: 'line', text }, style), ...extra });
export const blank = () => ({ type: 'blank' });
export const type = (text, style, speed) => ({ ...withStyle({ type: 'type', text }, style), ...(speed ? { speed } : {}) });
/** A message from a voice (see voices.js). `options`: speed, typoAt, cls, floating, ref. */
export const say = (who, text, options = {}) => ({ type: 'say', who, text, ...options });
export const typing = (ms, who) => ({ type: 'typing', ms, ...(who ? { who } : {}) });
export const cmd = (text, options = {}) => ({ type: 'cmd', text, ...options });
export const bar = (label, ms) => ({ type: 'bar', label, ...(ms ? { ms } : {}) });
/** A kernel log line with an explicit timestamp in seconds. */
export const klog = (t, text, style) => ({ ...withStyle({ type: 'klog', t, text }, style) });
export const svc = (text, state, ms) => ({ type: 'svc', text, ...(state ? { state } : {}), ...(ms ? { ms } : {}) });
export const memtest = (total, ms) => ({ type: 'memtest', ...(total ? { total } : {}), ...(ms ? { ms } : {}) });
/** Prints `text`, pauses, then appends `result` to the same line (hardware detection). */
export const probe = (text, result, ms, style) => ({ ...withStyle({ type: 'probe', text, result }, style), ...(ms ? { ms } : {}) });
export const wait = (ms) => ({ type: 'wait', ms });
/** A pause of random length each time the story runs. */
export const jitter = (min, max) => ({ type: 'wait', ms: () => rand(min, max) });
export const sfx = (cue, params) => ({ type: 'sfx', cue, ...(params ? { params } : {}) });
export const scene = (name) => ({ type: 'scene', name });
export const gfx = (name) => ({ type: 'gfx', name });
export const flash = () => ({ type: 'flash' });
export const burst = (ms) => ({ type: 'static', ...(ms ? { ms } : {}) });
export const corrupt = (rounds) => ({ type: 'corrupt', ...(rounds ? { rounds } : {}) });
export const blackout = (ms) => ({ type: 'blackout', ...(ms ? { ms } : {}) });
export const rain = (opacity, immediate = false) => ({ type: 'rain', opacity, ...(immediate ? { immediate } : {}) });
/** Adds (on) or removes a class of the screen element, e.g. `ghosted-hit`. */
export const screenClass = (name, on = true) => ({ type: 'class', name, ...(on ? {} : { on }) });
export const logo = (...words) => ({ type: 'logo', words });
export const wipe = () => ({ type: 'wipe' });
/** Trace actions: start { secs, mode }, dock, boost { rate }, slow, set { secs }, mode { mode }, close. */
export const trace = (action, options = {}) => ({ type: 'trace', do: action, ...options });
export const state = (set) => ({ type: 'state', set });
export const caseFile = (call, ...args) => ({ type: 'case', call, ...(args.length ? { args } : {}) });
export const label = (name) => ({ type: 'label', name });
export const goto = (to) => ({ type: 'goto', to });
export const branch = (when, then, otherwise) => ({ type: 'branch', when, then, ...(otherwise ? { else: otherwise } : {}) });
export const choice = (id, options, next, set) => ({ type: 'choice', id, options, next, ...(set ? { set } : {}) });
export const run = (fn, note) => ({ type: 'run', fn, ...(note ? { note } : {}) });
export const end = () => ({ type: 'end' });

/** A message made of parts, e.g. `parts(['<unknown>', 'ok'], ' has been lying to you.')`. */
export const parts = (...items) => items.map((item) => (Array.isArray(item) ? { t: item[0], cls: item[1] } : { t: item }));
