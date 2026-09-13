import { BOARD_LAYOUT } from '../app/config';
import type { Cell } from '../engine/types';

export interface BoardLayout {
  size: number;
  /** Side of one cell in CSS pixels. */
  cellPx: number;
  /** Side of the whole board in CSS pixels. */
  boardPx: number;
  dpr: number;
}

/**
 * Spec 9: the board never scrolls, so the cell size is whatever makes it fit
 * the viewport, clamped so it stays both tappable and not absurdly large.
 */
/** A wide, short viewport lays the controls out beside the board, not under it. */
export function isLandscape(
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return viewportWidth > viewportHeight && viewportHeight < 500;
}

export function computeCellPx(
  viewportWidth: number,
  viewportHeight: number,
  size: number,
): number {
  // The board lives in a column that stops growing at `maxContentWidth`, so
  // that is the width it has to fit, not the window's.
  const width = Math.min(viewportWidth, BOARD_LAYOUT.maxContentWidth);
  const landscape = isLandscape(viewportWidth, viewportHeight);
  const padX = landscape
    ? BOARD_LAYOUT.landscapePaddingX
    : BOARD_LAYOUT.viewportPaddingX;
  const padY = landscape
    ? BOARD_LAYOUT.landscapePaddingY
    : BOARD_LAYOUT.viewportPaddingY;
  const available = Math.min(width - padX, viewportHeight - padY);
  const raw = Math.floor(available / size);
  return Math.max(
    BOARD_LAYOUT.minCellPx,
    Math.min(BOARD_LAYOUT.maxCellPx, raw),
  );
}

export function computeLayout(
  viewportWidth: number,
  viewportHeight: number,
  size: number,
  dpr: number,
): BoardLayout {
  const cellPx = computeCellPx(viewportWidth, viewportHeight, size);
  return { size, cellPx, boardPx: cellPx * size, dpr };
}

export function cellCenter(
  layout: BoardLayout,
  cell: Cell,
): { x: number; y: number } {
  return {
    x: (cell[1] + 0.5) * layout.cellPx,
    y: (cell[0] + 0.5) * layout.cellPx,
  };
}

export function cellOrigin(
  layout: BoardLayout,
  cell: Cell,
): { x: number; y: number } {
  return { x: cell[1] * layout.cellPx, y: cell[0] * layout.cellPx };
}

/** Board-local pixel position to cell. The whole cell area is active. */
export function cellAt(layout: BoardLayout, x: number, y: number): Cell | null {
  const col = Math.floor(x / layout.cellPx);
  const row = Math.floor(y / layout.cellPx);
  if (row < 0 || row >= layout.size || col < 0 || col >= layout.size) {
    return null;
  }
  return [row, col];
}

/** Resize the backing store for the current device pixel ratio. */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  layout: BoardLayout,
): CanvasRenderingContext2D | null {
  const pixels = Math.round(layout.boardPx * layout.dpr);
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  canvas.style.width = `${layout.boardPx}px`;
  canvas.style.height = `${layout.boardPx}px`;

  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
  return context;
}
