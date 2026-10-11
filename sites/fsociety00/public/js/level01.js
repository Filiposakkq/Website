import { sourcePartThree, whisperSourcePart } from './source.js';

export const level01Hints = [
  'three parts. inspect the page layers: markup, styles, and script.',
  'on desktop try ctrl+u or dev tools. on mobile use `source map` here, then read each listed file.',
  'the markup comment, a CSS custom property, and the JavaScript console each hold one part.',
];

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

export function createLevel01({
  line,
  readCommand,
  say,
  gfx,
  revealSourcePart,
  wait,
  staticBurst,
  audio,
  gameOver,
  closePrompt,
  abortCommand,
  takeover,
}) {
  const key = getLevel01Key();
  const mmss = (seconds) => {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    return `${String(Math.floor(totalSeconds / 60)).padStart(2, '0')}:${String(totalSeconds % 60).padStart(2, '0')}`;
  };
  const sourceFiles = {
    'page/index.html': {
      url: new URL('../index.html', import.meta.url),
      clue: /sdb9-part-one|sdb9 :: layer 1\/3/,
    },
    'page/styles.css': {
      url: new URL('../styles.css', import.meta.url),
      clue: /--sdb9-part-two/,
    },
    'page/js/source.js': {
      url: new URL('./source.js', import.meta.url),
      clue: /sourcePartThree/,
    },
  };
  let elliotEchoTimer;

  function showElliotEcho() {
    document.querySelector('.elliot-echo')?.remove();
    document.querySelector('.screen')?.classList.remove('elliot-present');
    clearTimeout(elliotEchoTimer);
    audio.play('elliot-echo');
    const echo = document.createElement('div');
    echo.className = 'elliot-echo';
    echo.setAttribute('role', 'img');
    echo.setAttribute('aria-label', 'A shadowed, hooded figure appears in the background.');
    const image = document.createElement('img');
    image.src = new URL('../elliot-echo.svg', import.meta.url);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    const screen = document.querySelector('.screen');
    image.addEventListener('error', () => {
      echo.remove();
      screen?.classList.remove('elliot-present');
      line('elliot echo: image could not be loaded.', 'warn');
    }, { once: true });
    echo.appendChild(image);
    screen?.classList.add('elliot-present');
    (screen || document.body).prepend(echo);
    requestAnimationFrame(() => echo.classList.add('visible'));
    elliotEchoTimer = setTimeout(() => {
      echo.classList.remove('visible');
      setTimeout(() => {
        echo.remove();
        screen?.classList.remove('elliot-present');
      }, 700);
    }, 5200);
  }

  return async function playLevel01(trace, trusted) {
    const state = { over: null };
    let attempts = 3;
    let hints = 0;
    let solved = false;
    const announcedTraceThresholds = new Set();

    trace.onEnd = () => {
      state.over = 'TRACE COMPLETE';
      abortCommand();
    };
    trace.onTick = (seconds) => {
      for (const threshold of [60, 30, 10]) {
        if (seconds > 0 && seconds <= threshold && !announcedTraceThresholds.has(threshold)) {
          announcedTraceThresholds.add(threshold);
          audio.play(threshold === 10 ? 'trace-critical' : 'trace-tick');
        }
      }
    };

    const files = {
      'readme.txt': () => [
        'sdb9 is sealed with a three-part key.',
        'the key is not in this system.',
        'it is in the page that shows you this system.',
        '',
        'part 1 :: the skeleton under the skin.',
        'part 2 :: the skin itself.',
        'part 3 :: what it whispers when no one is looking.',
        '',
        'join the parts with dashes. then unlock.',
      ],
      'notes.txt': () => [
        'they never delete anything.',
        'they overwrite. then they make sure',
        'nobody remembers there was something to overwrite.',
      ],
      'sdb9.lock': () => [
        'target:   /dev/sdb9',
        'status:   LOCKED',
        `attempts: ${attempts}`,
        'key:      #####-#####-####   (3 parts)',
      ],
      'inbox/001.msg': () => [
        'the partition is not empty.',
        'it is locked.',
        'the key is not in this system.',
        'it is hidden in the page itself.',
        'look closer.',
      ],
    };

    while (!solved && !state.over) {
      const raw = await readCommand();
      if (raw === null) {
        trace.onEnd = null;
        return false;
      }
      if (state.over) break;
      const [name, ...args] = raw.trim().split(/\s+/);
      if (!name) continue;

      switch (name.toLowerCase()) {
        case 'help':
          audio.play('list-hit');
          line('commands:', 'dim');
          line('  help           this list');
          line('  ls             list files');
          line('  cat <file>     read a file');
          line('  unlock <key>   try a key on sdb9');
          line('  hint           ask for help (-30s)');
          line('  trace          show monitoring status');
          line('  source map     inspect source clues (mobile-friendly)');
          if (trusted === 'watcher') line('  abort          close the guest session');
          break;

        case 'ls':
          audio.play('list-hit');
          line('inbox/   notes.txt   readme.txt   page/   sdb9.lock');
          break;

        case 'cat': {
          audio.play('file-read');
          const file = (args[0] || '').replace(/^\.?\/?(~\/)?/, '');
          if (!args[0]) line('usage: cat <file>', 'dim');
          else if (files[file]) files[file]().forEach((entry) => line(entry || ' '));
          else if (sourceFiles[file]) {
            try {
              const response = await fetch(sourceFiles[file].url);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const source = await response.text();
              const clues = source.split(/\r?\n/).filter((entry) => sourceFiles[file].clue.test(entry));
              if (clues.length) clues.forEach((entry) => line(entry, 'dim'));
              else line('source clue not found in this file.', 'warn');
            } catch (error) {
              line(`source: could not read ${file}: ${error.message}`, 'warn');
            }
          } else line(`cat: ${args[0]}: No such file or directory`, 'warn');
          break;
        }

        case 'source':
        case 'view-source':
          audio.play('file-read');
          if (args[0] !== 'map') {
            line('browser source view is not available in every mobile browser.', 'dim');
            line('use `source map`, then `cat page/index.html`, `cat page/styles.css`,', 'dim');
            line('and `cat page/js/source.js` to inspect the three page layers.', 'dim');
          } else {
            line('SOURCE MAP :: /page', 'dim');
            line('  index.html       markup comment');
            line('  styles.css       root custom property');
            line('  js/source.js     console whisper');
            line('read each with: cat page/<file>', 'dim');
          }
          break;

        case 'trace':
          audio.play('trace-status');
          line(`trace:  ${trace.left() < 120 ? 'CLOSING' : 'ACTIVE'}`, trace.left() < 120 ? 'warn' : '');
          line(`eta:    ${mmss(trace.left())}`, 'dim');
          line('relays: 7 / 9', 'dim');
          break;

        case 'hint':
          audio.play('hint');
          if (hints >= level01Hints.length) {
            line('no more hints.', 'dim');
            break;
          }
          trace.set(Math.max(5, trace.left() - 30));
          line('[trace -30s]', 'warn');
          await say(level01Hints[hints++], { speed: 35 });
          if (hints === level01Hints.length) revealSourcePart();
          break;

        case 'unlock': {
          const guess = args.join(' ').toLowerCase().replace(/[\s_]+/g, '-');
          if (!guess) { line('usage: unlock <key>', 'dim'); break; }
          if (guess === 'elliot') {
            audio.play('elliot-echo');
            showElliotEcho();
            break;
          }
          if (guess === key.join('-')) {
            audio.play('success');
            solved = true;
            break;
          }
          attempts--;
          audio.play('failure');
          const parts = guess.split('-');
          if (parts.length === key.length) {
            line(`  [${key.map((part, index) => (parts[index] === part ? 'ok' : '--')).join('] [')}]`, 'dim');
          }
          line(`unlock: invalid key. attempts left: ${attempts}`, 'warn');
          await gfx('rgb');
          if (attempts <= 0) state.over = 'LOCKED OUT';
          break;
        }

        case 'abort':
          if (trusted !== 'watcher') { line(`command not found: ${name}`, 'warn'); break; }
          await takeover(trace);
          state.over = 'SESSION COMPROMISED';
          break;

        default:
          line(`command not found: ${name}`, 'warn');
          line('type help', 'dim');
      }
    }

    trace.onEnd = null;
    if (state.over) {
      await gameOver(trace, state.over);
      return false;
    }
    closePrompt();
    return true;
  };
}
