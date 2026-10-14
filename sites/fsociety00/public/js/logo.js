// The FSOCIETY logo: a pixel-font wordmark that decrypts out of noise, locks letter by letter, gets scanned, and then
// stays alive with an occasional jitter. Created once per page; timers belong to the current session.

import { rand } from './util.js';

const GLYPHS = {
  F: ['#####', '#....', '####.', '#....', '#....'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
};


/**
 * @param {object} deps
 * @param {HTMLElement} deps.out
 * @param {{ play: (cue: string) => void }} deps.audio
 * @param {() => ReturnType<typeof import('./session.js').createSession>} deps.getSession
 * @param {(ms: number) => Promise<void>} deps.wait
 * @param {() => boolean} deps.motionReduced
 * @param {() => void} deps.scroll
 * @param {(intervalId: number) => void} deps.onAmbient  called with the id of the logo's endless jitter interval
 */
export function createLogo({ out, audio, getSession, wait, motionReduced, scroll, onAmbient }) {
  async function logo(words) {
    audio.play('logo');
    const box = document.createElement('div');
    box.className = 'logo';
    box.setAttribute('aria-label', words.join(' '));
    box.dataset.word = words.join(' ');
    out.appendChild(box);
    const header = document.createElement('div');
    header.className = 'logo-header';
    header.setAttribute('aria-hidden', 'true');
    const mark = document.createElement('span');
    mark.className = 'logo-mark';
    mark.textContent = 'FS/00';
    const relay = document.createElement('span');
    relay.className = 'logo-relay';
    relay.textContent = 'RELAY ID // 0515';
    header.append(mark, relay);
    box.appendChild(header);
    const glyphs = [];
    for (const word of words) {
      const row = document.createElement('div');
      row.className = 'logo-row';
      box.appendChild(row);
      for (const ch of word) {
        const g = document.createElement('div');
        g.className = 'glyph';
        const cells = [];
        const pattern = [];
        GLYPHS[ch].forEach((r) => {
          for (const px of r) {
            const c = document.createElement('i');
            g.appendChild(c);
            cells.push(c);
            pattern.push(px === '#');
          }
        });
        row.appendChild(g);
        glyphs.push({ g, cells, pattern, locked: false });
      }
    }
    const caption = document.createElement('div');
    caption.className = 'logo-caption';
    caption.textContent = 'PRIVATE RELAY // TRUST NO ROUTE';
    box.appendChild(caption);
    scroll();

    if (motionReduced()) {
      glyphs.forEach((glyph) => {
        glyph.cells.forEach((cell, index) => cell.classList.toggle('on', glyph.pattern[index]));
        glyph.g.classList.add('lock');
      });
      box.classList.add('done');
      return;
    }

    // 1) noise: every cell flickers at random, as if the signal were being decrypted
    const noise = motionReduced() ? null : getSession().setInterval(() => {
      glyphs.forEach((o) => {
        if (!o.locked) o.cells.forEach((c) => c.classList.toggle('on', Math.random() < 0.45));
      });
    }, 60);
    await wait(1100);

    // 2) the letters lock into their shapes one by one
    for (const o of glyphs) {
      o.locked = true;
      o.cells.forEach((c, i) => c.classList.toggle('on', o.pattern[i]));
      o.g.classList.add('lock');
      await wait(190);
    }
    if (noise !== null) getSession().clearInterval(noise);

    // 3) a scan line sweeps over the finished logo
    box.classList.add('done');
    await wait(900);

    // 4) the logo stays "alive": now and then one letter jitters for a moment
    if (!motionReduced()) {
      const interval = getSession().setInterval(() => {
        const o = glyphs[rand(0, glyphs.length - 1)];
        o.g.style.setProperty('--j', `${rand(-3, 3)}px`);
        o.g.classList.add('jit');
        getSession().setTimeout(() => o.g.classList.remove('jit'), 140);
      }, 2600);
      onAmbient(interval);
    }
  }


  return logo;
}
