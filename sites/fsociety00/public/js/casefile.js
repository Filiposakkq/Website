import { pad2, scrambleText } from './util.js';
import { EVIDENCE as RECORDS, ORIGINAL_IDS, ROUTE_LABELS } from './story-data/evidence.js';
import { CASE } from './story-data/constants.js';
import { INTERCEPT_PASSES } from './story-data/hacking.js';
import { createBoardUI } from './board-ui.js';

// The case file: the evidence state machine and the board that shows it.
//
// Evidence records are data (story-data/evidence.js). Every tuning number (scan, intercept and decrypt times, the
// trace thresholds at which evidence is lost, the cost of a wrong connect) is `CASE` in story-data/constants.js.
//
// Each record is in one state per run:
//   hidden       not seen yet
//   locked       seen (a scan or an intercept found it) but its content is sealed: read it with `dump`, or, when it
//                is encrypted, with `decrypt` (which takes time while the trace keeps running)
//   unlocked     readable (collected with cat, dump, intercept, a story beat or connect)
//   decrypted    readable, after a decrypt
//   compromised  lost: the trace got close before the player held it (see `compromiseAtTrace`); never comes back
// A record the player already holds is never taken away.
//
// The board (the dialog the player opens with the CASE FILE button or `board`) is board-ui.js. This file gives it
// the data (`getView()`), tells it when something changed (`subscribe`) and takes its actions (`connect`).
const READABLE = ['unlocked', 'decrypted'];

const OUTCOME_LABELS = {
  'verified-handoff': 'VERIFIED HANDOFF',
  'unverified-handoff': 'UNVERIFIED HANDOFF',
  'contained-exit': 'CONTAINED EXIT',
  'open-relay-exit': 'OPEN RELAY EXIT',
  'session-compromised': 'SESSION COMPROMISED',
  'locked-out': 'LOCKED OUT',
  'trace-complete': 'TRACE COMPLETE',
};

export function createCaseFile({ trigger, getTraceLeft = () => null, setTraceLeft = null, audio = null }) {
  const state = {
    startedAt: 0,
    route: '',
    boardUnlocked: false,
    items: new Map(), // record id -> state (anything not in the map is hidden)
    discoveries: new Set(), // the readable ids (derived from `items`; kept for the board and for callers)
    scans: 0,
    intercepts: 0,
    job: null, // the decrypt in progress: { id, seconds, lost }
    connected: new Set(), // 'idA|idB' pairs the player has connected
    scrambled: new Map(), // id -> the corrupted text of a lost record (made once, so it does not flicker)
    decisions: [],
    events: [],
    hintsUsed: 0,
    failedUnlocks: 0,
    outcome: '',
    ghostScriptInspected: false,
    relayVerified: false,
    watcherIsolated: false,
  };

  const elapsed = () => state.startedAt ? Math.floor((performance.now() - state.startedAt) / 1000) : 0;
  const recordOf = (id) => RECORDS.find((item) => item.id === id) ?? null;
  const inRoute = (item) => !item.route || item.route === state.route;
  const stateOf = (id) => state.items.get(id) ?? 'hidden';
  const isReadable = (id) => READABLE.includes(stateOf(id));
  const play = (cue) => audio?.play(cue);

  // The board subscribes while it is open: kind 'data' (something changed) or 'tick' (one trace second passed).
  const listeners = new Set();
  function notify(kind) {
    listeners.forEach((listener) => listener(kind));
  }

  function recordEvent(kind, title, detail = '') {
    state.events.push({ kind, title, detail, at: elapsed() });
    updateTrigger();
    notify('data');
  }

  function updateTrigger() {
    trigger.hidden = !state.boardUnlocked;
    trigger.querySelector('.case-count').textContent = pad2(state.discoveries.size);
    trigger.setAttribute('aria-label', `Open evidence board, ${state.discoveries.size} evidence items`);
  }

  function start(route = 'main') {
    state.startedAt = performance.now();
    state.route = route;
    state.boardUnlocked = false;
    state.items = new Map();
    state.discoveries = new Set();
    state.scans = 0;
    state.intercepts = 0;
    state.job = null;
    state.connected = new Set();
    state.scrambled = new Map();
    state.decisions = [];
    state.events = [];
    state.hintsUsed = 0;
    state.failedUnlocks = 0;
    state.outcome = '';
    trigger.classList.remove('case-trigger--revealed');
    state.ghostScriptInspected = false;
    state.relayVerified = false;
    state.watcherIsolated = false;
    recordEvent('system', 'CASE OPENED', 'Local guest session initialized.');
    updateTrigger();
  }

  // ---- the state machine (see the header for the states) -----------------------------------------------------

  function setState(item, next) {
    if (next === 'hidden') state.items.delete(item.id);
    else state.items.set(item.id, next);
    if (READABLE.includes(next)) state.discoveries.add(item.id);
    else state.discoveries.delete(item.id);
    if (!state.boardUnlocked && next !== 'hidden') {
      state.boardUnlocked = true;
      trigger.classList.remove('case-trigger--revealed');
      void trigger.offsetWidth;
      trigger.classList.add('case-trigger--revealed');
    }
  }

  /** Makes a record readable: `cat`, a story beat or the easter egg. Returns true when it was new. */
  function discover(id, detail = '') {
    const item = recordOf(id);
    if (!item || !inRoute(item) || !['cat', 'story', 'echo'].includes(item.found)) return false;
    if (stateOf(id) !== 'hidden') return false;
    setState(item, 'unlocked');
    play('evidence-unlock');
    recordEvent('evidence', `EVIDENCE ADDED // ${item.title}`, detail || item.source);
    return true;
  }

  /**
   * The result of one finished `scan` (the command paces it): reveals, as `locked`, the scan records of this tier
   * (and the earlier ones that are still hidden). Returns { tier, found: [record] }.
   */
  function scan() {
    compromiseCheck();
    const tier = ++state.scans;
    const found = RECORDS.filter((item) => item.found === 'scan' && item.tier <= tier && inRoute(item)
      && stateOf(item.id) === 'hidden' && (item.requires ?? []).every(isReadable));
    found.forEach((item) => setState(item, 'locked'));
    recordEvent('scan', `SCAN ${tier} COMPLETE`, found.length
      ? `${found.length} new node${found.length === 1 ? '' : 's'}: ${found.map((item) => item.code).join(', ')}`
      : 'No new nodes on this segment.');
    return { tier, found };
  }

  /** The result of one finished `intercept`: captured packets are readable, an encrypted frame is `locked`. */
  function intercept() {
    compromiseCheck();
    const tier = ++state.intercepts;
    const found = RECORDS.filter((item) => item.found === 'intercept' && item.tier <= tier && inRoute(item)
      && stateOf(item.id) === 'hidden' && (item.requires ?? []).every(isReadable));
    found.forEach((item) => setState(item, item.encrypted ? 'locked' : 'unlocked'));
    if (found.some((item) => !item.encrypted)) play('evidence-unlock');
    recordEvent('intercept', `CAPTURE ${tier} COMPLETE`, found.length
      ? `${found.length} item${found.length === 1 ? '' : 's'}: ${found.map((item) => item.code).join(', ')}`
      : 'No packets of interest.');
    return { tier, found };
  }

  /** `dump <file>`: reads a file a scan found. { ok, reason?, item? } with reason unknown | encrypted | already | compromised. */
  function dump(path) {
    compromiseCheck();
    const file = String(path ?? '').trim().replace(/^\.?\/+/, '');
    const item = RECORDS.find((entry) => entry.file === file && inRoute(entry));
    if (!item || stateOf(item.id) === 'hidden') return { ok: false, reason: 'unknown' };
    const current = stateOf(item.id);
    if (current === 'compromised') return { ok: false, reason: 'compromised', item };
    if (READABLE.includes(current)) return { ok: false, reason: 'already', item };
    if (item.encrypted) return { ok: false, reason: 'encrypted', item };
    setState(item, 'unlocked');
    play('evidence-unlock');
    recordEvent('evidence', `EVIDENCE ADDED // ${item.title}`, `dump ${item.file}`);
    return { ok: true, item };
  }

  /** The files a scan has found so far (for `dump` without an argument). */
  const knownFiles = () => RECORDS.filter((item) => item.file && inRoute(item) && stateOf(item.id) !== 'hidden')
    .map((item) => ({ file: item.file, code: item.code, state: stateOf(item.id), encrypted: !!item.encrypted }));

  /**
   * The record a typed word names: its id, its short code (e11) or an unambiguous start of its id. Only records the
   * player has already seen can be named (a hidden record is "no such node").
   */
  function find(token) {
    const word = String(token ?? '').trim().toLowerCase();
    if (!word) return null;
    const seen = RECORDS.filter((item) => inRoute(item) && stateOf(item.id) !== 'hidden');
    const exact = seen.find((item) => item.id === word || item.code === word);
    if (exact) return exact;
    const starts = seen.filter((item) => item.id.startsWith(word));
    return starts.length === 1 ? starts[0] : null;
  }

  /**
   * Begins a decrypt (the command paces it and calls finishDecrypt). One at a time.
   * { ok, item, seconds } or { ok: false, reason: unknown | compromised | done | not-encrypted | busy, item? }.
   */
  function startDecrypt(token) {
    compromiseCheck();
    const item = find(token);
    if (!item) return { ok: false, reason: 'unknown' };
    const current = stateOf(item.id);
    if (current === 'compromised') return { ok: false, reason: 'compromised', item };
    if (current === 'decrypted') return { ok: false, reason: 'done', item };
    if (!item.encrypted || current !== 'locked') return { ok: false, reason: 'not-encrypted', item };
    if (state.job) return { ok: false, reason: 'busy', item: recordOf(state.job.id) };
    state.job = { id: item.id, seconds: item.decryptSeconds, lost: false };
    recordEvent('action', `DECRYPT STARTED // ${item.title}`, `${item.code} // ${item.decryptSeconds} s`);
    return { ok: true, item, seconds: item.decryptSeconds };
  }

  /** The decrypt in progress: { id, lost } (lost: the trace destroyed the record meanwhile), or null. */
  const jobStatus = () => (state.job ? { id: state.job.id, lost: state.job.lost } : null);

  /** The decrypt ran its full time: the record becomes `decrypted`. Returns the record, or null when it was lost. */
  function finishDecrypt() {
    const job = state.job;
    if (!job) return null;
    state.job = null;
    const item = recordOf(job.id);
    if (job.lost || stateOf(job.id) !== 'locked') return null;
    setState(item, 'decrypted');
    play('evidence-decrypt');
    recordEvent('evidence', `EVIDENCE DECRYPTED // ${item.title}`, item.source);
    return item;
  }

  /** The decrypt stopped before its time (the trace ended, or the record was lost). */
  function cancelDecrypt() {
    if (!state.job) return;
    const item = recordOf(state.job.id);
    state.job = null;
    recordEvent('action', `DECRYPT STOPPED // ${item.title}`, 'The job did not finish.');
  }

  /**
   * Connects two readable records. { ok, intel, a, b } reveals an INTEL record; otherwise { ok: false, reason: unknown |
   * same | compromised | locked | none | already }. `none` (no relation) is the one the command charges trace time for.
   */
  function connect(tokenA, tokenB) {
    compromiseCheck();
    const a = find(tokenA);
    const b = find(tokenB);
    if (!a || !b) return { ok: false, reason: 'unknown' };
    if (a.id === b.id) return { ok: false, reason: 'same' };
    for (const item of [a, b]) {
      if (stateOf(item.id) === 'compromised') return { ok: false, reason: 'compromised', item };
      if (!isReadable(item.id)) return { ok: false, reason: 'locked', item };
    }
    const intel = RECORDS.find((item) => item.type === 'INTEL' && inRoute(item)
      && item.connects.some(([x, y]) => (x === a.id && y === b.id) || (x === b.id && y === a.id)));
    if (!intel) return { ok: false, reason: 'none', a, b };
    if (isReadable(intel.id)) return { ok: false, reason: 'already', intel, a, b };
    state.connected.add([a.id, b.id].sort().join('|'));
    setState(intel, 'unlocked');
    play('relay-connect');
    recordEvent('intel', `INTEL // ${intel.title}`, `${a.code} + ${b.code}`);
    return { ok: true, intel, a, b };
  }

  /**
   * Evidence the player does not hold yet (hidden or locked) is lost when the trace has `compromiseAtTrace` seconds
   * left. Lost records become `compromised` for good. Called every trace second and before every evidence command.
   * Returns the records lost now.
   */
  function compromiseCheck(secsLeft = getTraceLeft()) {
    if (!state.startedAt || !Number.isFinite(secsLeft)) return [];
    const lost = RECORDS.filter((item) => item.compromiseAtTrace !== undefined && inRoute(item)
      && secsLeft <= item.compromiseAtTrace && ['hidden', 'locked'].includes(stateOf(item.id)));
    for (const item of lost) {
      setState(item, 'compromised');
      state.scrambled.set(item.id, {
        title: scrambleText(item.title, { intensity: 0.45 }),
        summary: scrambleText(item.summary, { intensity: 0.4 }),
        detail: scrambleText(item.detail, { intensity: 0.4 }),
      });
      if (state.job?.id === item.id) state.job.lost = true;
      recordEvent('alert', `EVIDENCE LOST // ${state.scrambled.get(item.id).title}`, 'The trace overwrote it before it could be read.');
    }
    if (lost.length) play('breach-alert');
    return lost;
  }

  /** Called once per trace second by the level shell (the one timer; the case file never starts its own). */
  function tick(secsLeft) {
    compromiseCheck(secsLeft);
    notify('tick');
  }

  function decide(id, title, detail) {
    const decision = { id, title, detail, at: elapsed() };
    state.decisions.push(decision);
    recordEvent('decision', title, detail);
    return decision;
  }

  function chooseTrust(route) {
    if (!ROUTE_LABELS[route]) return;
    state.route = route;
    decide('trust', `TRUST // ${route.toUpperCase()}`, ROUTE_LABELS[route]);
    recordEvent('route', 'BRANCH ACCESS GRANTED', route === 'unknown'
      ? 'A backchannel note is available under inbox/.'
      : 'The watcher session record is available under watcher/.');
  }

  function markHint() {
    state.hintsUsed++;
    decide('hint', `HINT REQUESTED // ${state.hintsUsed}`, 'A trace penalty was accepted in exchange for guidance.');
  }

  function markFailedUnlock() {
    state.failedUnlocks++;
    recordEvent('action', `KEY REJECTED // ATTEMPT ${state.failedUnlocks}`, 'The partition did not accept this key.');
  }

  function inspectGhostScript() {
    state.ghostScriptInspected = true;
    decide('script-inspected', 'PAYLOAD INSPECTED', 'ghost.sh was read before execution.');
    discover('ghost-script');
  }

  function verifyRelay() {
    state.relayVerified = true;
    decide('relay-verified', 'RELAY VERIFIED', 'The unknown channel’s warning was checked against the guest-session route.');
  }

  function isolateWatcher() {
    state.watcherIsolated = true;
    decide('watcher-isolated', 'PTS/1 ISOLATED', 'The watcher channel was quarantined before cleanup.');
  }

  function setOutcome(outcome) {
    if (!OUTCOME_LABELS[outcome]) return;
    state.outcome = outcome;
    recordEvent('outcome', `CASE CONCLUSION // ${OUTCOME_LABELS[outcome]}`, conclusion().text);
  }

  function setFailureOutcome(reason) {
    const outcome = reason === 'SESSION COMPROMISED' ? 'session-compromised'
      : reason === 'LOCKED OUT' ? 'locked-out'
        : reason === 'TRACE COMPLETE' ? 'trace-complete'
          : '';
    if (!outcome) return;
    state.outcome = outcome;
    recordEvent('outcome', `CASE CONCLUSION // ${OUTCOME_LABELS[outcome]}`, reason);
  }

  function conclusion() {
    if (state.outcome === 'verified-handoff') return {
      title: 'Verified, then executed',
      text: 'You checked the relay and inspected the cleanup script before running it. The session was contained with the strongest available chain of evidence.',
      tone: 'secure',
    };
    if (state.outcome === 'unverified-handoff') return {
      title: 'Signal trusted; payload unverified',
      text: 'You followed the backchannel without first inspecting the script. The immediate trace was closed, but the payload’s provenance remains uncertain.',
      tone: 'caution',
    };
    if (state.outcome === 'contained-exit') return {
      title: 'Operator contained',
      text: 'You read the watcher’s session record and isolated pts/1 before cleanup. The remote channel was denied a clean path back into the guest shell.',
      tone: 'secure',
    };
    if (state.outcome === 'open-relay-exit') return {
      title: 'Trace closed; relay left open',
      text: 'The cleanup removed the active session, but the watcher channel was not isolated first. The trace is quiet, not permanently gone.',
      tone: 'caution',
    };
    if (state.outcome === 'session-compromised') return {
      title: 'Guest session compromised',
      text: 'The abort request transferred session control to the watcher. The decision and route are preserved in this dossier.',
      tone: 'caution',
    };
    if (state.outcome === 'locked-out') return {
      title: 'Partition lockout',
      text: 'Three rejected keys closed access to the partition. The evidence collected before lockout remains in the board.',
      tone: 'caution',
    };
    if (state.outcome === 'trace-complete') return {
      title: 'Trace completed',
      text: 'The monitoring request completed before the investigation could finish.',
      tone: 'caution',
    };
    if (!state.route) return {
      title: 'No route selected',
      text: 'The operators have not been chosen yet. Trust is a recorded decision, not proof of identity.',
      tone: 'neutral',
    };
    if (state.route === 'watcher' && state.watcherIsolated) return {
      title: 'Watcher channel contained',
      text: 'You chose the watcher, then used the session log to isolate his connection. Keep the distinction between a useful lead and a trusted operator.',
      tone: 'secure',
    };
    if (state.route === 'unknown' && state.relayVerified && state.ghostScriptInspected) return {
      title: 'Backchannel corroborated',
      text: 'The relay was checked and the script was inspected. Independent checks support the handoff, although the author is still unknown.',
      tone: 'secure',
    };
    return {
      title: 'Investigation in progress',
      text: 'Collect artifacts and compare their sources. A confident message is not the same thing as corroborated evidence.',
      tone: 'neutral',
    };
  }

  // ---- what the board shows -----------------------------------------------------------------------------------

  /** One record as the board may show it: text only for what the player may read, scrambled text for a lost record. */
  function itemView(item, traceLeft) {
    const current = stateOf(item.id);
    const open = READABLE.includes(current);
    const lost = current === 'compromised' ? state.scrambled.get(item.id) : null;
    return {
      id: item.id,
      code: item.code,
      type: item.type,
      group: item.group,
      state: current,
      encrypted: !!item.encrypted,
      decryptSeconds: item.decryptSeconds ?? 0,
      file: item.file ?? '',
      x: item.x,
      y: item.y,
      links: item.links ?? [],
      title: open || current === 'locked' ? item.title : lost?.title ?? '',
      source: open ? item.source : '',
      summary: open ? item.summary : lost?.summary ?? '',
      detail: open ? item.detail : lost?.detail ?? '',
      decrypting: state.job?.id === item.id,
      // A locked record the trace is about to overwrite (within 20 s of its threshold).
      atRisk: current === 'locked' && item.compromiseAtTrace !== undefined && Number.isFinite(traceLeft)
        && traceLeft <= item.compromiseAtTrace + 20,
    };
  }

  /**
   * Everything the board draws, as plain data: the records the player may see (a record of the story that is not found
   * yet appears as an unobserved node; scan, intercept and connect records appear only once seen), the log of
   * captures, the timeline and the assessment.
   */
  function getView() {
    const traceLeft = getTraceLeft();
    const items = RECORDS.filter((item) => inRoute(item)
      && (stateOf(item.id) !== 'hidden' || ['cat', 'story', 'echo'].includes(item.found)))
      .map((item) => itemView(item, traceLeft));
    // The ghost trail: the signals of the branch the player did not take stay on the board as sealed stubs (no text, no
    // lines of their own), so the map looks incomplete in a way that invites a second run. INTEL has no position: skipped.
    if (ROUTE_LABELS[state.route]) {
      RECORDS.filter((item) => item.route && item.route !== state.route && Number.isFinite(item.x)).forEach((item) => items.push({
        id: item.id, code: '--', type: item.type, group: '', state: 'sealed', encrypted: false, decryptSeconds: 0, file: '',
        x: item.x, y: item.y, links: [], title: '', source: '', summary: '', detail: '', decrypting: false, atRisk: false,
      }));
    }
    return {
      route: state.route,
      routeLabel: ROUTE_LABELS[state.route] ?? '',
      outcome: state.outcome,
      outcomeLabel: OUTCOME_LABELS[state.outcome] ?? '',
      hintsUsed: state.hintsUsed,
      failedUnlocks: state.failedUnlocks,
      elapsed: elapsed(),
      traceLeft,
      readable: items.filter((item) => READABLE.includes(item.state)).length,
      total: items.filter((item) => item.state !== 'sealed').length,
      items,
      connected: [...state.connected].map((pair) => pair.split('|')),
      packets: INTERCEPT_PASSES.slice(0, state.intercepts).map((pass) => ({ title: pass.title, rows: pass.rows })),
      events: state.events.map((entry) => ({ ...entry })),
      conclusion: conclusion(),
      job: state.job ? { id: state.job.id, seconds: state.job.seconds } : null,
    };
  }

  /** The board connects two nodes. Like the `connect` command, a pair with no relation costs trace time. */
  function connectFromBoard(idA, idB) {
    const result = connect(idA, idB);
    if (!result.ok && result.reason === 'none' && CASE.connectMissCost > 0) {
      const left = getTraceLeft();
      if (setTraceLeft && Number.isFinite(left)) {
        setTraceLeft(Math.max(5, left - CASE.connectMissCost));
        result.cost = CASE.connectMissCost;
      }
    }
    return result;
  }

  const ui = createBoardUI({
    trigger,
    audio,
    getView,
    connect: connectFromBoard,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isStarted: () => !!state.startedAt,
  });

  updateTrigger();

  return {
    start,
    discover,
    chooseTrust,
    markHint,
    markFailedUnlock,
    inspectGhostScript,
    verifyRelay,
    isolateWatcher,
    scan,
    intercept,
    dump,
    knownFiles,
    find,
    startDecrypt,
    jobStatus,
    finishDecrypt,
    cancelDecrypt,
    connect,
    compromiseCheck,
    tick,
    decide,
    setOutcome,
    setFailureOutcome,
    open: ui.open,
    close: ui.close,
    getView,
    snapshot: () => ({
      route: state.route,
      discoveries: [...state.discoveries],
      evidence: Object.fromEntries(state.items),
      scans: state.scans,
      intercepts: state.intercepts,
      connected: [...state.connected],
      job: state.job ? { ...state.job } : null,
      decisions: [...state.decisions],
      hintsUsed: state.hintsUsed,
      failedUnlocks: state.failedUnlocks,
      ghostScriptInspected: state.ghostScriptInspected,
      relayVerified: state.relayVerified,
      watcherIsolated: state.watcherIsolated,
      outcome: state.outcome,
    }),
  };
}
