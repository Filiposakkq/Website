// Bespoke beats of the identity reveal that need the DOM: renaming every `unknown` on screen to `Mr. Robot`, flying
// the big "hello, friend." into the chat log, the surge overlay, and the GHOSTED stamp on record 4097. The story
// data (story-data/ending.js) decides when they run; they are `run` nodes there. Created once per page.

import { scrambleText } from './util.js';
import { swallowAbort } from './session.js';

/**
 * @param {object} deps
 * @param {HTMLElement} deps.out
 * @param {HTMLElement} deps.screen
 * @param {{ play: (cue: string) => void }} deps.audio
 * @param {() => ReturnType<typeof import('./session.js').createSession>} deps.getSession
 * @param {(ms: number) => Promise<void>} deps.sleep
 * @param {() => boolean} deps.motionReduced
 * @param {(opacity: number, immediate?: boolean) => void} deps.setRain
 * @param {(name: string) => Promise<void>} deps.gfx
 * @param {(ms?: number) => Promise<void>} deps.staticBurst
 * @param {() => void} deps.scroll
 * @param {WeakMap<Element, Element>} deps.helloSlots   floating element -> its placeholder in the log (output.js)
 */
export function createReveal({ out, screen, audio, getSession, sleep, motionReduced, setRain, gfx, staticBurst, scroll, helloSlots }) {
  // Rewrites every occurrence of a name on the screen: it first decays into noise, then the noise locks letter by
  // letter into the new name.
  async function renameEverywhere(from, to, { restoreRain = 0.22 } = {}) {
    const targets = [];
    const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (n.nodeValue.includes(from)) targets.push({ n, base: n.nodeValue });
    }
    if (motionReduced()) {
      targets.forEach((target) => {
        target.n.nodeValue = target.base.split(from).join(to);
      });
      return;
    }
    const everyChar = () => true;
    const decayFrames = 6;
    const lockFrames = 10;
    setRain(0.8);
    screen.classList.add('g-rgb');
    for (let f = 0; f <= decayFrames + lockFrames; f++) {
      let mid;
      if (f < decayFrames) {
        mid = scrambleText(from, { intensity: (f + 1) / decayFrames, eligible: everyChar });
      } else {
        const locked = Math.floor(((f - decayFrames) / lockFrames) * to.length);
        const chars = [...to];
        mid = chars.slice(0, locked).join('') + scrambleText(chars.slice(locked).join(''), { intensity: 1, eligible: everyChar });
      }
      targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(mid); });
      if (f === 3) staticBurst(500).catch(swallowAbort); // fire-and-forget: an abort is expected here
      await sleep(80);
    }
    screen.classList.remove('g-rgb');
    targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(to); });
    await gfx('slice');
    await gfx('invert');
    setRain(restoreRain);
  }


  async function moveHelloIntoChat(hello) {
    let targetSlot = helloSlots.get(hello);
    let flightLayer = hello.parentElement?.classList.contains('hello-flight-layer') ? hello.parentElement : null;
    if (!targetSlot) {
      targetSlot = document.createElement('span');
      targetSlot.className = 'mr-hello-chat mr-hello-placeholder';
      hello.replaceWith(targetSlot);
    }
    targetSlot.textContent = hello.textContent;
    scroll();
    const target = targetSlot.getBoundingClientRect();

    if (!flightLayer) {
      flightLayer = document.createElement('div');
      flightLayer.className = 'hello-flight-layer';
      flightLayer.setAttribute('aria-hidden', 'true');
      document.body.appendChild(flightLayer);
      flightLayer.appendChild(hello);
    }

    if (!motionReduced()) {
      const start = hello.getBoundingClientRect();
      const dx = target.left + target.width / 2 - (start.left + start.width / 2);
      const dy = target.top + target.height / 2 - (start.top + start.height / 2);
      const scaleX = target.width / Math.max(start.width, 1);
      const scaleY = target.height / Math.max(start.height, 1);
      audio.play('hello-move');
      const flight = hello.animate([
        { transform: 'translate(-50%, -50%) scale(1, 1)' },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${scaleX}, ${scaleY})` },
      ], {
        duration: 1200,
        easing: 'cubic-bezier(.22, .75, .18, 1)',
        transformOrigin: 'top left',
        fill: 'forwards',
      });
      const owner = getSession();
      owner.onAbort(() => flight.cancel()); // cancelling rejects `finished` with an AbortError
      await flight.finished;
      owner.throwIfAborted();
      flight.cancel();
    }
    targetSlot.replaceWith(hello);
    hello.classList.remove('mr-hello-center');
    hello.classList.add('mr-hello-chat');
    flightLayer.remove();
  }


  let surge = null;

  /** The light surge behind "hello, friend." (decorative). */
  function setSurge(on) {
    surge?.remove();
    surge = null;
    if (!on) return;
    surge = document.createElement('div');
    surge.className = 'identity-surge';
    surge.setAttribute('aria-hidden', 'true');
    document.body.appendChild(surge);
  }

  /** Turns the PENDING record row into the stamped GHOSTED record (the same DOM the developer route builds). */
  function stampGhosted(row) {
    row.className = 'ghosted-record';
    const id = document.createElement('span');
    id.className = 'ghosted-id';
    id.textContent = '4097';
    const user = document.createElement('span');
    user.className = 'ghosted-user';
    user.textContent = '████████';
    const word = document.createElement('span');
    word.className = 'ghosted-word';
    word.textContent = 'GHOSTED';
    row.replaceChildren(id, document.createTextNode('  '), user, document.createTextNode('         '), word);
  }

  return { renameEverywhere, moveHelloIntoChat, setSurge, stampGhosted };
}
