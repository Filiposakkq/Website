// The terminal's output primitives: the things a story node ultimately does to #output.
//
// Created once per page. Everything that waits goes through the CURRENT pace (`getPace()`), so a reboot or a
// developer jump (new session, new pace) needs no new output object. While the player is skipping, sounds are
// dropped (the text still appears, instantly).
//
// Screen readers: #output is a role=log with aria-live=off (it is mutated a character at a time). Each COMPLETED
// line is announced through a separate polite region instead, unless the current segment is decorative.

import { rand } from './util.js';
import { PROMPT } from './story-data/constants.js';

// The story runs 22% faster than the raw millisecond numbers in the data (kept from before phase 3).
const TEMPO = 0.78;
// Auto-typed text ticks on every 3rd character at 60% of a real keystroke's level.
const AUTO_TYPING = { gain: 0.6 };

/**
 * @param {object} options
 * @param {HTMLElement} options.out           #output
 * @param {HTMLElement} options.announcer     the polite sr-only region
 * @param {{ play: (cue: string, params?: object) => void }} options.audio
 * @param {() => ReturnType<typeof import('./pace.js').createPace>} options.getPace
 * @param {() => boolean} options.motionReduced
 * @param {() => boolean} options.isAnnouncing  false while decorative output (the BIOS) scrolls past
 * @param {Record<string, { name: string, nameCls: string, cls: string, quiet: boolean }>} options.voices
 */
export function createOutput({ out, announcer, audio, getPace, motionReduced, isAnnouncing, voices }) {
  const wait = (ms) => getPace().wait(ms);
  const play = (cue, params) => { if (!getPace().isSkipping()) audio.play(cue, params); };
  const scroll = () => window.scrollTo(0, document.body.scrollHeight);
  // `who` names a voice. The `name` / `nameCls` options are the old way (a display name and a class); they are
  // kept until the last legacy block of story.js has moved to story data (phase 3.7), then deleted.
  const voice = (who, name, nameCls) => voices[who ?? name]
    ?? { name: name ?? who, nameCls: nameCls ?? 'dim', cls: '', quiet: (name ?? who) === 'Mr. Robot' };
  let kernelLines = 0;

  function announce(text) {
    const message = String(text ?? '').trim();
    if (!message || !isAnnouncing()) return;
    const entry = document.createElement('div');
    entry.textContent = message;
    announcer.appendChild(entry);
    while (announcer.children.length > 12) announcer.firstElementChild.remove();
  }

  function line(text = '', cls = '', { silent = false } = {}) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    d.textContent = text || ' ';
    out.appendChild(d);
    scroll();
    if (!silent) announce(text);
    return d;
  }

  async function type(text, cls = '', speed = 35, { silent = false } = {}) {
    play('typewriter-start');
    const d = line('', cls);
    d.textContent = '';
    for (const [index, ch] of [...text].entries()) {
      if (index % 3 === 0 && ch.trim()) play('key-tick', AUTO_TYPING);
      d.textContent += ch;
      await wait(motionReduced() ? 0 : speed * TEMPO);
    }
    if (!silent) announce(text);
    return d;
  }

  async function bar(label, ms = 1500) {
    play('progress-start');
    const d = line();
    if (motionReduced()) {
      d.textContent = `${label} [################] 100%`;
      play('progress-complete');
      return;
    }
    const total = 16;
    for (let i = 0; i <= total; i++) {
      if (i > 0 && i % 4 === 0) play('progress-tick');
      const pct = Math.round((i / total) * 100);
      d.textContent = `${label} [${'#'.repeat(i)}${'.'.repeat(total - i)}] ${pct}%`;
      await wait((ms * 0.82 * TEMPO) / total);
    }
    play('progress-complete');
  }

  /** A kernel log line with an explicit timestamp (seconds). Every third line ticks. */
  async function klog(text, cls = 'dim', t = 0) {
    if (kernelLines++ % 3 === 0) play('kernel-tick');
    line(`[${t.toFixed(6).padStart(12)}] ${text}`, cls, { silent: true });
    await wait(rand(24, 88));
  }

  /** systemd style: `[ .... ] text` flips to `[  OK  ]`, or to `[FAILED]` with the boot-fail cue. */
  async function svc(text, state = 'OK', ms) {
    play('service');
    const d = document.createElement('div');
    const tag = document.createElement('span');
    tag.className = 'dim';
    tag.textContent = '[ .... ] ';
    d.append(tag, text);
    out.appendChild(d);
    scroll();
    await wait((ms ?? rand(150, 550)) * TEMPO);
    tag.textContent = state === 'OK' ? '[  OK  ] ' : '[FAILED] ';
    tag.className = state === 'OK' ? '' : 'warn';
    play(state === 'OK' ? 'service-ready' : 'boot-fail');
    await wait(40);
  }

  /** `Memory Test: 4096MB` counting up to `Memory Test: 16384MB OK` over about `ms`. */
  async function memtest(total = 16384, ms = 700) {
    const d = line('', '', { silent: true });
    if (motionReduced()) {
      d.textContent = `Memory Test: ${total}MB OK`;
      return;
    }
    const step = 512;
    const steps = Math.ceil(total / step);
    for (let mb = 0; mb < total; mb += step) {
      d.textContent = `Memory Test: ${mb}MB`;
      await wait(ms / steps);
    }
    d.textContent = `Memory Test: ${total}MB OK`;
  }

  /** Prints `text`, pauses, then appends `result` to the same line (hardware detection). */
  async function probe(text, result, ms = 700, cls = '') {
    const d = line(text, cls, { silent: true });
    await wait(ms);
    d.textContent = `${text}${result}`;
    announce(d.textContent);
  }

  /** Types a command after a prompt, like in a real terminal. `mask` shows asterisks (passwords). */
  async function cmd(text, speed = 55, pause = 450, { prompt = PROMPT, mask = false } = {}) {
    play('terminal-open');
    const d = document.createElement('div');
    const p = document.createElement('span');
    p.className = 'dim';
    p.textContent = prompt;
    const t = document.createElement('span');
    d.append(p, t);
    out.appendChild(d);
    for (const [index, ch] of [...text].entries()) {
      if (index % 3 === 0 && ch.trim()) play('key-tick', AUTO_TYPING);
      t.textContent += mask ? '*' : ch;
      scroll();
      await wait(motionReduced() ? 0 : speed * TEMPO);
    }
    await wait(pause);
  }

  /** The animated "is typing..." bubble (three pulsing dots). */
  async function typingFor(ms, who = 'unknown', nameCls) {
    const v = voice(who, undefined, nameCls);
    play('incoming-call');
    const d = document.createElement('div');
    d.innerHTML = `<span class="${v.nameCls}">&lt;${v.name}&gt; </span><span class="dots"><i></i><i></i><i></i></span>`;
    out.appendChild(d);
    scroll();
    await wait(ms * TEMPO);
    d.remove();
  }

  // A floating line is fixed to the viewport, so it must live outside `.screen`: an animated filter/transform on
  // `.screen` makes it the containing block, and "centre" would then be the middle of the whole scrolled log
  // instead of the middle of the window. The placeholder keeps its place in the log.
  const helloSlots = new WeakMap(); // floating element -> its hidden placeholder in the log

  /**
   * A message from a voice, typed the human way: uneven tempo, pauses at commas, an optional typo.
   * `text` is a string or an array of parts `[{ t: 'text', cls: 'ok' }, ...]` (a part with cls `ok` stays green
   * even inside the red watcher text).
   */
  async function say(text, { who, name, nameCls, cls, speed = 70, typoAt = -1, floating = false } = {}) {
    const v = voice(who ?? (name ? undefined : 'unknown'), name, nameCls);
    if (!v.quiet) play('message');
    const parts = typeof text === 'string' ? [{ t: text }] : text;
    const d = document.createElement('div');
    const tag = document.createElement('span');
    tag.className = v.nameCls;
    tag.textContent = `<${v.name}> `;
    const t = document.createElement('span');
    const textCls = cls ?? v.cls;
    if (textCls) t.className = textCls;
    if (floating) {
      const slot = document.createElement('span');
      slot.className = 'mr-hello-chat mr-hello-placeholder';
      slot.textContent = parts.map((part) => part.t).join('');
      d.append(tag, slot);
      const layer = document.createElement('div');
      layer.className = 'hello-flight-layer';
      layer.setAttribute('aria-hidden', 'true');
      layer.appendChild(t);
      document.body.appendChild(layer);
      helloSlots.set(t, slot);
    } else {
      d.append(tag, t);
    }
    out.appendChild(d);
    let i = 0;
    for (const part of parts) {
      const seg = document.createElement('span');
      if (part.cls) seg.className = part.cls;
      t.appendChild(seg);
      for (const ch of part.t) {
        if (i === typoAt && !motionReduced()) {
          seg.textContent += 'x';
          scroll();
          await wait(180);
          seg.textContent = seg.textContent.slice(0, -1);
          await wait(140);
        }
        if (!v.quiet && i % 3 === 0 && ch.trim()) play('key-tick', AUTO_TYPING);
        seg.textContent += ch;
        scroll();
        let ms = motionReduced() ? 0 : (speed + rand(-20, 40)) * TEMPO;
        if (',.'.includes(ch)) ms += 220;
        await wait(ms);
        i++;
      }
    }
    announce(`${v.name} says: ${parts.map((part) => part.t).join('')}`);
    return t;
  }

  return {
    line, type, bar, klog, svc, memtest, probe, cmd, typingFor, say, announce, scroll, helloSlots,
    /** Starts a new run: the kernel tick counter begins again. */
    reset() { kernelLines = 0; },
  };
}
