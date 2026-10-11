const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLocalDevelopment() {
  return LOCAL_HOSTS.has(location.hostname);
}

export function installDeveloperMenu(onAction) {
  if (!isLocalDevelopment()) return;

  const trigger = document.createElement('button');
  trigger.className = 'developer-trigger';
  trigger.type = 'button';
  trigger.textContent = 'DEV';
  trigger.setAttribute('aria-label', 'Open local developer controls');
  trigger.addEventListener('click', async () => {
    trigger.disabled = true;
    try {
      await openDeveloperMenu(onAction);
    } finally {
      trigger.disabled = false;
    }
  });
  document.body.appendChild(trigger);
}

function openDeveloperMenu(onAction) {
  const overlay = document.createElement('div');
  overlay.className = 'developer-overlay';
  overlay.setAttribute('role', 'presentation');
  const dialog = document.createElement('section');
  dialog.className = 'developer-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'developer-title');

  const header = document.createElement('div');
  header.className = 'developer-header';
  const label = document.createElement('div');
  label.className = 'developer-kicker';
  label.textContent = 'LOCAL BUILD // TEST CONTROLS';
  const title = document.createElement('h2');
  title.id = 'developer-title';
  title.textContent = 'DEVELOPER CONSOLE';
  header.append(label, title);

  const groups = [
    ['JUMP TO', [
      ['boot', 'BIOS / INTRO', 'Run the full startup sequence from the beginning.'],
      ['puzzle', 'LEVEL 01 // PUZZLE', 'Start directly at the two-minute terminal puzzle.'],
      ['puzzle-watcher', 'LEVEL 01 // WATCHER ROUTE', 'Test the watcher branch and its isolation decision.'],
      ['ending', 'GHOST SEQUENCE', 'Jump to the unlock flow and run the ghost sequence.'],
      ['identity', 'MR. ROBOT REVEAL', 'Play the identity reveal and dialogue.'],
    ]],
    ['PLAY ANIMATION', [
      ['logo', 'FSOCIETY WORDMARK', 'Replay the logo reveal.'],
      ['ghosted', 'GHOSTED STAMP', 'Preview the erased-user transformation.'],
      ['glitches', 'GLITCH SUITE', 'Preview the screen distortion effects.'],
      ['takeover', 'WATCHER TAKEOVER', 'Play the watcher closing the guest session.'],
      ['shutdown', 'CRT SHUTDOWN', 'Play the shutdown and reboot controls.'],
    ]],
  ];

  return new Promise((resolve) => {
    let closed = false;
    const close = (result = null) => {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.remove();
      resolve(result);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };

    const list = document.createElement('div');
    list.className = 'developer-groups';
    groups.forEach(([groupName, actions]) => {
      const group = document.createElement('section');
      group.className = 'developer-group';
      const heading = document.createElement('h3');
      heading.className = 'developer-group-title';
      heading.textContent = groupName;
      const buttons = document.createElement('div');
      buttons.className = 'developer-actions';
      actions.forEach(([action, name, description]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'developer-action';
        button.dataset.action = action;
        const nameNode = document.createElement('span');
        nameNode.className = 'developer-action-name';
        nameNode.textContent = name;
        const descriptionNode = document.createElement('span');
        descriptionNode.className = 'developer-action-description';
        descriptionNode.textContent = description;
        button.append(nameNode, descriptionNode);
        button.addEventListener('click', () => {
          close(action);
          onAction(action);
        });
        buttons.appendChild(button);
      });
      group.append(heading, buttons);
      list.appendChild(group);
    });

    const footer = document.createElement('div');
    footer.className = 'developer-footer';
    const note = document.createElement('span');
    note.textContent = 'AVAILABLE ON LOCAL HOST ONLY';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'developer-close';
    closeButton.textContent = '[ CLOSE ]';
    closeButton.addEventListener('click', () => close());
    footer.append(note, closeButton);
    dialog.append(header, list, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener('pointerdown', (event) => {
      if (event.target === overlay) close();
    });
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);
    dialog.querySelector('button')?.focus();
  });
}
