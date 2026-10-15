// The hacking commands of the Level 01 shell (phase 4): `scan`, `intercept`, `dump`, `decrypt`, `connect`. They build
// the case file with the terminal while the trace keeps running. Every one of them is optional: the key is still found
// by reading the three page layers, and nothing here prints it.
//
// One implementation, two entry points (phase 4b.3): the Level 01 shell and the board's command line register the same
// five commands. What differs is `io` (where the lines go, whether the shell prompt is hidden, how "the trace ended" is
// known) and the registry (the shell's `game` group, the board's `board` group). The state is the case file's, so a
// `scan` from either place is the same scan; a timed command takes the case file's single job slot (`caseFile.claim`),
// so a shell command and a board command can never overlap. The trace decides the price: the commands need a link
// (a trace that exists, `caseFile.linkState() !== 'none'`) and a wrong `connect` is charged only while it is lethal.
//
// How they run: a command that takes time (`scan`, `intercept`, `decrypt`) **blocks the shell** and shows live
// output; the trace HUD keeps counting. They wait in real time with `session.sleep` (never the reduced-motion `wait`,
// which would make them free), so a reboot or a developer jump cancels them cleanly, and they stop the moment the trace
// ends (`env.play.over`, set by the level shell). The state changes belong to the case file (casefile.js); this file
// only paces and prints. The words are in story-data/hacking.js, the numbers (seconds) are `CASE` in
// story-data/constants.js.

import { CASE } from './story-data/constants.js';
import { EVIDENCE } from './story-data/evidence.js';
import {
  SCAN_PASSES, SCAN_IDLE, INTERCEPT_PASSES, INTERCEPT_IDLE, DUMP_FILES, DECRYPTED, MESSAGES, fill,
} from './story-data/hacking.js';

const msg = (key, ...values) => fill(MESSAGES[key], ...values);

/** The rows of a pass: a string always, an object `{ text, when }` only when the record `when` was found by this run. */
const rowsOf = (rows, found = []) => rows
  .filter((row) => typeof row === 'string' || found.some((item) => item.id === row.when))
  .map((row) => (typeof row === 'string' ? row : row.text));

/**
 * @param {ReturnType<typeof import('./commands.js').createRegistry>} registry
 * @param {{ audio: object, session: object, caseFile: object, motionReduced: () => boolean }} deps
 * @param {{ line: Function, hidePrompt: () => void, over: (env: object) => boolean, group: string }} io
 *   `line(text, cls, options)` prints (and returns an element-like with a settable `textContent`); `hidePrompt()` hides
 *   the shell prompt while a timed command runs (a no-op on the board); `over(env)` is true when the trace has ended;
 *   `group` is the registry group the commands are listed under.
 */
export function registerHackingCommands(registry, deps, io) {
  const {
    audio, session, caseFile, motionReduced,
  } = deps;
  const { line, hidePrompt, group } = io;
  const over = (env) => !!io.over(env);

  /** The commands need a link: with no trace at all the answer is one in-world line (rule a). */
  function linked() {
    if (caseFile.linkState() !== 'none') return true;
    audio.play('cmd-fail');
    line(msg('noLink'), 'warn');
    return false;
  }

  /** Runs a timed command in the case file's one job slot; false (and a line) when another job is running. */
  async function exclusive(task) {
    const release = caseFile.claim();
    if (!release) {
      audio.play('cmd-fail');
      line(msg('jobBusy'), 'warn');
      return;
    }
    try {
      await task();
    } finally {
      release();
    }
  }

  /**
   * One progress line `label [####......] 40%` that fills over `seconds` of real time. Resolves true when it reached
   * 100 %, false when the trace ended (`env.play.over`) or `stop()` says so. The cue ticks with every redraw
   * (the cue limits itself to 12 per second); with reduced motion the line redraws once per second.
   */
  async function progress(label, seconds, env, { stop = () => false, cue = 'decrypt-progress' } = {}) {
    const step = motionReduced() ? 1000 : CASE.progressStepMs;
    const width = 16;
    const total = Math.max(1, seconds * 1000);
    const row = line('', '', { silent: true });
    const started = performance.now();
    for (;;) {
      const elapsed = performance.now() - started;
      const ratio = Math.min(1, elapsed / total);
      const filled = Math.round(ratio * width);
      row.textContent = `${label} [${'#'.repeat(filled)}${'.'.repeat(width - filled)}] ${Math.round(ratio * 100)}%`;
      audio.play(cue);
      if (ratio >= 1) return true;
      if (over(env) || stop()) return false;
      await session.sleep(Math.min(step, total - elapsed));
    }
  }

  /** Prints `rows` one by one, spread over `seconds` (the live packet list). False when the trace ended meanwhile. */
  async function trickle(rows, seconds, env, cue) {
    const gap = (seconds * 1000) / (rows.length + 1);
    for (const row of rows) {
      await session.sleep(gap);
      if (over(env)) return false;
      line(row, 'dim');
      audio.play(cue);
    }
    await session.sleep(gap);
    return !over(env);
  }

  const stateOf = (item) => caseFile.snapshot().evidence[item.id] ?? 'hidden';

  async function runScan(env) {
    const tier = caseFile.snapshot().scans + 1;
    const pass = SCAN_PASSES[tier - 1];
    if (!pass) {
      audio.play('cmd-fail');
      SCAN_IDLE.forEach((text) => line(text, 'dim'));
      return;
    }
    audio.play('cmd-run');
    hidePrompt();
    line(pass.title);
    if (!(await progress('scan', CASE.scanSeconds[tier - 1] ?? 1, env))) return;
    const { found } = caseFile.scan();
    rowsOf(pass.rows, found).forEach((row) => line(row, 'dim'));
    if (!found.length) {
      line('no new nodes.', 'dim');
      return;
    }
    line(`new nodes: ${found.length}`, 'ok');
    found.forEach((item) => line(`  ${item.code}  ${item.file}${item.encrypted ? '  [enc]' : ''}`));
    line('read with: dump <file> or decrypt <id>', 'dim');
  }

  registry.register({
    name: 'scan', group, needs: 'link', usage: 'scan', summary: 'map the network',
    async run(_args, env) {
      if (!linked()) return;
      await exclusive(() => runScan(env));
    },
  });

  async function runIntercept(env) {
    const tier = caseFile.snapshot().intercepts + 1;
    const pass = INTERCEPT_PASSES[tier - 1];
    if (!pass) {
      audio.play('cmd-fail');
      line(INTERCEPT_IDLE.title);
      INTERCEPT_IDLE.rows.forEach((row) => line(row, 'dim'));
      line(INTERCEPT_IDLE.nothing, 'dim');
      return;
    }
    audio.play('cmd-run');
    hidePrompt();
    line(pass.title);
    if (!(await trickle(pass.rows, CASE.interceptSeconds[tier - 1] ?? 1, env, 'packet-intercept'))) return;
    const { found } = caseFile.intercept();
    if (!found.length) {
      line('captured: nothing of interest.', 'dim');
      return;
    }
    found.forEach((item) => line(`captured: ${item.code}  ${item.title}${item.encrypted ? '  [enc]' : ''}`, 'ok'));
    if (found.some((item) => item.encrypted)) line('read with: decrypt <id>', 'dim');
  }

  registry.register({
    name: 'intercept', group, needs: 'link', usage: 'intercept', summary: 'capture packets',
    async run(_args, env) {
      if (!linked()) return;
      await exclusive(() => runIntercept(env));
    },
  });

  registry.register({
    name: 'dump', group, needs: 'link', usage: 'dump <file>', summary: 'read a scanned file',
    run(args) {
      if (!linked()) return;
      audio.play('file-read');
      if (!args[0]) {
        const files = caseFile.knownFiles();
        if (!files.length) {
          line(msg('noFiles'), 'dim');
          return;
        }
        line(msg('dumpUsage'), 'dim');
        files.forEach((entry) => line(`  ${entry.file}  ${entry.code}${entry.encrypted ? ' [enc]' : ''}`, 'dim'));
        return;
      }
      const result = caseFile.dump(args[0]);
      if (result.reason === 'unknown') {
        audio.play('cmd-fail');
        line(msg('dumpUnknown', args[0]), 'warn');
      } else if (result.reason === 'compromised') {
        audio.play('cmd-fail');
        line(msg('dumpLost', args[0]), 'warn');
      } else if (result.reason === 'encrypted') {
        audio.play('cmd-fail');
        line(msg('dumpEncrypted', result.item.file, result.item.code), 'warn');
      } else {
        (DUMP_FILES[result.item.file] ?? []).forEach((row) => line(row));
        if (result.ok) line(`[evidence] ${result.item.code}  ${result.item.title}`, 'ok');
      }
    },
  });

  function refuseDecrypt(result, token) {
    audio.play('cmd-fail');
    const { item } = result;
    if (result.reason === 'unknown') line(msg('decryptUnknown', token), 'warn');
    else if (result.reason === 'compromised') line(msg('decryptLost', item.code), 'warn');
    else if (result.reason === 'done') line(msg('decryptDone', item.code), 'warn');
    else if (result.reason === 'busy') line(msg('decryptBusy'), 'warn');
    else if (stateOf(item) === 'locked' && item.file) line(msg('decryptPlainFile', item.code, item.file), 'warn');
    else line(msg('decryptPlain', item.code), 'warn');
  }

  async function runDecrypt(token, env) {
    const result = caseFile.startDecrypt(token);
    if (!result.ok) {
      refuseDecrypt(result, token);
      return;
    }
    const { item, seconds } = result;
    audio.play('cmd-run');
    hidePrompt();
    line(`decrypting ${item.code}: ${item.title} (${seconds} s)`);
    let finished = false;
    try {
      finished = await progress(`decrypt ${item.code}`, seconds, env, { stop: () => caseFile.jobStatus()?.lost === true });
    } finally {
      // An abort (reboot), the end of the trace or a lost record all leave the job behind: clear it.
      if (!finished) caseFile.cancelDecrypt();
    }
    if (!finished) {
      line(msg(over(env) ? 'decryptStop' : 'decryptLostWhile', item.code), 'warn');
      return;
    }
    const done = caseFile.finishDecrypt();
    if (!done) {
      line(msg('decryptLostWhile', item.code), 'warn');
      return;
    }
    line(`[ok] decrypted: ${item.title}`, 'ok');
    (DECRYPTED[item.id] ?? []).forEach((row) => line(`  ${row}`, 'dim'));
    line(`[evidence] ${item.code}  ${item.title}`, 'ok');
  }

  registry.register({
    name: 'decrypt', group, needs: 'link', usage: 'decrypt <id>', summary: 'open an encrypted node',
    async run(args, env) {
      if (!linked()) return;
      const token = args[0];
      if (!token) {
        audio.play('file-read');
        const locked = EVIDENCE.filter((item) => item.encrypted && stateOf(item) === 'locked');
        if (!locked.length) {
          line(msg('decryptNone'), 'dim');
          return;
        }
        line(msg('decryptUsage'), 'dim');
        locked.forEach((item) => line(`  ${item.code}  ${item.title}  (${item.decryptSeconds} s)`, 'dim'));
        return;
      }
      await exclusive(() => runDecrypt(token, env));
    },
  });

  registry.register({
    name: 'connect', group, needs: 'link', usage: 'connect <a> <b>', summary: 'link two clues',
    run(args) {
      if (!linked()) return;
      if (args.length < 2) {
        audio.play('file-read');
        line(msg('connectUsage'), 'dim');
        const readable = EVIDENCE.filter((item) => item.type !== 'INTEL' && ['unlocked', 'decrypted'].includes(stateOf(item)));
        if (readable.length) line(`readable: ${readable.map((item) => item.code).join(' ')}`, 'dim');
        return;
      }
      const [a, b] = args;
      const result = caseFile.connect(a, b);
      if (result.ok) {
        // The case file plays relay-connect itself (a connect on the board makes the same sound).
        line(`[ok] ${result.a.code} + ${result.b.code}`, 'ok');
        line(`intel: ${result.intel.title}`, 'ok');
        line(`  ${result.intel.summary}`, 'dim');
        line(`  ${result.intel.detail}`, 'dim');
        line(`[evidence] ${result.intel.code}  ${result.intel.title}`, 'ok');
        return;
      }
      audio.play('cmd-fail');
      if (result.reason === 'unknown') line(msg('connectUnknown', caseFile.find(a) ? b : a), 'warn');
      else if (result.reason === 'same') line(msg('connectSame'), 'warn');
      else if (result.reason === 'locked') line(msg('connectLocked', result.item.code), 'warn');
      else if (result.reason === 'compromised') line(msg('connectLost', result.item.code), 'warn');
      else if (result.reason === 'already') line(msg('connectAlready', result.a.code, result.b.code), 'dim');
      else {
        line(msg('connectNone', result.a.code, result.b.code), 'warn');
        // The price of guessing: charged only while the trace is lethal (rule b), and it says so.
        const cost = caseFile.chargeTrace(CASE.connectMissCost);
        if (cost) line(`[trace -${cost}s]`, 'warn');
      }
    },
  });
}
