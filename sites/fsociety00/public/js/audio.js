import { ALIASES, BEDS, CUES, DEFAULT_JITTER, REACTIVE, SCENES } from './audio/patches.js';
import { createRenderer, patchDuration } from './audio/render.js';

const HELLO_CLIP_URL = CUES['hello-friend'].patch.url;
const MASTER_GAIN = 0.52;
/** Output ceiling: the soft clip at the end of the master chain keeps every sample below this (about -1 dBFS). */
const CEILING = 0.89;

/**
 * The game's audio controller: `{ unlock, setScene, play, list, duration, stopAll, dispose, pendingNodes, prepare }`.
 * The sounds themselves are data in `audio/patches.js`; `audio/render.js` turns them into Web Audio nodes.
 *
 * @param {{ context?: BaseAudioContext, random?: () => number, now?: () => number }} [options]
 *        `context` and `random` are for tests (tools/audio-lint.mjs passes an OfflineAudioContext and a seeded
 *        random); the game never passes them. `now` is the wall clock used by the per-cue rate limiter.
 */
export function createAudioController({
  context: providedContext = null,
  random = Math.random,
  now = () => performance.now(),
} = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let renderer = null;
  let activeBed = null; // { key, stop }
  const voiceClip = new Audio(HELLO_CLIP_URL);
  voiceClip.preload = 'auto';
  voiceClip.volume = 0.86;
  let voiceReady = false;
  let currentScene = 'idle';
  const lastPlayed = new Map();
  const warned = new Set();

  function warnOnce(key, message) {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(message);
  }

  function ensureContext() {
    if (context) return true;
    if (!providedContext && !AudioContextClass) throw new Error('Web Audio is not supported by this browser.');

    context = providedContext ?? new AudioContextClass();
    master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.24;
    master.gain.value = MASTER_GAIN;

    // Last stage: a soft clip. Input beyond +-1 is clamped to the curve's end, so nothing can leave above CEILING.
    const limiter = context.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let index = 0; index < curve.length; index++) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = CEILING * Math.tanh(x / CEILING);
    }
    limiter.curve = curve;
    limiter.oversample = '2x';

    master.connect(compressor);
    compressor.connect(limiter);
    limiter.connect(context.destination);

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = random() * 2 - 1;
    }
    renderer = createRenderer({ context, destination: master, noiseBuffer, random });
    return true;
  }

  // ---- beds / scenes ----

  function resolveScene(scene) {
    if (Object.hasOwn(SCENES, scene)) {
      const target = SCENES[scene];
      return target ? { bed: target.bed, scene: target.scene ?? null } : null;
    }
    if (Object.hasOwn(BEDS, scene)) return { bed: scene, scene: BEDS[scene].defaultScene };
    warnOnce(`scene:${scene}`, `Unknown audio scene: ${scene}`);
    return null;
  }

  function setScene(scene) {
    currentScene = scene;
    if (!context) return; // remembered; unlock() starts the bed
    const target = resolveScene(scene);
    const key = target ? `${target.bed}:${target.scene ?? ''}` : null;
    if (activeBed && activeBed.key === key) return; // already playing this bed: do not restart it
    if (activeBed) {
      activeBed.stop(context.currentTime);
      activeBed = null;
    }
    if (target) {
      const bed = renderer.startBed(BEDS[target.bed], target.scene);
      activeBed = { key, stop: bed.stop };
    }
  }

  // ---- cues ----

  function resolveCue(name) {
    const real = Object.hasOwn(ALIASES, name) ? ALIASES[name] : name;
    return Object.hasOwn(CUES, real) ? { name: real, cue: CUES[real] } : null;
  }

  /** Per-cue rate limit (`cue.rate` = plays per second at most). */
  function allowed(name, perSecond) {
    const time = now();
    if (time - (lastPlayed.get(name) ?? -Infinity) < 1000 / perSecond) return false;
    lastPlayed.set(name, time);
    return true;
  }

  function playVoice() {
    if (!voiceReady) {
      console.error('The hello friend voice clip is not unlocked yet.');
      return;
    }
    voiceClip.currentTime = 0;
    void voiceClip.play().catch((error) => {
      console.error('The hello friend voice clip could not be played.', error);
    });
  }

  /**
   * @param {string} name  a cue from `list()`; unknown names warn once and are ignored
   * @param {{ gain?: number, secondsLeft?: number }} [params]  `gain` scales the level; reactive cues read the rest
   */
  function play(name, params = {}) {
    if (!context) return;
    const found = resolveCue(name);
    if (!found) {
      warnOnce(`cue:${name}`, `Unknown audio cue: ${name}`);
      return;
    }
    const { name: cueName, cue } = found;
    if (cue.rate && !allowed(cueName, cue.rate)) return;
    if (cue.patch.kind === 'clip') {
      playVoice();
      return;
    }
    const patch = REACTIVE[cueName] ? REACTIVE[cueName](params, cue.patch) : cue.patch;
    const jitter = cue.jitter === false ? null : { ...DEFAULT_JITTER, ...cue.jitter };
    renderer.playPatch(patch, { start: context.currentTime, gain: params.gain ?? 1, jitter });
  }

  /** Length in seconds of a cue (for a reactive cue with the given params), or null for a clip or unknown name. */
  function duration(name, params = {}) {
    const found = resolveCue(name);
    if (!found || found.cue.patch.kind === 'clip') return null;
    const patch = REACTIVE[found.name] ? REACTIVE[found.name](params, found.cue.patch) : found.cue.patch;
    return patchDuration(patch);
  }

  /** The registry: every cue, alias and bed with its category and description (the phase 7 preview panel reads this). */
  function list() {
    const entries = Object.entries(CUES).map(([name, cue]) => ({
      name,
      kind: 'cue',
      category: cue.category,
      description: cue.description,
      synth: cue.patch.kind !== 'clip',
      duration: duration(name),
      reactive: Object.hasOwn(REACTIVE, name),
      rate: cue.rate ?? null,
      samples: cue.samples ?? null,
      usedBy: cue.usedBy ?? null,
    }));
    for (const [alias, target] of Object.entries(ALIASES)) {
      entries.push({
        name: alias,
        kind: 'alias',
        aliasOf: target,
        category: CUES[target].category,
        description: CUES[target].description,
        synth: CUES[target].patch.kind !== 'clip',
        duration: duration(target),
        reactive: Object.hasOwn(REACTIVE, target),
        rate: CUES[target].rate ?? null,
        samples: CUES[target].samples ?? null,
        usedBy: CUES[target].usedBy ?? null,
      });
    }
    for (const [name, bed] of Object.entries(BEDS)) {
      entries.push({
        name,
        kind: 'bed',
        category: bed.category,
        description: bed.description,
        synth: true,
        duration: null,
        scenes: Object.keys(bed.scenes),
        usedBy: null,
      });
    }
    return entries;
  }

  // ---- lifecycle ----

  function unlock() {
    ensureContext();
    voiceClip.muted = true;
    const voiceUnlock = voiceClip.play().then(() => {
      voiceClip.pause();
      voiceClip.currentTime = 0;
      voiceClip.muted = false;
      voiceReady = true;
    }).catch((error) => {
      voiceClip.muted = false;
      console.error('Could not unlock the hello friend voice clip.', error);
    });
    const contextUnlock = context.resume();
    return Promise.all([voiceUnlock, contextUnlock]).then(() => {
      master.gain.setTargetAtTime(MASTER_GAIN, context.currentTime, 0.04);
      setScene(currentScene);
    }).catch((error) => {
      console.error('Could not start required scene audio.', error);
      throw error;
    });
  }

  /**
   * Silences everything now (short fade): scheduled and playing cues and the voice clip, and the ambient bed
   * unless `beds` is false (then the caller fades the bed itself with `setScene('idle')`).
   * @param {{ beds?: boolean }} [options]
   */
  function stopAll({ beds = true } = {}) {
    if (renderer) renderer.stopAll({ beds });
    if (beds) activeBed = null;
    voiceClip.pause();
    voiceClip.currentTime = 0;
  }

  /** `stopAll()` and forget the scene. The controller can be used again afterwards. */
  function dispose() {
    stopAll();
    currentScene = 'idle';
  }

  /** Creates the audio graph without unlocking audio or loading the voice clip. For tests. */
  function prepare() {
    ensureContext();
    return context;
  }

  return {
    unlock,
    setScene,
    play,
    list,
    duration,
    stopAll,
    dispose,
    /** Source nodes still scheduled or playing (tests only; there is no global for it). */
    pendingNodes: () => (renderer ? renderer.pendingNodes() : 0),
    prepare,
  };
}
