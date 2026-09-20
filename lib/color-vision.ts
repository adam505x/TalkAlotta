/**
 * Colour vision, asked once during setup and changeable from Settings.
 *
 * Separate from `vision` in lib/sizing.ts on purpose. That answer is about
 * ACUITY and it changes SIZE: how big the buttons are and how large the picture
 * and label inside them get. This answer is about HUE and it changes nothing
 * about size at all — only which colours the Fitzgerald key is drawn in.
 *
 * Folding the two together would be wrong in both directions: someone with
 * red-green colour blindness usually has perfectly ordinary acuity and does not
 * want larger buttons, and someone with low vision does not necessarily confuse
 * any two hues.
 *
 * WHAT THIS DOES NOT CHANGE: colour is never the only signal on this board.
 * Every button carries its word, like-coloured buttons are grouped together,
 * and yes and no sit at opposite ends of their row. Eleven word classes is more
 * than any palette can keep distinguishable under colour blindness, so the
 * palettes below are chosen to keep the GROUPS apart rather than to promise
 * that every individual colour is still readable as itself.
 */

export type ColorVisionCategory = 'none' | 'red_green' | 'blue_yellow' | 'mono' | 'unknown';

export const COLOR_VISION_OPTIONS: { value: ColorVisionCategory; label: string }[] = [
  // Not "No known difficulty": Settings shows this list directly under the
  // eyesight list, which already uses that exact phrase for a different answer.
  { value: 'none', label: 'Sees colours normally' },
  { value: 'red_green', label: 'Red and green look alike' },
  { value: 'blue_yellow', label: 'Blue and yellow look alike' },
  { value: 'mono', label: 'Little or no colour at all' },
  { value: 'unknown', label: 'Not sure' },
];

const LABELS: Record<ColorVisionCategory, string> = Object.fromEntries(
  COLOR_VISION_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ColorVisionCategory, string>;

export function describeColorVision(value: ColorVisionCategory): string {
  return LABELS[value] ?? LABELS.unknown;
}

/**
 * What each answer actually changes, in the words a caregiver reads in Settings.
 */
export function colorVisionEffect(value: ColorVisionCategory): string {
  switch (value) {
    case 'red_green':
      return 'Button colours are spread along the blue-to-yellow range, which stays visible when red and green do not.';
    case 'blue_yellow':
      return 'Button colours are spread along the red-to-green range, and the blues are darkened so they do not read as green.';
    case 'mono':
      return 'Colour is dropped entirely. Button faces are told apart by lightness instead.';
    default:
      return 'The standard AAC colour key is used.';
  }
}

export function isColorVision(value: unknown): value is ColorVisionCategory {
  return (
    value === 'none' ||
    value === 'red_green' ||
    value === 'blue_yellow' ||
    value === 'mono' ||
    value === 'unknown'
  );
}

export function parseColorVision(value: unknown): ColorVisionCategory {
  return isColorVision(value) ? value : 'unknown';
}
