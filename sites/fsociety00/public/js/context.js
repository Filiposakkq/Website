// The GameContext is the one object the level / story modules receive instead of a long
// list of loose parameters. It is built once per session by story.js.

/**
 * @typedef {object} TerminalApi
 * @property {(options?: { signal?: AbortSignal }) => Promise<string|null>} readCommand
 *           Resolves with the typed line, `null` after `abort()`, rejects with an AbortError when
 *           its session aborts.
 * @property {() => void} abort   Resolves a pending readCommand() with null (tap / timer end).
 * @property {() => void} close   Hides the prompt line.
 */

/**
 * @typedef {object} TraceApi
 * @property {(seconds: number) => object} create  Replaces the current trace HUD with a new one.
 * @property {() => (object|null)} current         The active trace, if any.
 */

/**
 * @typedef {object} GameContext
 * @property {HTMLElement} out        The #output element.
 * @property {HTMLElement} screen     The #screen element.
 * @property {(text?: string, cls?: string, options?: object) => HTMLElement} line
 * @property {(text: string, cls?: string, speed?: number, options?: object) => Promise<HTMLElement>} type
 * @property {(text: string|object[], options?: object) => Promise<HTMLElement>} say
 * @property {(text: string, speed?: number, pause?: number) => Promise<void>} cmd
 * @property {(ms: number) => Promise<void>} wait   Skip/reduced-motion aware, abortable.
 * @property {ReturnType<typeof import('./session.js').createSession>} session
 * @property {(name: string) => Promise<void>} gfx
 * @property {() => Promise<void>} flash
 * @property {(ms?: number) => Promise<void>} staticBurst
 * @property {(rounds?: number) => Promise<void>} corrupt
 * @property {{ play: (cue: string) => void, setScene: (scene: string) => void }} audio
 * @property {object} caseFile
 * @property {TraceApi} trace
 * @property {TerminalApi} terminal
 * @property {(trace: object, reason: string) => Promise<void>} gameOver
 * @property {(trace: object) => Promise<void>} takeover
 * @property {() => void} revealSourcePart   Whispers the third key part to the console.
 * @property {() => boolean} motionReduced
 * @property {() => boolean} isSkipping
 */

const REQUIRED = [
  'out', 'screen', 'line', 'type', 'say', 'cmd', 'wait', 'session', 'gfx', 'flash', 'staticBurst',
  'corrupt', 'audio', 'caseFile', 'trace', 'terminal', 'gameOver', 'takeover', 'revealSourcePart',
  'motionReduced', 'isSkipping',
];

/**
 * Builds a frozen GameContext. Fails immediately when a member is missing, so a forgotten
 * dependency is a startup error instead of a crash in the middle of a level.
 *
 * @param {Partial<GameContext>} parts
 * @returns {GameContext}
 */
export function createGameContext(parts) {
  const missing = REQUIRED.filter((key) => parts[key] === undefined || parts[key] === null);
  if (missing.length) throw new Error(`GameContext is missing: ${missing.join(', ')}`);
  const { terminal } = parts;
  for (const key of ['readCommand', 'abort', 'close']) {
    if (typeof terminal[key] !== 'function') throw new Error(`GameContext.terminal.${key} must be a function`);
  }
  return Object.freeze({ ...parts });
}
