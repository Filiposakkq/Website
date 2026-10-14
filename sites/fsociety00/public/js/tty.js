const INTERACTIVE = 'button, a, input, textarea, select, summary, [contenteditable], [tabindex]';

// True for the page itself or anything inside #screen that is not a control.
function inTerminalArea(target) {
  if (!(target instanceof Element)) return false;
  if (target === document.body || target === document.documentElement) return true;
  return !!target.closest('#screen') && !target.closest(INTERACTIVE);
}

const modalOpen = () => !!document.querySelector('dialog[open], [aria-modal="true"]:not([hidden])');

// Printable characters, Backspace and Enter. Never Tab, Shift, arrows or Escape, and not shortcuts.
const isTypingKey = (event) => !event.ctrlKey && !event.metaKey && !event.altKey
  && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter');

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
      const shortcut = event.ctrlKey || event.metaKey || event.altKey; // Ctrl+C, Cmd+V ... are not typing
      if (!event.repeat && !shortcut && (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter')) {
        onKeyPress(event.key);
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submit();
    });
    // Send typing to the terminal only when that is clearly what the player means. Stealing focus on
    // every key (as this used to) made Tab, arrows and dialogs unusable for keyboard users.
    addEventListener('pointerdown', (event) => {
      if (!tty.resolve || document.activeElement === input) return;
      if (inTerminalArea(event.target) && !modalOpen()) input.focus();
    });
    addEventListener('keydown', (event) => {
      if (!tty.resolve || document.activeElement === input) return;
      if (!isTypingKey(event) || !inTerminalArea(event.target) || modalOpen()) return;
      input.focus();
    });
  }

  /**
   * Waits for the next typed line. Resolves with the line, or null after abort().
   * With a `signal` it rejects with the signal's reason when the session aborts, so the awaiting
   * code unwinds instead of leaking a promise that never settles.
   */
  function readCommand({ signal } = {}) {
    init();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      let onSignal = null;
      const settle = (value) => {
        signal?.removeEventListener('abort', onSignal);
        resolve(value);
      };
      onSignal = () => {
        if (tty.resolve === settle) {
          tty.resolve = null;
          input.value = '';
          typed.textContent = '';
        }
        reject(signal.reason);
      };
      signal?.addEventListener('abort', onSignal, { once: true });
      tty.resolve = settle;
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
