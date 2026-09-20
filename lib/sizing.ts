/**
 * Turns onboarding measurements into a concrete board layout.
 *
 * THE GRID IS LOCKED. The front board is seven buttons across and four down,
 * and that does not change for anybody. Nothing measured during setup is
 * allowed to add or remove a row or a column, because the fixed positions carry
 * meaning: a communicator who learns where a word lives should find it in the
 * same place on every device, and a grid that reshaped itself per profile would
 * take that away. Pages to the right hold the overflow, and the last page
 * simply runs out of buttons rather than padding itself to four rows.
 *
 * Two inputs, two different jobs:
 *
 *  - The TAP TEST is the only physical calibration, and it now sets exactly one
 *    thing: HOW BIG THE BUTTONS ARE. The seven-by-four cells stay where they
 *    are, so a button drawn smaller inside its cell leaves more space around
 *    it, and a button drawn larger closes that space up. Size and spacing are
 *    therefore the same control, not two.
 *
 *  - The VISION ANSWER is a plain question, not a test. It scales the picture
 *    and text inside each button, and sets a floor under the button size.
 *
 * Where the two disagree about size, the BIGGER one wins. Nobody is harmed by
 * buttons being too large.
 */

export type VisionCategory = 'none' | 'glasses' | 'low_vision' | 'cvi' | 'unknown';

export interface GridPreset {
  cols: number;
  rows: number;
}

/** The locked front board: seven across, four down. */
export const BOARD_COLS = 7;
export const BOARD_ROWS = 4;

/**
 * Grid ladder. Retained because Settings still offers it and the stored profile
 * is an index into it, but setup no longer chooses from it: onboarding always
 * writes LOCKED_GRID_INDEX.
 *
 * `rows` counts only the folder grid underneath. The three core rows sit above
 * it, so index 0 is seven across and four down in total.
 */
export const GRID_PRESETS: GridPreset[] = [
  { cols: 7, rows: 1 }, // the locked board
  { cols: 8, rows: 2 },
  { cols: 9, rows: 2 },
  { cols: 9, rows: 3 },
  { cols: 10, rows: 3 },
];

export const MAX_GRID_INDEX = GRID_PRESETS.length - 1;

/** The only preset setup ever writes: seven across, four down. */
export const LOCKED_GRID_INDEX = 0;

/* -------------------------------------------------------------------------
   Button size
   ------------------------------------------------------------------------- */

/**
 * How much of its cell a button fills, as a fraction. The cells never move, so
 * this single number is both the button size and, by what it leaves over, the
 * space between buttons.
 *
 * The floor is not lower than 0.62 because below that the gaps read as holes in
 * the board rather than as separation, and the ceiling stops just short of 1 so
 * neighbouring buttons never actually touch.
 */
export const BUTTON_SCALE_MIN = 0.62;
export const BUTTON_SCALE_MAX = 0.97;
export const BUTTON_SCALE_DEFAULT = 0.9;

/** Slider granularity, and the step the stored percentage snaps to. */
export const BUTTON_SCALE_STEP = 0.01;

/**
 * One column of the board on a landscape tablet, in CSS pixels. Used only to
 * turn a button scale into the gap the board stores, so the two stay two views
 * of one number instead of drifting apart.
 */
export const REFERENCE_CELL_PX = 132;

export function clampButtonScale(scale: number): number {
  if (!Number.isFinite(scale)) return BUTTON_SCALE_DEFAULT;
  return Math.min(BUTTON_SCALE_MAX, Math.max(BUTTON_SCALE_MIN, scale));
}

/**
 * Average miss distance in CSS pixels across the five tap targets, mapped to a
 * button size. A bigger miss means a bigger button.
 *
 * On a locked grid a bigger button necessarily means a narrower gap, which is
 * the one real cost of pinning the layout: someone with a heavy tremor gets a
 * target that is easier to land on but sits closer to its neighbour. Size wins
 * because missing the intended button entirely is worse than clipping the edge
 * of the next one.
 */
export function buttonScaleFromTapError(averageErrorPx: number): number {
  if (!Number.isFinite(averageErrorPx) || averageErrorPx < 0) return BUTTON_SCALE_DEFAULT;
  if (averageErrorPx <= 20) return 0.74;
  if (averageErrorPx <= 35) return 0.8;
  if (averageErrorPx <= 55) return 0.86;
  if (averageErrorPx <= 80) return 0.92;
  return BUTTON_SCALE_MAX;
}

/**
 * The smallest button this vision category should ever be given. Low vision and
 * CVI both need a larger target regardless of how accurate the tapping was.
 */
export function buttonScaleFloorFromVision(vision: VisionCategory): number {
  switch (vision) {
    case 'cvi':
      return 0.92;
    case 'low_vision':
      return 0.86;
    default:
      return BUTTON_SCALE_MIN;
  }
}

/**
 * The gap the board stores, derived from the button size. The cell is fixed, so
 * whatever the button does not fill is the gap.
 */
export function gapFromButtonScale(scale: number): number {
  return Math.round(REFERENCE_CELL_PX * (1 - clampButtonScale(scale)));
}

/** Plain words for a button size, for a caregiver who is not reading pixels. */
export function describeButtonSize(scale: number): string {
  const s = clampButtonScale(scale);
  if (s >= 0.94) return 'Largest buttons, tight spacing';
  if (s >= 0.87) return 'Large buttons, close spacing';
  if (s >= 0.79) return 'Medium buttons, even spacing';
  if (s >= 0.7) return 'Small buttons, wide spacing';
  return 'Smallest buttons, widest spacing';
}

/* -------------------------------------------------------------------------
   Vision
   ------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------
   Putting it together
   ------------------------------------------------------------------------- */

export interface SuggestedLayout {
  /** Always LOCKED_GRID_INDEX. Kept so the stored profile shape is unchanged. */
  gridIndex: number;
  /** Fraction of its cell each button fills. */
  buttonScale: number;
  gapPx: number;
  iconScale: number;
  /** True when the vision answer forced bigger buttons than the tap test asked for. */
  visionOverrodeTap: boolean;
}

export function suggestLayout(averageErrorPx: number, vision: VisionCategory): SuggestedLayout {
  const fromTap = buttonScaleFromTapError(averageErrorPx);
  const floor = buttonScaleFloorFromVision(vision);
  // Higher scale means a bigger button, so Math.max takes the bigger option.
  const buttonScale = clampButtonScale(Math.max(fromTap, floor));
  return {
    gridIndex: LOCKED_GRID_INDEX,
    buttonScale,
    gapPx: gapFromButtonScale(buttonScale),
    iconScale: iconScaleFromVision(vision),
    visionOverrodeTap: buttonScale > fromTap,
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
  const core = 3 * p.cols;
  return `${p.cols} across, ${p.rows + 3} down (${core + p.cols * p.rows} buttons)`;
}
