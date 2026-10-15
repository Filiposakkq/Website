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

/**
 * The evidence board and the hacking commands `scan`, `intercept`, `dump`, `decrypt`, `connect` (phase 4). This is the one
 * place to tune them. The window is short (`TRACE.afterTrust` after the trust choice, `hint` takes 30 s off), so
 * everything here is optional depth, never a requirement: the key is still found by reading the page layers.
 * Playtest numbers are unverified until the owner has played them (see the phase 4 notes).
 */
export const CASE = {
  hops: 4, // relays between the guest and the target on the trace map (topology.js); the target is hop 5
  traceWindow: TRACE.afterTrust, // the trace length that "100 %" on the map means
  scanSeconds: [3, 4], // run time of scan 1 (local network) and scan 2 (deep scan); later scans are instant
  interceptSeconds: [3, 3], // run time of intercept 1 and intercept 2; later captures are instant
  decryptSeconds: { relayChain: 6, ledger: 8 }, // how long `decrypt` runs for each locked record
  // Evidence the player does not hold yet (hidden or locked) is lost when the trace has this many seconds left.
  compromiseAt: { relayChain: 45, ledger: 35, residue: 90 },
  connectMissCost: 3, // trace seconds a `connect` that finds no relation costs (stops brute forcing)
  progressStepMs: 250, // how often a running job redraws its progress line (once per second with reduced motion)
};

/** How long the skip control has to be held. */
export const SKIP_HOLD_MS = 3000;

/** The shell the player sees. */
export const PROMPT = 'guest@fsociety00:~$ ';
