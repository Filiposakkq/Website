// Pace: how fast the story runs right now. One per session.
//
//   - `wait(ms)` is the story's pause. It collapses to a yield when the player is skipping, when motion is
//     reduced (prefers-reduced-motion or body.quiet-motion), or when `ms` is not positive.
//   - `sleep(ms)` is a real pause for effects that already return early when skipping or reduced.
//   - `setFast(true)` starts a skip: pauses that are already running end at once (session.flush()).
//
// Aborting the session still wakes every pause with an AbortError, fast or not.

/**
 * @param {{ session: ReturnType<typeof import('./session.js').createSession>, motionReduced: () => boolean }} options
 */
export function createPace({ session, motionReduced }) {
  let fast = false;
  return {
    isSkipping: () => fast,
    setFast(value) {
      const next = Boolean(value);
      if (next === fast) return;
      fast = next;
      if (fast) session.flush();
    },
    wait: (ms) => (fast || motionReduced() || !(ms > 0) ? session.wait(0) : session.sleep(ms)),
    sleep: (ms) => session.sleep(ms),
  };
}
