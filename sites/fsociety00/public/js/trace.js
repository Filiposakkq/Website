import { formatClock } from './util.js';

/** What the countdown may do right now (the story data sets it per scene, see story-data/constants.js TRACE). */
export const TRACE_MODES = ['running', 'frozen', 'lethal'];
/** A `running` (not yet lethal) trace stops counting here and reads TRACE PENDING: it cannot expire. */
export const PENDING_FLOOR = 10;

/**
 * The trace HUD countdown.
 *
 * Modes (`setMode`):
 * - `running`: counts down, but never below PENDING_FLOOR seconds (the HUD then reads TRACE PENDING); it cannot
 *   expire, so it cannot end the game. This is the mode before the player has chosen who to trust.
 * - `frozen`: the clock holds (HUD shows the time it stopped at) and nothing can expire.
 * - `lethal`: counts down to zero. Reaching it is the only thing that ends the game with TRACE COMPLETE.
 * `close()` ends the trace for good (the ghost script closed the request): the HUD reads TRACE CLOSED.
 *
 * The interval only runs while the trace is live: it stops when the timer expires and when the trace is halted,
 * closed or frozen. `set()` re-arms an expired (but not halted) trace by starting a fresh interval. The story
 * `session` is required: it clears the interval and removes the HUD when the session aborts.
 * `onSecond(secsLeft)` is a second, permanent hook (the sound) that runs on every live tick; `api.onTick` stays
 * free for the level code to replace. It is not called for the final tick at 0.
 *
 * @param {number} [secs]
 * @param {{ session: ReturnType<typeof import('./session.js').createSession>, onSecond?: ((secs: number) => void) | null, mode?: 'running'|'frozen'|'lethal' }} options
 */
export function startTrace(secs = 480, { session, onSecond = null, mode: initialMode = 'running' } = {}) {
  if (!session) throw new TypeError('startTrace needs the story session (its timers must be cleared on abort).');
  if (!TRACE_MODES.includes(initialMode)) throw new TypeError(`Unknown trace mode "${initialMode}".`);
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'center';
  el.innerHTML = '<span class="lbl">TRACE ETA</span><span class="num"></span>';
  document.body.appendChild(el);
  const num = el.querySelector('.num');
  const label = el.querySelector('.lbl');
  let step = 1;
  let ended = false;
  let retired = false; // halted or closed: never restarts
  let mode = initialMode;
  let timer = 0;
  let lastTick = performance.now();

  const pending = () => mode === 'running' && secs <= PENDING_FLOOR;

  const render = () => {
    num.textContent = formatClock(secs);
    el.classList.toggle('hot', secs < 60 && !pending());
    label.textContent = pending() ? 'TRACE PENDING' : mode === 'frozen' ? 'TRACE HELD' : 'TRACE ETA';
  };

  function start() {
    if (timer || retired || mode === 'frozen') return;
    lastTick = performance.now();
    timer = session.setInterval(onInterval, 1000);
  }

  function stop() {
    if (!timer) return;
    session.clearInterval(timer);
    timer = 0;
  }

  function onInterval() {
    const now = performance.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;
    const floor = mode === 'lethal' ? 0 : PENDING_FLOOR;
    // A trace that is already below the floor (set low by the story) holds where it is instead of jumping up.
    secs = Math.max(Math.min(secs, floor), secs - step * elapsed);
    if (secs <= 0) {
      secs = 0;
      num.textContent = '00:00';
      el.classList.add('hot');
      if (!ended) {
        ended = true;
        el.classList.add('expired');
        label.textContent = 'TRACE COMPLETE';
        stop(); // no more ticks after expiry
        if (api.onEnd) api.onEnd();
        if (api.onTick) api.onTick(0); // the one final tick
      }
      return;
    }
    render();
    if (pending()) return; // the clock holds at the floor: no tick sound, no callbacks
    if (onSecond) {
      try { onSecond(secs); } catch (error) { console.error('The trace sound failed.', error); }
    }
    if (api.onTick) api.onTick(secs);
  }

  render();

  const api = {
    onEnd: null,
    onTick: null,
    boost: (n = 2) => { step = n; lastTick = performance.now(); },
    slow: () => { step = 1; lastTick = performance.now(); },
    set: (n) => {
      if (!Number.isFinite(n)) throw new TypeError('Trace time must be a finite number of seconds.');
      secs = Math.max(0, n);
      ended = false;
      lastTick = performance.now();
      el.classList.remove('expired');
      render();
      start(); // restarts the interval if the trace had expired
    },
    left: () => secs,
    mode: () => mode,
    /** 'running' | 'frozen' | 'lethal'. Leaving `frozen` restarts the clock from where it stopped. */
    setMode: (next) => {
      if (!TRACE_MODES.includes(next)) throw new TypeError(`Unknown trace mode "${next}".`);
      if (retired || next === mode) return;
      mode = next;
      lastTick = performance.now();
      if (mode === 'frozen') stop();
      else start();
      render();
    },
    isRunning: () => timer !== 0,
    dock: () => { el.classList.remove('center'); el.classList.add('corner'); },
    /** The trace request was closed (ghost.sh): the clock stops for good and the HUD says so. */
    close: () => {
      stop();
      retired = true;
      mode = 'frozen';
      label.textContent = 'TRACE CLOSED';
      num.textContent = '--:--';
      el.classList.remove('hot');
      el.classList.add('dead');
    },
    halt: (remove = false) => {
      stop();
      retired = true;
      if (remove) { el.remove(); return; }
      if (!el.classList.contains('expired')) num.textContent = '--:--';
      el.classList.remove('hot');
    },
  };

  start();
  session.onAbort(() => api.halt(true));
  return api;
}
