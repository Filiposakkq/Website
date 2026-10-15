// The words of the hacking commands `scan`, `intercept`, `dump`, `decrypt`, `connect` (phase 4). The behavior is in
// ../hacking-commands.js, the evidence they unlock is in ./evidence.js and the numbers (how long each takes) are
// `CASE` in ./constants.js. Terminal style: lower case, terse, narrow (a phone shows about 34 characters per line).
//
// World facts (keep them consistent with ./system.js and the story bible): the guest machine is 10.0.2.15 with a rogue
// adapter eth0:1 (192.0.2.66); the watcher is attached from 198.51.100.7 as pts/1; the one outbound connection goes to a
// redacted host in 203.0.113.0/24 on port 4444. Only documentation-range addresses (192.0.2.0/24, 198.51.100.0/24,
// 203.0.113.0/24) and 10.0.2.0/24 appear here: no real IP, location or identity. No text here prints the Level 01 key.

/**
 * What `scan` prints, one pass per run (a pass is the table; the records it reveals come from evidence.js). A row may be
 * `{ text, when: '<record id>' }`: it is only printed when this run found that record.
 */
import { DENIED, RESTRICTED } from './system.js';

export const SCAN_PASSES = [
  {
    title: 'scan: 10.0.2.0/24',
    rows: [
      '  10.0.2.15      guest (you)',
      '  192.0.2.66     eth0:1 rogue',
      '  198.51.100.7   pts/1 watcher',
      '  203.0.113.███  :4444 open',
    ],
  },
  {
    title: 'deep scan: relay segment',
    rows: [
      '  198.51.100.12  relay, ssh closed',
      '  203.0.113.7    relay, ssh closed',
      { text: '  mem            trace-agent page', when: 'ram-residue' },
    ],
  },
];

export const SCAN_IDLE = ['scan: nothing new on this segment.'];

/** What `intercept` prints, one capture per run: the live packet rows. `[enc]` marks an encrypted frame. */
export const INTERCEPT_PASSES = [
  {
    title: 'capture: eth0',
    rows: [
      ' 1  10.0.2.15 > 203.0.113.███  96',
      ' 2  203.0.113.███ > 10.0.2.15  96',
      ' 3  10.0.2.15 > 203.0.113.███  96',
    ],
  },
  {
    title: 'capture: eth0, relay side',
    rows: [
      ' 1  10.0.2.15 > 198.51.100.12  64',
      ' 2  198.51.100.12 > 10.0.2.15  512 [enc]',
      ' 3  198.51.100.12 > 203.0.113.7  512 [enc]',
    ],
  },
];

export const INTERCEPT_IDLE = {
  title: 'capture: eth0',
  rows: [
    ' 1  10.0.2.15 > 10.0.2.1  54',
    ' 2  10.0.2.1 > 10.0.2.15  54',
  ],
  nothing: 'capture: nothing of interest.',
};

/** The raw text `dump` prints for a file a scan found (a record of evidence.js whose `file` is the key). */
export const DUMP_FILES = {
  'relay/handshake.log': [
    '03:14:07 login guest pts/0',
    '03:14:08 REGISTER guest=4097',
    '03:14:08 ack #4097 relay=0515',
  ],
  'mem/trace-agent.bin': [
    'trace-agent v0.3',
    'target: guest@fsociety00 (4097)',
    'path:   4 relays + 1',
    'state:  following',
  ],
};

/** The text a successful `decrypt` prints, by record id. */
export const DECRYPTED = {
  'net-relay-chain': [
    'relay 1   198.51.100.12',
    'relay 2   203.0.113.7',
    'relay 3   198.51.100.88',
    'relay 4   203.0.113.███',
    'target    [REDACTED]',
  ],
  'srv-ledger': [
    '4095  guest  overwritten',
    '4096  guest  overwritten',
    '4097  guest@fsociety00  active',
  ],
};

/** Messages. `{0}` and `{1}` are filled with the record codes or names the player typed. */
export const MESSAGES = {
  scanStart: 'scanning ...',
  captureStart: 'capturing ...',
  noFiles: 'dump: no files known yet. try scan.',
  dumpUsage: 'usage: dump <file>',
  dumpUnknown: 'dump: {0}: no such file',
  dumpEncrypted: 'dump: {0}: encrypted. use decrypt {1}',
  dumpLost: 'dump: {0}: data corrupted',
  decryptUsage: 'usage: decrypt <id>',
  decryptNone: 'decrypt: nothing is locked right now.',
  decryptUnknown: 'decrypt: {0}: no such node',
  decryptPlain: 'decrypt: {0} is not encrypted',
  decryptPlainFile: 'decrypt: {0} is not encrypted. use dump {1}',
  decryptDone: 'decrypt: {0} is already decrypted',
  decryptLost: 'decrypt: {0}: data corrupted, cannot recover',
  decryptBusy: 'decrypt: another job is running',
  decryptStop: 'decrypt: interrupted',
  decryptLostWhile: 'decrypt: {0} was overwritten by the trace',
  connectUsage: 'usage: connect <id> <id>',
  connectUnknown: 'connect: {0}: no such node',
  connectSame: 'connect: pick two different nodes',
  connectLocked: 'connect: {0} is not readable yet',
  connectLost: 'connect: {0}: data corrupted',
  connectNone: 'connect: no relation between {0} and {1}',
  connectAlready: 'connect: {0} and {1} are already linked',
  noLink: 'no active link yet.',
  jobBusy: 'another job is running.',
};

/**
 * The board command line (phase 4b.3; board-commands.js). The board answers only evidence commands; every word the
 * shell knows that is not one of them gets `BOARD_USE_SHELL`. The validator checks that this list covers every command
 * the shell registers (level01.js, system-commands.js), so a new shell command cannot slip through as "not found".
 */
/** The prompt of the board's little terminal; a typed line is echoed behind it. */
export const BOARD_PROMPT = 'board> ';
export const BOARD_USE_SHELL = 'use the shell for that';
export const BOARD_SHELL_WORDS = [
  'ls', 'cat', 'unlock', 'hint', 'trace', 'board', 'evidence', 'source', 'view-source', 'verify', 'isolate', 'abort',
  'whoami', 'pwd', 'date', 'ps', 'netstat', 'ifconfig', 'history', 'uname', 'echo', 'clear',
  ...Object.keys(RESTRICTED), ...DENIED,
];
export const BOARD_HELP_HINT = 'type help for the board commands.';

/** Fills `{0}`, `{1}` in a message. */
export const fill = (template, ...values) => template.replace(/\{(\d)\}/g, (_match, index) => values[Number(index)] ?? '');

/**
 * The trace path shown by `trace --status` and the board (topology.js): you, `CASE.hops` relays, then the target.
 * Documentation-range addresses only (the same relays `decrypt` shows for the relay chain); the last relay and the
 * target are redacted. `label` is at most 8 characters, so a line fits a phone terminal.
 */
export const TOPOLOGY_NODES = [
  { label: 'you', address: '10.0.2.15' },
  { label: 'relay 1', address: '198.51.100.12' },
  { label: 'relay 2', address: '203.0.113.7' },
  { label: 'relay 3', address: '198.51.100.88' },
  { label: 'relay 4', address: '203.0.113.███' },
  { label: 'target', address: '[REDACTED]' },
];
