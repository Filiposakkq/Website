// Named numbers of the story. Tune them here, not in code. Times are seconds unless the name says ms.

/** The trace countdown. */
export const TRACE = {
  start: 480, // when the countdown first appears
  afterTrust: 120, // after the player has chosen who to trust
  afterUnlock: 120, // after sdb9 opens, while the player has to run ghost.sh
  takeover: 60, // after the watcher takes over the session (abort), at 8x speed
  takeoverRate: 8,
  hintCost: 30, // what one `hint` costs
};

/** How long the skip control has to be held. */
export const SKIP_HOLD_MS = 3000;

/** The shell the player sees. */
export const PROMPT = 'guest@fsociety00:~$ ';
