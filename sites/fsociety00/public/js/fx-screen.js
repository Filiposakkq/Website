// Screen effects: the glitches, flashes, noise, blackout, corruption and the remote wipe. They are pure presentation:
// while the player is skipping or motion is reduced most of them return at once (`isSkipping() || motionReduced()`),
// and every pause goes through the current pace/session, so an abort ends them. Created once per page.

import { rand, scrambleText } from './util.js';

export const FX_NAMES = ['rgb', 'slice', 'roll', 'invert', 'zoom'];

/**
 * @param {object} deps
 * @param {HTMLElement} deps.out        #output
 * @param {HTMLElement} deps.screen     #screen
 * @param {{ play: (cue: string, params?: object) => void }} deps.audio
 * @param {() => ReturnType<typeof import('./pace.js').createPace>} deps.getPace
 * @param {() => boolean} deps.motionReduced
 * @param {(opacity: number, immediate?: boolean) => void} deps.setRain
 */
export function createScreenFx({ out, screen, audio, getPace, motionReduced, setRain }) {
  const isSkipping = () => getPace().isSkipping();
  const sleep = (ms) => getPace().sleep(ms);
  const wait = (ms) => getPace().wait(ms);

  async function glitch() {
    if (isSkipping() || motionReduced()) return;
    audio.play('static');
    screen.classList.add('glitch');
    await sleep(500);
    screen.classList.remove('glitch');
  }

  async function blackout(ms = 1400) {
    if (motionReduced()) {
      out.innerHTML = '';
      window.scrollTo(0, 0);
      return;
    }
    screen.style.opacity = '0';
    await wait(ms * 0.78);
    out.innerHTML = '';
    window.scrollTo(0, 0);
    screen.style.opacity = '1';
  }

  async function flash() {
    if (isSkipping() || motionReduced()) return;
    audio.play('static');
    screen.classList.add('flash');
    await sleep(180);
    screen.classList.remove('flash');
  }

  // ---------- glitch effects: each one looks different ----------
  const FX_MS = { rgb: 420, slice: 460, roll: 580, invert: 460, zoom: 460 };

  async function gfx(name) {
    if (isSkipping() || motionReduced()) return;
    audio.play(`glitch-${name}`);
    const cls = 'g-' + name;
    screen.classList.add(cls);
    await sleep(FX_MS[name]);
    screen.classList.remove(cls);
  }

  // Noise like a lost signal.
  const noiseEl = document.createElement('div');
  noiseEl.id = 'noise';
  (function makeNoise() {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const x = c.getContext('2d');
    const img = x.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand(0, 255);
      img.data[i] = 0;
      img.data[i + 1] = v;
      img.data[i + 2] = Math.floor(v * 0.4);
      img.data[i + 3] = rand(60, 255);
    }
    x.putImageData(img, 0, 0);
    noiseEl.style.backgroundImage = `url(${c.toDataURL()})`;
    document.body.appendChild(noiseEl);
  })();

  async function staticBurst(ms = 350) {
    if (isSkipping() || motionReduced()) return;
    audio.play('static');
    noiseEl.classList.add('on');
    await sleep(ms);
    noiseEl.classList.remove('on');
  }

  // Data corruption: random characters all over the screen are destroyed for a moment.
  async function corrupt(rounds = 6) {
    if (isSkipping() || motionReduced()) return;
    audio.play('corrupt');
    const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
    const nodes = [];
    const orig = [];
    while (walker.nextNode()) {
      nodes.push(walker.currentNode);
      orig.push(walker.currentNode.nodeValue);
    }
    for (let r = 0; r < rounds; r++) {
      nodes.forEach((n, i) => {
        n.nodeValue = scrambleText(orig[i], { intensity: 0.18 });
      });
      await wait(70);
    }
    nodes.forEach((n, i) => { n.nodeValue = orig[i]; });
  }

  // The dramatic glitch for "hello, friend.": the text breaks, noise, slice, roll, strobe.
  async function glitchHello(el) {
    if (motionReduced()) return;
    const orig = el.textContent;
    const scr = () => scrambleText(orig, { intensity: 0.42, eligible: (ch) => /[a-z]/i.test(ch) });
    for (let i = 0; i < 4; i++) {
      el.textContent = scr();
      await wait(55);
      el.textContent = orig;
      await wait(55);
    }
    await gfx('rgb');
    await staticBurst(180);
    await gfx('slice');
    el.textContent = orig;
  }


  // Remote wipe: the text turns red, decays into noise and is swallowed line by line.
  async function wipe(els) {
    if (!motionReduced()) setRain(0.7);
    els.forEach((element, index) => {
      element.classList.add('purging');
      element.style.setProperty('--purge-delay', `${Math.min(index, 6) * 20}ms`);
    });
    if (!motionReduced()) {
      await sleep(520);
    }
    els.forEach((element) => element.remove());
    setRain(0.22);
  }


  /** Removes the classes and the noise overlay a run may have left behind when it was cut short. */
  function reset() {
    screen.classList.remove('glitch', 'flash', 'g-rgb', 'g-slice', 'g-roll', 'g-invert', 'g-zoom');
    noiseEl.classList.remove('on');
  }

  return { glitch, blackout, flash, gfx, staticBurst, corrupt, glitchHello, wipe, reset };
}
