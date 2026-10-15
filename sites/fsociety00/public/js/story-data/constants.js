// Named numbers of the story. Tune them here, not in code. Times are seconds unless the name says ms.

/** The trace countdown. */
export const TRACE = {
  start: 480, // when the countdown first appears
  afterTrust: 300, // after the player has chosen who to trust (5 minutes; phase 4b.0b, was 120)
  afterUnlock: 120, // after sdb9 opens, while the player has to run ghost.sh
  takeover: 60, // after the watcher takes over the session (abort), at 8x speed
  takeoverRate: 8,
  hintCost: 30, // what one `hint` costs
};

/**
 * The evidence board and the hacking commands `scan`, `intercept`, `dump`, `decrypt`, `connect` (phase 4). This is the one
 * place to tune them. The window after the trust choice is `TRACE.afterTrust` (5 minutes since phase 4b.0b; `hint` takes
 * 30 s off), and everything here is optional depth, never a requirement: the key is still found by reading the page
 * layers.
 * Playtest numbers are unverified until the owner has played them (see the phase 4 notes).
 */
export const CASE = {
  hops: 4, // relays between the guest and the target on the trace map (topology.js); the target is hop 5
  traceWindow: TRACE.afterTrust, // the trace length that "100 %" on the map means
  scanSeconds: [3, 4], // run time of scan 1 (local network) and scan 2 (deep scan); later scans are instant
  interceptSeconds: [3, 3], // run time of intercept 1 and intercept 2; later captures are instant
  decryptSeconds: { relayChain: 6, ledger: 8 }, // how long `decrypt` runs for each locked record
  // Evidence the player does not hold yet (hidden or locked) is lost when the trace has this many seconds left. The
  // thresholds are a share of the window (`compromiseShare`), so a longer or shorter window keeps the same shape:
  // 3/8, 7/24 and 3/4 of 120 s were 45, 35 and 90 s left (the phase 4 tuning); with 300 s they are 113, 88 and 225 s.
  compromiseShare: { relayChain: 3 / 8, ledger: 7 / 24, residue: 3 / 4 },
  compromiseAt: {
    relayChain: Math.round((3 / 8) * TRACE.afterTrust),
    ledger: Math.round((7 / 24) * TRACE.afterTrust),
    residue: Math.round((3 / 4) * TRACE.afterTrust),
  },
  connectMissCost: 3, // trace seconds a `connect` that finds no relation costs (stops brute forcing)
  progressStepMs: 250, // how often a running job redraws its progress line (once per second with reduced motion)
};

/** How long the skip control has to be held. */
export const SKIP_HOLD_MS = 3000;

/** The shell the player sees. */
export const PROMPT = 'guest@fsociety00:~$ ';
