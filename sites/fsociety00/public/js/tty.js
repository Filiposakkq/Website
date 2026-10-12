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

  return { readCommand, abort, close };
}
