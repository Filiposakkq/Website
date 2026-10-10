const out = document.getElementById('output');
const screen = document.getElementById('screen');
const promptLine = document.getElementById('promptLine');
const skipHint = document.getElementById('skipHint');

// koho hráč nakonec zvolil: 'unknown' | 'watcher' | null
let trusted = null;

// =====================================================================
// SKIP
//  1) boot sekvence (BIOS, kernel log...): jedno klepnutí / klávesa -> `skip`
//  2) celý úvod až k volbě "komu věřit": TŘI RYCHLÁ klepnutí / kliknutí
//     za sebou -> `skipToChoice`. Vypne se těsně před volbou, takže volba
//     a všechno po ní se vždy přehraje normálně.
// Všechny animace se ptají přes isSkipping(), skip se řeší jen tady.
// =====================================================================
let skip = false;               // skip 1: jen boot sekvence
let skippable = true;
let skipToChoice = false;       // skip 2: všechno až k volbě
let skipToChoiceArmed = true;   // po volbě už trojklik nic nedělá
const TRIPLE_CLICK_MS = 700;    // tři klepnutí do tohoto času = skip
let clickTimes = [];

addEventListener('pointerdown', () => {
  if (skippable) skip = true;
  if (!skipToChoiceArmed) return;
  const now = performance.now();
  clickTimes = clickTimes.filter((t) => now - t < TRIPLE_CLICK_MS);
  clickTimes.push(now);
  if (clickTimes.length >= 3) {
    clickTimes = [];
    skipToChoice = true;
    skipHint.hidden = true;
  }
});
addEventListener('keydown', () => { if (skippable) skip = true; });

const isSkipping = () => skip || skipToChoice;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wait = (ms) => (isSkipping() ? Promise.resolve() : sleep(ms));
const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const ip = () => `${rand(11, 223)}.${rand(0, 255)}.${rand(0, 255)}.${rand(1, 254)}`;
const scroll = () => window.scrollTo(0, document.body.scrollHeight);

function line(text = '', cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.textContent = text || '\u00a0';
  out.appendChild(d);
  scroll();
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

// kernel log s časovým razítkem
let kt = 0;
async function klog(text, cls = 'dim') {
  kt += Math.random() * 0.35;
  line(`[${kt.toFixed(3).padStart(7)}] ${text}`, cls);
  await wait(rand(30, 110));
}

// systemd styl: [ OK ] služba
async function svc(text, state = 'OK', ms) {
  const d = document.createElement('div');
  const tag = document.createElement('span');
  tag.className = 'dim';
  tag.textContent = '[ .... ] ';
  d.append(tag, text);
  out.appendChild(d);
  scroll();
  await wait(ms ?? rand(150, 550));
  tag.textContent = state === 'OK' ? '[  OK  ] ' : '[FAILED] ';
  tag.className = state === 'OK' ? '' : 'warn';
  await wait(40);
}

async function memtest() {
  const d = line();
  const total = 16384;
  for (let mb = 0; mb <= total; mb += 512) {
    d.textContent = `Memory test: ${mb} MB`;
    await wait(22);
  }
  d.textContent = `Memory test: ${total} MB OK`;
}

async function glitch() {
  if (isSkipping()) return;
  screen.classList.add('glitch');
  await sleep(500);
  screen.classList.remove('glitch');
}

async function blackout(ms = 1400) {
  screen.style.opacity = '0';
  await wait(ms);
  out.innerHTML = '';
  window.scrollTo(0, 0);
  screen.style.opacity = '1';
}

async function flash() {
  if (isSkipping()) return;
  screen.classList.add('flash');
  await sleep(180);
  screen.classList.remove('flash');
}

// ---------- glitch efekty: každý je jiný ----------
const FX_MS = { rgb: 600, slice: 500, roll: 700, invert: 450, zoom: 500 };

async function gfx(name) {
  if (isSkipping()) return;
  const cls = 'g-' + name;
  screen.classList.add(cls);
  await sleep(FX_MS[name]);
  screen.classList.remove(cls);
}

// šum jako ztracený signál
const noiseEl = document.createElement('div');
noiseEl.id = 'noise';
(function makeNoise() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d');
  const img = x.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rand(0, 255);
    img.data[i] = 0;
    img.data[i + 1] = v;
    img.data[i + 2] = Math.floor(v * 0.4);
    img.data[i + 3] = rand(60, 255);
  }
  x.putImageData(img, 0, 0);
  noiseEl.style.backgroundImage = `url(${c.toDataURL()})`;
  document.body.appendChild(noiseEl);
})();

async function staticBurst(ms = 350) {
  if (isSkipping()) return;
  noiseEl.classList.add('on');
  await sleep(ms);
  noiseEl.classList.remove('on');
}

// poškození dat: na chvíli se zničí náhodné znaky po celé obrazovce
async function corrupt(rounds = 6) {
  if (isSkipping()) return;
  const junk = '#%&@$*+=?01<>/\\|';
  const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const orig = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
    orig.push(walker.currentNode.nodeValue);
  }
  for (let r = 0; r < rounds; r++) {
    nodes.forEach((n, i) => {
      n.nodeValue = [...orig[i]]
        .map((ch) => (!/\s/.test(ch) && Math.random() < 0.18 ? junk[rand(0, junk.length - 1)] : ch))
        .join('');
    });
    await wait(70);
  }
  nodes.forEach((n, i) => { n.nodeValue = orig[i]; });
}

// dramatický glitch pro "hello, friend.": text se láme, šum, řez, roll, strobe
async function glitchHello(el) {
  const orig = el.textContent;
  const junk = '#%&@$*+=?01<>/\\|';
  const scr = () => [...orig]
    .map((ch) => (/[a-z]/i.test(ch) && Math.random() < 0.6 ? junk[rand(0, junk.length - 1)] : ch))
    .join('');
  screen.classList.add('g-rgb');
  for (let i = 0; i < 6; i++) {
    el.textContent = scr();
    await wait(80);
    el.textContent = orig;
    await wait(60);
  }
  screen.classList.remove('g-rgb');
  staticBurst(450);
  await gfx('slice');
  await gfx('roll');
  await gfx('invert');
  el.textContent = orig;
}

// napsání příkazu za prompt, jako v opravdovém terminálu
async function cmd(text, speed = 55, pause = 450) {
  const d = document.createElement('div');
  const p = document.createElement('span');
  p.className = 'dim';
  p.textContent = 'root@fsociety00:~$ ';
  const t = document.createElement('span');
  d.append(p, t);
  out.appendChild(d);
  for (const ch of text) {
    t.textContent += ch;
    scroll();
    await wait(speed);
  }
  await wait(pause);
}

const GLYPHS = {
  F: ['#####', '#....', '####.', '#....', '#....'],
  S: ['.####', '#....', '.###.', '....#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  C: ['.####', '#....', '#....', '#....', '.####'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
};

async function logo(words) {
  const box = document.createElement('div');
  box.className = 'logo';
  out.appendChild(box);
  const glyphs = [];
  for (const word of words) {
    const row = document.createElement('div');
    row.className = 'logo-row';
    box.appendChild(row);
    for (const ch of word) {
      const g = document.createElement('div');
      g.className = 'glyph';
      const cells = [];
      const pattern = [];
      GLYPHS[ch].forEach((r) => {
        for (const px of r) {
          const c = document.createElement('i');
          g.appendChild(c);
          cells.push(c);
          pattern.push(px === '#');
        }
      });
      row.appendChild(g);
      glyphs.push({ g, cells, pattern, locked: false });
    }
  }
  scroll();

  // 1) šum: všechny buňky náhodně blikají, jako když se signál dešifruje
  const noise = setInterval(() => {
    glyphs.forEach((o) => {
      if (!o.locked) o.cells.forEach((c) => c.classList.toggle('on', Math.random() < 0.45));
    });
  }, 60);
  await wait(1100);

  // 2) písmena se postupně zamknou do správného tvaru
  for (const o of glyphs) {
    o.locked = true;
    o.cells.forEach((c, i) => c.classList.toggle('on', o.pattern[i]));
    o.g.classList.add('lock');
    await wait(190);
  }
  clearInterval(noise);

  // 3) sken přejede přes hotové logo
  box.classList.add('done');
  await wait(900);

  // 4) logo zůstane "živé": občas se jedno písmeno na chvíli zkroutí
  setInterval(() => {
    const o = glyphs[rand(0, glyphs.length - 1)];
    o.g.style.setProperty('--j', `${rand(-8, 8)}px`);
    o.g.classList.add('jit');
    setTimeout(() => o.g.classList.remove('jit'), 140);
  }, 2600);
}

// text se postupně rozpadne na náhodné znaky
async function decay(els) {
  const junk = '#%&@$*+=?01<>/\\|';
  const originals = els.map((e) => e.textContent);
  for (let step = 1; step <= 10; step++) {
    const p = step / 10;
    els.forEach((e, i) => {
      e.textContent = [...originals[i]]
        .map((ch) => (!/\s/.test(ch) && Math.random() < p ? junk[rand(0, junk.length - 1)] : ch))
        .join('');
    });
    await wait(110);
  }
  await wait(300);
}

// animovaná "píše..." bublina (tři pulzující tečky)
async function typingFor(ms, name = 'unknown', nameCls = 'dim') {
  const d = document.createElement('div');
  d.innerHTML = `<span class="${nameCls}">&lt;${name}&gt; </span><span class="dots"><i></i><i></i><i></i></span>`;
  out.appendChild(d);
  scroll();
  await wait(ms);
  d.remove();
}

// odpočet trasování jako HUD vpravo nahoře, jde zrychlit
// api: boost(n) zrychlí, slow() vrátí rychlost 1x, set(sec) přenastaví čas,
//      left() zbývající sekundy, halt(remove) zastaví, onEnd = co se stane na 00:00
function startTrace(secs = 900) {
  const el = document.createElement('div');
  el.id = 'hud';
  el.className = 'center';
  el.innerHTML = '<span class="lbl">TRACE ETA</span><span class="num"></span>';
  document.body.appendChild(el);
  const num = el.querySelector('.num');
  let step = 1;
  let ended = false;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const tick = () => {
    num.textContent = fmt(secs);
    el.classList.toggle('hot', secs < 60);
  };
  tick();
  const api = {
    onEnd: null,
    boost: (n = 2) => { step = n; },
    slow: () => { step = 1; },
    set: (n) => { secs = n; ended = false; tick(); },
    left: () => secs,
    dock: () => { el.classList.remove('center'); el.classList.add('corner'); },
    kill: () => {
      clearInterval(id);
      el.querySelector('.lbl').textContent = 'TRACE KILLED';
      num.textContent = '--:--';
      el.classList.remove('hot');
      el.classList.add('dead');
    },
    halt: (remove = false) => {
      clearInterval(id);
      if (remove) { el.remove(); return; }
      num.textContent = '--:--';
      el.classList.remove('hot');
    },
  };
  const id = setInterval(() => {
    secs -= step;
    if (secs <= 0) {
      secs = 0;
      num.textContent = '00:00';
      el.classList.add('hot');
      if (!ended) {
        ended = true;
        if (api.onEnd) api.onEnd();
      }
    } else {
      tick();
    }
  }, 1000);
  return api;
}

// zpráva od "někoho" psaná po lidsku: nepravidelné tempo, pauzy, překlep
// text je řetězec, nebo pole částí [{ t: 'text', cls: 'ok' }, ...]
// (část s cls 'ok' se vypíše zeleně i uvnitř červené řeči watchera)
async function say(text, { cls = '', speed = 70, typoAt = -1, name = 'unknown', nameCls = 'dim' } = {}) {
  const parts = typeof text === 'string' ? [{ t: text }] : text;
  const d = document.createElement('div');
  const who = document.createElement('span');
  who.className = nameCls;
  who.textContent = `<${name}> `;
  const t = document.createElement('span');
  if (cls) t.className = cls;
  d.append(who, t);
  out.appendChild(d);
  let i = 0;
  for (const part of parts) {
    const seg = document.createElement('span');
    if (part.cls) seg.className = part.cls;
    t.appendChild(seg);
    for (const ch of part.t) {
      if (i === typoAt) {
        seg.textContent += 'x';
        scroll();
        await wait(260);
        seg.textContent = seg.textContent.slice(0, -1);
        await wait(200);
      }
      seg.textContent += ch;
      scroll();
      let ms = speed + rand(-20, 40);
      if (',.'.includes(ch)) ms += 350;
      await wait(ms);
      i++;
    }
  }
  return t;
}

// vzdálené smazání: text zčervená, rozpadne se na šum a "zhltne se" řádek po řádku
async function wipe(els) {
  if (window.setRain) setRain(0.7);
  els.forEach((e) => e.classList.add('warn'));
  await decay(els);
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    while (e.textContent.length > 0) {
      e.textContent = e.textContent.slice(0, -2);
      await wait(14);
    }
    e.remove();
  }
  await gfx('slice');
  if (window.setRain) setRain(0.22);
}

// ---------- terminál: psaní přímo do promptu ----------
// Pod prompt se schová neviditelný <input> (kvůli klávesnici na mobilu),
// co se do něj napíše, se zrcadlí rovnou před blikající kurzor.
const tty = { resolve: null };
let ttyInput = null;
let ttyTyped = null;

function ttyInit() {
  if (ttyInput) return;
  const cursor = promptLine.querySelector('.cursor');
  const wrap = document.createElement('span');
  wrap.className = 'inputwrap';
  ttyTyped = document.createElement('span');
  ttyTyped.className = 'typed';
  cursor.before(wrap);
  wrap.append(ttyTyped, cursor);

  ttyInput = document.createElement('input');
  ttyInput.type = 'text';
  ttyInput.className = 'tty-input';
  ttyInput.autocomplete = 'off';
  ttyInput.autocapitalize = 'off';
  ttyInput.setAttribute('autocorrect', 'off');
  ttyInput.spellcheck = false;
  ttyInput.enterKeyHint = 'go';
  ttyInput.setAttribute('aria-label', 'terminal');
  promptLine.appendChild(ttyInput);

  ttyInput.addEventListener('input', () => {
    ttyTyped.textContent = ttyInput.value;
    scroll();
  });
  ttyInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    ttySubmit();
  });
  // klepnutí kamkoliv i psaní na klávesnici vždy míří do promptu
  addEventListener('pointerdown', () => { if (tty.resolve) ttyInput.focus(); });
  addEventListener('keydown', () => {
    if (tty.resolve && document.activeElement !== ttyInput) ttyInput.focus();
  });
}

// počká, až hráč napíše příkaz a dá Enter; vrátí napsaný text
function readCommand() {
  ttyInit();
  return new Promise((resolve) => {
    tty.resolve = resolve;
    promptLine.hidden = false;
    scroll();
    if (matchMedia('(pointer: fine)').matches) ttyInput.focus();
  });
}

function ttySubmit() {
  if (!tty.resolve) return;
  const value = ttyInput.value;
  ttyInput.value = '';
  ttyTyped.textContent = '';
  const resolve = tty.resolve;
  tty.resolve = null;
  // napsaný příkaz zůstane ve výstupu, jako v opravdovém terminálu
  const d = document.createElement('div');
  const p = document.createElement('span');
  p.className = 'dim';
  p.textContent = 'root@fsociety00:~$ ';
  d.append(p, value);
  out.appendChild(d);
  scroll();
  resolve(value);
}

// zruší čekání bez ozvěny (např. když hráč klepne na možnost místo psaní)
function ttyAbort() {
  if (!tty.resolve) return;
  ttyInput.value = '';
  ttyTyped.textContent = '';
  const resolve = tty.resolve;
  tty.resolve = null;
  resolve(null);
}

function closePrompt() {
  tty.resolve = null;
  promptLine.hidden = true;
  if (ttyInput) ttyInput.blur();
}

// ---------- výběr: komu věřit ----------
// Jde to klepnutím na možnost (mobil), nebo napsáním přímo do terminálu.
// Platí: "1", "2", "trust <unknown>", "trust <watcher>", případně jen jméno.
const normChoice = (s) => s.trim().toLowerCase().replace(/^trust\s+/, '').replace(/[<>]/g, '').trim();

async function chooseTrust() {
  const options = [
    { n: '1', id: 'unknown', label: 'trust <unknown>', match: ['1', 'unknown'] },
    { n: '2', id: 'watcher', label: 'trust <watcher>', match: ['2', 'watcher'] },
  ];

  const box = document.createElement('div');
  box.className = 'choices';
  out.appendChild(box);

  let tapped = null;
  const tap = (o) => {
    if (tapped) return;
    tapped = o;
    ttyAbort();
  };
  options.forEach((o) => {
    const el = document.createElement('div');
    el.className = 'choice';
    el.dataset.id = o.id;
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.textContent = `[${o.n}] ${o.label}`;
    el.addEventListener('click', () => tap(o));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') tap(o); });
    box.appendChild(el);
  });

  const lock = (opt) => {
    box.querySelectorAll('.choice').forEach((el) => {
      el.classList.add('locked');
      el.classList.toggle('picked', el.dataset.id === opt.id);
    });
  };

  let choice = null;
  while (!choice) {
    const raw = tapped ? null : await readCommand();
    if (tapped) {
      // klepnutí: příkaz se "napíše" do terminálu sám
      choice = tapped;
      closePrompt();
      lock(choice);
      await cmd(choice.label, 45);
    } else {
      const hit = options.find((o) => o.match.includes(normChoice(raw)));
      if (hit) {
        choice = hit;
        closePrompt();
        lock(choice);
      } else if (raw.trim()) {
        line(`command not found: ${raw.trim()}`, 'warn');
        line(`try: ${options.map((o) => o.label).join('  |  ')}`, 'dim');
      }
    }
  }
  return choice.id;
}

// =====================================================================
// LEVEL 01: klíč k /dev/sdb9 je schovaný ve stránce samotné
//   část 1: HTML komentář v index.html   ("kostra pod kůží")
//   část 2: CSS (komentář + proměnná)    ("kůže samotná")
//   část 3: console.log v téhle JS       ("co šeptá, když se nikdo nedívá")
// Klíč se píše jako: unlock ghost-shell-1337
// =====================================================================
const KEY = ['ghost', 'shell', '1337'];

const HINTS = [
  'three parts. three layers of the page.',
  'markup. style. script. dev tools: F12 or ctrl+U. on a phone put view-source: in front of the address.',
  'part 1 sleeps in a comment. part 2 hides in the stylesheet. part 3 whispers in the console.',
];

function whisper() {
  console.log(
    `%c[sdb9] key :: part 3/3 :: ${KEY[2]}`,
    'color:#33ff66;background:#000;padding:2px 6px;font-family:monospace'
  );
}

const mmss = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

// hráč vyčerpal pokusy nebo vypršel čas: smazání, GAME OVER, reboot klepnutím
async function gameOver(trace, reason) {
  closePrompt();
  trace.halt(true);
  line();
  line(`*** ${reason} ***`, 'warn');
  await staticBurst(600);
  await gfx('invert');
  await corrupt(8);
  await wait(800);
  line('you were found.', 'warn');
  await wait(1200);
  await wipe([...out.children]);
  await blackout(1200);
  line('GAME OVER', 'big warn');
  line('tap or press any key to reboot', 'dim');
  await sleep(900);
  await new Promise((r) => {
    addEventListener('pointerdown', r, { once: true });
    addEventListener('keydown', r, { once: true });
  });
  location.reload();
}

// terminál hádanky; vrací true, když hráč odemkl sdb9
async function level01(trace, trusted) {
  const state = { over: null };
  let attempts = 3;
  let hints = 0;
  let solved = false;

  trace.onEnd = () => { state.over = 'TRACE COMPLETE'; ttyAbort(); };
  whisper();
  const whisperId = setInterval(whisper, 15000);

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
    if (raw === null || state.over) break;
    const [name, ...args] = raw.trim().split(/\s+/);
    if (!name) continue;

    switch (name.toLowerCase()) {
      case 'help':
        line('commands:', 'dim');
        line('  help           this list');
        line('  ls             list files');
        line('  cat <file>     read a file');
        line('  unlock <key>   try a key on sdb9');
        line('  hint           ask for help (-30s)');
        line('  trace          show trace status');
        if (trusted === 'watcher') line('  abort          cut the trace');
        break;

      case 'ls':
        line('inbox/   notes.txt   readme.txt   sdb9.lock');
        break;

      case 'cat': {
        const f = (args[0] || '').replace(/^\.?\/?(~\/)?/, '');
        if (!args[0]) line('usage: cat <file>', 'dim');
        else if (files[f]) files[f]().forEach((l) => line(l || ' '));
        else line(`cat: ${args[0]}: No such file or directory`, 'warn');
        break;
      }

      case 'trace':
        line(`trace:  ${trace.left() < 120 ? 'CLOSING' : 'ACTIVE'}`, trace.left() < 120 ? 'warn' : '');
        line(`eta:    ${mmss(trace.left())}`, 'dim');
        line('hops:   7 / 9', 'dim');
        break;

      case 'hint': {
        if (hints >= HINTS.length) { line('no more hints.', 'dim'); break; }
        trace.set(Math.max(5, trace.left() - 30));
        line('[trace -30s]', 'warn');
        await say(HINTS[hints++], { speed: 35 });
        whisper();
        break;
      }

      case 'unlock': {
        const guess = args.join(' ').toLowerCase().replace(/[\s_]+/g, '-');
        if (!guess) { line('usage: unlock <key>', 'dim'); break; }
        if (guess === KEY.join('-')) { solved = true; break; }
        attempts--;
        const g = guess.split('-');
        if (g.length === KEY.length) {
          line(`  [${KEY.map((k, i) => (g[i] === k ? 'ok' : '--')).join('] [')}]`, 'dim');
        }
        line(`unlock: invalid key. attempts left: ${attempts}`, 'warn');
        await gfx('rgb');
        whisper();
        if (attempts <= 0) state.over = 'LOCKED OUT';
        break;
      }

      case 'abort': {
        // past pro toho, kdo uvěřil watcherovi: okamžitý GAME OVER
        if (trusted !== 'watcher') { line(`command not found: ${name}`, 'warn'); break; }
        line('abort: sending...', 'dim');
        await wait(900);
        line('[ALERT] abort rejected', 'warn');
        line('[ALERT] your coordinates were sent to 9 / 9 hops', 'warn');
        await gfx('slice');
        await staticBurst(400);
        await say('thank you.', { name: 'watcher', nameCls: 'warn', cls: 'warn', speed: 80 });
        await wait(700);
        await say('i told you-', { speed: 100 });
        await gfx('rgb');
        state.over = 'COORDINATES LEAKED';
        break;
      }

      default:
        line(`command not found: ${name}`, 'warn');
        line('type help', 'dim');
    }
  }

  clearInterval(whisperId);
  trace.onEnd = null;
  if (state.over) {
    await gameOver(trace, state.over);
    return false;
  }
  closePrompt();
  return true;
}

// přepíše všechny výskyty jména na obrazovce: nejdřív se rozpadne na šum,
// pak se šum po písmenech zamkne do nového jména
async function renameEverywhere(from, to) {
  const junk = '#%&@$*+=?01<>/\\|';
  const targets = [];
  const walker = document.createTreeWalker(out, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const n = walker.currentNode;
    if (n.nodeValue.includes(from)) targets.push({ n, base: n.nodeValue });
  }
  const j = () => junk[rand(0, junk.length - 1)];
  const decayFrames = 6;
  const lockFrames = 10;
  if (window.setRain) setRain(0.8);
  screen.classList.add('g-rgb');
  for (let f = 0; f <= decayFrames + lockFrames; f++) {
    let mid;
    if (f < decayFrames) {
      mid = [...from].map((ch) => (Math.random() < (f + 1) / decayFrames ? j() : ch)).join('');
    } else {
      const locked = Math.floor(((f - decayFrames) / lockFrames) * to.length);
      mid = [...to].map((ch, i) => (i < locked ? ch : j())).join('');
    }
    targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(mid); });
    if (f === 3) staticBurst(500);
    await sleep(80);
  }
  screen.classList.remove('g-rgb');
  targets.forEach((t) => { t.n.nodeValue = t.base.split(from).join(to); });
  await gfx('slice');
  await gfx('invert');
  if (window.setRain) setRain(0.22);
}

// po odemčení sdb9 hráč spustí ghost.sh (napsat, nebo klepnout). Čas běží dál.
async function promptGhost(trace) {
  const state = { over: null };
  trace.onEnd = () => { state.over = 'TRACE COMPLETE'; ttyAbort(); };

  const box = document.createElement('div');
  box.className = 'choices';
  out.appendChild(box);
  const el = document.createElement('div');
  el.className = 'choice';
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.textContent = '[1] ./ghost.sh';
  let tapped = false;
  const go = () => { if (tapped) return; tapped = true; ttyAbort(); };
  el.addEventListener('click', go);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  box.appendChild(el);

  const runs = ['1', './ghost.sh', 'ghost.sh', 'sh ghost.sh', 'sh ./ghost.sh', 'bash ghost.sh',
    'bash ./ghost.sh', 'run ghost.sh', 'ghost'];
  let ok = false;
  while (!ok && !state.over) {
    const raw = tapped ? null : await readCommand();
    if (tapped) {
      // klepnutí: příkaz se "napíše" do terminálu sám
      closePrompt();
      el.classList.add('locked', 'picked');
      await cmd('./ghost.sh', 40);
      ok = true;
    } else if (raw === null) {
      break;
    } else {
      const c = raw.trim().toLowerCase();
      if (runs.includes(c)) {
        closePrompt();
        el.classList.add('locked', 'picked');
        ok = true;
      } else if (c === 'ls') {
        line('erased.list   ghost.sh');
      } else if (c === 'cat ghost.sh' || c === 'cat ./ghost.sh') {
        line('#!/bin/sh', 'dim');
        line('# ghost :: by the one who cannot say his name', 'dim');
        line('kill_trace');
        line('purge_session');
        line('cloak guest');
      } else if (c) {
        line(`command not found: ${raw.trim()}`, 'warn');
        line('run ghost.sh', 'dim');
      }
    }
  }
  trace.onEnd = null;
  if (state.over) {
    await gameOver(trace, state.over);
    return false;
  }
  return true;
}

// ghost.sh: zabije trace (tracerd), vyhodí watchera ze session (watcherd) a hráče schová
async function runGhost(trace) {
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  line('[ghost] payload loaded', 'dim');
  await wait(600);
  line('[ghost] listing sessions...', 'dim');
  await wait(800);
  line('  PID    PROC        STATE', 'dim');
  line('  812    sshd        ok');
  line('  4242   tracerd     TRACING', 'warn');
  line('  4310   watcherd    INJECTED', 'warn');
  line('  4877   guest-sh    ok');
  await wait(1300);
  await bar('[ghost] forging 9 hops', 1800);
  await wait(500);

  // 1) trace
  line('[ghost] target: tracerd', 'dim');
  await wait(400);
  await cmd('kill -9 4242', 40, 300);
  line('tracerd: terminated');
  trace.kill();
  await flash();
  await staticBurst(300);
  line('=== TRACE CANCELLED ===');
  await wait(1200);

  // 2) watcher, ještě pořád ve session
  line();
  line('[ghost] target: watcherd', 'dim');
  await wait(500);
  await typingFor(900, 'watcher', 'warn');
  await say('what are you doing.', { ...W, speed: 40 });
  await wait(500);
  await say('wait. you do not understand what he-', { ...W, speed: 35 });
  await cmd('kill -9 4310', 40, 300);
  line('watcherd: connection reset by peer', 'warn');
  await gfx('slice');
  await staticBurst(500);
  await cmd(`iptables -A INPUT -s ${ip()} -j DROP`, 25, 250);
  line('[ghost] watcher session purged', 'dim');
  line('*** watcher disconnected ***', 'warn');
  await gfx('roll');
  await wait(900);

  // 3) hráč se schová
  line();
  await bar('[ghost] cloaking guest', 1200);
  line('[ghost] done. you are a ghost.');
  await wait(1200);
}

// po odemčení sdb9: watcher se ještě brání, ghost.sh zabije trace i watchera,
// pak seznam smazaných a jméno unknowna se přepíše na Mr. Robot
async function revealName(trace, trusted) {
  const R = { name: 'Mr. Robot' };
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  await bar('decrypting /dev/sdb9', 2200);
  await svc('Mounted /dev/sdb9.');
  await flash();
  await staticBurst(400);
  line();
  line('/dev/sdb9: 2 files', 'dim');
  line('owner: unknown', 'dim');
  await wait(1000);
  await cmd('ls /mnt/sdb9');
  line('erased.list   ghost.sh');
  await wait(1200);
  line();

  // watcher je pořád ve session (vložil se dřív) a snaží se zabránit
  line('*** watcher: session still active ***', 'warn');
  await staticBurst(400);
  await typingFor(1100, 'watcher', 'warn');
  await say('close it.', { ...W, speed: 60 });
  await wait(700);
  await say('you do not know what is in there.', { ...W, speed: 40 });
  await wait(600);
  line('[ALERT] watcherd: injected process still running (pid 4310)', 'warn');
  line('[ALERT] tracerd: ETA 02:30', 'warn');
  trace.slow();
  trace.set(150);
  await gfx('rgb');
  await wait(800);
  await say('he is still inside the session.', { speed: 45 });
  await wait(700);
  await say('he has been inside since he injected himself.', { speed: 45 });
  await wait(700);
  await say('there is a file in sdb9. ghost.sh.', { speed: 45 });
  await wait(700);
  await say('run it. now.', { cls: 'warn', speed: 70 });
  await wait(500);
  line();

  if (!(await promptGhost(trace))) return;
  line();
  await runGhost(trace);
  line();

  await cmd('cat /mnt/sdb9/erased.list');
  const redact = () => '█'.repeat(rand(5, 11));
  for (let i = 1; i <= 9; i++) {
    line(`${String(i).padStart(4, '0')}  ${redact()}  ERASED`, 'dim');
    await wait(110);
  }
  line('  ...', 'dim');
  await wait(500);
  line('4096  ████████  ERASED', 'dim');
  await wait(900);
  const mine = line('4097  guest         PENDING', 'warn');
  await gfx('invert');
  await wait(1600);
  line();

  await typingFor(2200);
  await say('it worked.', { speed: 80 });
  await wait(1100);
  await say('the trace is dead. the watcher is out.', { speed: 55 });
  await wait(1300);
  await say('but look at the list.', { speed: 70 });
  await wait(1200);
  await say('4097. that is you.', { cls: 'warn', speed: 80 });
  await wait(1400);
  await say('that is how they find people.', { speed: 55 });
  await wait(1500);
  mine.className = '';
  mine.textContent = '4097  guest         GHOSTED';
  await gfx('rgb');
  await wait(900);
  await say('ghost.sh took you off it. for now.', { speed: 55 });
  await wait(1500);
  await say(
    trusted === 'unknown'
      ? 'you trusted me. i will not waste that.'
      : 'you did not trust me. you came anyway. that is enough.',
    { speed: 55 }
  );
  await wait(1500);
  await say('i could never tell you my name.', { speed: 60 });
  await wait(1100);
  await say('they listen for it. every channel. every line.', { speed: 55 });
  await wait(1300);
  await say('but nobody is listening now.', { speed: 55 });
  await wait(1300);
  await say('so listen.', { speed: 90 });
  await wait(1000);
  await say('my name is-', { speed: 130 });
  await wait(700);

  // jméno se přepíše všude na obrazovce
  await renameEverywhere('unknown', 'Mr. Robot');
  await wait(1100);

  await say('hello, friend.', { ...R, cls: 'big', speed: 150 });
  await wait(1300);
  await say('this time you can see who is talking.', { ...R, speed: 60 });
  await wait(1300);
  await say('i threw the watcher out of the session.', { ...R, speed: 55 });
  await wait(1400);
  await say('he will find a way back. he always does.', { ...R, speed: 60 });
  await wait(1300);
  line();
  line('=== LEVEL 01 COMPLETE ===');
  await gfx('zoom');
  line('access level: GUEST -> USER', 'dim');
  await wait(900);
  line('[ALERT] 1 zombie process: watcherd <defunct>', 'warn');
  await wait(900);
  line('loading level 02...', 'dim');
  await bar('level02.bin', 1800);
  line('// to be continued', 'dim');
}

async function boot() {
  await wait(600);

  // 1) BIOS / POST
  line('FSOC-BIOS v0.0.1  (c) 2015 E Corp', 'dim');
  line('Build 15-05-2015 03:14:07', 'dim');
  line();
  await wait(300);
  line('CPU: Intel(R) Core(TM) i7-4790 @ 3.60GHz');
  await wait(200);
  await memtest();
  await wait(200);
  line('Detecting drives...');
  await wait(500);
  line('  sda  512GB  SSD  OK', 'dim');
  await wait(180);
  line('  sdb  2TB    HDD  OK', 'dim');
  await wait(180);
  line('  sdc  ----   no media', 'dim');
  await wait(600);
  line();

  // 2) bootloader
  line('GNU GRUB  version 2.02');
  await wait(400);
  line('Loading Linux 4.19.0-fsoc ...');
  await wait(700);
  line('Loading initial ramdisk ...');
  await wait(900);
  line();

  // 3) kernel log
  await klog('Linux version 4.19.0-fsoc (root@fsociety00) (gcc 8.3.0)');
  await klog('Command line: BOOT_IMAGE=/vmlinuz root=/dev/sda1 ro quiet');
  await klog('x86/fpu: Supporting XSAVE feature 0x001: x87 floating point');
  await klog('BIOS-provided physical RAM map:');
  await klog('BIOS-e820: [mem 0x0000000000000000-0x000000000009ffff] usable');
  await klog('BIOS-e820: [mem 0x0000000000100000-0x00000003ffffffff] usable');
  await klog('NX (Execute Disable) protection: active');
  await klog('DMI: E Corp / FSOC-MB 1.0.3, BIOS 0.0.1');
  await klog('tsc: Detected 3600.000 MHz processor');
  await klog('ACPI: Core revision 20180810');
  await klog('PCI: Using configuration type 1 for base access');
  await klog('NET: Registered protocol family 2');
  await klog('TCP: Hash tables configured (established 131072)');
  await klog('usb 1-1: new high-speed USB device number 2');
  await klog('usb 1-1: device descriptor read/64, error -71', 'warn');
  await klog('usb 1-1: Product: unknown');
  await klog('EXT4-fs (sda1): mounted filesystem with ordered data mode');
  await klog('random: crng init done');
  line();
  await wait(400);

  // 4) služby
  await svc('Started Journal Service.');
  await svc('Mounted /boot.');
  await svc('Started udev Kernel Device Manager.');
  await svc('Reached target Local File Systems.');
  await svc('Started Network Manager.');
  await svc('Started OpenSSH server daemon.');
  await svc('Started Tor anonymity daemon.');
  await svc('Started fsociety00 relay service.');
  line();

  // 5) kontrola disku
  await bar('fsck /dev/sda1', 1300);
  line('/dev/sda1: clean, 41392/3276800 files', 'dim');
  await wait(300);
  line();

  // 6) síť
  line('Bringing up network...', 'dim');
  await wait(400);
  line(`eth0: link up, 1000Mbps full duplex`);
  await wait(300);
  line(`eth0: inet ${ip()}  (spoofed)`, 'dim');
  await wait(500);
  line('Building secure tunnel...', 'dim');
  await wait(300);
  for (let i = 1; i <= 5; i++) {
    line(`  hop ${i}: ${ip()}   ${rand(18, 210)}ms`, 'dim');
    await wait(rand(250, 500));
  }
  line('Tunnel established.');
  await wait(500);
  line();

  // 7) šifrovaný disk
  await svc('Starting cryptsetup for /dev/sdb1...', 'OK', 700);
  await bar('decrypting /dev/dat', 1800);
  await svc('Mounted /dev/dat.');
  await wait(500);
  line();
  line('scanning for partitions...', 'dim');
  await wait(900);
  line('found unlisted partition: /dev/sdb9', 'warn');
  await wait(500);
  line('size:  0 bytes', 'dim');
  await wait(250);
  line('owner: unknown', 'dim');
  await wait(900);
  line();

  // 8) něco je špatně
  line('WARNING: unauthorized access detected', 'warn');
  await wait(700);
  line('source: unknown', 'warn');
  await wait(800);
  line('tracing connection...', 'dim');
  await wait(1300);
  line('trace failed.', 'warn');
  await wait(700);

  // od tohoto místa nefunguje jedno klepnutí, příběh jde přeskočit jen trojklikem
  skip = false;
  skippable = false;
  skipHint.textContent = 'tap x3 to skip';
  skipHint.hidden = skipToChoice;

  await flash();
  await staticBurst(500);
  await gfx('roll');
  await blackout(1500);
  if (window.setRain) setRain(0.22);

  // 9) příběh
  await wait(900);
  line('*** INCOMING TRANSMISSION ***', 'warn');
  await wait(700);
  line('source: unknown', 'dim');
  await wait(500);
  line('direct line open.', 'dim');
  await wait(1800);
  line();

  const story = [];
  await typingFor(2600);

  const hello = await say('hello, friend.', { cls: 'big', speed: 150 });
  story.push(hello);
  await wait(1500);
  await glitchHello(hello);
  await wait(1400);

  await typingFor(1800);
  story.push(await say('i\'ve been waiting for you.', { speed: 80 }));
  await wait(1800);
  story.push(await say('you shouldn\'t be here.', { speed: 75, typoAt: 4 }));
  await wait(1300);
  story.push(await say('but you are.', { cls: 'warn', speed: 100 }));
  await wait(1700);
  story.push(await say('there is something hidden in this system.', { speed: 55 }));
  await wait(1100);
  story.push(await say('find it before they do.', { speed: 55 }));
  await wait(1500);
  story.push(await say('they are already looking for you.', { cls: 'warn', speed: 70 }));
  await gfx('invert');
  await corrupt(8);
  await wait(1200);
  line();
  line('*** unknown disconnected ***', 'warn');
  await wait(1000);
  line('wiping session...', 'dim');
  await wait(900);
  await wipe([...out.children]); // smaže celou obrazovku, ne jen část
  await wait(400);
  await flash();
  await blackout(1600);

  await logo(['FSOCIETY']);
  await gfx('zoom');
  line('//  access level: GUEST  //', 'dim');
  await wait(900);
  line();

  // pokračování
  await svc('Opening guest session.');
  await svc('Checking inbox...', 'OK', 900);
  line();
  line('1 unread message', '');
  await wait(600);
  line('from:    unknown', 'dim');
  await wait(300);
  line('subject: sdb9', 'dim');
  await wait(1000);
  line();
  await cmd('cat ~/inbox/001.msg');
  line();
  await type('the partition is not empty.', '', 35);
  await wait(1000);
  await type('it is locked.', '', 35);
  await wait(1200);
  await type('the key is not in this system.', '', 35);
  await wait(1000);
  await type('it is hidden in the page itself.', 'warn', 40);
  await wait(1200);
  await type('look closer.', 'warn', 90);
  await wait(1200);
  line();

  // zadání první úrovně
  line('=== LEVEL 01 :: THE KEY ===');
  await gfx('rgb');
  await wait(500);
  line('target:    /dev/sdb9', 'dim');
  await wait(250);
  line('status:    LOCKED', 'warn');
  await wait(250);
  line('attempts:  3', 'dim');
  await wait(250);
  line('key:       ????????', 'dim');
  await wait(1100);
  line();
  await typingFor(2200);
  await say('you have 15 minutes.', { speed: 80 });
  await wait(1300);
  await say('make them count.', { cls: 'warn', speed: 110 });
  await wait(1100);
  line();
  // odpočet se ukáže uprostřed obrazovky, chvíli tam visí a pak se přesune do rohu
  const trace = startTrace();
  await wait(2800);
  await gfx('rgb');
  await wait(600);
  trace.dock();
  await wait(1500);

  // pokračování: přerušená zpráva, poplach, ztráta spojení
  await typingFor(2000);
  await say('listen carefully.', { speed: 80 });
  await wait(1300);
  await say('sdb9 holds a list.', { speed: 70 });
  await wait(1200);
  await say('everyone they have erased.', { speed: 70 });
  await wait(1400);
  await say('and the key to open it is-', { speed: 95 });
  await gfx('rgb');
  await staticBurst(600);
  line();
  line('*** connection lost ***', 'warn');
  await wait(1200);
  line('[ALERT] firewall: unknown process spawned', 'warn');
  await wait(500);
  line(`[ALERT] ${ip()} flagged`, 'warn');
  await wait(500);
  line('[ALERT] trace accelerated x2', 'warn');
  trace.boost();
  await corrupt(6);
  await gfx('roll');
  await wait(900);
  line();
  line('reconnecting...', 'dim');
  await wait(1800);
  line('reconnect failed.', 'warn');
  await wait(1200);
  line();
  await type('you are on your own now.', '', 45);
  await wait(1000);
  await type('hint: not everything is visible.', 'dim', 35);
  await wait(500);
  await type('hint: inspect everything.', 'dim', 35);
  await wait(1200);
  line();

  // otočka: na linku se vlomí někdo jiný
  await wait(1200);
  line('*** new connection: watcher ***', 'warn');
  await staticBurst(350);
  await wait(900);
  const W = { name: 'watcher', nameCls: 'warn', cls: 'warn' };
  await typingFor(1500, 'watcher', 'warn');
  await say('i see you.', { ...W, speed: 60 });
  await wait(1100);
  await say([{ t: '<unknown>', cls: 'ok' }, { t: ' has been lying to you.' }], { ...W, speed: 45 });
  await wait(1000);
  await say('there is no key.', { ...W, speed: 70 });
  await wait(1200);
  await say('there is only the trace.', { ...W, speed: 70 });
  await gfx('slice');
  trace.boost(3);
  line('[ALERT] watcher injected into session', 'warn');
  await wait(900);
  line('*** unknown reconnected ***', 'dim');
  await staticBurst(300);
  await wait(600);
  await say('don\'t listen to him.', { speed: 55, typoAt: 3 });
  await wait(900);
  await say('he wants you to stop looking.', { speed: 55 });
  await wait(1000);
  await say('keep going.', { cls: 'warn', speed: 90 });
  await wait(900);
  await say('the answer is in the page.', { speed: 70 });
  await gfx('rgb');
  await corrupt(6);
  await wait(1000);
  line();
  await type('who do you trust?', 'dim', 60);
  await wait(1200);
  line();

  // === konec SKIPu: tady se zastaví přeskakování, od volby se hraje normálně ===
  skipToChoice = false;
  skipToChoiceArmed = false;
  skipHint.hidden = true;

  // výběr: klepnutí na možnost, nebo napsat příkaz přímo do terminálu
  trusted = await chooseTrust();
  line();
  await wait(700);

  if (trusted === 'unknown') {
    await say('good.', { speed: 90 });
    await wait(900);
    await say('i wasn\'t sure you would.', { speed: 60 });
    await wait(900);
    await say('i can\'t tell you my name yet.', { speed: 60 });
    await wait(900);
    await say('they listen for it.', { speed: 70 });
    await wait(1000);
    line('[ALERT] watcher: connection hostile', 'warn');
    await gfx('slice');
    await typingFor(1200, 'watcher', 'warn');
    await say('he can\'t say it because he does not trust you.', { ...W, speed: 45 });
    await wait(900);
    await say('ignore him.', { speed: 55 });
  } else {
    await say('smart.', { ...W, speed: 80 });
    await wait(900);
    await say([{ t: '<unknown>', cls: 'ok' }, { t: ' wants you inside sdb9.' }], { ...W, speed: 55 });
    await wait(1000);
    await say('ask yourself why.', { ...W, speed: 70 });
    await wait(1100);
    await say('type abort. cut the trace before it cuts you.', { ...W, speed: 50 });
    await wait(900);
    await gfx('rgb');
    await staticBurst(500);
    line('*** unknown reconnected ***', 'dim');
    await wait(700);
    await say('don\'t-', { speed: 120 });
    await gfx('slice');
    await say('he is lying. read the readme.', { speed: 45 });
  }

  await wait(1200);
  line();
  line('[ALERT] trace recalculated', 'warn');
  await wait(600);
  trace.slow();
  trace.set(600);
  line('ETA reset: 10:00', 'dim');
  await wait(900);
  await typingFor(1500);
  await say('you have ten minutes.', { speed: 70 });
  await wait(900);
  await say('type help.', { speed: 90 });
  await wait(600);
  line();

  // hádanka: klíč je schovaný ve stránce (viz KEY nahoře)
  const opened = await level01(trace, trusted);
  if (!opened) return;
  await revealName(trace, trusted);
}

boot();
