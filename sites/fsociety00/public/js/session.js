// A session is one run of the story (or one developer route). Everything that sleeps,
// animates or listens on behalf of that run is registered with it, so aborting the session
// (reboot, developer jump) stops all of it at once instead of leaving ghost timers that keep
// writing into the next run.
//
// Usage:
//   const session = createSession();
//   await session.sleep(500);            // rejects with an AbortError the moment the session aborts
//   session.setInterval(fn, 1000);       // cleared automatically on abort
//   session.onAbort(() => overlay.remove());
//   session.abort('reboot');
//
// AbortError must always propagate. Only the outermost wrapper (see `swallowAbort`) may catch it.

/** Thrown into every awaiting chain when its session aborts. */
export class AbortError extends Error {
  constructor(reason = 'session aborted') {
    super(typeof reason === 'string' ? reason : 'session aborted');
    this.name = 'AbortError';
    this.reason = reason;
  }
}

/** True for our AbortError and for platform ones (DOMException "AbortError", e.g. animation.finished). */
export const isAbortError = (error) => error instanceof AbortError || error?.name === 'AbortError';

/** `.catch(swallowAbort)` for outermost / fire-and-forget promises: ignores aborts, rethrows real bugs. */
export function swallowAbort(error) {
  if (!isAbortError(error)) throw error;
}

let current = null;

/** The most recently created session. Exposed for tests and the developer tools (no window global). */
export const currentSession = () => current;

export function createSession() {
  const controller = new AbortController();
  const { signal } = controller;
  const timeouts = new Set();
  const intervals = new Set();
  const frames = new Set();
  const sleepers = new Set(); // { timer, reject }
  const cleanups = new Set();

  const session = {
    signal,

    isAborted: () => signal.aborted,

    /** Throws an AbortError if the session was aborted. Call after any await that is not a session helper. */
    throwIfAborted() {
      if (signal.aborted) throw new AbortError(signal.reason?.message ?? signal.reason);
    },

    /** Resolves after `ms`; rejects immediately (not when the timer would have fired) on abort. */
    sleep(ms) {
      if (signal.aborted) return Promise.reject(new AbortError(signal.reason?.message ?? signal.reason));
      return new Promise((resolve, reject) => {
        const entry = { timer: 0, reject };
        entry.timer = setTimeout(() => {
          sleepers.delete(entry);
          resolve();
        }, ms);
        sleepers.add(entry);
      });
    },

    /** Like sleep(), but a non-positive duration only yields (still honours an earlier abort). */
    wait(ms) {
      if (signal.aborted) return Promise.reject(new AbortError(signal.reason?.message ?? signal.reason));
      return ms > 0 ? session.sleep(ms) : Promise.resolve();
    },

    setTimeout(fn, ms, ...rest) {
      if (signal.aborted) return 0;
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn(...rest);
      }, ms);
      timeouts.add(id);
      return id;
    },
    clearTimeout(id) {
      clearTimeout(id);
      timeouts.delete(id);
    },

    setInterval(fn, ms, ...rest) {
      if (signal.aborted) return 0;
      const id = setInterval(fn, ms, ...rest);
      intervals.add(id);
      return id;
    },
    clearInterval(id) {
      clearInterval(id);
      intervals.delete(id);
    },

    requestAnimationFrame(fn) {
      if (signal.aborted) return 0;
      const id = requestAnimationFrame((time) => {
        frames.delete(id);
        fn(time);
      });
      frames.add(id);
      return id;
    },
    cancelAnimationFrame(id) {
      cancelAnimationFrame(id);
      frames.delete(id);
    },

    /**
     * Registers a cleanup that runs when the session aborts (stop audio, remove overlays ...).
     * If the session is already aborted it runs immediately. Returns a function that unregisters it.
     */
    onAbort(fn) {
      if (signal.aborted) {
        runCleanup(fn);
        return () => {};
      }
      cleanups.add(fn);
      return () => cleanups.delete(fn);
    },

    /** Stops everything this session started. Idempotent. */
    abort(reason = 'session aborted') {
      if (signal.aborted) return;
      controller.abort(new AbortError(reason));
      timeouts.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      frames.forEach(cancelAnimationFrame);
      timeouts.clear();
      intervals.clear();
      frames.clear();
      const waking = [...sleepers];
      sleepers.clear();
      waking.forEach((entry) => {
        clearTimeout(entry.timer);
        entry.reject(new AbortError(reason));
      });
      // Newest first, like unwinding a stack.
      [...cleanups].reverse().forEach(runCleanup);
      cleanups.clear();
    },

    /** Live handles (timers, intervals, frames, sleeping awaiters). Zero once the session has aborted. */
    pending: () => timeouts.size + intervals.size + frames.size + sleepers.size,
  };

  function runCleanup(fn) {
    try {
      fn();
    } catch (error) {
      console.error('Session cleanup failed.', error);
    }
  }

  current = session;
  return session;
}
