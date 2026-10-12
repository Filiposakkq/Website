const HELLO_CLIP_URL = './audio/hello-friend-mr-robot.mp3';

/**
 * @param {{ context?: BaseAudioContext }} [options]  `context` is for tests: pass an OfflineAudioContext
 *        to render every cue without a speaker (see tools/smoke.mjs). The game never passes it.
 */
export function createAudioController({ context: providedContext = null } = {}) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  let context = null;
  let master = null;
  let compressor = null;
  let noiseBuffer = null;
  let activeBed = null;
  const voiceClip = new Audio(HELLO_CLIP_URL);
  voiceClip.preload = 'auto';
  voiceClip.volume = 0.86;
  let voiceReady = false;
  let currentScene = 'idle';

  function ensureContext() {
    if (context) return true;
    if (!providedContext && !AudioContextClass) throw new Error('Web Audio is not supported by this browser.');

    context = providedContext ?? new AudioContextClass();
    master = context.createGain();
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.24;
    master.gain.value = 0.52;
    master.connect(compressor);
    compressor.connect(context.destination);

    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.random() * 2 - 1;
    }
    return true;
  }

  // Attack/hold/decay. Short sounds used to ramp up for a fixed 35 ms even when they lasted less than
  // that, so the decay ramp ended before the attack ramp did. The attack is now a fraction of the
  // duration and the hold point is clamped between the end of the attack and the end of the sound.
  function envelope(gain, start, peak, duration, hold = 0) {
    const level = Math.max(0.0001, peak);
    const attack = Math.min(0.035, duration * 0.4);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(level, start + attack);
    if (hold > 0) gain.gain.setValueAtTime(level, start + Math.max(attack, Math.min(hold, duration)));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  }

  function tone(frequency, duration, {
    endFrequency = frequency,
    type = 'sine',
    volume = 0.12,
    delay = 0,
    destination = master,
  } = {}) {
    if (!context) return;
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    envelope(gain, start, volume, duration);
    oscillator.connect(gain);
    gain.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  function noise(duration, {
    cutoff = 1500,
    volume = 0.04,
    delay = 0,
    type = 'lowpass',
  } = {}) {
    if (!context || !noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    source.loop = true;
    filter.type = type;
    filter.frequency.setValueAtTime(cutoff, start);
    envelope(gain, start, volume, duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start);
    source.stop(start + duration + 0.05);
  }

  function keyImpact(delay, frequency, volume, duration) {
    if (!context || !noiseBuffer) return;
    const start = context.currentTime + delay;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(frequency, start);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(start, Math.random() * 1.8, duration);
    source.stop(start + duration + 0.005);
  }

  function makeBed(scene) {
    const now = context.currentTime;
    const bus = context.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.gain.exponentialRampToValueAtTime(0.14, now + 0.9);
    bus.connect(master);
    const nodes = [bus];

    const addDrone = (frequency, volume, type = 'sine', detune = 0) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(bus);
      oscillator.start();
      nodes.push(oscillator, gain);
    };
    const addFilteredNoise = (cutoff, volume) => {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = noiseBuffer;
      source.loop = true;
      filter.type = 'lowpass';
      filter.frequency.value = cutoff;
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(bus);
      source.start();
      nodes.push(source, filter, gain);
    };
    const addPulse = (rate, depth) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = rate;
      gain.gain.value = depth;
      oscillator.connect(gain);
      gain.connect(bus.gain);
      oscillator.start();
      nodes.push(oscillator, gain);
    };

    if (scene === 'boot') {
      addDrone(49, 0.24, 'triangle');
      addDrone(73.4, 0.08, 'sine', -7);
      addFilteredNoise(230, 0.12);
      addPulse(0.65, 0.018);
    } else if (scene === 'story') {
      addDrone(42, 0.19, 'sine');
      addFilteredNoise(1150, 0.16);
      addFilteredNoise(2900, 0.025);
      addPulse(0.18, 0.012);
    } else if (scene === 'puzzle') {
      addDrone(55, 0.16, 'triangle');
      addDrone(82.4, 0.06, 'sine', 5);
      addFilteredNoise(420, 0.1);
      addFilteredNoise(1700, 0.018);
      addPulse(0.42, 0.014);
    } else if (scene === 'ghost') {
      addDrone(36.7, 0.22, 'sine');
      addDrone(55, 0.08, 'triangle');
      addFilteredNoise(260, 0.1);
      addFilteredNoise(2200, 0.018);
      addPulse(0.12, 0.022);
    } else if (scene === 'reveal') {
      addDrone(41.2, 0.18, 'sine');
      addDrone(61.7, 0.1, 'triangle', -3);
      addDrone(164.8, 0.025, 'sine', 6);
      addFilteredNoise(3600, 0.014);
      addPulse(0.08, 0.01);
    } else if (scene === 'shutdown') {
      addDrone(46.2, 0.16, 'sawtooth');
      addFilteredNoise(180, 0.09);
      addPulse(0.9, 0.025);
    }
    return { bus, nodes };
  }

  function stopBed() {
    if (!activeBed || !context) return;
    const oldBed = activeBed;
    const end = context.currentTime + 0.5;
    oldBed.bus.gain.cancelScheduledValues(context.currentTime);
    oldBed.bus.gain.setTargetAtTime(0.0001, context.currentTime, 0.09);
    window.setTimeout(() => {
      oldBed.nodes.forEach((node) => {
        if (typeof node.stop === 'function') {
          try {
            node.stop();
          } catch (error) {
            if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
          }
        }
        node.disconnect();
      });
    }, Math.max(0, (end - context.currentTime) * 1000));
    activeBed = null;
  }

  function setScene(scene) {
    currentScene = scene;
    if (!context || scene === 'idle') {
      stopBed();
      return;
    }
    stopBed();
    activeBed = makeBed(scene);
  }

  function play(effect) {
    if (!context) return;
    switch (effect) {
      case 'power-on':
        tone(392, 0.42, { type: 'sine', volume: 0.12 });
        tone(587.3, 0.55, { type: 'sine', volume: 0.09, delay: 0.12 });
        tone(784, 0.36, { type: 'triangle', volume: 0.035, delay: 0.48 });
        noise(0.7, { cutoff: 190, volume: 0.028, type: 'lowpass' });
        break;
      case 'boot-memory':
        [110, 164.8, 220, 329.6].forEach((frequency, index) => {
          tone(frequency, 0.1, { type: 'sine', volume: 0.045, delay: index * 0.13 });
        });
        break;
      case 'boot-prompt':
        tone(246.9, 0.12, { type: 'sine', volume: 0.04 });
        tone(369.9, 0.16, { type: 'triangle', volume: 0.03, delay: 0.08 });
        break;
      case 'boot-checkpoint':
        tone(660, 0.07, { type: 'square', volume: 0.016 });
        tone(990, 0.085, { type: 'sine', volume: 0.019, delay: 0.045 });
        break;
      case 'kernel-tick':
        tone(1180 + Math.random() * 180, 0.025, { type: 'square', volume: 0.009 });
        break;
      case 'relay-hop':
        tone(430, 0.065, { type: 'sine', volume: 0.025 });
        tone(640, 0.085, { type: 'triangle', volume: 0.019, delay: 0.055 });
        break;
      case 'typewriter-start':
        noise(0.055, { cutoff: 1950, volume: 0.022, type: 'highpass' });
        tone(118, 0.075, { type: 'triangle', volume: 0.014, delay: 0.018 });
        break;
      case 'elliot-echo':
        tone(61.7, 0.9, { type: 'sine', volume: 0.085, endFrequency: 36.7 });
        noise(0.72, { cutoff: 510, volume: 0.045, type: 'bandpass', delay: 0.08 });
        tone(740, 0.32, { type: 'triangle', volume: 0.03, delay: 0.3, endFrequency: 185 });
        break;
      case 'trace-appear':
        tone(49, 0.68, { type: 'sine', volume: 0.09, endFrequency: 73.4 });
        tone(146.8, 0.42, { type: 'triangle', volume: 0.05, delay: 0.22, endFrequency: 220 });
        noise(0.45, { cutoff: 1100, volume: 0.025, type: 'lowpass' });
        break;
      case 'progress-start':
        tone(164.8, 0.16, { type: 'sine', volume: 0.025, endFrequency: 220 });
        break;
      case 'progress-tick':
        tone(520 + Math.random() * 120, 0.035, { type: 'sine', volume: 0.012 });
        break;
      case 'progress-complete':
        tone(523.3, 0.11, { type: 'sine', volume: 0.025 });
        tone(659.3, 0.15, { type: 'sine', volume: 0.028, delay: 0.075 });
        break;
      case 'puzzle-start':
        tone(55, 0.55, { type: 'sine', volume: 0.075, endFrequency: 73.4 });
        tone(440, 0.2, { type: 'triangle', volume: 0.025, delay: 0.2 });
        break;
      case 'ghost-step':
        tone(196, 0.09, { type: 'sine', volume: 0.035 });
        tone(392, 0.14, { type: 'triangle', volume: 0.032, delay: 0.08 });
        break;
      case 'ghost-scan':
        tone(39, 0.9, { type: 'sine', volume: 0.11, endFrequency: 31 });
        tone(1046.5, 0.36, { type: 'triangle', volume: 0.025, delay: 0.24, endFrequency: 523.3 });
        noise(0.65, { cutoff: 340, volume: 0.03, type: 'lowpass' });
        break;
      case 'mail-arrive':
        tone(587.3, 0.1, { type: 'sine', volume: 0.045 });
        tone(880, 0.18, { type: 'sine', volume: 0.04, delay: 0.1 });
        break;
      case 'list-hit':
        tone(246.9, 0.09, { type: 'square', volume: 0.025 });
        noise(0.08, { cutoff: 1500, volume: 0.012, type: 'highpass', delay: 0.035 });
        break;
      case 'drive-seek':
        tone(145, 0.38, { type: 'triangle', volume: 0.055, endFrequency: 82 });
        tone(720, 0.09, { type: 'square', volume: 0.018, delay: 0.16 });
        noise(0.32, { cutoff: 620, volume: 0.035, type: 'bandpass' });
        break;
      case 'kernel-start':
        tone(55, 0.62, { type: 'sine', volume: 0.1, endFrequency: 38 });
        tone(440, 0.2, { type: 'triangle', volume: 0.045, delay: 0.15 });
        tone(660, 0.24, { type: 'triangle', volume: 0.04, delay: 0.34 });
        break;
      case 'service':
        tone(1050, 0.055, { type: 'square', volume: 0.018 });
        tone(1570, 0.07, { type: 'sine', volume: 0.014, delay: 0.045 });
        break;
      case 'service-ready':
        tone(523.3, 0.1, { type: 'sine', volume: 0.035 });
        tone(784, 0.17, { type: 'sine', volume: 0.04, delay: 0.08 });
        break;
      case 'terminal-open':
        tone(98, 0.28, { type: 'triangle', volume: 0.05, endFrequency: 73.4 });
        tone(392, 0.08, { type: 'square', volume: 0.022, delay: 0.18 });
        break;
      case 'key-tap':
        keyImpact(0, 1850 + Math.random() * 650, 0.038, 0.024);
        keyImpact(0.026, 1150 + Math.random() * 500, 0.022, 0.03);
        tone(135 + Math.random() * 35, 0.045, {
          type: 'triangle',
          volume: 0.018,
          endFrequency: 82,
        });
        break;
      case 'command-submit':
        tone(740, 0.045, { type: 'square', volume: 0.018 });
        tone(1108.7, 0.085, { type: 'sine', volume: 0.026, delay: 0.045 });
        break;
      case 'message':
        tone(520, 0.09, { type: 'sine', volume: 0.018 });
        tone(780, 0.12, { type: 'triangle', volume: 0.022, delay: 0.08 });
        break;
      case 'success':
        [392, 523.3, 659.3, 784].forEach((frequency, index) => {
          tone(frequency, 0.3, { type: 'sine', volume: 0.045, delay: index * 0.12 });
        });
        break;
      case 'failure':
        tone(190, 0.42, { type: 'sawtooth', volume: 0.06, endFrequency: 65 });
        noise(0.3, { cutoff: 420, volume: 0.028 });
        break;
      case 'hint':
        tone(392, 0.12, { type: 'triangle', volume: 0.035 });
        tone(311.1, 0.16, { type: 'sine', volume: 0.03, delay: 0.13 });
        break;
      case 'trace-tick':
        tone(880, 0.035, { type: 'square', volume: 0.012 });
        break;
      case 'trace-status':
        tone(630, 0.07, { type: 'triangle', volume: 0.02 });
        tone(945, 0.09, { type: 'sine', volume: 0.018, delay: 0.065 });
        break;
      case 'trace-critical':
        [0, 0.18, 0.36].forEach((delay) => {
          tone(660, 0.11, { type: 'square', volume: 0.04, delay });
        });
        break;
      case 'trace-expired':
        tone(880, 0.85, { type: 'sine', volume: 0.09, endFrequency: 55 });
        noise(0.6, { cutoff: 850, volume: 0.04, type: 'bandpass' });
        break;
      case 'network-lock':
        tone(330, 0.24, { type: 'sine', volume: 0.06, endFrequency: 495 });
        tone(660, 0.32, { type: 'triangle', volume: 0.035, delay: 0.16 });
        noise(0.28, { cutoff: 2100, volume: 0.018, type: 'bandpass' });
        break;
      case 'disk-unseal':
        tone(82, 0.72, { type: 'sawtooth', volume: 0.065, endFrequency: 41 });
        tone(246.9, 0.38, { type: 'triangle', volume: 0.05, delay: 0.2, endFrequency: 493.9 });
        noise(0.55, { cutoff: 360, volume: 0.035 });
        break;
      case 'trace-warning':
        tone(880, 0.17, { type: 'square', volume: 0.055 });
        tone(740, 0.16, { type: 'square', volume: 0.045, delay: 0.21 });
        tone(880, 0.22, { type: 'square', volume: 0.052, delay: 0.42 });
        break;
      case 'transmission':
        tone(520, 0.42, { type: 'sine', volume: 0.05, endFrequency: 570 });
        tone(760, 0.29, { type: 'triangle', volume: 0.035, delay: 0.18 });
        noise(0.65, { cutoff: 2800, volume: 0.022, type: 'bandpass' });
        break;
      case 'disconnect':
        tone(740, 0.28, { type: 'sine', volume: 0.055, endFrequency: 320 });
        noise(0.18, { cutoff: 3400, volume: 0.025, type: 'highpass', delay: 0.12 });
        break;
      case 'incoming-call':
        [0, 0.32, 0.82].forEach((delay) => {
          tone(660, 0.13, { type: 'sine', volume: 0.035, delay });
          tone(880, 0.16, { type: 'sine', volume: 0.03, delay: delay + 0.08 });
        });
        break;
      case 'file-read':
        noise(0.11, { cutoff: 900, volume: 0.018, type: 'bandpass' });
        tone(330, 0.09, { type: 'sine', volume: 0.018, delay: 0.05 });
        break;
      case 'typing':
        [0, 0.075, 0.19].forEach((delay, index) => {
          noise(0.045, { cutoff: 2200 + index * 350, volume: 0.018, delay, type: 'highpass' });
        });
        break;
      case 'logo':
        tone(73.4, 0.8, { type: 'sine', volume: 0.095, endFrequency: 49 });
        tone(293.7, 0.48, { type: 'triangle', volume: 0.05, delay: 0.14 });
        tone(440, 0.65, { type: 'sine', volume: 0.035, delay: 0.28 });
        break;
      case 'static':
        noise(0.3, { cutoff: 4200, volume: 0.045, type: 'bandpass' });
        tone(1800, 0.11, { type: 'sawtooth', volume: 0.025, endFrequency: 420 });
        break;
      case 'corrupt':
        tone(1200, 0.14, { type: 'square', volume: 0.03, endFrequency: 180 });
        tone(240, 0.2, { type: 'sawtooth', volume: 0.035, delay: 0.1, endFrequency: 90 });
        break;
      case 'glitch-rgb':
        tone(1400, 0.12, { type: 'square', volume: 0.038, endFrequency: 350 });
        tone(510, 0.19, { type: 'sawtooth', volume: 0.028, delay: 0.06, endFrequency: 1180 });
        noise(0.14, { cutoff: 3600, volume: 0.025, type: 'highpass' });
        break;
      case 'glitch-slice':
        [0, 0.12, 0.27].forEach((delay) => {
          noise(0.075, { cutoff: 1900, volume: 0.035, delay, type: 'bandpass' });
        });
        tone(92, 0.42, { type: 'sine', volume: 0.06, endFrequency: 48 });
        break;
      case 'glitch-roll':
        tone(260, 0.54, { type: 'sawtooth', volume: 0.035, endFrequency: 52 });
        tone(780, 0.42, { type: 'sine', volume: 0.032, delay: 0.08, endFrequency: 110 });
        break;
      case 'glitch-invert':
        tone(110, 0.2, { type: 'square', volume: 0.045, endFrequency: 880 });
        tone(880, 0.24, { type: 'triangle', volume: 0.03, delay: 0.12, endFrequency: 110 });
        break;
      case 'glitch-zoom':
        tone(65.4, 0.55, { type: 'sine', volume: 0.075, endFrequency: 130.8 });
        tone(523.3, 0.28, { type: 'triangle', volume: 0.03, delay: 0.16, endFrequency: 1046.5 });
        break;
      case 'signal':
        tone(880, 0.16, { type: 'sine', volume: 0.12, endFrequency: 510 });
        tone(1320, 0.11, { type: 'triangle', volume: 0.045, delay: 0.08 });
        noise(0.13, { cutoff: 3200, volume: 0.025 });
        break;
      case 'intrusion':
        tone(180, 0.85, { type: 'sawtooth', volume: 0.1, endFrequency: 74 });
        tone(920, 0.38, { type: 'square', volume: 0.035, endFrequency: 240, delay: 0.08 });
        noise(0.5, { cutoff: 900, volume: 0.05, type: 'bandpass' });
        break;
      case 'ghost':
        tone(58, 1.1, { type: 'sine', volume: 0.16, endFrequency: 26 });
        tone(440, 0.2, { type: 'triangle', volume: 0.05, delay: 0.36 });
        noise(0.48, { cutoff: 500, volume: 0.035 });
        break;
      case 'identity':
        tone(110, 1.35, { type: 'sine', volume: 0.16, endFrequency: 55 });
        tone(392, 1.2, { type: 'sine', volume: 0.075, delay: 0.2, endFrequency: 784 });
        tone(587.3, 1.55, { type: 'triangle', volume: 0.045, delay: 0.36, endFrequency: 880 });
        noise(0.9, { cutoff: 2600, volume: 0.018 });
        break;
      case 'identity-hit':
        tone(49, 0.65, { type: 'sine', volume: 0.12, endFrequency: 37 });
        noise(0.22, { cutoff: 5200, volume: 0.05, type: 'bandpass', delay: 0.12 });
        tone(1046.5, 0.14, { type: 'triangle', volume: 0.04, delay: 0.18, endFrequency: 523.3 });
        break;
      case 'shutdown':
        tone(880, 1.05, { type: 'sine', volume: 0.12, endFrequency: 48 });
        tone(1760, 0.74, { type: 'sine', volume: 0.035, endFrequency: 92 });
        noise(0.7, { cutoff: 400, volume: 0.05 });
        break;
      case 'shutdown-stage':
        tone(130, 0.25, { type: 'triangle', volume: 0.04, endFrequency: 75 });
        noise(0.19, { cutoff: 1300, volume: 0.022, type: 'lowpass', delay: 0.08 });
        break;
      case 'power-cut':
        tone(1200, 0.28, { type: 'sawtooth', volume: 0.055, endFrequency: 45 });
        noise(0.42, { cutoff: 480, volume: 0.055 });
        break;
      case 'reboot':
        tone(220, 0.5, { type: 'sine', volume: 0.07, delay: 0 });
        tone(330, 0.5, { type: 'sine', volume: 0.08, delay: 0.18 });
        tone(440, 0.75, { type: 'sine', volume: 0.1, delay: 0.36 });
        tone(659.3, 0.5, { type: 'triangle', volume: 0.045, delay: 0.58 });
        break;
      case 'ghost-transition':
        tone(55, 0.82, { type: 'sine', volume: 0.1, endFrequency: 27 });
        tone(880, 0.38, { type: 'triangle', volume: 0.035, delay: 0.24, endFrequency: 220 });
        noise(0.6, { cutoff: 720, volume: 0.035, delay: 0.1 });
        break;
      case 'ghost-command':
        tone(43.7, 0.75, { type: 'sine', volume: 0.1, endFrequency: 29.1 });
        tone(293.7, 0.24, { type: 'triangle', volume: 0.035, delay: 0.25, endFrequency: 196 });
        noise(0.4, { cutoff: 800, volume: 0.03, delay: 0.18 });
        break;
      case 'ghosted-stamp':
        tone(32.7, 1, { type: 'sine', volume: 0.13, endFrequency: 24.5 });
        noise(0.52, { cutoff: 3800, volume: 0.06, type: 'bandpass', delay: 0.06 });
        tone(987.8, 0.23, { type: 'square', volume: 0.045, delay: 0.18, endFrequency: 164.8 });
        tone(65.4, 0.5, { type: 'triangle', volume: 0.07, delay: 0.32, endFrequency: 32.7 });
        break;
      case 'hello-move':
        tone(82.4, 0.68, { type: 'sine', volume: 0.055, endFrequency: 164.8 });
        tone(659.3, 0.48, { type: 'triangle', volume: 0.024, delay: 0.12, endFrequency: 392 });
        break;
      case 'hello-friend':
        if (!voiceReady) {
          console.error('The hello friend voice clip is not unlocked yet.');
          break;
        }
        voiceClip.currentTime = 0;
        void voiceClip.play().catch((error) => {
          console.error('The hello friend voice clip could not be played.', error);
        });
        break;
      default:
        console.warn(`Unknown audio cue: ${effect}`);
    }
  }

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
      master.gain.setTargetAtTime(0.52, context.currentTime, 0.04);
      setScene(currentScene);
    }).catch((error) => {
      console.error('Could not start required scene audio.', error);
      throw error;
    });
  }

  /** Creates the audio graph without unlocking audio or loading the voice clip. For tests. */
  function prepare() {
    ensureContext();
    return context;
  }

  return { unlock, setScene, play, prepare };
}
