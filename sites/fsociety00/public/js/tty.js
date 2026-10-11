export function createTerminal({ out, promptLine, scroll, onKeyPress = () => {} }) {
  const tty = { resolve: null };
  let input = null;
  let typed = null;

  function init() {
    if (input) return;
    const cursor = promptLine.querySelector('.cursor');
    const wrap = document.createElement('span');
    wrap.className = 'inputwrap';
    typed = document.createElement('span');
    typed.className = 'typed';
    cursor.before(wrap);
    wrap.append(typed, cursor);

    input = document.createElement('input');
    input.type = 'text';
    input.className = 'tty-input';
    input.autocomplete = 'off';
    input.autocapitalize = 'off';
    input.setAttribute('autocorrect', 'off');
    input.spellcheck = false;
    input.enterKeyHint = 'go';
    input.setAttribute('aria-label', 'terminal');
    promptLine.appendChild(input);

    input.addEventListener('input', () => {
      typed.textContent = input.value;
      scroll();
    });
    input.addEventListener('keydown', (event) => {
      if (!event.repeat && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter')) {
        onKeyPress(event.key);
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    });
    addEventListener('pointerdown', () => { if (tty.resolve) input.focus(); });
    addEventListener('keydown', () => {
      if (tty.resolve && document.activeElement !== input) input.focus();
    });
  }

  function readCommand() {
    init();
    return new Promise((resolve) => {
      tty.resolve = resolve;
      promptLine.hidden = false;
      scroll();
      if (matchMedia('(pointer: fine)').matches) input.focus();
    });
  }

  function submit() {
    if (!tty.resolve) return;
    const value = input.value;
    input.value = '';
    typed.textContent = '';
    const resolve = tty.resolve;
    tty.resolve = null;
    const echo = document.createElement('div');
    const prompt = document.createElement('span');
    prompt.className = 'dim';
    prompt.textContent = 'guest@fsociety00:~$ ';
    echo.append(prompt, value);
    out.appendChild(echo);
    scroll();
    resolve(value);
  }

  function abort() {
    if (!tty.resolve) return;
    input.value = '';
    typed.textContent = '';
    const resolve = tty.resolve;
    tty.resolve = null;
    resolve(null);
  }

  function close() {
    tty.resolve = null;
    promptLine.hidden = true;
    if (input) input.blur();
  }

  async function chooseTrust({ cmd, line }) {
    const options = [
      { n: '1', id: 'unknown', label: 'trust <unknown>', match: ['1', 'unknown'] },
      { n: '2', id: 'watcher', label: 'trust <watcher>', match: ['2', 'watcher'] },
    ];
    const box = document.createElement('div');
    box.className = 'choices';
    out.appendChild(box);

    let tapped = null;
    const tap = (option) => {
      if (tapped) return;
      tapped = option;
      abort();
    };
    options.forEach((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'choice';
      button.dataset.id = option.id;
      button.textContent = `[${option.n}] ${option.label}`;
      button.addEventListener('click', () => tap(option));
      box.appendChild(button);
    });

    const lock = (option) => {
      box.querySelectorAll('.choice').forEach((element) => {
        element.classList.add('locked');
        element.classList.toggle('picked', element.dataset.id === option.id);
        element.disabled = true;
      });
    };
    const normalize = (value) => value.trim().toLowerCase()
      .replace(/^trust\s+/, '').replace(/[<>]/g, '').trim();

    let choice = null;
    while (!choice) {
      const raw = tapped ? null : await readCommand();
      if (tapped) {
        choice = tapped;
        close();
        lock(choice);
        await cmd(choice.label, 45);
      } else {
        const hit = options.find((option) => option.match.includes(normalize(raw)));
        if (hit) {
          choice = hit;
          close();
          lock(choice);
        } else if (raw.trim()) {
          line(`command not found: ${raw.trim()}`, 'warn');
          line(`try: ${options.map((option) => option.label).join('  |  ')}`, 'dim');
        }
      }
    }
    return choice.id;
  }

  return { readCommand, abort, close, chooseTrust };
}
