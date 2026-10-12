// Small shared helpers. Anything that was copy-pasted between modules lives here.

/** Characters used to "corrupt" text (glitches, decays, redactions). */
export const SCRAMBLE_CHARSET = '#%&@$*+=?01<>/\\|';

/** Random integer in [a, b], both inclusive. */
export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

/** A random character from `charset`. */
export const randomChar = (charset = SCRAMBLE_CHARSET) => charset[rand(0, charset.length - 1)];

/**
 * Seconds -> "MM:SS". Negative, fractional and non-finite input is clamped/floored,
 * so a broken timer shows 00:00 instead of NaN:NaN.
 */
export function formatClock(totalSeconds) {
  const total = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Returns `text` with a fraction of its characters replaced by random `charset` characters.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.intensity=0.18]  Probability (0..1) that an eligible character is replaced.
 * @param {string} [options.charset]         Replacement characters.
 * @param {(ch: string) => boolean} [options.eligible]  Which characters may be replaced.
 *        Defaults to every non-whitespace character.
 */
export function scrambleText(text, {
  intensity = 0.18,
  charset = SCRAMBLE_CHARSET,
  eligible = (ch) => !/\s/.test(ch),
} = {}) {
  return [...text]
    .map((ch) => (eligible(ch) && Math.random() < intensity ? randomChar(charset) : ch))
    .join('');
}
