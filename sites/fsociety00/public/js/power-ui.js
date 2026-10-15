// The launch screen sequence (INITIALIZE) and the reboot sequence (REBOOT SYSTEM after a game over). Both end by
// starting the story in a fresh state.

import { openModal, closeModal } from './modals.js';

/**
 * @param {object} deps
 * @param {(reason: string) => void} deps.beginSession
 * @param {() => Promise<void>} deps.startStory
 */
export function createPowerUi({ beginSession, startStory, screen, out, line, wait, audio, caseFile, setRain }) {
  const byId = (id) => document.getElementById(id);
  const launch = byId('launch');
  const initialize = byId('initialize');
  const initializeLabel = initialize.querySelector('.initialize-label');
  const launchStatus = byId('launchStatus');
  const panel = byId('powerPanel');
  const restart = byId('restartControl');
  const title = byId('powerTitle');
  const status = byId('powerStatus');
  const bootLog = byId('powerBootLog');

  const REBOOT_STAGES = [
    'DISPLAY RAILS ONLINE', 'FRAME BUFFER SYNCHRONIZED', 'LOCAL CONSOLE MOUNTED', 'GUEST SESSION READY', 'LINK STABLE',
  ];
  const LAUNCH_STAGES = ['NEGOTIATING DISPLAY MODE', 'VERIFYING LOCAL CONSOLE', 'OPENING GUEST SESSION'];

  async function launchStory() {
    if (initialize.disabled) return;
    audio.setScene('boot');
    void audio.unlock().then(() => {
      audio.play('power-on');
    }).catch((error) => {
      console.error('Scene audio could not be started from the initialize action.', error);
    });
    initialize.disabled = true;
    caseFile.start();
    launch.classList.add('initializing');
    for (const stage of LAUNCH_STAGES) {
      launchStatus.textContent = stage;
      await wait(500);
    }
    await wait(250);
    launch.classList.add('departing');
    await wait(520);
    closeModal(launch);
    launch.classList.remove('initializing', 'departing');
    initialize.disabled = false;
    initializeLabel.textContent = '[ INITIALIZE SYSTEM ]';
    launchStatus.textContent = '';
    screen.classList.add('boot-entry');
    void startStory();
    await wait(1050);
    screen.classList.remove('boot-entry');
  }

  async function resetGame() {
    restart.disabled = true;
    beginSession('reboot'); // abort the previous run for good, then start a fresh session
    await Promise.resolve(); // let the aborted chains unwind before touching the DOM
    audio.setScene('idle');
    audio.play('reboot');
    panel.classList.add('rebooting');
    screen.classList.remove('shutdown', 'intrusion');
    screen.style.opacity = '1';
    out.replaceChildren();
    title.innerHTML = 'RESTORING<br>CONSOLE';
    status.innerHTML = 'LOCAL DISPLAY <span>///</span> LINK INITIALIZATION';
    restart.textContent = '[ REINITIALIZING... ]';
    for (const stage of REBOOT_STAGES) {
      bootLog.textContent = stage;
      await wait(680);
    }
    await wait(800);
    panel.classList.remove('rebooting');
    closeModal(panel);
    screen.classList.add('recovering');
    title.innerHTML = 'SESSION<br>TERMINATED';
    status.innerHTML = 'REMOTE SESSION CLOSED <span>///</span> LOCAL DISPLAY OFFLINE';
    bootLog.textContent = 'AWAITING LOCAL INPUT';
    restart.textContent = '[ REBOOT SYSTEM ]';
    restart.disabled = false;
    document.body.classList.remove('powering-down');
    setRain(0, true);
    window.scrollTo(0, 0);
    byId('hud')?.remove();
    caseFile.start();
    line('LOCAL CONSOLE RESTORED', 'dim');
    audio.setScene('boot');
    void startStory();
    await wait(1900);
    screen.classList.remove('recovering');
  }

  return {
    open: () => openModal(launch),
    launchStory,
    resetGame,
    initialize,
    restart,
  };
}
