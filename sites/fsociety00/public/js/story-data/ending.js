// The ending of Level 01 after the ghost script: the erased list, the player's record (4097) stamped GHOSTED, the
// first voice's assessment of how the player got here, then the identity reveal ("unknown" becomes "Mr. Robot"),
// "hello, friend." and the closing lines. Cues: ghosted-stamp, identity, identity-hit, hello-friend, hello-move.
//
// The reveal gives a name and no backstory on purpose (docs/story/story-bible.md section 6).

import { rand } from '../util.js';
import {
  line, blank, say, typing, cmd, bar, burst, wait, sfx, scene, gfx, rain, caseFile, screenClass, run, label,
} from './dsl.js';

/**
 * How the player's choices ended: one of verified-handoff, unverified-handoff, contained-exit, open-relay-exit.
 * Pure: the validator and the tests can call it.
 *
 * @param {'unknown'|'watcher'} trusted
 * @param {{ relayVerified: boolean, ghostScriptInspected: boolean, watcherIsolated: boolean }} snapshot
 */
export function outcomeFor(trusted, snapshot) {
  if (trusted === 'unknown') {
    return snapshot.relayVerified && snapshot.ghostScriptInspected ? 'verified-handoff' : 'unverified-handoff';
  }
  return snapshot.watcherIsolated ? 'contained-exit' : 'open-relay-exit';
}

/** What the first voice says about the outcome, and whether it counts as good (green) or bad (red). */
export const ASSESSMENTS = {
  'verified-handoff': ['you checked the relay. you read the script. then you ran it.', 'ok'],
  'unverified-handoff': ['you trusted the relay. the trace is closed, but the script was never verified.', 'warn'],
  'contained-exit': ['you read his session log. pts/1 was isolated before the cleanup.', 'ok'],
  'open-relay-exit': ['the script closed the session. you left the watcher channel open until then.', 'warn'],
};

// `outcome` is set by the run node just before; a dry run (the validator) never executes it.
const assessment = (state) => ASSESSMENTS[state.outcome] ?? ASSESSMENTS['unverified-handoff'];

const REDACTED_ROWS = 9;
const redact = () => '█'.repeat(rand(5, 11));

const erasedList = [
  cmd('cat /mnt/sdb9/erased.list'),
  ...Array.from({ length: REDACTED_ROWS }, (_, index) => [
    line(() => `${String(index + 1).padStart(4, '0')}  ${redact()}  ERASED`, 'dim'),
    wait(110),
  ]).flat(),
  line('  ...', 'dim'),
  wait(500),
  line('4096  ████████  ERASED', 'dim'),
  wait(900),
  line('4097  ████████     PENDING', 'warn pending-record', { ref: 'record' }),
  gfx('invert'),
  wait(1600),
  blank(),
];

const firstVoice = [
  typing(2200),
  say('unknown', 'it worked.', { speed: 80 }),
  wait(1100),
  say('unknown', 'the trace is quiet. the watcher is gone.', { speed: 55 }),
  wait(1300),
  say('unknown', 'but look at the list.', { speed: 70 }),
  caseFile('discover', 'erased-list'),
  wait(1200),
  say('unknown', '4097. that is you.', { cls: 'warn', speed: 80 }),
  wait(1400),
  say('unknown', 'that is how they find people.', { speed: 55 }),
  wait(1500),
  sfx('ghosted-stamp'),
  run((host, flow) => host.reveal.stampGhosted(flow.refs.record), 'stamp record 4097 GHOSTED'),
  screenClass('ghosted-hit'),
  gfx('rgb'),
  wait(700),
  screenClass('ghosted-hit', false),
  wait(900),
  say('unknown', 'ghost.sh took you off it. for now.', { speed: 55 }),
  wait(1500),
  say('unknown', (state, host) => (state.trusted === 'unknown'
    ? 'you chose the voice that warned you about the abort command.'
    : (host.caseFile.snapshot().watcherIsolated
      ? 'you read the log. you cut my connection before the cleanup.'
      : 'you chose the watcher. his channel stayed open until the script closed it.')), { speed: 55 }),
  wait(1500),
  run((host, flow) => {
    const outcome = outcomeFor(flow.state.trusted, host.caseFile.snapshot());
    host.caseFile.setOutcome(outcome);
    flow.set({ outcome });
  }, 'record how the player got here'),
  say('unknown', (state) => assessment(state)[0], { cls: (state) => assessment(state)[1], speed: 52 }),
  wait(1100),
];

// The watcher tries to get back in (phase 4b, owner request 2026-10-15). The third voice answers in blue: a secure line is
// established, the retry is blocked and the watcher is sealed out, the first voice (now Mr. Robot) did not do it, and the
// third voice closes the level. No name and no purpose are given (story bible, section 5). The upload of the case file
// at the start of the story and this block are the two blue "machine" moments of the third voice.
const secureLine = [
  burst(300),
  line('[watcher] reconnect: handshake started', 'warn'),
  wait(700),
  typing(900, 'watcher'),
  say('watcher', 'let me back in. he is not what-', { speed: 40 }),
  wait(500),
  sfx('signal'),
  bar('establishing secure line', 2800, 'voice-blue'),
  wait(300),
  line('secure line established // agency channel', 'voice-blue'),
  wait(500),
  burst(400),
  line('[watcher] reconnect: BLOCKED // peer sealed', 'voice-blue'),
  wait(900),
  say('robot', 'i did not do that.', { speed: 60 }),
  wait(900),
  line('*** new connection: ??? ***', 'dim'),
  wait(700),
  typing(1300, 'mystery'),
  say('mystery', 'that door is closed.', { speed: 65 }),
  wait(1000),
  say('mystery', 'sleep. we will call when it is time.', { speed: 65 }),
  wait(1100),
  line('*** ??? disconnected ***', 'dim'),
  wait(900),
];

// "unknown" is rewritten to "Mr. Robot" everywhere on screen; he speaks in his own voice from here on.
const reveal = [
  label('reveal'),
  scene('reveal'),
  say('unknown', 'you came here looking for a name.', { speed: 55 }),
  wait(700),
  rain(0.26, true),
  say('unknown', 'names are how they keep track of us.', { speed: 52 }),
  wait(850),
  say('unknown', 'but you already know the one they gave me-', { speed: 70 }),
  rain(0, true),
  run((host) => host.reveal.renameEverywhere('unknown', 'Mr. Robot', { restoreRain: 0 }), 'rewrite every <unknown> on screen'),
  wait(1250),
  sfx('identity'),
  run((host) => host.reveal.setSurge(true), 'surge overlay on'),
  screenClass('identity-lock'),
  sfx('identity-hit'),
  sfx('hello-friend'),
  say('robot', 'hello, friend.', { cls: 'big mr-hello mr-hello-center', speed: 112, floating: true, ref: 'hello' }),
  run((host, flow) => host.glitchHello(flow.refs.hello), 'glitch the big greeting'),
  wait(900),
  run((host, flow) => host.reveal.moveHelloIntoChat(flow.refs.hello), 'fly the greeting into the chat log'),
  wait(800),
  run((host) => host.reveal.setSurge(false), 'surge overlay off'),
  screenClass('identity-lock', false),
  rain(0.12),
  scene('story'),
  say('robot', 'bonsoir.', { cls: 'mr-reference', speed: 65 }),
  wait(1300),
  say('robot', 'this time you can see who is talking.', { speed: 60 }),
  wait(1300),
  say('robot', 'i threw the watcher out of the session.', { speed: 55 }),
  wait(1400),
  say('robot', 'he will find a way back. he always does.', { speed: 60 }),
  wait(1300),
  blank(),
  line('=== LEVEL 01 COMPLETE ==='),
  gfx('zoom'),
  line('sdb9: access granted for this session', 'dim'),
  wait(900),
  line('[ALERT] watcher connection: retry attempt detected', 'warn'),
  wait(900),
  ...secureLine,
  line('// you are a ghost. this is where the signal ends.', 'dim'),
];

export const ending = [...erasedList, ...firstVoice, ...reveal];
