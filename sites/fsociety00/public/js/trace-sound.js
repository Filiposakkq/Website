/**
 * What the trace sounds like. One function per trace: call it with the seconds left once per second.
 *
 * - every second: a `trace-tick` ping (pitch, level, grit and rate come from the seconds left, see the cue)
 * - crossing 120 s: `trace-warn` once; crossing 60 s: `trace-critical` once; the last 10 s: `trace-critical` again
 * - if the time jumps back up (the trace is set to a larger value), the thresholds re-arm
 *
 * @param {{ play: (cue: string, params?: object) => void }} audio
 * @returns {(secondsLeft: number) => void}
 */
export function createTraceSound(audio) {
  let level = 0; // 0 above 120 s, 1 at or below 120 s, 2 at or below 60 s
  let finalSounded = false;
  return (secondsLeft) => {
    if (!(secondsLeft > 0)) return; // the expiry sound belongs to the game over
    const now = secondsLeft <= 60 ? 2 : secondsLeft <= 120 ? 1 : 0;
    let alarmed = false; // one alarm per tick: do not stack the crossing sound and the final countdown
    if (now > level) {
      audio.play(now === 2 ? 'trace-critical' : 'trace-warn');
      alarmed = now === 2;
    }
    level = now;
    if (secondsLeft > 10) finalSounded = false;
    else if (!finalSounded) {
      finalSounded = true;
      if (!alarmed) audio.play('trace-critical');
    }
    audio.play('trace-tick', { secondsLeft });
  };
}
