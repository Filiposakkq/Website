// Digital rain behind the terminal text. Replaces the old fx.js classic script:
// no window globals, requestAnimationFrame instead of setInterval, and it reacts to live
// changes of prefers-reduced-motion / body.quiet-motion (the old version only decided once, at load).

const CHARS = '01234567890abcdef<>/\\{}$#%&';
const CELL = 16;
const STEP_MS = 55; // one animation step, same cadence as the old setInterval(frame, 55)
const MAX_CATCH_UP_MS = STEP_MS * 4; // after a stall, do not replay the missed time

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {{
 *   setOpacity: (value: number, immediate?: boolean) => void,
 *   setIntensity: (multiplier: number) => void,
 *   pause: () => void,
 *   resume: () => void,
 *   destroy: () => void,
 * }}
 */
export function createRain(canvas) {
  const context = canvas.getContext('2d');
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let drops = [];
  let requestedOpacity = 0;
  let intensity = 1;
  let userPaused = false;
  let destroyed = false;
  let frameId = 0;
  let lastTime = 0;
  let carry = 0;
  let clearTransitionFrame = 0;

  const motionBlocked = () => motionPreference.matches || document.body.classList.contains('quiet-motion');

  function resize() {
    canvas.width = canvas.clientWidth || innerWidth;
    canvas.height = canvas.clientHeight || innerHeight;
    drops = Array.from({ length: Math.floor(canvas.width / CELL) }, () => Math.random() * -50);
  }

  function step() {
    context.fillStyle = 'rgba(0, 0, 0, 0.08)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#33ff66';
    context.font = `${CELL}px VT323, monospace`;
    for (let i = 0; i < drops.length; i++) {
      const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
      context.fillText(ch, i * CELL, drops[i] * CELL);
      if (drops[i] * CELL > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }

  function frame(time) {
    frameId = 0;
    if (!shouldRun()) return;
    carry = Math.min(carry + (time - lastTime), MAX_CATCH_UP_MS);
    lastTime = time;
    const stepMs = STEP_MS / intensity;
    if (carry >= stepMs) {
      step();
      carry %= stepMs;
    }
    frameId = requestAnimationFrame(frame);
  }

  const shouldRun = () => !destroyed && !userPaused && !document.hidden && !motionBlocked();

  /** Starts or stops the loop (and re-applies the opacity) to match the current conditions. */
  function sync() {
    canvas.style.opacity = motionBlocked() ? '0' : String(requestedOpacity);
    if (shouldRun()) {
      if (!frameId) {
        lastTime = performance.now();
        carry = 0;
        frameId = requestAnimationFrame(frame);
      }
    } else if (frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function setOpacity(value, immediate = false) {
    requestedOpacity = value;
    if (immediate) {
      canvas.style.transition = 'none';
      cancelAnimationFrame(clearTransitionFrame);
      clearTransitionFrame = requestAnimationFrame(() => canvas.style.removeProperty('transition'));
    }
    sync();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const classObserver = new MutationObserver(sync);
  classObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  motionPreference.addEventListener('change', sync);
  document.addEventListener('visibilitychange', sync);

  resize();
  sync();

  return {
    setOpacity,
    setIntensity(multiplier) {
      intensity = Math.min(4, Math.max(0.25, Number.isFinite(multiplier) ? multiplier : 1));
    },
    pause() {
      userPaused = true;
      sync();
    },
    resume() {
      userPaused = false;
      sync();
    },
    destroy() {
      destroyed = true;
      sync();
      cancelAnimationFrame(clearTransitionFrame);
      resizeObserver.disconnect();
      classObserver.disconnect();
      motionPreference.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    },
  };
}
