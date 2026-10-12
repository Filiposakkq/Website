/**
 * Renders a row of tappable choice buttons. This is the single builder behind the trust
 * choice and the `./ghost.sh` prompt; the DOM it produces is what the `.choices` / `.choice`
 * CSS expects:
 *
 *   <div class="choices">
 *     <button type="button" class="choice" data-id="...">[1] label</button>
 *   </div>
 *
 * @param {object} config
 * @param {HTMLElement} config.container  Where the box is appended.
 * @param {Array<{ id?: string, label: string, key?: string }>} config.options
 *        `key` is shown as a `[key] ` prefix. `id` becomes `data-id` and is passed to `onPick`.
 * @param {(option: object, event: MouseEvent) => void} config.onPick
 * @param {string} [config.className]  Class of the wrapper (default `choices`).
 * @returns {{ box: HTMLElement, buttons: HTMLButtonElement[], lock: (pickedId?: string) => void }}
 */
export function renderChoices({ container, options, onPick, className = 'choices' }) {
  const box = document.createElement('div');
  box.className = className;
  container.appendChild(box);

  const buttons = options.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'choice';
    if (option.id !== undefined) button.dataset.id = option.id;
    button.textContent = option.key ? `[${option.key}] ${option.label}` : option.label;
    button.addEventListener('click', (event) => onPick(option, event));
    box.appendChild(button);
    return button;
  });

  /** Disables every button and highlights the picked one (matched by `data-id`). */
  function lock(pickedId) {
    buttons.forEach((button) => {
      button.classList.add('locked');
      button.classList.toggle('picked', pickedId === undefined || button.dataset.id === pickedId);
      button.disabled = true;
    });
  }

  return { box, buttons, lock };
}
