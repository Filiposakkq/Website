const out = document.getElementById('output');
const screen = document.getElementById('screen');
const promptLine = document.getElementById('promptLine');
const skipHint = document.getElementById('skipHint');

let skip = false;
addEventListener('pointerdown', () => { skip = true; });
addEventListener('keydown', () => { skip = true; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (ms) => (skip ? Promise.resolve() : sleep(ms));

function line(text = '', cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text || '\u00a0';
  out.appendChild(d);
  window.scrollTo(0, document.body.scrollHeight);
  return d;
}

async function type(text, cls = '', speed = 35) {
  const d = line('', cls);
  d.textContent = '';
  for (const ch of text) {
    d.textContent += ch;
    await wait(speed);
  }
  return d;
}

async function bar(label, ms = 1500) {
  const d = line();
  const total = 16;
  for (let i = 0; i <= total; i++) {
    const pct = Math.round((i / total) * 100);
    d.textContent = `${label} [${'#'.repeat(i)}${'.'.repeat(total - i)}] ${pct}%`;
    await wait(ms / total);
  }
}

async function glitch() {
  if (skip) return;
  screen.classList.add('glitch');
  await sleep(500);
  screen.classList.remove('glitch');
}

async function boot() {
  await wait(500);

  // fake BIOS
  const bios = [
    'FSOC-BIOS v0.0.1',
    'cpu ........ OK',
    'memory ..... OK',
    'network .... OK',
  ];
  for (const l of bios) {
    line(l, 'dim');
    await wait(220);
  }
  line();

  await bar('loading kernel');
  await bar('mounting /dev/dat');
  line();

  // něco je špatně
  await wait(400);
  line('WARNING: unauthorized access detected', 'warn');
  await wait(700);
  line('tracing connection...', 'dim');
  await wait(1200);
  line('trace failed.', 'warn');
  await wait(600);
  await glitch();
  line();

  // příběh
  await type('hello, friend.', 'big', 70);
  await wait(900);
  line();
  await type('you were not supposed to find this place.');
  await wait(700);
  await type('someone left something here for you.');
  await wait(700);
  await type('find it.');
  await wait(600);
  line();

  skipHint.hidden = true;
  promptLine.hidden = false;
  window.scrollTo(0, document.body.scrollHeight);
}

boot();
