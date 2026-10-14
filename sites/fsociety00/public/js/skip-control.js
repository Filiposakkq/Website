// The hold-to-skip control (lower right). One per session: its listeners and its hold animation belong to the
// session, so a reboot or developer jump removes them and the next run builds a fresh control (the hold state
// lives in the session, not in module variables).
//
// The control knows nothing about the story. It follows the engine: while the pointer is in a skippable segment
// the control shows `HOLD 3S // SKIP <BOOT|INTRO>`; holding it for the full time calls `engine.skip()`.
// A real press is needed in tests (the hold uses pointer capture): see tools/README.md.

import { SKIP_HOLD_MS } from './story-data/constants.js';

const WORDS = {
  boot: { label: 'BOOT', name: 'boot sequence' },
  intro: { label: 'INTRO', name: 'story intro' },
};

/**
 * @param {object} options
 * @param {HTMLButtonElement} options.element  #skipHint
 * @param {ReturnType<typeof import('./session.js').createSession>} options.session
 * @param {number} [options.holdMs]
 */
export function createSkipControl({ element, session, holdMs = SKIP_HOLD_MS }) {
  const label = element.querySelector('.skip-label');
  let engine = null;
  let startedAt = 0;
  let target = null;
  let frame = 0;

  const seconds = Math.round(holdMs / 1000);

  function show(kind) {
    label.textContent = `HOLD ${seconds}S // SKIP ${WORDS[kind].label}`;
    element.setAttribute('aria-label', `Hold for ${seconds} seconds to skip the ${WORDS[kind].name}`);
    element.hidden = false;
    element.classList.remove('done');
    element.style.setProperty('--hold-progress', '0');
  }

  function cancel() {
    if (frame) session.cancelAnimationFrame(frame);
    frame = 0;
    startedAt = 0;
    target = null;
    element.classList.remove('holding');
    element.style.setProperty('--hold-progress', '0');
  }

  function advance(now) {
    const progress = Math.min((now - startedAt) / holdMs, 1);
    element.style.setProperty('--hold-progress', String(progress));
    if (progress < 1) {
      frame = session.requestAnimationFrame(advance);
      return;
    }
    const held = target;
    cancel();
    // Only skip if the story is still in the segment the hold started in.
    if (engine && held && engine.skipTarget() === held) engine.skip();
  }

  function begin() {
    if (startedAt || element.hidden || element.disabled || !engine) return;
    target = engine.skipTarget();
    if (!target) return;
    startedAt = performance.now();
    element.classList.add('holding');
    frame = session.requestAnimationFrame(advance);
  }

  const options = { signal: session.signal };
  element.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    begin();
  }, options);
  element.addEventListener('pointerup', cancel, options);
  element.addEventListener('pointercancel', cancel, options);
  element.addEventListener('lostpointercapture', cancel, options);
  element.addEventListener('pointermove', (event) => {
    if (!startedAt) return;
    const bounds = element.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right
      || event.clientY < bounds.top || event.clientY > bounds.bottom) cancel();
  }, options);
  element.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      begin();
    } else if (event.key === 'Escape') cancel();
  }, options);
  element.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') cancel();
  }, options);
  element.addEventListener('click', (event) => event.preventDefault(), options);
  addEventListener('blur', cancel, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); }, options);
  session.onAbort(() => {
    cancel();
    element.hidden = true;
  });

  return {
    /** Gives the control the engine it follows. */
    attach(next) { engine = next; },
    /** Engine event: the pointer entered a segment (or the run ended: `segment` is null). */
    onSegment(segment) {
      // An aborted run's engine reports its end a moment later; the element already belongs to the next run.
      if (session.isAborted()) return;
      cancel();
      if (segment?.skippable) show(segment.skippable);
      else element.hidden = true;
    },
    /** Engine event: a skip started. The boot hint stays (marked done) until the intro begins. */
    onSkip(segment) {
      if (session.isAborted()) return;
      if (segment.skippable === 'boot') element.classList.add('done');
      else element.hidden = true;
    },
  };
}
