/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createHome } from '../../src/app/screens/Home';
import { createLevelSelect } from '../../src/app/screens/LevelSelect';
import { recordSolve } from '../../src/app/progress';
import { defaultProgress, type Progress } from '../../src/storage/persistence';
import type { TierId } from '../../src/engine/types';
import {
  PATH_PALETTE,
  lockedTierSurface,
  tierSurface,
  withAlpha,
} from '../../src/render/theme';

const AT = '2026-08-27T10:00:00.000Z';

function withSolves(tier: TierId, count: number, hint = false): Progress {
  let progress = defaultProgress();
  for (let i = 1; i <= count; i++) {
    progress = recordSolve(
      progress,
      tier,
      i,
      { elapsedMs: 60_000, hintUsed: hint, perfect: !hint },
      AT,
    ).progress;
  }
  return progress;
}

function noop(): void {}

function home(progress: Progress, onTier: (tier: TierId) => void = noop) {
  const view = createHome({
    progress,
    onTier,
    onHowToPlay: noop,
    onSettings: noop,
  });
  document.body.append(view.el);
  return view.el;
}

describe('Home (spec 9, criterion 8)', () => {
  it('lists the six tiers in ladder order with their board sizes', () => {
    const root = home(defaultProgress());
    const names = [...root.querySelectorAll('.tier__name')].map(
      (n) => n.textContent,
    );
    const sizes = [...root.querySelectorAll('.tier__size')].map(
      (n) => n.textContent,
    );
    expect(names).toEqual([
      'Easy',
      'Normal',
      'Hard',
      'Extreme',
      'Expert',
      'Master',
    ]);
    expect(sizes).toEqual(['5×5', '6×6', '8×8', '10×10', '12×12', '14×14']);
    root.remove();
  });

  it('locks the last three tiers and says what opens them', () => {
    const root = home(defaultProgress());
    const locked = [...root.querySelectorAll('.tier--locked')];
    expect(locked).toHaveLength(3);
    expect(
      locked.map((row) => row.querySelector('.tier__unlock')?.textContent),
    ).toEqual([
      'Solve 20 Hard levels to unlock',
      'Solve 20 Extreme levels to unlock',
      'Solve 20 Expert levels to unlock',
    ]);
    root.remove();
  });

  it('opens Extreme once 20 Hard levels are solved', () => {
    const root = home(withSolves('hard', 20));
    expect(root.querySelectorAll('.tier--locked')).toHaveLength(2);
    root.remove();
  });

  it('shows progress and fills the bar in proportion', () => {
    const root = home(withSolves('easy', 25));
    const first = root.querySelector('.tier__progress');
    const bar = root.querySelector<HTMLElement>('.tier__bar-fill');
    expect(first?.textContent).toBe('25/100');
    expect(Number.parseFloat(bar?.style.width ?? '')).toBeCloseTo(25);
    root.remove();
  });

  it('calls back with the tier that was tapped', () => {
    const picked: TierId[] = [];
    const root = home(defaultProgress(), (tier) => picked.push(tier));
    root.querySelectorAll<HTMLButtonElement>('.tier__button')[2]?.click();
    expect(picked).toEqual(['hard']);
    root.remove();
  });

  it('renders a locked tier as an inert div, not a button', () => {
    const picked: TierId[] = [];
    const root = home(defaultProgress(), (tier) => picked.push(tier));
    const rows = [...root.querySelectorAll('.tier')];
    const extreme = rows[3]?.querySelector('.tier__button');
    expect(extreme?.tagName).toBe('DIV');
    expect(extreme?.getAttribute('aria-disabled')).toBe('true');
    expect(picked).toEqual([]);
    root.remove();
  });

  it('leaves the tier rows named by their own text, with no mismatched label', () => {
    const root = home(defaultProgress());
    for (const button of root.querySelectorAll('.tier__button')) {
      const label = button.getAttribute('aria-label');
      if (label === null) continue;
      // A label must contain the visible text or voice control breaks.
      const visible = button.textContent?.trim() ?? '';
      expect(label).toContain(visible);
    }
    root.remove();
  });
});

describe('LevelSelect (spec 9, criterion 9)', () => {
  function levels(progress: Progress, onLevel: (index: number) => void = noop) {
    const view = createLevelSelect({
      tier: 'easy',
      progress,
      onBack: noop,
      onLevel,
    });
    document.body.append(view.el);
    return view.el;
  }

  it('shows one tile per level', () => {
    const root = levels(defaultProgress());
    expect(root.querySelectorAll('.level-tile')).toHaveLength(100);
    expect(root.querySelector('.topbar__title')?.textContent).toBe(
      'Easy · 5×5',
    );
    expect(root.querySelector('.topbar__trailing')?.textContent).toBe('0/100');
    root.remove();
  });

  it('rings the first unsolved level and nothing else', () => {
    const root = levels(withSolves('easy', 3));
    const ringed = [...root.querySelectorAll('.level-tile--suggested')];
    expect(ringed).toHaveLength(1);
    expect(ringed[0]?.textContent).toBe('4');
    root.remove();
  });

  it('fills a solved tile and hollows a hinted one', () => {
    let progress = withSolves('easy', 1);
    progress = recordSolve(
      progress,
      'easy',
      2,
      { elapsedMs: 1000, hintUsed: true, perfect: false },
      AT,
    ).progress;

    const root = levels(progress);
    const tiles = [...root.querySelectorAll('.level-tile')];
    expect(tiles[0]?.classList.contains('level-tile--solved')).toBe(true);
    expect(tiles[0]?.querySelector('.level-tile__dot')).toBeNull();
    expect(tiles[1]?.classList.contains('level-tile--hinted')).toBe(true);
    expect(tiles[1]?.querySelector('.level-tile__dot')).not.toBeNull();
    root.remove();
  });

  it('describes a hinted tile for a screen reader', () => {
    let progress = defaultProgress();
    progress = recordSolve(
      progress,
      'easy',
      1,
      { elapsedMs: 1000, hintUsed: true, perfect: false },
      AT,
    ).progress;
    const root = levels(progress);
    expect(root.querySelector('.level-tile')?.getAttribute('aria-label')).toBe(
      'Level 1, solved with a hint',
    );
    root.remove();
  });

  it('calls back with the level that was tapped', () => {
    const picked: number[] = [];
    const root = levels(withSolves('easy', 41), (index) => picked.push(index));
    root.querySelectorAll<HTMLButtonElement>('.level-tile')[41]?.click();
    expect(picked).toEqual([42]);
    root.remove();
  });

  it('opens only level 1 on a fresh profile', () => {
    const root = levels(defaultProgress());
    const open = [
      ...root.querySelectorAll<HTMLButtonElement>('.level-tile'),
    ].filter((t) => !t.disabled);
    expect(open.map((t) => t.textContent)).toEqual(['1']);
    root.remove();
  });

  it('opens the next level as each one is solved', () => {
    const root = levels(withSolves('easy', 3));
    const tiles = [...root.querySelectorAll<HTMLButtonElement>('.level-tile')];
    expect(tiles.slice(0, 4).map((t) => t.disabled)).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(tiles[4]?.disabled).toBe(true);
    root.remove();
  });

  it('will not open a locked level when tapped', () => {
    const picked: number[] = [];
    const root = levels(defaultProgress(), (index) => picked.push(index));
    root.querySelectorAll<HTMLButtonElement>('.level-tile')[41]?.click();
    expect(picked).toEqual([]);
    root.remove();
  });

  it('says why a locked level is locked', () => {
    const root = levels(defaultProgress());
    expect(
      root.querySelectorAll('.level-tile')[4]?.getAttribute('aria-label'),
    ).toBe('Level 5, locked. Solve level 4 first.');
    root.remove();
  });

  it('keeps a solved level open even with a gap before it', () => {
    // Progress earned before the sequential rule must not strand a level.
    const progress = recordSolve(
      defaultProgress(),
      'easy',
      50,
      { elapsedMs: 1000, hintUsed: false, perfect: true },
      AT,
    ).progress;
    const tiles = [
      ...levels(progress).querySelectorAll<HTMLButtonElement>('.level-tile'),
    ];
    expect(tiles[49]?.disabled).toBe(false);
    expect(tiles[50]?.disabled).toBe(false);
    expect(tiles[48]?.disabled).toBe(true);
    document.querySelectorAll('.screen--levels').forEach((n) => n.remove());
  });

  it('does not ring a locked level as the suggestion', () => {
    const root = levels(defaultProgress());
    const ringed = [...root.querySelectorAll('.level-tile--suggested')];
    expect(ringed).toHaveLength(1);
    expect(ringed[0]?.textContent).toBe('1');
    root.remove();
  });
});

describe('tier colours', () => {
  function homeRows(progress: Progress): HTMLElement[] {
    const view = createHome({
      progress,
      onTier: noop,
      onHowToPlay: noop,
      onSettings: noop,
    });
    document.body.append(view.el);
    return [...view.el.querySelectorAll<HTMLElement>('.tier')];
  }

  it('gives every tier its own colour', () => {
    const rows = homeRows(defaultProgress());
    const colours = rows.map((r) => r.style.getPropertyValue('--tier-color'));
    expect(colours.filter(Boolean)).toHaveLength(6);
    expect(new Set(colours).size).toBe(6);
    document.querySelectorAll('.screen--home').forEach((n) => n.remove());
  });

  it('matches the board palette rather than inventing colours', () => {
    const rows = homeRows(defaultProgress());
    for (const row of rows) {
      const colour = row.style.getPropertyValue('--tier-color').trim();
      expect(PATH_PALETTE).toContain(colour);
    }
    document.querySelectorAll('.screen--home').forEach((n) => n.remove());
  });

  it("paints every part of a capsule from that row's own colour", () => {
    const rows = homeRows(defaultProgress());
    for (const row of rows) {
      const id = row.querySelector('.tier__name')?.textContent ?? '';
      // A locked row is moulded from grey instead, so that it stays opaque
      // over the artwork rather than being dimmed with an opacity.
      const surface = row.classList.contains('tier--locked')
        ? lockedTierSurface()
        : tierSurface(id.toLowerCase());
      const read = (name: string): string =>
        row.style.getPropertyValue(name).trim();
      expect(read('--tier-face')).toBe(surface.face);
      expect(read('--tier-top')).toBe(surface.top);
      expect(read('--tier-bottom')).toBe(surface.bottom);
      expect(read('--tier-edge')).toBe(surface.edge);
      expect(read('--tier-ink')).toBe(surface.ink);
      expect(read('--tier-track')).toBe(withAlpha(surface.ink, 0.25));
      expect(read('--tier-fill')).toBe(withAlpha(surface.ink, 0.85));
    }
    document.querySelectorAll('.screen--home').forEach((n) => n.remove());
  });

  it('moulds every locked row from the same grey, in white ink', () => {
    const locked = homeRows(defaultProgress()).filter((row) =>
      row.classList.contains('tier--locked'),
    );
    expect(locked.length).toBeGreaterThan(0);
    for (const row of locked) {
      expect(row.style.getPropertyValue('--tier-face').trim()).toBe(
        lockedTierSurface().face,
      );
      expect(row.style.getPropertyValue('--tier-ink').trim()).toBe('#FFFFFF');
      // Its own colour is still on the row: only the capsule is drained.
      expect(PATH_PALETTE).toContain(
        row.style.getPropertyValue('--tier-color').trim(),
      );
    }
    document.querySelectorAll('.screen--home').forEach((n) => n.remove());
  });
});
