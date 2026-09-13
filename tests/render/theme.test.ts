import { describe, expect, it } from 'vitest';
import { MAX_COLORS } from '../../src/generator/difficulty';
import {
  BOARD_STYLE,
  PATH_PALETTE,
  TIER_SURFACE,
  contrastRatio,
  labelColorOn,
  lineColor,
  pathColor,
  relativeLuminance,
  lockedTierSurface,
  tierColor,
  tierSurface,
  watchSystemPreferences,
  withAlpha,
} from '../../src/render/theme';
import { TIERS } from '../../src/generator/difficulty';

describe('palette (spec 10)', () => {
  it('has one colour per possible pair', () => {
    expect(PATH_PALETTE).toHaveLength(MAX_COLORS);
    expect(new Set(PATH_PALETTE).size).toBe(MAX_COLORS);
  });

  it('gives every colour-blind label at least 4.5:1 against its dot', () => {
    /*
     * Against the colour the renderer actually paints the dot, which is
     * `lineColor` — the palette colour lightened — not the palette colour
     * itself. Asserting the palette passed while testing a colour that never
     * reaches the canvas.
     */
    for (let c = 0; c < PATH_PALETTE.length; c++) {
      const painted = lineColor(c);
      expect(contrastRatio(painted, labelColorOn(painted))) //
        .toBeGreaterThanOrEqual(4.5);
    }
  });

  it('stays visible against both page backgrounds', () => {
    for (const hex of PATH_PALETTE) {
      const best = Math.max(
        contrastRatio(hex, '#FFFFFF'),
        contrastRatio(hex, '#121212'),
      );
      expect(best).toBeGreaterThanOrEqual(3);
    }
  });

  it('wraps rather than falling off the end', () => {
    expect(pathColor(0)).toBe(PATH_PALETTE[0]);
    expect(pathColor(MAX_COLORS)).toBe(PATH_PALETTE[0]);
  });

  it('converts hex to rgba for the cell tint', () => {
    expect(withAlpha('#D62828', 0.14)).toBe('rgba(214, 40, 40, 0.14)');
    expect(withAlpha('#FFF', 1)).toBe('rgba(255, 255, 255, 1)');
  });
});

describe('board style (spec 10)', () => {
  it('fills every occupied cell the same, joined or not', () => {
    // An endpoint waiting to be connected has to look like a cell on a
    // finished line, so the board reads as one surface.
    expect(BOARD_STYLE).not.toHaveProperty('completedTintAlpha');
    expect(BOARD_STYLE.tintAlpha).toBeGreaterThan(0.8);
  });

  it('keeps the line paler than the cell it runs through', () => {
    expect(BOARD_STYLE.lineLighten).toBeGreaterThan(0.5);
  });

  it('leaves the endpoint ring inside its own diameter', () => {
    // Two ring widths have to fit across the O with a hole left over, or the
    // letter closes up into a dot.
    expect(BOARD_STYLE.endpointRingWidth * 2).toBeLessThan(
      BOARD_STYLE.endpointDiameter,
    );
  });
});

describe('tier capsules on Home', () => {
  it('reads the label at both ends of the gradient, not just the middle', () => {
    const weak: string[] = [];
    for (const tier of TIERS) {
      const surface = tierSurface(tier.id);
      for (const [where, ground] of [
        ['top', surface.top],
        ['face', surface.face],
        ['bottom', surface.bottom],
      ] as const) {
        const ratio = contrastRatio(surface.ink, ground);
        if (ratio < TIER_SURFACE.minLabelContrast) {
          weak.push(`${tier.id} ${where} ${ratio.toFixed(2)}:1`);
        }
      }
    }
    expect(weak).toEqual([]);
  });

  it('moulds each capsule out of its own tier colour', () => {
    for (const tier of TIERS) {
      const surface = tierSurface(tier.id);
      const base = relativeLuminance(tierColor(tier.id));
      const face = relativeLuminance(surface.face);
      // The face may move away from the ink to clear contrast, but only far
      // enough that it still reads as the tier's colour.
      expect(Math.abs(face - base)).toBeLessThan(0.25);
      expect(relativeLuminance(surface.top)).toBeGreaterThan(face);
      expect(relativeLuminance(surface.bottom)).toBeLessThan(face);
      expect(relativeLuminance(surface.edge)).toBeLessThan(
        relativeLuminance(surface.bottom),
      );
    }
  });

  it('drains a locked capsule to grey without letting the artwork through', () => {
    const locked = lockedTierSurface();
    // Grey: no channel may lead any other by enough to read as a hue.
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(locked.face.slice(i, i + 2), 16),
    ) as [number, number, number];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
    // And still legible, since nothing dims it any more.
    expect(contrastRatio(locked.ink, locked.top)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(locked.ink, locked.bottom)).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it('keeps the six capsules distinct from one another', () => {
    const faces = TIERS.map((tier) => tierSurface(tier.id).face);
    expect(new Set(faces).size).toBe(TIERS.length);
  });
});

describe('watching the OS preferences', () => {
  interface FakeQuery {
    listeners: (() => void)[];
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    matches: boolean;
    media: string;
  }

  function install(): { queries: FakeQuery[]; restore: () => void } {
    const queries: FakeQuery[] = [];
    const original = globalThis.matchMedia;
    globalThis.matchMedia = ((media: string) => {
      const query: FakeQuery = {
        media,
        matches: false,
        listeners: [],
        addEventListener(_type, listener) {
          this.listeners.push(listener);
        },
        removeEventListener(_type, listener) {
          this.listeners = this.listeners.filter((l) => l !== listener);
        },
      };
      queries.push(query);
      return query;
    }) as unknown as typeof globalThis.matchMedia;
    return {
      queries,
      restore: () => {
        globalThis.matchMedia = original;
      },
    };
  }

  it('reports a change to either preference', () => {
    const { queries, restore } = install();
    let changes = 0;
    const stop = watchSystemPreferences(() => changes++);

    expect(queries.map((q) => q.media)).toEqual([
      '(prefers-color-scheme: dark)',
      '(prefers-reduced-motion: reduce)',
    ]);

    for (const query of queries) for (const l of query.listeners) l();
    expect(changes).toBe(2);

    stop();
    restore();
  });

  it('unsubscribes both queries', () => {
    const { queries, restore } = install();
    let changes = 0;
    const stop = watchSystemPreferences(() => changes++);
    stop();

    expect(queries.every((q) => q.listeners.length === 0)).toBe(true);
    expect(changes).toBe(0);
    restore();
  });

  it('is a no-op where matchMedia does not exist', () => {
    const original = globalThis.matchMedia;
    // @ts-expect-error - deleting a global for the duration of the test
    delete globalThis.matchMedia;

    const stop = watchSystemPreferences(() => {
      throw new Error('should never fire');
    });
    expect(() => stop()).not.toThrow();

    globalThis.matchMedia = original;
  });
});
