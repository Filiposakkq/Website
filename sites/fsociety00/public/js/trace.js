import { formatClock } from './util.js';

/**
 * The trace HUD countdown.
 *
 * The interval only runs while the trace is live: it stops when the timer expires and when the trace
 * is halted or killed. `set()` re-arms an expired (but not halted) trace by starting a fresh interval.
 * Pass the story `session` so the interval is cleared, and the HUD removed, when the session aborts.
 * `onSecond(secsLeft)` is a second, permanent hook (the sound) that runs on every live tick; `api.onTick` stays
 * free for the level code to replace. It is not called for the final tick at 0.
 *
 * @param {number} [secs]
 * @param {{ session?: ReturnType<typeof import('./session.js').createSession> | null, onSecond?: ((secs: number) => void) | null }} [options]
 */
export function startTrace(secs = 480, { session = null, onSecond = null } = {}) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'center';
  el.innerHTML = '<span class="lbl">TRACE ETA</span><span class="num"></span>';
  document.body.appendChild(el);
  const num = el.querySelector('.num');
  const label = el.querySelector('.lbl');
  let step = 1;
  let ended = false;
  let retired = false; // halted or killed: never restarts
  let timer = 0;
  let lastTick = performance.now();

  const schedule = (fn, ms) => (session ? session.setInterval(fn, ms) : setInterval(fn, ms));
  const unschedule = (id) => (session ? session.clearInterval(id) : clearInterval(id));

  const render = () => {
    num.textContent = formatClock(secs);
    el.classList.toggle('hot', secs < 60);
  };

  function start() {
    if (timer || retired) return;
    lastTick = performance.now();
    timer = schedule(onInterval, 1000);
  }

  function stop() {
    if (!timer) return;
    unschedule(timer);
    timer = 0;
  }

  function onInterval() {
    const now = performance.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;
    secs = Math.max(0, secs - step * elapsed);
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
    if (onSecond) onSecond(secs);
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
      label.textContent = 'TRACE ETA';
      render();
      start(); // restarts the interval if the trace had expired
    },
    left: () => secs,
    isRunning: () => timer !== 0,
    dock: () => { el.classList.remove('center'); el.classList.add('corner'); },
    kill: () => {
      stop();
      retired = true;
      label.textContent = 'TRACE KILLED';
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
  if (session) session.onAbort(() => api.halt(true));
  return api;
}
