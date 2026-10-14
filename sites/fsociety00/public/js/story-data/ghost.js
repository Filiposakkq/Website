// The ghost route: after sdb9 opens, the watcher is still on the line and the player has to run ghost.sh. The
// script closes the trace request, ends the watcher's session and the guest token, and leaves the player a ghost.
// Cues: ghost-appear, ghost-transition, ghost-step, ghost-scan, ghost-command, signal, intrusion, success.
// The trace turns CLOSED at the script's first real step ("close_trace"): from then on nothing can locate the
// player, so no timer can fire during the rest of the sequence.

import { TRACE } from './constants.js';
import { formatClock, rand } from '../util.js';
import {
  line, blank, say, typing, cmd, bar, svc, wait, sfx, scene, gfx, flash, burst, trace, label, run,
} from './dsl.js';

/** The panel shown while the script runs. */
export const GHOST_PANEL = {
  label: 'FSOCIETY // CONTAINMENT ROUTINE',
  title: 'GHOST',
  subtitle: 'LOCAL SESSION CLEANUP',
  steps: ['CLOSE TRACE REQUEST', 'END REMOTE SESSION', 'REVOKE GUEST TOKEN', 'CLOSE LOCAL SHELL'],
};

/** What the player can type at the `./ghost.sh` prompt. */
export const GHOST_PROMPT = {
  button: './ghost.sh',
  runs: ['1', './ghost.sh', 'ghost.sh', 'sh ghost.sh', 'sh ./ghost.sh', 'bash ghost.sh', 'bash ./ghost.sh', 'run ghost.sh', 'ghost'],
  listing: 'erased.list   ghost.sh',
  catCommands: ['cat ghost.sh', 'cat ./ghost.sh'],
  script: [
    '#!/bin/sh',
    '# ghost :: by the one who cannot say his name',
    'close_trace',
    'disconnect_peer watcher',
    'invalidate_guest_session',
  ],
  inspected: '[inspection] three cleanup actions; no key material requested.',
  hint: 'run ghost.sh',
  decisions: {
    tapped: ['CONTAINMENT SCRIPT EXECUTED', 'The cleanup script was launched from the branch prompt.'],
    typed: ['CONTAINMENT SCRIPT EXECUTED', 'The cleanup script was launched from the terminal.'],
  },
};

const step = (index) => run((host) => host.ghost.panel.setStep(index), `ghost panel step ${index}`);

// sdb9 unlocks. The watcher is still in the session and tries to stop the player; the first voice says run it.
const unlock = [
  label('unlock'),
  bar('unlocking /dev/sdb9', 2200),
  svc('Mounted /dev/sdb9.'),
  flash(),
  burst(400),
  blank(),
  line('/dev/sdb9: 2 files', 'dim'),
  line('owner: unknown', 'dim'),
  wait(1000),
  cmd('ls /mnt/sdb9'),
  line('erased.list   ghost.sh'),
  wait(1200),
  blank(),
  line('*** watcher: session still active ***', 'warn'),
  burst(400),
  typing(1100, 'watcher'),
  say('watcher', 'close it.', { speed: 60 }),
  wait(700),
  say('watcher', 'you do not know what is in there.', { speed: 40 }),
  wait(600),
  line('[ALERT] watcher remote session still active (pts/1)', 'warn'),
  line(() => `[ALERT] trace request ETA ${formatClock(TRACE.afterUnlock)}`, 'warn'),
  trace('slow'),
  trace('set', { secs: TRACE.afterUnlock }),
  gfx('rgb'),
  wait(800),
  say('unknown', 'he is still on the line.', { speed: 45 }),
  wait(700),
  say('unknown', 'he had a session here before you arrived.', { speed: 45 }),
  wait(700),
  say('unknown', 'there is a script on sdb9. ghost.sh.', { speed: 45 }),
  wait(700),
  burst(180),
  say('unknown', 'run it.', { cls: 'urgent-command', speed: 115 }),
  wait(240),
  say('unknown', 'NOW.', { cls: 'urgent-command', speed: 155 }),
  wait(500),
  blank(),
  run(async (host, flow) => { if (!(await host.ghost.prompt())) flow.end(); }, 'wait for ./ghost.sh (game over if the trace runs out)'),
  blank(),
];

const secure = { cls: 'secure-message', speed: 38 };

// The script runs. The watcher opens a private line and is cut off mid-sentence.
const script = [
  scene('ghost'),
  sfx('ghost-transition'),
  sfx('ghost-appear'),
  run((host) => host.ghost.panel.open(), 'open the ghost panel'),
  step(0),
  line('[ghost] script started', 'dim'),
  wait(600),
  line('[ghost] checking active sessions...', 'dim'),
  wait(800),
  line('  SESSION   USER      STATE', 'dim'),
  line('  pts/0     guest     ACTIVE'),
  line('  pts/1     watcher   ACTIVE', 'warn'),
  line('  relay     monitor   TRACING', 'warn'),
  sfx('ghost-scan'),
  wait(1300),
  step(0),
  bar('[ghost] refreshing relay route', 1800),
  wait(500),

  // Close the trace request before ending the remote operator's session.
  step(0),
  line('[ghost] closing trace request', 'dim'),
  wait(400),
  sfx('ghost-command'),
  cmd('close_trace --session relay', { speed: 40, pause: 300 }),
  line('monitor: trace request closed'),
  trace('close'),
  sfx('signal'),
  step(1),
  flash(),
  burst(300),
  line('=== TRACE REQUEST CLOSED ==='),
  wait(1200),

  // The watcher stays connected until his session is explicitly closed.
  blank(),
  line('[ghost] closing remote session: pts/1', 'dim'),
  wait(500),
  typing(900, 'watcher'),
  line('DIRECT CHANNEL // SESSION KEY VERIFIED', 'secure-channel'),
  say('watcher', 'i opened a private line. listen before he cuts it.', secure),
  wait(700),
  say('watcher', 'he is not trying to save you. he needs you to open it.', secure),
  wait(600),
  say('watcher', 'when it opens, the list has your name too.', secure),
  wait(500),
  say('watcher', 'wait. you do not understand what he-', { speed: 35 }),
  step(1),
  sfx('ghost-command'),
  cmd('disconnect_peer watcher', { speed: 40, pause: 300 }),
  sfx('intrusion'),
  line('watcher: remote session closed', 'warn'),
  step(2),
  gfx('slice'),
  burst(500),
  line(() => `[ghost] peer address 203.0.113.${rand(1, 254)} added to the local deny list`, 'dim'),
  wait(300),
  line('[ghost] guest session token invalidated', 'dim'),
  line('*** watcher disconnected ***', 'warn'),
  step(3),
  gfx('roll'),
  wait(900),

  // End the local guest shell after the remote session is closed.
  blank(),
  bar('[ghost] closing guest shell', 1200),
  line('[ghost] done. you are a ghost.'),
  run((host) => host.ghost.panel.finish(), 'complete and remove the ghost panel'),
  scene('puzzle'),
  wait(700),
  blank(),
];

export const ghost = [...unlock, ...script];
