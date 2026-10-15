// The voices of the story. `say` and `typing` nodes name a voice; the output module reads the display name,
// the CSS class of the name tag and of the text, whether the voice makes typing sounds (`quiet: true` means none)
// and, optionally, which cue it ticks with (`tick`; the default is `key-tick`).
// Characters must not use a fixed real name for the first character before the identity reveal:
// `unknown` is renamed to `Mr. Robot` on screen by the reveal, and `robot` is the voice used afterwards.
//
// `mystery` (phase 4b) is the third voice, `<???>` in blue. It is a complete mystery on purpose (owner decision
// 2026-10-15): no name, no backstory, it never says who it is, why it knows or what it wants, and it is expected to
// come back in a later level. Do not give it one without an owner decision (see the story bible, section 6).

export const VOICES = {
  unknown: { name: 'unknown', nameCls: 'dim', cls: '', quiet: false },
  watcher: { name: 'watcher', nameCls: 'warn', cls: 'warn', quiet: false },
  robot: { name: 'Mr. Robot', nameCls: 'dim', cls: '', quiet: true },
  mystery: { name: '???', nameCls: 'voice-blue', cls: 'voice-blue', quiet: false, tick: 'key-tick-mystery' },
};
