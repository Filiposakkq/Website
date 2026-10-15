// The evidence of the case file as data (phase 4). Pure data, no DOM: `tools/validate-story.mjs` imports this file
// in Node and checks it. The behavior is in ../casefile.js (state machine), ../hacking-commands.js (the commands) and
// ../board-ui.js (the dialog). Every number that tunes the game (scan times, decrypt times, the trace thresholds at
// which evidence is lost) is in `CASE` in ./constants.js; the records below only point at it.
//
// A record:
//   id        stable name; other code refers to it (`discover('page-markup')`)
//   code      short name the player can type on a phone: `decrypt e11`, `connect e1 e2` (the id also works)
//   type      INTERCEPT  captured network packets (the `intercept` command)
//             ARTIFACT   files (`cat`, `dump`, `decrypt`)
//             SIGNAL     transmissions from the unknown and watcher channels, and anomalies
//             INTEL      unlocked by connecting two related records (`connect`); has no position of its own
//             COMPROMISED  volatile evidence: it is lost if the trace gets close before the player holds it
//   group     the small heading above the title
//   title, source, summary, detail   the dossier text (source = where the player got it: a command)
//   x, y      position on the map, in percent of the map (INTEL records are placed between the pair that unlocks them)
//   links     ids drawn as a line on the map (the two directions are drawn once)
//   route     'unknown' | 'watcher': only exists on that trust route; the other route sees a sealed stub
//   found     how it enters the board: 'cat' (a command reads it), 'story' (a story node), 'echo' (the easter egg),
//             'scan' (a scan reveals it as locked), 'intercept' (an intercept captures it), 'connect' (INTEL)
//   tier      for 'scan' and 'intercept': which run of the command brings it (1 = first run, 2 = second ...)
//   file      for 'scan' records: the path `dump <file>` reads (a record that is not encrypted is read with `dump`)
//   encrypted, decryptSeconds   an encrypted record stays `locked` until `decrypt` has run for that long
//   requires  ids that must be readable before this record can appear (a scan or intercept does not reveal it earlier)
//   connects  for INTEL: the pairs [idA, idB]; connecting any one of them reveals the record
//   compromiseAtTrace   seconds left on the trace at or below which the record is lost if the player does not hold
//                       it yet (state hidden or locked). A record the player already read is never taken away.
//
// States at run time (casefile.js): hidden -> locked (seen, content sealed) -> unlocked (readable) or decrypted
// (readable, after a decrypt), and compromised (lost: corrupted and unreadable). `locked` + `encrypted: false`
// means "read it with dump"; `locked` + `encrypted: true` means "decrypt it".
//
// Rule: no text here may print the Level 01 key or its layers (checked by validate-story). New records may point
// toward the three page layers, never replace them.

import { CASE } from './constants.js';

export const EVIDENCE_TYPES = ['INTERCEPT', 'ARTIFACT', 'SIGNAL', 'INTEL', 'COMPROMISED'];
export const EVIDENCE_STATES = ['hidden', 'locked', 'unlocked', 'decrypted', 'compromised'];
export const EVIDENCE_FOUND = ['cat', 'story', 'echo', 'scan', 'intercept', 'connect'];

export const ROUTE_LABELS = {
  unknown: 'UNKNOWN // BACKCHANNEL',
  watcher: 'WATCHER // SESSION OPERATOR',
};

export const EVIDENCE = [
  // ---- the original nine (text unchanged since phase 1; migrated to the schema)
  {
    id: 'lock-header',
    code: 'e1',
    type: 'ARTIFACT',
    group: 'TARGET',
    title: 'SDB9 lock header',
    source: 'cat sdb9.lock',
    summary: 'A sealed partition is mounted locally. The lock stores no key, only its shape.',
    detail: 'Three unknown parts are required. The key is not in the guest filesystem, so the investigation must move into the page layers.',
    x: 10,
    y: 30,
    links: ['page-markup', 'page-style'],
    found: 'cat',
  },
  {
    id: 'page-markup',
    code: 'e2',
    type: 'ARTIFACT',
    group: 'PAGE LAYER',
    title: 'Markup fragment',
    source: 'cat page/index.html',
    summary: 'The document skeleton contains the first fragment.',
    detail: 'A comment in the markup holds the first piece. Its location supports the note that the key is distributed across the page.',
    x: 28,
    y: 12,
    links: ['page-style', 'page-script'],
    found: 'cat',
  },
  {
    id: 'page-style',
    code: 'e3',
    type: 'ARTIFACT',
    group: 'PAGE LAYER',
    title: 'Style fragment',
    source: 'cat page/styles.css',
    summary: 'The shell stylesheet contains the second fragment.',
    detail: 'A custom property in the stylesheet holds the second piece. It is separate from the markup clue.',
    x: 28,
    y: 48,
    links: ['page-script', 'lock-header'],
    found: 'cat',
  },
  {
    id: 'page-script',
    code: 'e4',
    type: 'ARTIFACT',
    group: 'PAGE LAYER',
    title: 'Script fragment',
    source: 'cat page/js/source.js or hint',
    summary: 'A source whisper holds the final key fragment.',
    detail: 'The JavaScript source contains the last piece. Read all three fragments in order and join them with dashes.',
    x: 46,
    y: 30,
    links: ['lock-header', 'ghost-script'],
    found: 'cat',
  },
  {
    id: 'route-note',
    code: 'e5',
    type: 'SIGNAL',
    group: 'BACKCHANNEL',
    title: 'Unknown’s relay note',
    source: 'cat inbox/001.msg',
    summary: 'A private note warns that the watcher’s abort instruction targets the guest session.',
    detail: 'The unknown operator claims the trace can be closed with the local containment script. The note is not proof by itself; inspect the script before execution.',
    x: 10,
    y: 72,
    route: 'unknown',
    links: ['ghost-script', 'page-script'],
    found: 'cat',
  },
  {
    id: 'watcher-log',
    code: 'e6',
    type: 'SIGNAL',
    group: 'SESSION LOG',
    title: 'Watcher session record',
    source: 'cat watcher/session.log',
    summary: 'The watcher attached before the guest and issued an abort request against the guest shell.',
    detail: 'This is the watcher branch’s audit trail. It exposes a safer option: isolate pts/1 before cleaning up the trace.',
    x: 28,
    y: 86,
    route: 'watcher',
    links: ['ghost-script', 'lock-header'],
    found: 'cat',
  },
  {
    id: 'ghost-script',
    code: 'e7',
    type: 'ARTIFACT',
    group: 'PAYLOAD',
    title: 'Containment script',
    source: 'cat ghost.sh',
    summary: 'The script closes the trace request, disconnects the watcher, and invalidates the guest token.',
    detail: 'Reading before execution lets you judge the cleanup steps. The unknown branch encourages inspection; the watcher branch can isolate the remote session first.',
    x: 82,
    y: 48,
    links: ['page-script', 'erased-list'],
    found: 'story',
  },
  {
    id: 'erased-list',
    code: 'e8',
    type: 'ARTIFACT',
    group: 'IMPACT',
    title: 'Erased-user index',
    source: 'cat /mnt/sdb9/erased.list',
    summary: 'The partition contains a numbered list of erased identities. Guest 4097 is added as its newest record.',
    detail: 'The session was not an isolated target. The index suggests the same operation has been repeated across many accounts.',
    x: 90,
    y: 84,
    links: ['ghost-script', 'srv-ledger'],
    found: 'story',
  },
  {
    id: 'elliot-echo',
    code: 'e9',
    type: 'SIGNAL',
    group: 'ANOMALY',
    title: 'Unverified visual echo',
    source: 'unlock elliot',
    summary: 'A hooded figure briefly appears behind the terminal.',
    detail: 'The image is an unexplained local signal. It is atmospheric evidence only; it does not verify the identity behind either channel.',
    x: 64,
    y: 12,
    links: ['page-script'],
    found: 'echo',
  },

  // ---- new in phase 4: network evidence found with the hacking commands
  {
    id: 'net-beacon',
    code: 'e10',
    type: 'INTERCEPT',
    group: 'NETWORK',
    title: 'Outbound beacon',
    source: 'intercept',
    summary: 'A keepalive leaves the rogue adapter every 30 seconds.',
    detail: 'Each packet goes to a redacted host on port 4444 and is padded to a fixed size, so its length reveals nothing about its content. The pattern matches the one connection netstat shows.',
    x: 46,
    y: 62,
    links: ['ghost-script', 'net-relay-chain', 'srv-handshake'],
    found: 'intercept',
    tier: 1,
  },
  {
    id: 'net-relay-chain',
    code: 'e11',
    type: 'INTERCEPT',
    group: 'NETWORK',
    title: 'Relay handshake frame',
    source: 'intercept (encrypted frame), then decrypt e11',
    summary: 'The trace request is routed through four relays before it reaches its target.',
    detail: 'The decrypted frame lists the relay chain in order and ends at a host that is redacted. Closing the guest shell does not close the relays: the request keeps moving until it is withdrawn at its source.',
    x: 64,
    y: 76,
    links: ['net-beacon', 'ram-residue'],
    found: 'intercept',
    tier: 2,
    encrypted: true,
    decryptSeconds: CASE.decryptSeconds.relayChain,
    requires: ['net-beacon'],
    compromiseAtTrace: CASE.compromiseAt.relayChain,
  },
  {
    id: 'srv-handshake',
    code: 'e12',
    type: 'ARTIFACT',
    group: 'RELAY',
    title: 'Relay handshake log',
    source: 'scan, then dump relay/handshake.log',
    summary: 'Guest 4097 was registered with the relay at 03:14.',
    detail: 'The log shows the guest login at 03:14 and a registration request sent to the relay one second later. The session was announced before the first command was typed.',
    x: 64,
    y: 44,
    links: ['net-beacon', 'srv-ledger'],
    found: 'scan',
    tier: 1,
    file: 'relay/handshake.log',
  },
  {
    id: 'srv-ledger',
    code: 'e13',
    type: 'ARTIFACT',
    group: 'RELAY',
    title: 'Relay ledger',
    source: 'scan, then decrypt e13',
    summary: 'A ledger of guest sessions in which 4097 is the newest entry.',
    detail: 'Every row is a guest session the relay has registered. Earlier rows are overwritten, not deleted. The ledger ends with the current session.',
    x: 82,
    y: 66,
    links: ['srv-handshake', 'erased-list'],
    found: 'scan',
    tier: 1,
    file: 'relay/ledger.enc',
    encrypted: true,
    decryptSeconds: CASE.decryptSeconds.ledger,
    compromiseAtTrace: CASE.compromiseAt.ledger,
  },
  {
    id: 'ram-residue',
    code: 'e14',
    type: 'COMPROMISED',
    group: 'MEMORY',
    title: 'Trace agent residue',
    source: 'deep scan, then dump mem/trace-agent.bin',
    summary: 'A memory page left by the trace agent. It decays while the trace runs.',
    detail: 'The page holds the agent’s target list. It is volatile: once the trace closes in it is overwritten and cannot be recovered, so it has to be read early.',
    x: 46,
    y: 88,
    links: ['net-relay-chain'],
    found: 'scan',
    tier: 2,
    file: 'mem/trace-agent.bin',
    compromiseAtTrace: CASE.compromiseAt.residue,
  },

  // ---- INTEL: unlocked with `connect <a> <b>` (no position: the board puts it between the pair)
  {
    id: 'intel-layers',
    code: 'e15',
    type: 'INTEL',
    group: 'ANALYSIS',
    title: 'Where the key is',
    source: 'connect e1 e2',
    summary: 'The lock and the page agree: the key lives in the page.',
    detail: 'The lock asks for three parts and stores none of them. The page holds one in each of its layers: markup, styles and script. `source map` in the terminal lists the files to read.',
    links: [],
    found: 'connect',
    connects: [['lock-header', 'page-markup'], ['lock-header', 'page-style'], ['lock-header', 'page-script']],
  },
  {
    id: 'intel-chain',
    code: 'e16',
    type: 'INTEL',
    group: 'ANALYSIS',
    title: 'One exit',
    source: 'connect e10 e11',
    summary: 'The beacon and the relay chain share one exit.',
    detail: 'Both flows leave through the same relay. The trace is a routed request, not a local process: it has to be withdrawn at the relay, not at the shell.',
    links: [],
    found: 'connect',
    connects: [['net-beacon', 'net-relay-chain']],
  },
  {
    id: 'intel-ledger',
    code: 'e17',
    type: 'INTEL',
    group: 'ANALYSIS',
    title: 'The ledger and the list',
    source: 'connect e12 e13',
    summary: 'The relay’s ledger and the partition’s list share one format.',
    detail: 'Both count guest sessions in numbered records. Whatever sdb9 holds, it is kept by the same system that registered this session.',
    links: [],
    found: 'connect',
    connects: [['srv-handshake', 'srv-ledger']],
  },
  {
    id: 'intel-cleanup-unknown',
    code: 'e18',
    type: 'INTEL',
    group: 'ANALYSIS',
    title: 'Note and script agree',
    source: 'connect e5 e7',
    summary: 'The backchannel note and the script describe the same cleanup order.',
    detail: 'Both put the trace request first and the remote peer second. Reading the script before running it is what the note asks for, and it costs nothing.',
    links: [],
    route: 'unknown',
    found: 'connect',
    connects: [['route-note', 'ghost-script']],
  },
  {
    id: 'intel-cleanup-watcher',
    code: 'e19',
    type: 'INTEL',
    group: 'ANALYSIS',
    title: 'Log and script name one peer',
    source: 'connect e6 e7',
    summary: 'The session log and the script point at the same peer.',
    detail: 'The log shows pts/1 attached before the guest, and the script’s cleanup disconnects a peer. Isolating pts/1 first leaves that peer no way back in.',
    links: [],
    route: 'watcher',
    found: 'connect',
    connects: [['watcher-log', 'ghost-script']],
  },
];

/** The ids of the records the first version of the board knew (used by the temporary compatibility view in 4.1). */
export const ORIGINAL_IDS = EVIDENCE.slice(0, 9).map((item) => item.id);
