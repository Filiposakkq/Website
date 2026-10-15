// The developer menu's routes (localhost and preview hostnames only, see developer-menu.js): each one jumps into the
// story at a chosen point with a fresh session. Nothing here runs on production.

import { TRACE } from './story-data/constants.js';
import { closeModal } from './modals.js';

/**
 * @param {object} deps
 * @param {(reason: string) => void} deps.beginSession  aborts the current run and starts a new session
 * @param {() => ReturnType<typeof import('./engine.js').createEngine>} deps.getEngine
 * @param {(trusted: string) => Promise<boolean>} deps.runLevel  the Level 01 shell; true when sdb9 was unlocked
 */
export function createDeveloperRoutes({
  beginSession, getEngine, runLevel, out, screen, line, wait, audio, caseFile, createTrace, closePrompt, reveal,
  logo, gfx, watcherTakeover, gameOver,
}) {
  const byId = (id) => document.getElementById(id);

  return async function runDeveloperRoute(route) {
    beginSession('developer route'); // stops the previous run completely, with a fresh session and skip state
    await Promise.resolve();
    closePrompt();
    closeModal(byId('launch'));
    closeModal(byId('powerPanel'));
    out.replaceChildren();
    byId('hud')?.remove();
    document.querySelectorAll('.elliot-echo, .ghost-sequence, .breach-sequence, .identity-surge, .hello-flight-layer')
      .forEach((element) => element.remove());
    screen.classList.remove('shutdown', 'intrusion', 'boot-entry', 'recovering', 'ghosted-hit', 'identity-lock');
    screen.style.opacity = '1';
    document.body.classList.remove('powering-down');
    byId('shutdownSequence').hidden = true;
    const trusted = route === 'puzzle-watcher' ? 'watcher' : 'unknown';
    caseFile.start(trusted);
    caseFile.chooseTrust(trusted);
    // Every route except `boot` skips the intro, where the story makes the board available: do it here.
    if (route !== 'boot') caseFile.makeAvailable();
    audio.setScene(route === 'boot' ? 'boot' : 'story');
    const engine = getEngine();
    const lethalTrace = (seconds) => {
      const trace = createTrace(seconds, 'lethal');
      trace.dock();
      return trace;
    };

    if (route === 'boot') {
      await engine.run();
    } else if (route === 'puzzle' || route === 'puzzle-watcher') {
      audio.setScene('puzzle');
      line(`LOCAL TEST ROUTE // LEVEL 01 // ${trusted.toUpperCase()}`, 'dim');
      lethalTrace(TRACE.afterTrust);
      if (await runLevel(trusted)) await engine.run({ from: 'unlock', state: { trusted } });
    } else if (route === 'ending') {
      audio.setScene('ghost');
      lethalTrace(TRACE.afterTrust);
      await engine.run({ from: 'unlock', state: { trusted } });
    } else if (route === 'identity') {
      await engine.run({ from: 'reveal', state: { trusted } });
    } else if (route === 'logo') {
      await logo(['FSOCIETY']);
    } else if (route === 'ghosted') {
      audio.setScene('ghost');
      const row = line('4097  ████████     PENDING', 'pending-record warn');
      audio.play('ghost-scan');
      await wait(900);
      audio.play('ghosted-stamp');
      reveal.stampGhosted(row);
      screen.classList.add('ghosted-hit');
      audio.play('glitch-rgb');
      await wait(700);
      screen.classList.remove('ghosted-hit');
    } else if (route === 'glitches') {
      for (const effect of ['rgb', 'slice', 'roll', 'invert', 'zoom']) await gfx(effect);
    } else if (route === 'takeover') {
      audio.setScene('puzzle');
      const trace = lethalTrace(TRACE.takeover);
      await watcherTakeover(trace);
      trace.halt(true);
    } else if (route === 'shutdown') {
      await gameOver({ halt() {} }, 'DEVELOPER SHUTDOWN TEST');
    }
  };
}
