/**
 * Audio patch table. Data only: no Web Audio code lives in this file.
 *
 * A cue is `{ category, description, patch, ...options }`. A patch is a plain object, built with the small
 * constructors below, that `render.js` turns into oscillators, noise and filters:
 *
 *   tone      one oscillator: `wave`, `freq`, optional sweep `freqEnd`, optional vibrato
 *   noise     filtered noise burst: `filter`, `freq`, optional filter sweep `freqEnd`, `q`
 *   fm        carrier plus modulator (alarms, metallic hits)
 *   layers    several patches at once, each starting at its own `at` offset (also used as the sequence kind)
 *   variants  one of several alternative patches, picked at random on every play
 *   clip      a sound file played through an <audio> element (only the hello-friend voice)
 *
 * Cue options: `jitter` (`{ detune, gain }` random spread, or `false`), `rate` (max plays per second),
 * `usedBy` (which phase wires a cue that nothing plays yet). Reactive cues also have an entry in REACTIVE.
 * Beds (looping ambient scenes) are in BEDS; SCENES maps `audio.setScene()` names to beds.
 *
 * Never rename or remove a cue name another file plays (see docs/overhaul/audio-cues.md); add an alias.
 */

const cue = (category, description, patch, options = {}) => ({ category, description, patch, ...options });

// ---- patch constructors (argument names mirror the old synth helpers) ----

const tone = (freq, dur, {
  type = 'sine', volume = 0.12, delay = 0, endFrequency = freq, spread = 0, attack = 0.035, detune = 0, vibrato = null,
} = {}) => ({
  kind: 'tone', wave: type, freq, freqEnd: endFrequency, spread, gain: volume, dur, at: delay, attack, detune, vibrato,
});

const noise = (dur, {
  cutoff = 1500, volume = 0.04, delay = 0, type = 'lowpass', cutoffEnd = cutoff, q = 1, attack = 0.035, spread = 0,
} = {}) => ({
  kind: 'noise', filter: type, freq: cutoff, freqEnd: cutoffEnd, q, spread, gain: volume, dur, at: delay, attack,
});

const fm = (freq, dur, {
  ratio = 2, index = 2, type = 'sine', volume = 0.1, delay = 0, endFrequency = freq, attack = 0.01,
} = {}) => ({
  kind: 'fm', wave: type, freq, freqEnd: endFrequency, ratio, index, gain: volume, dur, at: delay, attack,
});

/** A short key-click: band-passed noise with a 2 ms attack. */
const click = (freq, volume, dur, delay = 0, spread = 0) => noise(dur, {
  cutoff: freq, volume, delay, type: 'bandpass', q: 0.8, attack: 0.002, spread,
});

const layers = (...items) => ({ kind: 'layers', layers: items.flat(Infinity) });
const variants = (...options) => ({ kind: 'variants', options });
const clip = (url) => ({ kind: 'clip', url });

/** `each([0, .1], (time, index) => patch)`: one patch per time offset. */
const each = (times, make) => times.map((time, index) => make(time, index));

/** Notes one after another: `steps([392, 523], every, dur, toneOptions)`. */
const steps = (freqs, every, dur, options = {}) => layers(
  ...freqs.map((freq, index) => tone(freq, dur, { ...options, delay: (options.delay ?? 0) + index * every })),
);

// ---- cues ----

export const CUES = {
  // ---- Boot ----
  'power-on': cue('boot', "Cold power-on chime with a low rumble (launch click)", layers(
      tone(392, 0.42, { type: 'sine', volume: 0.12 }),
      tone(587.3, 0.55, { type: 'sine', volume: 0.09, delay: 0.12 }),
      tone(784, 0.36, { type: 'triangle', volume: 0.035, delay: 0.48 }),
      noise(0.7, { cutoff: 190, volume: 0.028, type: 'lowpass' }),
    )),
  'boot-memory': cue('boot', "Four rising blips for the memory test", steps([110, 164.8, 220, 329.6], 0.13, 0.1, { type: 'sine', volume: 0.045 })),
  'boot-prompt': cue('boot', "Soft two-note BIOS prompt", layers(
      tone(246.9, 0.12, { type: 'sine', volume: 0.04 }),
      tone(369.9, 0.16, { type: 'triangle', volume: 0.03, delay: 0.08 }),
    )),
  'boot-checkpoint': cue('boot', "Short POST checkpoint blip", layers(
      tone(660, 0.07, { type: 'square', volume: 0.016 }),
      tone(990, 0.085, { type: 'sine', volume: 0.019, delay: 0.045 }),
    )),
  'kernel-tick': cue('boot', "Very quiet square tick for kernel log lines", layers(tone(1180, 0.025, { type: 'square', volume: 0.009, spread: 180 }))),
  'kernel-start': cue('boot', "Low thump and two tones when the kernel starts", layers(
      tone(55, 0.62, { type: 'sine', volume: 0.1, endFrequency: 38 }),
      tone(440, 0.2, { type: 'triangle', volume: 0.045, delay: 0.15 }),
      tone(660, 0.24, { type: 'triangle', volume: 0.04, delay: 0.34 }),
    )),
  'service': cue('boot', "Tiny two-tone blip when a service line starts", layers(
      tone(1050, 0.055, { type: 'square', volume: 0.018 }),
      tone(1570, 0.07, { type: 'sine', volume: 0.014, delay: 0.045 }),
    )),
  'service-ready': cue('boot', "Rising two-note confirmation for an OK service", layers(
      tone(523.3, 0.1, { type: 'sine', volume: 0.035 }),
      tone(784, 0.17, { type: 'sine', volume: 0.04, delay: 0.08 }),
    )),
  'drive-seek': cue('boot', "Hard-drive seek: falling thunk, click and noise", layers(
      tone(145, 0.38, { type: 'triangle', volume: 0.055, endFrequency: 82 }),
      tone(720, 0.09, { type: 'square', volume: 0.018, delay: 0.16 }),
      noise(0.32, { cutoff: 620, volume: 0.035, type: 'bandpass' }),
    )),
  'relay-hop': cue('boot', "Two-tone blip for each network relay hop", layers(
      tone(430, 0.065, { type: 'sine', volume: 0.025 }),
      tone(640, 0.085, { type: 'triangle', volume: 0.019, delay: 0.055 }),
    )),
  'network-lock': cue('boot', "Rising tone and band noise when the network locks", layers(
      tone(330, 0.24, { type: 'sine', volume: 0.06, endFrequency: 495 }),
      tone(660, 0.32, { type: 'triangle', volume: 0.035, delay: 0.16 }),
      noise(0.28, { cutoff: 2100, volume: 0.018, type: 'bandpass' }),
    )),
  'disk-unseal': cue('boot', "Heavy sawtooth drop and rising tone for the disk unseal", layers(
      tone(82, 0.72, { type: 'sawtooth', volume: 0.065, endFrequency: 41 }),
      tone(246.9, 0.38, { type: 'triangle', volume: 0.05, delay: 0.2, endFrequency: 493.9 }),
      noise(0.55, { cutoff: 360, volume: 0.035 }),
    )),
  'terminal-open': cue('boot', "Low thud and click as the terminal opens", layers(
      tone(98, 0.28, { type: 'triangle', volume: 0.05, endFrequency: 73.4 }),
      tone(392, 0.08, { type: 'square', volume: 0.022, delay: 0.18 }),
    )),

  // ---- Terminal ----
  'typewriter-start': cue('terminal', "Short click at the start of each typed line", layers(
      noise(0.055, { cutoff: 1950, volume: 0.022, type: 'highpass' }),
      tone(118, 0.075, { type: 'triangle', volume: 0.014, delay: 0.018 }),
    )),
  'typing': cue('terminal', "Three quick noise ticks (currently unused)", layers(
      ...each([0, 0.075, 0.19], (delay, index) => noise(0.045, { cutoff: 2200 + index * 350, volume: 0.018, delay, type: 'highpass' })),
    )),
  'key-tap': cue('terminal', "Mechanical key click with a low thock (legacy typing sound)", layers(
      click(1850, 0.038, 0.024, 0, 650),
      click(1150, 0.022, 0.03, 0.026, 500),
      tone(135, 0.045, { type: 'triangle', volume: 0.018, endFrequency: 82, spread: 35 }),
    )),
  'command-submit': cue('terminal', "Two-note blip when Enter submits a command", layers(
      tone(740, 0.045, { type: 'square', volume: 0.018 }),
      tone(1108.7, 0.085, { type: 'sine', volume: 0.026, delay: 0.045 }),
    )),
  'list-hit': cue('terminal', "Square blip with a noise tail for help and ls", layers(
      tone(246.9, 0.09, { type: 'square', volume: 0.025 }),
      noise(0.08, { cutoff: 1500, volume: 0.012, type: 'highpass', delay: 0.035 }),
    )),
  'file-read': cue('terminal', "Band-noise rustle and a tone for cat, evidence and view-source", layers(
      noise(0.11, { cutoff: 900, volume: 0.018, type: 'bandpass' }),
      tone(330, 0.09, { type: 'sine', volume: 0.018, delay: 0.05 }),
    )),
  'hint': cue('terminal', "Falling two-note hint cue", layers(
      tone(392, 0.12, { type: 'triangle', volume: 0.035 }),
      tone(311.1, 0.16, { type: 'sine', volume: 0.03, delay: 0.13 }),
    )),
  'success': cue('terminal', "Four-note rising arpeggio for success", steps([392, 523.3, 659.3, 784], 0.12, 0.3, { type: 'sine', volume: 0.045 })),
  'failure': cue('terminal', "Falling sawtooth and noise for a failed action", layers(
      tone(190, 0.42, { type: 'sawtooth', volume: 0.06, endFrequency: 65 }),
      noise(0.3, { cutoff: 420, volume: 0.028 }),
    )),
  'progress-start': cue('terminal', "Rising blip when a progress bar starts", layers(
      tone(164.8, 0.16, { type: 'sine', volume: 0.025, endFrequency: 220 }),
    )),
  'progress-tick': cue('terminal', "Quiet sine tick while a progress bar fills", layers(tone(520, 0.035, { type: 'sine', volume: 0.012, spread: 120 }))),
  'progress-complete': cue('terminal', "Two-note finish for a progress bar", layers(
      tone(523.3, 0.11, { type: 'sine', volume: 0.025 }),
      tone(659.3, 0.15, { type: 'sine', volume: 0.028, delay: 0.075 }),
    )),

  // ---- Story / tension ----
  'message': cue('story', "Soft two-note chat message", layers(
      tone(520, 0.09, { type: 'sine', volume: 0.018 }),
      tone(780, 0.12, { type: 'triangle', volume: 0.022, delay: 0.08 }),
    )),
  'transmission': cue('story', "Incoming transmission sweep with band noise", layers(
      tone(520, 0.42, { type: 'sine', volume: 0.05, endFrequency: 570 }),
      tone(760, 0.29, { type: 'triangle', volume: 0.035, delay: 0.18 }),
      noise(0.65, { cutoff: 2800, volume: 0.022, type: 'bandpass' }),
    )),
  'incoming-call': cue('story', "Three double-pings like a phone ringing", layers(
      ...each([0, 0.32, 0.82], (delay) => [
        tone(660, 0.13, { type: 'sine', volume: 0.035, delay }),
        tone(880, 0.16, { type: 'sine', volume: 0.03, delay: delay + 0.08 }),
      ]),
    )),
  'mail-arrive': cue('story', "Two-note mail chime", layers(
      tone(587.3, 0.1, { type: 'sine', volume: 0.045 }),
      tone(880, 0.18, { type: 'sine', volume: 0.04, delay: 0.1 }),
    )),
  'logo': cue('story', "Low swell and two tones under the FSOCIETY logo", layers(
      tone(73.4, 0.8, { type: 'sine', volume: 0.095, endFrequency: 49 }),
      tone(293.7, 0.48, { type: 'triangle', volume: 0.05, delay: 0.14 }),
      tone(440, 0.65, { type: 'sine', volume: 0.035, delay: 0.28 }),
    )),
  'puzzle-start': cue('story', "Low rise and a tone when the puzzle begins", layers(
      tone(55, 0.55, { type: 'sine', volume: 0.075, endFrequency: 73.4 }),
      tone(440, 0.2, { type: 'triangle', volume: 0.025, delay: 0.2 }),
    )),
  'hello-move': cue('story', "Rising sub tone and falling tone as hello moves into the chat", layers(
      tone(82.4, 0.68, { type: 'sine', volume: 0.055, endFrequency: 164.8 }),
      tone(659.3, 0.48, { type: 'triangle', volume: 0.024, delay: 0.12, endFrequency: 392 }),
    )),
  'hello-friend': cue('story', "The \"hello, friend.\" voice clip (mp3 file, not synthesized)", clip('./audio/hello-friend-mr-robot.mp3')),
  'identity': cue('story', "Long swell for the identity reveal", layers(
      tone(110, 1.35, { type: 'sine', volume: 0.16, endFrequency: 55 }),
      tone(392, 1.2, { type: 'sine', volume: 0.075, delay: 0.2, endFrequency: 784 }),
      tone(587.3, 1.55, { type: 'triangle', volume: 0.045, delay: 0.36, endFrequency: 880 }),
      noise(0.9, { cutoff: 2600, volume: 0.018 }),
    )),
  'identity-hit': cue('story', "Sub hit with a bright noise crack for the name swap", layers(
      tone(49, 0.65, { type: 'sine', volume: 0.12, endFrequency: 37 }),
      noise(0.22, { cutoff: 5200, volume: 0.05, type: 'bandpass', delay: 0.12 }),
      tone(1046.5, 0.14, { type: 'triangle', volume: 0.04, delay: 0.18, endFrequency: 523.3 }),
    )),
  'elliot-echo': cue('story', "Falling sub tone and noise for the Elliot echo", layers(
      tone(61.7, 0.9, { type: 'sine', volume: 0.085, endFrequency: 36.7 }),
      noise(0.72, { cutoff: 510, volume: 0.045, type: 'bandpass', delay: 0.08 }),
      tone(740, 0.32, { type: 'triangle', volume: 0.03, delay: 0.3, endFrequency: 185 }),
    )),
  'ghost': cue('story', "Deep falling drone with a tone and noise (currently unused)", layers(
      tone(58, 1.1, { type: 'sine', volume: 0.16, endFrequency: 26 }),
      tone(440, 0.2, { type: 'triangle', volume: 0.05, delay: 0.36 }),
      noise(0.48, { cutoff: 500, volume: 0.035 }),
    )),
  'ghost-transition': cue('story', "Falling drone and noise as the ghost sequence starts", layers(
      tone(55, 0.82, { type: 'sine', volume: 0.1, endFrequency: 27 }),
      tone(880, 0.38, { type: 'triangle', volume: 0.035, delay: 0.24, endFrequency: 220 }),
      noise(0.6, { cutoff: 720, volume: 0.035, delay: 0.1 }),
    )),
  'ghost-step': cue('story', "Two-note step in the ghost checklist", layers(
      tone(196, 0.09, { type: 'sine', volume: 0.035 }),
      tone(392, 0.14, { type: 'triangle', volume: 0.032, delay: 0.08 }),
    )),
  'ghost-scan': cue('story', "Deep drone with a high falling ping for the ghost scan", layers(
      tone(39, 0.9, { type: 'sine', volume: 0.11, endFrequency: 31 }),
      tone(1046.5, 0.36, { type: 'triangle', volume: 0.025, delay: 0.24, endFrequency: 523.3 }),
      noise(0.65, { cutoff: 340, volume: 0.03, type: 'lowpass' }),
    )),
  'ghost-command': cue('story', "Deep drone and falling tone for a ghost command", layers(
      tone(43.7, 0.75, { type: 'sine', volume: 0.1, endFrequency: 29.1 }),
      tone(293.7, 0.24, { type: 'triangle', volume: 0.035, delay: 0.25, endFrequency: 196 }),
      noise(0.4, { cutoff: 800, volume: 0.03, delay: 0.18 }),
    )),
  'ghosted-stamp': cue('story', "Very low hit, noise crack and falling square for the GHOSTED stamp", layers(
      tone(32.7, 1, { type: 'sine', volume: 0.13, endFrequency: 24.5 }),
      noise(0.52, { cutoff: 3800, volume: 0.06, type: 'bandpass', delay: 0.06 }),
      tone(987.8, 0.23, { type: 'square', volume: 0.045, delay: 0.18, endFrequency: 164.8 }),
      tone(65.4, 0.5, { type: 'triangle', volume: 0.07, delay: 0.32, endFrequency: 32.7 }),
    )),

  // ---- Trace ----
  'trace-appear': cue('trace', "Rising sub tone and tone when the trace HUD appears", layers(
      tone(49, 0.68, { type: 'sine', volume: 0.09, endFrequency: 73.4 }),
      tone(146.8, 0.42, { type: 'triangle', volume: 0.05, delay: 0.22, endFrequency: 220 }),
      noise(0.45, { cutoff: 1100, volume: 0.025, type: 'lowpass' }),
    )),
  'trace-tick': cue('trace', "Short square tick (reactive from phase 2.5)", layers(
      tone(880, 0.035, { type: 'square', volume: 0.012 }),
    )),
  'trace-status': cue('trace', "Two-note blip for the trace command", layers(
      tone(630, 0.07, { type: 'triangle', volume: 0.02 }),
      tone(945, 0.09, { type: 'sine', volume: 0.018, delay: 0.065 }),
    )),
  'trace-warning': cue('trace', "Three-note square alarm for the failed-trace warning", layers(
      tone(880, 0.17, { type: 'square', volume: 0.055 }),
      tone(740, 0.16, { type: 'square', volume: 0.045, delay: 0.21 }),
      tone(880, 0.22, { type: 'square', volume: 0.052, delay: 0.42 }),
    )),
  'trace-critical': cue('trace', "Three fast square beeps for the critical trace state", layers(
      ...each([0, 0.18, 0.36], (delay) => tone(660, 0.11, { type: 'square', volume: 0.04, delay })),
    )),
  'trace-expired': cue('trace', "Falling flatline tone with a noise burst", layers(
      tone(880, 0.85, { type: 'sine', volume: 0.09, endFrequency: 55 }),
      noise(0.6, { cutoff: 850, volume: 0.04, type: 'bandpass' }),
    )),

  // ---- Glitch ----
  'static': cue('glitch', "Band-noise burst with a falling sawtooth", layers(
      noise(0.3, { cutoff: 4200, volume: 0.045, type: 'bandpass' }),
      tone(1800, 0.11, { type: 'sawtooth', volume: 0.025, endFrequency: 420 }),
    )),
  'corrupt': cue('glitch', "Falling square and sawtooth for text corruption", layers(
      tone(1200, 0.14, { type: 'square', volume: 0.03, endFrequency: 180 }),
      tone(240, 0.2, { type: 'sawtooth', volume: 0.035, delay: 0.1, endFrequency: 90 }),
    )),
  'signal': cue('glitch', "Short falling ping with noise", layers(
      tone(880, 0.16, { type: 'sine', volume: 0.12, endFrequency: 510 }),
      tone(1320, 0.11, { type: 'triangle', volume: 0.045, delay: 0.08 }),
      noise(0.13, { cutoff: 3200, volume: 0.025 }),
    )),
  'glitch-rgb': cue('glitch', "Falling square and rising sawtooth with a noise tick", layers(
      tone(1400, 0.12, { type: 'square', volume: 0.038, endFrequency: 350 }),
      tone(510, 0.19, { type: 'sawtooth', volume: 0.028, delay: 0.06, endFrequency: 1180 }),
      noise(0.14, { cutoff: 3600, volume: 0.025, type: 'highpass' }),
    )),
  'glitch-slice': cue('glitch', "Three noise slices over a falling sub tone", layers(
      ...each([0, 0.12, 0.27], (delay) => noise(0.075, { cutoff: 1900, volume: 0.035, delay, type: 'bandpass' })),
      tone(92, 0.42, { type: 'sine', volume: 0.06, endFrequency: 48 }),
    )),
  'glitch-roll': cue('glitch', "Long falling sawtooth and sine", layers(
      tone(260, 0.54, { type: 'sawtooth', volume: 0.035, endFrequency: 52 }),
      tone(780, 0.42, { type: 'sine', volume: 0.032, delay: 0.08, endFrequency: 110 }),
    )),
  'glitch-invert': cue('glitch', "Square sweep up and triangle sweep down", layers(
      tone(110, 0.2, { type: 'square', volume: 0.045, endFrequency: 880 }),
      tone(880, 0.24, { type: 'triangle', volume: 0.03, delay: 0.12, endFrequency: 110 }),
    )),
  'glitch-zoom': cue('glitch', "Rising sub and tone for the zoom glitch", layers(
      tone(65.4, 0.55, { type: 'sine', volume: 0.075, endFrequency: 130.8 }),
      tone(523.3, 0.28, { type: 'triangle', volume: 0.03, delay: 0.16, endFrequency: 1046.5 }),
    )),

  // ---- Game over ----
  'intrusion': cue('gameover', "Falling sawtooth, square and noise for an intrusion", layers(
      tone(180, 0.85, { type: 'sawtooth', volume: 0.1, endFrequency: 74 }),
      tone(920, 0.38, { type: 'square', volume: 0.035, endFrequency: 240, delay: 0.08 }),
      noise(0.5, { cutoff: 900, volume: 0.05, type: 'bandpass' }),
    )),
  'disconnect': cue('gameover', "Falling tone with a high noise tail", layers(
      tone(740, 0.28, { type: 'sine', volume: 0.055, endFrequency: 320 }),
      noise(0.18, { cutoff: 3400, volume: 0.025, type: 'highpass', delay: 0.12 }),
    )),
  'shutdown': cue('gameover', "Long falling sine for the shutdown", layers(
      tone(880, 1.05, { type: 'sine', volume: 0.12, endFrequency: 48 }),
      tone(1760, 0.74, { type: 'sine', volume: 0.035, endFrequency: 92 }),
      noise(0.7, { cutoff: 400, volume: 0.05 }),
    )),
  'shutdown-stage': cue('gameover', "Short falling thud with noise for each shutdown stage", layers(
      tone(130, 0.25, { type: 'triangle', volume: 0.04, endFrequency: 75 }),
      noise(0.19, { cutoff: 1300, volume: 0.022, type: 'lowpass', delay: 0.08 }),
    )),
  'power-cut': cue('gameover', "Falling sawtooth and noise as the power is cut", layers(
      tone(1200, 0.28, { type: 'sawtooth', volume: 0.055, endFrequency: 45 }),
      noise(0.42, { cutoff: 480, volume: 0.055 }),
    )),
  'reboot': cue('gameover', "Four-note rising chord for the reboot", layers(
      tone(220, 0.5, { type: 'sine', volume: 0.07, delay: 0 }),
      tone(330, 0.5, { type: 'sine', volume: 0.08, delay: 0.18 }),
      tone(440, 0.75, { type: 'sine', volume: 0.1, delay: 0.36 }),
      tone(659.3, 0.5, { type: 'triangle', volume: 0.045, delay: 0.58 }),
    )),

};

// ---- ambient beds ----
// A bed is a set of looping layers. `breath` is a slow relative amplitude LFO, `sweep` a slow filter LFO
// (Hz), `pulse` a tremolo on the whole bed (relative depth), `drive` soft-clips the bed (0 to 1).
// `scenes` holds extra layers per scene so one bed can serve several scenes.

const drone = (freq, volume, type = 'sine', { detune = 0, breath = null } = {}) => ({
  kind: 'drone', wave: type, freq, gain: volume, detune, breath,
});
const hiss = (cutoff, volume, { type = 'lowpass', q = 1, sweep = null, breath = null } = {}) => ({
  kind: 'hiss', filter: type, freq: cutoff, q, gain: volume, sweep, breath,
});

export const BEDS = {
  'ambient-boot': {
    category: 'ambient',
    description: 'Boot bed: low triangle drone, mains hum, slow filtered rumble and a faint disk whirr',
    level: 0.14, fadeIn: 0.9, fadeOut: 0.5, drive: 0,
    layers: [
      drone(49, 0.24, 'triangle'),
      drone(73.4, 0.08, 'sine', { detune: -7, breath: { rate: 0.05, depth: 0.35 } }),
      drone(100, 0.02, 'sine'),
      hiss(230, 0.12, { sweep: { rate: 0.06, depth: 70 } }),
      hiss(2800, 0.01, { type: 'bandpass', q: 3, breath: { rate: 0.3, depth: 0.8 } }),
    ],
    pulse: { rate: 0.65, depth: 0.129 },
    scenes: {},
    defaultScene: null,
  },
  'ambient-story': {
    category: 'ambient',
    description: 'Story bed in three flavours: story (sub drone and soft rumble), ghost (deeper, beating) and reveal (thin high shimmer)',
    level: 0.14, fadeIn: 0.9, fadeOut: 0.5, drive: 0,
    layers: [],
    pulse: null,
    scenes: {
      story: {
        layers: [
          drone(42, 0.19),
          drone(63, 0.04, 'sine', { detune: 9, breath: { rate: 0.07, depth: 0.5 } }),
          hiss(1150, 0.16, { sweep: { rate: 0.04, depth: 260 } }),
          hiss(2900, 0.025),
        ],
        pulse: { rate: 0.18, depth: 0.086 },
      },
      ghost: {
        layers: [
          drone(36.7, 0.22),
          drone(36.7, 0.06, 'sine', { detune: 14 }),
          drone(55, 0.08, 'triangle'),
          hiss(260, 0.1),
          hiss(2200, 0.018, { sweep: { rate: 0.11, depth: 500 } }),
        ],
        pulse: { rate: 0.12, depth: 0.157 },
      },
      reveal: {
        layers: [
          drone(41.2, 0.18),
          drone(61.7, 0.1, 'triangle', { detune: -3 }),
          drone(164.8, 0.025, 'sine', { detune: 6, breath: { rate: 0.09, depth: 0.6 } }),
          hiss(3600, 0.014),
        ],
        pulse: { rate: 0.08, depth: 0.071 },
      },
    },
    defaultScene: 'story',
  },
  'ambient-puzzle': {
    category: 'ambient',
    description: 'Puzzle bed: triangle drone, slow rumble and a thin throbbing tone that adds tension',
    level: 0.14, fadeIn: 0.9, fadeOut: 0.5, drive: 0,
    layers: [
      drone(55, 0.16, 'triangle'),
      drone(82.4, 0.06, 'sine', { detune: 5 }),
      drone(220, 0.008, 'sine', { detune: -11, breath: { rate: 0.42, depth: 0.9 } }),
      hiss(420, 0.1, { sweep: { rate: 0.05, depth: 90 } }),
      hiss(1700, 0.018),
    ],
    pulse: { rate: 0.42, depth: 0.1 },
    scenes: {},
    defaultScene: null,
  },
  'ambient-traced': {
    category: 'ambient',
    description: 'Traced bed: detuned sawtooth pair, soft-clipped, with a fast tremolo and a sweeping grind',
    level: 0.14, fadeIn: 0.6, fadeOut: 0.5, drive: 0.55,
    layers: [
      drone(46.2, 0.16, 'sawtooth'),
      drone(46.9, 0.1, 'sawtooth'),
      hiss(180, 0.09),
      hiss(900, 0.05, { type: 'bandpass', q: 2, sweep: { rate: 0.5, depth: 300 } }),
    ],
    pulse: { rate: 0.9, depth: 0.179 },
    scenes: {},
    defaultScene: null,
  },
};

/** `audio.setScene()` names. `null` is silence. A bed name is also accepted as a scene. */
export const SCENES = {
  idle: null,
  boot: { bed: 'ambient-boot' },
  story: { bed: 'ambient-story', scene: 'story' },
  reveal: { bed: 'ambient-story', scene: 'reveal' },
  ghost: { bed: 'ambient-story', scene: 'ghost' },
  puzzle: { bed: 'ambient-puzzle' },
  shutdown: { bed: 'ambient-traced' },
  intrusion: { bed: 'ambient-traced' },
};

/** Alternative names that play another cue (new brief names for sounds that already exist). */
export const ALIASES = {};

/** Cues whose sound depends on a parameter: `(params, patch) => patch`. */
export const REACTIVE = {};

/** Default random spread applied to every play unless a cue sets `jitter`. */
export const DEFAULT_JITTER = { detune: 7, gain: 0.04 };
