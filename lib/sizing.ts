/**
 * Turns onboarding measurements into a concrete board layout.
 *
 * Two inputs, two different jobs:
 *
 *  - The TAP TEST is the only physical calibration. It sets how big the buttons
 *    are (which grid preset) and, just as importantly, how much GAP sits between
 *    them. For someone with a tremor the gap prevents mis-taps as much as the
 *    button size does, so the measured error drives both.
 *
 *  - The VISION ANSWER is a plain question, not a test. It scales the picture and
 *    text inside each button, and for low vision or CVI it also caps the grid so
 *    there are fewer, larger buttons on screen.
 *
 * Where the two disagree about overall size, the BIGGER one wins. Nobody is
 * harmed by buttons being too large.
 */

export type VisionCategory = 'none' | 'glasses' | 'low_vision' | 'cvi' | 'unknown';

export interface GridPreset {
  cols: number;
  rows: number;
}

/**
 * Grid ladder, biggest buttons first. Index 0 is the largest button size.
 * The range is 4x3 (12 buttons) up to 6x5 (30 buttons); the larger number is
 * always the column count.
 */
export const GRID_PRESETS: GridPreset[] = [
  { cols: 4, rows: 3 }, // 12 buttons, biggest
  { cols: 5, rows: 3 }, // 15
  { cols: 5, rows: 4 }, // 20
  { cols: 6, rows: 4 }, // 24
  { cols: 6, rows: 5 }, // 30 buttons, smallest
];

export const MAX_GRID_INDEX = GRID_PRESETS.length - 1;

/**
 * Average miss distance in CSS pixels across the five tap targets, mapped to a
 * grid preset. A bigger miss means bigger buttons, so a lower index.
 */
export function gridIndexFromTapError(averageErrorPx: number): number {
  if (!Number.isFinite(averageErrorPx) || averageErrorPx < 0) return 2;
  if (averageErrorPx <= 20) return 4;
  if (averageErrorPx <= 35) return 3;
  if (averageErrorPx <= 55) return 2;
  if (averageErrorPx <= 80) return 1;
  return 0;
}

/** Gap between buttons, in pixels, widened for a less accurate tap. */
export function gapFromTapError(averageErrorPx: number): number {
  if (!Number.isFinite(averageErrorPx) || averageErrorPx < 0) return 12;
  return Math.round(Math.min(28, Math.max(8, 8 + averageErrorPx / 3)));
}

/** Scale applied to the picture and the text label inside each button. */
export function iconScaleFromVision(vision: VisionCategory): number {
  switch (vision) {
    case 'low_vision':
      return 1.35;
    case 'cvi':
      return 1.5;
    case 'glasses':
      return 1.1;
    default:
      return 1;
  }
}

/**
 * The most buttons this vision category should ever see at once. Low vision and
 * CVI both benefit from fewer, larger, more widely spaced targets, so the grid
 * is capped even if the tap test was accurate.
 */
export function gridCapFromVision(vision: VisionCategory): number {
  switch (vision) {
    case 'cvi':
      return 1;
    case 'low_vision':
      return 2;
    default:
      return MAX_GRID_INDEX;
  }
}

export interface SuggestedLayout {
  gridIndex: number;
  gapPx: number;
  iconScale: number;
  /** True when the vision answer forced bigger buttons than the tap test asked for. */
  visionOverrodeTap: boolean;
}

export function suggestLayout(averageErrorPx: number, vision: VisionCategory): SuggestedLayout {
  const fromTap = gridIndexFromTapError(averageErrorPx);
  const cap = gridCapFromVision(vision);
  // Lower index means bigger buttons, so Math.min takes the bigger-button option.
  const gridIndex = Math.min(fromTap, cap);
  return {
    gridIndex,
    gapPx: gapFromTapError(averageErrorPx),
    iconScale: iconScaleFromVision(vision),
    visionOverrodeTap: gridIndex < fromTap,
  };
}

export function presetAt(index: number): GridPreset {
  const i = Math.max(0, Math.min(MAX_GRID_INDEX, Math.round(index)));
  return GRID_PRESETS[i];
}

/** How many buttons the grid area holds at this preset. */
export function capacityAt(index: number): number {
  const p = presetAt(index);
  return p.cols * p.rows;
}

export function describePreset(index: number): string {
  const p = presetAt(index);
  return `${p.cols} across, ${p.rows} down (${p.cols * p.rows} buttons)`;
}
