// The ways a run can end badly: the text and timing of the shutdown sequence (`gameOver`) and of the watcher's
// takeover (`abort` on the watcher route). The DOM work is in ../endings.js. Reasons, as the code passes them:
// 'TRACE COMPLETE' (the clock ran out), 'LOCKED OUT' (three wrong keys), 'SESSION COMPROMISED' (abort),
// 'DEVELOPER SHUTDOWN TEST' (developer panel only). Every reason except the first uses `closed`.
// Cues: trace-expired, shutdown, shutdown-stage, power-cut, intrusion, signal, disconnect.

export const GAME_OVER = {
  traceExpired: {
    reason: 'TRACE COMPLETE',
    cue: 'trace-expired',
    statusLine: 'TRACE WINDOW EXPIRED // 00:00',
    kicker: 'TRACE WINDOW // 00:00',
    title: ['SIGNAL', 'LOCATED'],
    stepMs: 850,
    phases: [
      ['LAST RELAY RESPONDED', 'REMOTE MONITOR ACKNOWLEDGED THE TRACE'],
      ['GUEST ROUTE IDENTIFIED', 'SESSION METADATA ASSOCIATED'],
      ['ACCESS REVOKED', 'REMOTE SHELL CLOSED'],
      ['DISPLAY POWER CUT', 'LOCAL CONSOLE DISCONNECTED'],
    ],
  },
  closed: {
    cue: 'shutdown',
    statusLine: 'REMOTE SESSION CLOSED',
    kicker: 'LOCAL DISPLAY // POWER DOWN',
    title: ['CLOSING', 'SESSION'],
    stepMs: 760,
    phases: [
      ['FLUSHING LOCAL STATE', 'ACTIVE SESSION DETACHED'],
      ['CLOSING REMOTE CHANNEL', 'TRACE HANDLE RELEASED'],
      ['CLEARING DISPLAY BUFFER', 'LOCAL CONSOLE SUSPENDED'],
      ['DISPLAY POWER CUT', 'LOCAL CONSOLE DISCONNECTED'],
    ],
  },
  powerDownLine: 'POWERING DOWN DISPLAY...',
};

export const TAKEOVER = {
  kicker: 'REMOTE OPERATOR // SESSION CONTROL',
  title: ['ACCESS', 'REVOKED'],
  stageMs: 1050,
  stages: [
    'REMOTE CONSOLE // OPERATOR VERIFIED',
    'GUEST SHELL // ACCESS REVOKED',
    'TRACE REQUEST // EVENT LOGGED',
    'SESSION CHANNEL // CLOSED',
  ],
  afterLines: ['[WATCHER] your shell has been closed.', '[WATCHER] you should have stayed out.'],
};
