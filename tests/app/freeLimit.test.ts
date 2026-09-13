/**
 * The pUZles free limit, at the boundary.
 *
 * Easy 20 must stay open to a free hub player, Easy 21 must not, and a standalone build —
 * where the hub's flag does not exist at all — must be untouched. A mistake in either
 * direction is invisible in normal play and ships.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { TIERS, tierById } from '../../src/generator/difficulty';
import {
  FREE_LEVELS,
  FREE_TIER,
  __setFreeLimitForTest,
  freeLimitActive,
  isPaywalled,
  isTierPaywalled,
} from '../../src/app/freeLimit';
import {
  isLevelUnlocked,
  isUnlocked,
  lockReason,
  unlockedTiers,
} from '../../src/app/progress';
import type { Progress } from '../../src/storage/persistence';

/** Progress with levels 1..n of a tier solved, so n+1 is reached honestly. */
function solvedThrough(tier: string, n: number): Progress {
  const solved: Record<
    number,
    { bestMs: number; hint: boolean; perfect: boolean; at: string }
  > = {};
  for (let i = 1; i <= n; i++) {
    solved[i] = { bestMs: 1000, hint: false, perfect: true, at: '2026-09-13' };
  }
  return { tiers: { [tier]: { solved } } } as unknown as Progress;
}

afterEach(() => __setFreeLimitForTest(null));

describe('standalone (no hub flag)', () => {
  it('is not limited', () => {
    __setFreeLimitForTest(null);
    expect(freeLimitActive()).toBe(false);
  });

  it('opens level 21 once level 20 is solved, and keeps every tier', () => {
    __setFreeLimitForTest(false);
    expect(isLevelUnlocked(solvedThrough('easy', 20), 'easy', 21)).toBe(true);
    expect(isTierPaywalled('hard')).toBe(false);
    expect(isUnlocked(tierById('normal'), solvedThrough('easy', 0))).toBe(true);
  });
});

describe('inside the hub, unpaid', () => {
  it('gives exactly the first 20 levels of the free tier', () => {
    __setFreeLimitForTest(true);
    const progress = solvedThrough(FREE_TIER, 50);

    expect(isLevelUnlocked(progress, FREE_TIER, 1)).toBe(true);
    expect(isLevelUnlocked(progress, FREE_TIER, FREE_LEVELS)).toBe(true);
    expect(isLevelUnlocked(progress, FREE_TIER, FREE_LEVELS + 1)).toBe(false);
    expect(isPaywalled(FREE_TIER, FREE_LEVELS)).toBe(false);
    expect(isPaywalled(FREE_TIER, FREE_LEVELS + 1)).toBe(true);
  });

  it('leaves exactly one tier playable', () => {
    __setFreeLimitForTest(true);
    const progress = solvedThrough(FREE_TIER, 100);
    expect(unlockedTiers(progress).map((t) => t.id)).toEqual([FREE_TIER]);
    for (const tier of TIERS) {
      if (tier.id === FREE_TIER) continue;
      expect(isUnlocked(tier, progress)).toBe(false);
      expect(isLevelUnlocked(progress, tier.id, 1)).toBe(false);
    }
  });

  it('names the hub as the reason, not a level to beat', () => {
    __setFreeLimitForTest(true);
    const progress = solvedThrough(FREE_TIER, 50);
    expect(lockReason(progress, FREE_TIER, FREE_LEVELS + 1)).toBe('hub');
    expect(lockReason(progress, 'hard', 1)).toBe('hub');
    // Inside the free range, an unreached level is still an ordinary progress lock.
    expect(lockReason(solvedThrough(FREE_TIER, 3), FREE_TIER, 10)).toBe(
      'progress',
    );
    expect(lockReason(progress, FREE_TIER, 1)).toBe('none');
  });
});
