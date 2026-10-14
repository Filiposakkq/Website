/**
 * Turns the data in patches.js into Web Audio nodes.
 *
 * Rules this file keeps:
 * - Every start/stop time is on the audio clock (`context.currentTime`). There is no setTimeout for audio
 *   lifetimes; nodes are stopped with `stop(time)` and cleaned up in `onended`.
 * - Envelope ramp times only ever increase, and the attack never exceeds 40% of the sound.
 * - Every source node is tracked, so `pendingNodes()` says how many are still scheduled or playing and
 *   `stopAll()` can silence them (used when the story session aborts).
 */

const FLOOR = 0.0001;
const MIN_DURATION = 0.01;
const TAIL = 0.02; // stop() slack after the envelope has reached the floor
const MIN_ATTACK = 0.001;

/**
 * Attack then decay on a gain AudioParam. The attack is clamped to 40% of the duration so the decay ramp can
 * never end before the attack ramp does (the old fixed 35 ms attack broke very short sounds).
 * @returns {{ attackEnd: number, end: number }} absolute times of the two ramp targets (`attackEnd < end`)
 */
export function envelope(param, start, peak, duration, attack = 0.035) {
  const length = Math.max(MIN_DURATION, duration);
  const rise = Math.max(MIN_ATTACK, Math.min(attack, length * 0.4));
  const attackEnd = start + rise;
  const end = start + length;
  param.setValueAtTime(FLOOR, start);
  param.exponentialRampToValueAtTime(Number.isFinite(peak) ? Math.max(FLOOR * 2, peak) : FLOOR * 2, attackEnd);
  param.exponentialRampToValueAtTime(FLOOR, end);
  return { attackEnd, end };
}

/**
 * Fades a gain param to silence from whatever value it has at `now`. Uses setTargetAtTime, which starts from
 * the current value; an exponential ramp would start from the end of the previous automation event and could
 * already be mostly done by `now` (that made beds drop in 20 ms instead of fading).
 */
function fadeToSilence(param, now, timeConstant) {
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(now);
  } else {
    const held = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(FLOOR, held), now);
  }
  param.setTargetAtTime(FLOOR, now, timeConstant);
}

/** Seconds from the start of the patch until its last layer has finished (excluding the tiny stop slack). */
export function patchDuration(patch) {
  const at = patch.at ?? 0;
  switch (patch.kind) {
    case 'tone':
    case 'noise':
    case 'fm':
      return at + Math.max(MIN_DURATION, patch.dur);
    case 'layers':
      return at + patch.layers.reduce((longest, layer) => Math.max(longest, patchDuration(layer)), 0);
    case 'variants':
      return at + patch.options.reduce((longest, option) => Math.max(longest, patchDuration(option)), 0);
    default:
      return 0;
  }
}

/**
 * @param {{ context: BaseAudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, random?: () => number }} options
 */
export function createRenderer({ context, destination, noiseBuffer, random = Math.random }) {
  /** Every group (one per played cue and one per bed) that still has live sources. */
  const groups = new Set();
  let liveSources = 0;
  const lastVariant = new WeakMap();

  const spread = (amount) => (random() * 2 - 1) * amount;

  function createGroup(bus, { bed = false } = {}) {
    const group = { bus, bed, nodes: [bus], sources: new Set() };
    groups.add(group);
    return group;
  }

  function track(group, source) {
    group.sources.add(source);
    liveSources++;
    source.addEventListener('ended', () => {
      group.sources.delete(source);
      liveSources--;
      if (group.sources.size === 0) {
        groups.delete(group);
        for (const node of group.nodes) node.disconnect();
      }
    }, { once: true });
  }

  function addNode(group, node) {
    group.nodes.push(node);
    return node;
  }

  function startSource(group, source, start, end) {
    track(group, source);
    source.start(start);
    source.stop(end + TAIL);
  }

  function noiseSource(group, filterType, freq, q) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;
    const filter = addNode(group, context.createBiquadFilter());
    filter.type = filterType;
    filter.frequency.value = Math.max(10, freq);
    filter.Q.value = q;
    source.connect(filter);
    group.nodes.push(source);
    return { source, filter };
  }

  function renderTone(patch, base, scale, jitter, group) {
    const start = base + (patch.at ?? 0);
    const duration = Math.max(MIN_DURATION, patch.dur);
    const startFreq = Math.max(1, patch.freq + random() * patch.spread);
    const oscillator = context.createOscillator();
    const gain = addNode(group, context.createGain());
    oscillator.type = patch.wave;
    oscillator.frequency.setValueAtTime(startFreq, start);
    if (patch.freqEnd !== patch.freq) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, patch.freqEnd), start + duration);
    }
    oscillator.detune.setValueAtTime(patch.detune + (jitter ? spread(jitter.detune) : 0), start);
    const peak = patch.gain * scale * (1 + (jitter ? spread(jitter.gain) : 0));
    const { end } = envelope(gain.gain, start, peak, duration, patch.attack);
    oscillator.connect(gain);
    gain.connect(group.bus);
    group.nodes.push(oscillator);
    if (patch.vibrato) {
      const lfo = context.createOscillator();
      const depth = addNode(group, context.createGain());
      lfo.frequency.value = patch.vibrato.rate;
      depth.gain.value = patch.vibrato.depth;
      lfo.connect(depth);
      depth.connect(oscillator.detune);
      group.nodes.push(lfo);
      startSource(group, lfo, start, end);
    }
    startSource(group, oscillator, start, end);
  }

  function renderNoise(patch, base, scale, jitter, group) {
    const start = base + (patch.at ?? 0);
    const duration = Math.max(MIN_DURATION, patch.dur);
    const startFreq = Math.max(10, patch.freq + random() * patch.spread);
    const { source, filter } = noiseSource(group, patch.filter, startFreq, patch.q);
    filter.frequency.setValueAtTime(startFreq, start);
    if (patch.freqEnd !== patch.freq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(10, patch.freqEnd), start + duration);
    }
    const gain = addNode(group, context.createGain());
    const peak = patch.gain * scale * (1 + (jitter ? spread(jitter.gain) : 0));
    const { end } = envelope(gain.gain, start, peak, duration, patch.attack);
    filter.connect(gain);
    gain.connect(group.bus);
    // Start somewhere random inside the looped noise so repeated clicks are not identical.
    source.start(start, random() * Math.max(0, noiseBuffer.duration - 0.1));
    track(group, source);
    source.stop(end + TAIL);
  }

  function renderFm(patch, base, scale, jitter, group) {
    const start = base + (patch.at ?? 0);
    const duration = Math.max(MIN_DURATION, patch.dur);
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = addNode(group, context.createGain());
    const gain = addNode(group, context.createGain());
    const sweep = patch.freqEnd !== patch.freq;
    carrier.type = patch.wave;
    carrier.frequency.setValueAtTime(patch.freq, start);
    modulator.frequency.setValueAtTime(patch.freq * patch.ratio, start);
    modGain.gain.setValueAtTime(Math.max(1, patch.freq * patch.index), start);
    if (sweep) {
      carrier.frequency.exponentialRampToValueAtTime(Math.max(1, patch.freqEnd), start + duration);
      modulator.frequency.exponentialRampToValueAtTime(Math.max(1, patch.freqEnd * patch.ratio), start + duration);
      modGain.gain.exponentialRampToValueAtTime(Math.max(1, patch.freqEnd * patch.index), start + duration);
    }
    carrier.detune.setValueAtTime(jitter ? spread(jitter.detune) : 0, start);
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    const peak = patch.gain * scale * (1 + (jitter ? spread(jitter.gain) : 0));
    const { end } = envelope(gain.gain, start, peak, duration, patch.attack);
    carrier.connect(gain);
    gain.connect(group.bus);
    group.nodes.push(carrier, modulator);
    startSource(group, modulator, start, end);
    startSource(group, carrier, start, end);
  }

  function renderPatch(patch, base, scale, jitter, group) {
    switch (patch.kind) {
      case 'tone': return renderTone(patch, base, scale, jitter, group);
      case 'noise': return renderNoise(patch, base, scale, jitter, group);
      case 'fm': return renderFm(patch, base, scale, jitter, group);
      case 'layers': {
        const layerBase = base + (patch.at ?? 0);
        for (const layer of patch.layers) renderPatch(layer, layerBase, scale, jitter, group);
        return undefined;
      }
      case 'variants': {
        let index = Math.floor(random() * patch.options.length);
        // Never the same variant twice in a row, so repeated cues do not machine-gun.
        if (patch.options.length > 1 && index === lastVariant.get(patch)) index = (index + 1) % patch.options.length;
        lastVariant.set(patch, index);
        return renderPatch(patch.options[index], base + (patch.at ?? 0), scale, jitter, group);
      }
      default:
        throw new Error(`Unknown patch kind: ${patch.kind}`);
    }
  }

  /**
   * Plays a patch.
   * @param {object} patch
   * @param {{ start?: number, gain?: number, jitter?: { detune: number, gain: number } | null }} [options]
   */
  function playPatch(patch, { start = context.currentTime, gain = 1, jitter = null } = {}) {
    const bus = context.createGain();
    bus.connect(destination);
    const group = createGroup(bus);
    renderPatch(patch, start, gain, jitter, group);
    if (group.sources.size === 0) {
      groups.delete(group);
      bus.disconnect();
    }
  }

  function modulate(group, param, { rate, amount }, start, end) {
    const lfo = context.createOscillator();
    const depth = addNode(group, context.createGain());
    lfo.frequency.value = rate;
    depth.gain.value = amount;
    lfo.connect(depth);
    depth.connect(param);
    group.nodes.push(lfo);
    track(group, lfo);
    lfo.start(start);
    lfo.stop(end);
  }

  function softClipCurve(drive) {
    const k = 1 + drive * 8;
    const curve = new Float32Array(2049);
    for (let index = 0; index < curve.length; index++) {
      const x = (index / (curve.length - 1)) * 2 - 1;
      curve[index] = Math.tanh(k * x) / k;
    }
    return curve;
  }

  /**
   * Starts a looping bed. Beds have no end time: they run until `stop()` fades them out and stops every
   * node on the audio clock.
   * @param {object} bed  an entry of BEDS
   * @param {string | null} scene  picks the extra layers in `bed.scenes`
   */
  function startBed(bed, scene = null, start = context.currentTime) {
    const bus = context.createGain();
    bus.gain.setValueAtTime(FLOOR, start);
    bus.gain.exponentialRampToValueAtTime(bed.level, start + bed.fadeIn);
    bus.connect(destination);
    const group = createGroup(bus, { bed: true });
    const extra = (scene && bed.scenes[scene]) || { layers: [], pulse: null };
    const pulse = extra.pulse ?? bed.pulse;
    // A bed lives until stop() is called; sources are scheduled far ahead and cut short by stop().
    const forever = start + 24 * 3600;

    const trem = addNode(group, context.createGain());
    trem.gain.value = pulse ? 1 - pulse.depth : 1;
    trem.connect(bus);
    let mixOut = trem;
    if (bed.drive > 0) {
      const shaper = addNode(group, context.createWaveShaper());
      shaper.curve = softClipCurve(bed.drive);
      shaper.oversample = '2x';
      shaper.connect(trem);
      mixOut = shaper;
    }
    if (pulse) modulate(group, trem.gain, { rate: pulse.rate, amount: pulse.depth }, start, forever);

    for (const layer of [...bed.layers, ...extra.layers]) {
      const gain = addNode(group, context.createGain());
      gain.gain.value = layer.gain;
      gain.connect(mixOut);
      let source;
      if (layer.kind === 'drone') {
        source = context.createOscillator();
        source.type = layer.wave;
        source.frequency.value = layer.freq;
        source.detune.value = layer.detune;
        source.connect(gain);
        group.nodes.push(source);
      } else {
        const noise = noiseSource(group, layer.filter, layer.freq, layer.q);
        source = noise.source;
        noise.filter.connect(gain);
        if (layer.sweep) modulate(group, noise.filter.frequency, { rate: layer.sweep.rate, amount: layer.sweep.depth }, start, forever);
      }
      if (layer.breath) modulate(group, gain.gain, { rate: layer.breath.rate, amount: layer.gain * layer.breath.depth }, start, forever);
      track(group, source);
      source.start(start, layer.kind === 'hiss' ? random() * Math.max(0, noiseBuffer.duration - 0.1) : 0);
      source.stop(forever);
    }

    return {
      /** Fades out and stops every node at `now + fadeOut` on the audio clock. */
      stop(now = context.currentTime, fadeOut = bed.fadeOut) {
        // Time constant fadeOut / 7: about -60 dB when the nodes are stopped, so nothing is cut audibly.
        fadeToSilence(bus.gain, now, fadeOut / 7);
        for (const source of group.sources) source.stop(now + fadeOut + 0.05);
      },
    };
  }

  /**
   * Silences every playing and scheduled sound after a very short fade (a hard cut would click).
   * `beds: false` leaves the ambient bed alone (the caller fades it with its own, longer fade).
   */
  function stopAll({ beds = true, fade = 0.03 } = {}) {
    const now = context.currentTime;
    for (const group of groups) {
      if (group.bed && !beds) continue;
      fadeToSilence(group.bus.gain, now, fade / 6);
      for (const source of group.sources) source.stop(now + fade);
    }
  }

  return {
    playPatch,
    startBed,
    stopAll,
    /** Source nodes that are scheduled or playing and have not ended yet (for tests). */
    pendingNodes: () => liveSources,
  };
}
