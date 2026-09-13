/** Display name of the app. Rename here and nowhere else. */
export const APP_NAME = 'pUZlink';

/** Human-facing version string, shown in Settings. */
export const APP_VERSION = '1.0.0';

/** localStorage key prefix; the `v1` segment is the storage schema version. */
export const STORAGE_PREFIX = 'colorlink:v1:';

export const STORAGE_KEYS = {
  progress: `${STORAGE_PREFIX}progress`,
  settings: `${STORAGE_PREFIX}settings`,
  inProgress: `${STORAGE_PREFIX}inProgress`,
} as const;

/** Board layout (spec 9). */
export const BOARD_LAYOUT = {
  /**
   * Chrome the board cannot use. On a phone every board size is width-limited,
   * so these two numbers are what decide how big the board gets. They must stay
   * in step with the padding on `.screen--play` and the height of the top bar,
   * stats row and toolbar; `tests/render/layout.test.ts` pins the arithmetic.
   */
  viewportPaddingX: 16,
  viewportPaddingY: 196,
  /**
   * Landscape turns the column into a row: the controls move beside the board
   * instead of under it, so the board is limited by height, not width.
   * Without this the 20px floor forced a board taller than the screen and the
   * page scrolled, which spec 9 forbids.
   */
  landscapePaddingX: 184,
  landscapePaddingY: 64,
  minCellPx: 20,
  maxCellPx: 72,
  /**
   * The widest the content column ever gets, matching `.screen`'s `max-width`
   * in `src/styles/screens.css`. The board is sized from the viewport, which on
   * a desktop window is far wider than the column it sits in — a 14x14 board
   * came out 700px wide inside a 560px column and hung over the top bar, the
   * stats and the toolbar.
   */
  maxContentWidth: 560,
} as const;

/** Animation durations in ms (spec 9 feedback table). Zeroed when reduced motion is on. */
/**
 * The play clock.
 *
 * `tickMs` is how often the HUD time is repainted. `maxTickDeltaMs` is the most
 * that any single tick may add: the clock is built on `performance.now()`,
 * which keeps running while a device sleeps, and the pause path that would
 * normally stop it hangs off `visibilitychange`, which a hard suspend does not
 * always fire. Without a ceiling, a phone asleep in a pocket overnight bills
 * the whole night to the level. Anything longer than a tick is not play time.
 */
export const TIMER = {
  tickMs: 250,
  maxTickDeltaMs: 1000,
} as const;

export const ANIM = {
  endpointPop: 120,
  segmentGrow: 60,
  pathPulse: 200,
  cutFade: 120,
  winStagger: 40,
  cardSlide: 200,
  hintPerCell: 30,
} as const;

/**
 * Vibration patterns, in milliseconds.
 *
 * Spec 9 asks for 10ms on a connect and [10, 40, 20] on a win. Measured on a
 * Galaxy A14 those play at exactly the length asked for and cannot be felt: a
 * rotating-mass motor needs 20-30ms just to spin up, and Android scales touch
 * haptics to LOW. Android's own touch feedback uses 45ms, which is the mark to
 * hit. navigator.vibrate exposes no amplitude, so duration is the only lever.
 */
export const HAPTICS = {
  connect: 40,
  win: [45, 60, 90],
} as const;

/** Web Audio master gain (spec 10). */
export const AUDIO_MASTER_GAIN = 0.25;

/** Number of level tiles per row in the level grid (spec 9). */
export const LEVEL_GRID_COLUMNS = 5;
