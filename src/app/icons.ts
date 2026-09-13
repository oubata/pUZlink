/**
 * Inline 24×24 icons, 1.75 px stroke, `currentColor` (spec 10). No icon package,
 * no network request.
 */

const OPEN =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">';

function icon(body: string): string {
  return `${OPEN}${body}</svg>`;
}

export const ICONS = {
  back: icon('<path d="M15 5 8 12l7 7"/>'),
  pause: icon('<path d="M9 5v14M15 5v14"/>'),
  undo: icon('<path d="M4 9h10a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/>'),
  hint: icon(
    '<path d="M9.5 17h5"/><path d="M10 20.5h4"/>' +
      '<path d="M12 3a6 6 0 0 0-3.6 10.8c.5.4.9 1 1 1.7h5.2c.1-.7.5-1.3 1-1.7A6 6 0 0 0 12 3Z"/>',
  ),
  restart: icon(
    '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4 4v4h4"/>',
  ),
  /*
   * A gear: eight trapezoidal teeth around the body with a hole through the
   * middle. Radial spokes off a plain ring, which is what this was, read as a
   * wheel rather than a gear.
   */
  gear: icon(
    '<path d="M12.00 1.60L14.87 2.00L14.96 4.68L16.97 5.86L19.35 4.65L21.10 6.96L19.27 8.91L19.86 11.17L22.40 12.00L22.00 14.87L19.32 14.96L18.14 16.97L19.35 19.35L17.04 21.10L15.09 19.27L12.83 19.86L12.00 22.40L9.13 22.00L9.04 19.32L7.03 18.14L4.65 19.35L2.90 17.04L4.73 15.09L4.14 12.83L1.60 12.00L2.00 9.13L4.68 9.04L5.86 7.03L4.65 4.65L6.96 2.90L8.91 4.73L11.17 4.14Z"/>' +
      '<circle cx="12" cy="12" r="4.2"/>',
  ),
  lock: icon(
    '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/>' +
      '<path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>',
  ),
} as const;

/**
 * The app mark: two O's joined by a line, the same artwork as the launcher
 * icon in `scripts/icons/generate.mjs`. It carries the palette's own colours
 * rather than `currentColor`, so it is not one of the ICONS above, and it
 * drops the icon's white plate, which would be invisible on the page anyway.
 */
export const APP_MARK =
  // Cropped to the artwork's own bounds rather than the icon's 64-unit plate,
  // so a width in CSS gives the mark that width on screen.
  '<svg viewBox="10 14 44 36" width="100%" aria-hidden="true" focusable="false">' +
  '<path d="M25 22 H40 a6 6 0 0 1 6 6 v7" fill="none" stroke="#118AB2" ' +
  'stroke-width="7" stroke-linecap="butt" stroke-linejoin="round"/>' +
  '<circle cx="18" cy="22" r="5.1" fill="none" stroke="#D62828" stroke-width="3.8"/>' +
  '<circle cx="46" cy="42" r="5.1" fill="none" stroke="#D62828" stroke-width="3.8"/>' +
  '</svg>';

export type IconName = keyof typeof ICONS;
