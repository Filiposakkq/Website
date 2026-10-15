// The trust choice and the two routes. Who the player trusts decides which extra file, commands and evidence
// exist in Level 01 (see level01.js) and how the ghost sequence ends. The trace turns lethal here: before the
// choice it only runs down to a floor and reads TRACE PENDING, so it can never end the game before the player
// has had a chance to choose.

import { TRACE } from './constants.js';
import { formatClock } from '../util.js';
import {
  line, blank, say, typing, wait, sfx, gfx, burst, trace, caseFile, label, goto, choice, run, parts,
} from './dsl.js';

export const TRUST_OPTIONS = [
  { id: 'unknown', key: '1', label: 'trust <unknown>', match: ['1', 'unknown'] },
  { id: 'watcher', key: '2', label: 'trust <watcher>', match: ['2', 'watcher'] },
];

const afterPick = [
  caseFile('chooseTrust', (state) => state.trusted),
  sfx('trust-choice'),
  blank(),
  wait(700),
];

const unknownRoute = [
  label('route-unknown'),
  ...afterPick,
  say('unknown', 'good.', { speed: 90 }),
  wait(900),
  say('unknown', "i wasn't sure you would.", { speed: 60 }),
  wait(900),
  say('unknown', "i can't tell you my name yet.", { speed: 60 }),
  wait(900),
  say('unknown', 'they listen for it.', { speed: 70 }),
  wait(1000),
  line('[ALERT] watcher: connection hostile', 'warn'),
  gfx('slice'),
  typing(1200, 'watcher'),
  say('watcher', "he cannot say it. he does not trust you.", { speed: 45 }),
  wait(900),
  say('unknown', 'ignore him.', { speed: 55 }),
  goto('trace-reset'),
];

const watcherRoute = [
  label('route-watcher'),
  ...afterPick,
  say('watcher', 'smart.', { speed: 80 }),
  wait(900),
  say('watcher', parts(['<unknown>', 'ok'], ' wants you inside sdb9.'), { speed: 55 }),
  wait(1000),
  say('watcher', 'ask yourself why.', { speed: 70 }),
  wait(1100),
  say('watcher', 'type abort. close the session before it logs you.', { speed: 50 }),
  wait(900),
  gfx('rgb'),
  burst(500),
  line('*** unknown reconnected ***', 'dim'),
  wait(700),
  say('unknown', "don't-", { speed: 120 }),
  gfx('slice'),
  say('unknown', 'he is lying. read the readme.', { speed: 45 }),
  goto('trace-reset'),
];

// Both routes end here: the clock restarts at five minutes (TRACE.afterTrust) and from now on it can end the game.
const traceReset = [
  label('trace-reset'),
  wait(1200),
  blank(),
  line('[ALERT] monitoring interval recalculated', 'warn'),
  wait(600),
  trace('slow'),
  trace('mode', { mode: 'lethal' }),
  trace('set', { secs: TRACE.afterTrust }),
  line(() => `ETA RESET: ${formatClock(TRACE.afterTrust)}`, 'dim'),
  wait(900),
  typing(1500),
  say('unknown', 'five minutes. no extensions.', { cls: 'warn', speed: 70 }),
  wait(900),
  say('unknown', 'type help.', { speed: 90 }),
  wait(600),
  blank(),
  label('level'),
  run(async (host, flow) => { if (!(await host.runLevel(flow.state.trusted))) flow.end(); }, 'the Level 01 shell (commands.js registry); ends the run on game over'),
];

export const routes = [
  choice('trust', TRUST_OPTIONS, { unknown: 'route-unknown', watcher: 'route-watcher' }, 'trusted'),
  ...unknownRoute,
  ...watcherRoute,
  ...traceReset,
];
