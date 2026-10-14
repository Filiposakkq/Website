// The voices of the story. `say` and `typing` nodes name a voice; the output module reads the display name,
// the CSS class of the name tag and of the text, and whether the voice makes typing sounds.
// Characters must not use a fixed real name for the first character before the identity reveal:
// `unknown` is renamed to `Mr. Robot` on screen by the reveal, and `robot` is the voice used afterwards.

export const VOICES = {
  unknown: { name: 'unknown', nameCls: 'dim', cls: '', quiet: false },
  watcher: { name: 'watcher', nameCls: 'warn', cls: 'warn', quiet: false },
  robot: { name: 'Mr. Robot', nameCls: 'dim', cls: '', quiet: true },
};
