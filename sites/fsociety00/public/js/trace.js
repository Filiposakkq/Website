export function startTrace(secs = 480) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'center';
  el.innerHTML = '<span class="lbl">TRACE ETA</span><span class="num"></span>';
  document.body.appendChild(el);
  const num = el.querySelector('.num');
  let step = 1;
  let ended = false;
  let lastTick = performance.now();
  const fmt = (s) => {
    const totalSeconds = Number.isFinite(s) ? Math.max(0, Math.floor(s)) : 0;
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  };
  const tick = () => {
    num.textContent = fmt(secs);
    el.classList.toggle('hot', secs < 60);
  };
  tick();
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
      el.querySelector('.lbl').textContent = 'TRACE ETA';
      tick();
    },
    left: () => secs,
    dock: () => { el.classList.remove('center'); el.classList.add('corner'); },
    kill: () => {
      clearInterval(id);
      el.querySelector('.lbl').textContent = 'TRACE KILLED';
      num.textContent = '--:--';
      el.classList.remove('hot');
      el.classList.add('dead');
    },
    halt: (remove = false) => {
      clearInterval(id);
      if (remove) { el.remove(); return; }
      if (!el.classList.contains('expired')) num.textContent = '--:--';
      el.classList.remove('hot');
    },
  };
  const id = setInterval(() => {
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
        el.querySelector('.lbl').textContent = 'TRACE COMPLETE';
        if (api.onEnd) api.onEnd();
      }
    } else {
      tick();
    }
    if (api.onTick) api.onTick(secs);
  }, 1000);
  return api;
}
