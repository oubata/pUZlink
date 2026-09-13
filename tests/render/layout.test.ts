import { describe, expect, it } from 'vitest';
import { BOARD_LAYOUT } from '../../src/app/config';
import { TIERS } from '../../src/generator/difficulty';
import {
  cellAt,
  cellCenter,
  computeCellPx,
  computeLayout,
  isLandscape,
} from '../../src/render/layout';

describe('board layout (spec 9, criterion 10)', () => {
  it('fits every board size on a 360×640 viewport with tappable cells', () => {
    for (const tier of TIERS) {
      const layout = computeLayout(360, 640, tier.size, 3);
      expect(layout.cellPx).toBeGreaterThanOrEqual(BOARD_LAYOUT.minCellPx);
      expect(layout.boardPx).toBeLessThanOrEqual(
        360 - BOARD_LAYOUT.viewportPaddingX,
      );
    }
  });

  it('follows the cell-size formula', () => {
    // Portrait phone: width-limited, so (360 - 16) / size.
    expect(computeCellPx(360, 640, 14)).toBe(24);
    expect(computeCellPx(360, 640, 5)).toBe(68);
  });

  it('uses nearly the full width in portrait, since that is the binding limit', () => {
    for (const size of [5, 6, 8, 10, 12, 14]) {
      const boardPx = computeCellPx(360, 780, size) * size;
      expect(boardPx).toBeLessThanOrEqual(360 - BOARD_LAYOUT.viewportPaddingX);
      // Never leave more than one cell's worth of width unused.
      expect(boardPx).toBeGreaterThan(
        360 - BOARD_LAYOUT.viewportPaddingX - size,
      );
    }
  });

  it('clamps the cell size at both ends', () => {
    expect(computeCellPx(4000, 4000, 5)).toBe(BOARD_LAYOUT.maxCellPx);
    expect(computeCellPx(200, 300, 14)).toBe(BOARD_LAYOUT.minCellPx);
  });

  it('is limited by height on a short, wide viewport', () => {
    // Short and wide is landscape: the controls sit beside the board, so the
    // board is bounded by height less only the top bar.
    expect(isLandscape(1200, 400)).toBe(true);
    expect(computeCellPx(1200, 400, 8)).toBe(
      Math.floor((400 - BOARD_LAYOUT.landscapePaddingY) / 8),
    );
  });

  it('keeps the landscape board inside the screen, where it used to overflow', () => {
    // A 14x14 board at the 20px floor is 280px tall. On a 360px-high screen
    // the old portrait maths produced a board that scrolled off the bottom.
    for (const size of [5, 8, 14]) {
      const boardPx = computeCellPx(780, 360, size) * size;
      expect(boardPx).toBeLessThanOrEqual(360 - BOARD_LAYOUT.landscapePaddingY);
      expect(boardPx).toBeLessThanOrEqual(780 - BOARD_LAYOUT.landscapePaddingX);
    }
  });

  it('treats a tall viewport as portrait even when it is wide', () => {
    expect(isLandscape(1200, 900)).toBe(false);
    expect(isLandscape(360, 780)).toBe(false);
  });

  it('maps pixels back to the cell they fall in', () => {
    const layout = computeLayout(360, 640, 8, 2);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const { x, y } = cellCenter(layout, [row, col]);
        expect(cellAt(layout, x, y)).toEqual([row, col]);
      }
    }
  });

  it('treats the whole cell area as active, with no dead zone', () => {
    const layout = computeLayout(360, 640, 5, 1);
    expect(cellAt(layout, 0, 0)).toEqual([0, 0]);
    expect(cellAt(layout, layout.cellPx - 0.01, layout.cellPx - 0.01)).toEqual([
      0, 0,
    ]);
    expect(cellAt(layout, layout.cellPx, layout.cellPx)).toEqual([1, 1]);
  });

  it('returns null outside the board', () => {
    const layout = computeLayout(360, 640, 5, 1);
    expect(cellAt(layout, -1, 0)).toBeNull();
    expect(cellAt(layout, 0, -1)).toBeNull();
    expect(cellAt(layout, layout.boardPx, 0)).toBeNull();
    expect(cellAt(layout, 0, layout.boardPx)).toBeNull();
  });
});

describe('the board stays inside its column', () => {
  it('does not outgrow the 560px content column on a desktop window', () => {
    // The column is capped by CSS; the board was sized from the whole window,
    // so on a wide screen it hung over the top bar and the toolbar.
    const wide = computeLayout(1400, 900, 14, 1);
    expect(wide.boardPx).toBeLessThanOrEqual(
      BOARD_LAYOUT.maxContentWidth - BOARD_LAYOUT.viewportPaddingX,
    );
  });

  it('leaves a phone-width board exactly as it was', () => {
    // The cap must not touch the case every player is actually in.
    expect(computeCellPx(360, 640, 14)).toBe(24);
    expect(computeCellPx(390, 844, 5)).toBe(72);
  });
});
