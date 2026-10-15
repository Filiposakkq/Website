import { sourcePartThree, whisperSourcePart } from './source.js';
import { formatClock } from './util.js';
import { isAbortError } from './session.js';
import { createRegistry } from './commands.js';
import { registerSystemCommands } from './system-commands.js';
import { TRACE } from './story-data/constants.js';
import { SYSTEM_FILES } from './story-data/system.js';
import {
  LEVEL01_HINTS, LEVEL01_FILES, LEVEL01_FILE_ROUTE, LEVEL01_FILE_EVIDENCE, LEVEL01_LS, LEVEL01_SOURCE_FILES,
  LEVEL01_SOURCE_MAP,
} from './story-data/level01.js';

export const level01Hints = LEVEL01_HINTS;

export function getLevel01Key() {
  const markup = document.querySelector('meta[name="sdb9-part-one"]')?.content;
  const style = getComputedStyle(document.documentElement)
    .getPropertyValue('--sdb9-part-two')
    .trim()
    .replace(/^["']|["']$/g, '');

  if (!markup || !style || !sourcePartThree) {
    throw new Error('Level 01 key material is missing from the page sources.');
  }

  return [markup, style, sourcePartThree];
}

export function revealLevel01SourcePart() {
  whisperSourcePart();
}

/**
 * Builds the Level 01 shell. Everything it needs comes from the GameContext. The commands are registered in a
 * registry (commands.js); this function only owns the key, the echo and the read-eval loop.
 *
 * @param {import('./context.js').GameContext} ctx
 */
export function createLevel01(ctx) {
  const {
    line, say, gfx, wait, audio, caseFile, gameOver, takeover, revealSourcePart, session, screen,
  } = ctx;
  const { readCommand, abort: abortCommand, close: closePrompt } = ctx.terminal;

  // The key is read from the live page. If someone removed the meta tag or the CSS variable the game
  // must not crash: fall back to the sealed built-in parts and say so in the terminal when the level starts.
  let key;
  let integrityFailed = false;
  try {
    key = getLevel01Key();
  } catch (error) {
    console.warn(`${error.message} Falling back to the sealed key.`);
    key = ['ghost', 'shell', sourcePartThree];
    integrityFailed = true;
  }
  const sourceFiles = Object.fromEntries(Object.entries(LEVEL01_SOURCE_FILES)
    .map(([name, file]) => [name, { ...file, url: new URL(file.path, import.meta.url) }]));
  let echoElement = null;
  let echoFadeTimer = 0;
  let echoRemoveTimer = 0;

  function removeElliotEcho() {
    session.clearTimeout(echoFadeTimer);
    session.clearTimeout(echoRemoveTimer);
    echoElement?.remove();
    echoElement = null;
    screen.classList.remove('elliot-present');
  }
  // A reboot / developer jump must not leave the echo (or its timers) behind.
  session.onAbort(removeElliotEcho);

  function showElliotEcho() {
    removeElliotEcho();
    audio.play('elliot-echo');
    const echo = document.createElement('div');
    echo.className = 'elliot-echo';
    echo.setAttribute('role', 'img');
    echo.setAttribute('aria-label', 'A shadowed, hooded figure appears in the background.');
    const image = document.createElement('img');
    image.src = new URL('../elliot-echo.svg', import.meta.url);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.addEventListener('error', () => {
      if (echoElement !== echo) return;
      removeElliotEcho();
      line('elliot echo: image could not be loaded.', 'warn');
    }, { once: true });
    echo.appendChild(image);
    echoElement = echo;
    screen.classList.add('elliot-present');
    screen.prepend(echo);
    session.requestAnimationFrame(() => echo.classList.add('visible'));
    echoFadeTimer = session.setTimeout(() => {
      echo.classList.remove('visible');
      echoRemoveTimer = session.setTimeout(removeElliotEcho, 700);
    }, 5200);
  }

  const registry = createRegistry();
  const discovered = (id) => caseFile.snapshot().discoveries.includes(id);

  registry.register({
    name: 'help', usage: 'help', summary: 'this list',
    run(_args, env) {
      audio.play('list-hit');
      registry.helpLines(env).forEach(([text, cls]) => line(text, cls));
    },
  });

  registry.register({
    name: 'ls', usage: 'ls', summary: 'list files',
    run(_args, env) {
      audio.play('list-hit');
      line(LEVEL01_LS[env.trusted]);
    },
  });

  registry.register({
    name: 'cat', usage: 'cat <file>', summary: 'read a file',
    async run(args, env) {
      audio.play('file-read');
      const file = (args[0] || '').replace(/^\.?\/?(~\/)?/, '');
      if (!args[0]) { line('usage: cat <file>', 'dim'); return; }
      const requiredRoute = LEVEL01_FILE_ROUTE[file];
      if (requiredRoute && requiredRoute !== env.trusted) {
        line(`cat: ${args[0]}: No such file or directory`, 'warn');
      } else if (LEVEL01_FILES[file] || SYSTEM_FILES[file]) {
        (LEVEL01_FILES[file] ?? SYSTEM_FILES[file])({ attempts: env.play.attempts }).forEach((entry) => line(entry || ' '));
        if (LEVEL01_FILE_EVIDENCE[file]) caseFile.discover(LEVEL01_FILE_EVIDENCE[file]);
      } else if (sourceFiles[file]) {
        try {
          const response = await fetch(sourceFiles[file].url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const source = await response.text();
          session.throwIfAborted();
          const clues = source.split(/\r?\n/).filter((entry) => sourceFiles[file].clue.test(entry));
          if (clues.length) {
            clues.forEach((entry) => line(entry, 'dim'));
            caseFile.discover(sourceFiles[file].evidence);
          } else line('source clue not found in this file.', 'warn');
        } catch (error) {
          if (isAbortError(error)) throw error;
          line(`source: could not read ${file}: ${error.message}`, 'warn');
        }
      } else line(`cat: ${args[0]}: No such file or directory`, 'warn');
    },
  });

  registry.register({
    name: 'unlock', usage: 'unlock <key>', summary: 'try a key on sdb9',
    async run(args, env) {
      const guess = args.join(' ').toLowerCase().replace(/[\s_]+/g, '-');
      if (!guess) { line('usage: unlock <key>', 'dim'); return; }
      if (guess === 'elliot') {
        audio.play('elliot-echo');
        showElliotEcho();
        caseFile.discover('elliot-echo');
        return;
      }
      if (guess === key.join('-')) {
        audio.play('success');
        env.play.solved = true;
        return;
      }
      env.play.attempts--;
      caseFile.markFailedUnlock();
      audio.play('failure');
      const parts = guess.split('-');
      if (parts.length === key.length) {
        line(`  [${key.map((part, index) => (parts[index] === part ? 'ok' : '--')).join('] [')}]`, 'dim');
      }
      line(`unlock: invalid key. attempts left: ${env.play.attempts}`, 'warn');
      await gfx('rgb');
      if (env.play.attempts <= 0) env.play.over = 'LOCKED OUT';
    },
  });

  registry.register({
    name: 'hint', usage: 'hint', summary: `ask for help (-${TRACE.hintCost}s)`,
    async run(_args, env) {
      audio.play('hint');
      caseFile.markHint();
      if (env.play.hints >= LEVEL01_HINTS.length) { line('no more hints.', 'dim'); return; }
      env.trace.set(Math.max(5, env.trace.left() - TRACE.hintCost));
      line(`[trace -${TRACE.hintCost}s]`, 'warn');
      await say(LEVEL01_HINTS[env.play.hints++], { speed: 35 });
      if (env.play.hints === LEVEL01_HINTS.length) {
        revealSourcePart();
        caseFile.discover('page-script', 'The final fragment was revealed by the hint sequence.');
      }
    },
  });

  registry.register({
    name: 'trace', usage: 'trace', summary: 'show monitoring status',
    run(_args, env) {
      audio.play('trace-status');
      const closing = env.trace.left() < 120;
      line(`trace:  ${closing ? 'CLOSING' : 'ACTIVE'}`, closing ? 'warn' : '');
      line(`eta:    ${formatClock(env.trace.left())}`, 'dim');
      line('relays: 7 / 9', 'dim');
    },
  });

  registry.register({
    name: 'board', aliases: ['evidence'], usage: 'board', summary: 'review the evidence and decision log',
    run() {
      audio.play('file-read');
      caseFile.open();
    },
  });

  registry.register({
    name: 'source', aliases: ['view-source'], usage: 'source map', summary: 'inspect source clues (mobile-friendly)',
    run(args) {
      audio.play('file-read');
      if (args[0] !== 'map') {
        line('browser source view is not available in every mobile browser.', 'dim');
        line('use `source map`, then `cat page/index.html`, `cat page/styles.css`,', 'dim');
        line('and `cat page/js/source.js` to inspect the three page layers.', 'dim');
        return;
      }
      LEVEL01_SOURCE_MAP.forEach((text) => line(text, 'dim'));
      line('read each with: cat page/<file>', 'dim');
    },
  });

  // The two routes each get their own command; the other route sees them as unknown or as a usage line.
  registry.register({
    name: 'verify', usage: 'verify relay', summary: 'validate the backchannel (read its note first)',
    listed: (env) => env.trusted === 'unknown',
    run(args, env) {
      if (args[0]?.toLowerCase() !== 'relay' || env.trusted !== 'unknown') line('usage: verify relay', 'dim');
      else if (!discovered('route-note')) line('relay: read inbox/001.msg before you validate its claim.', 'warn');
      else {
        caseFile.verifyRelay();
        line('[route] abort maps to pts/0; the backchannel recommends inspected cleanup.', 'ok');
        line('[branch] `cat ghost.sh` is still the only way to inspect the payload.', 'dim');
      }
    },
  });

  registry.register({
    name: 'isolate', usage: 'isolate watcher', summary: 'quarantine pts/1 (read its log first)',
    listed: (env) => env.trusted === 'watcher',
    run(args, env) {
      if (args[0]?.toLowerCase() !== 'watcher' || env.trusted !== 'watcher') line('usage: isolate watcher', 'dim');
      else if (!discovered('watcher-log')) line('isolate: inspect watcher/session.log before changing the route.', 'warn');
      else {
        caseFile.isolateWatcher();
        line('[route] pts/1 quarantined. guest shell remains under local control.', 'ok');
        line('[branch] abort would still hand control to the remote operator.', 'dim');
      }
    },
  });

  registry.register({
    name: 'abort', usage: 'abort', summary: 'close the guest session',
    available: (env) => env.trusted === 'watcher',
    async run(_args, env) {
      await takeover(env.trace);
      env.play.over = 'SESSION COMPROMISED';
    },
  });

  registerSystemCommands(registry, { line, audio, out: ctx.out });

  return async function playLevel01(trace, trusted) {
    const play = { over: null, solved: false, attempts: 3, hints: 0 };
    const env = { trusted, trace, play };
    if (integrityFailed) line('sdb9: integrity check failed, using sealed key', 'warn');

    trace.onEnd = () => {
      play.over = 'TRACE COMPLETE';
      abortCommand();
    };
    // The trace sound (tick, warn, critical) is attached where the trace is created (story.js, trace-sound.js).

    while (!play.solved && !play.over) {
      const raw = await readCommand();
      // Check expiry first: trace.onEnd wakes the prompt with null, and that must end in game over.
      if (play.over) break;
      if (raw === null) {
        trace.onEnd = null;
        return false;
      }
      await registry.dispatch(raw, env, line);
    }

    trace.onEnd = null;
    if (play.over) {
      await gameOver(trace, play.over);
      return false;
    }
    closePrompt();
    return true;
  };
}
