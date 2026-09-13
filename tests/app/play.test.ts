/**
 * @vitest-environment jsdom
 *
 * PlayView builds a BoardRenderer, which CLAUDE.md keeps out of jsdom — but
 * nothing here tests the renderer. It degrades to a null 2D context and draws
 * nothing, which is exactly what these tests want: the win flow, the tools and
 * the timer, with no canvas in the way. `getContext` is stubbed to return that
 * null directly rather than let jsdom log a "not implemented" line per test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayView, type PlaySnapshot } from '../../src/app/screens/Play';
import { ANIM, TIMER } from '../../src/app/config';
import { silentFeedback } from '../../src/app/feedback';
import { tierById } from '../../src/generator/difficulty';
import { generate } from '../../src/generator/generate';
import type { Level } from '../../src/engine/types';

const EASY = tierById('easy');
const LEVEL: Level = generate(EASY, 1);

interface Harness {
  view: PlayView;
  solved: PlaySnapshot[];
  shown: number;
  persisted: (PlaySnapshot | null)[];
  restarts: number;
}

function play(restore: PlaySnapshot | null = null): Harness {
  const harness: Partial<Harness> & {
    solved: PlaySnapshot[];
    persisted: (PlaySnapshot | null)[];
  } = { solved: [], persisted: [], shown: 0, restarts: 0 };

  const view = new PlayView({
    level: LEVEL,
    tier: EASY,
    restore,
    colorBlindLabels: false,
    // Keeps the win animation's stagger in play, so the timer is testable.
    reducedMotion: false,
    feedback: silentFeedback,
    onBack: () => {},
    onPause: () => {},
    onSolved: (snapshot) => harness.solved.push(snapshot),
    onWinShown: () => (harness.shown = (harness.shown ?? 0) + 1),
    onPersist: (snapshot) => harness.persisted.push(snapshot),
    onConfirmRestart: () => (harness.restarts = (harness.restarts ?? 0) + 1),
  });
  document.body.append(view.el);
  harness.view = view;
  return harness as Harness;
}

/** Draw every pair along the level's own solution, as a player would. */
function solve(view: PlayView): void {
  for (const path of LEVEL.solution) {
    const first = path[0];
    if (!first) continue;
    view.engine.begin(first);
    for (let i = 1; i < path.length; i++) {
      const cell = path[i];
      if (cell) view.engine.extend(cell);
    }
    view.engine.end();
  }
}

const stagger = ANIM.winStagger * LEVEL.pairs.length + ANIM.cardSlide;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('the win flow records before it animates', () => {
  it('reports the solve synchronously, before any timer runs', () => {
    const harness = play();
    solve(harness.view);

    // No timers have been advanced at all.
    expect(harness.solved).toHaveLength(1);
    expect(harness.shown).toBe(0);
    expect(harness.view.engine.won).toBe(true);
    harness.view.destroy();
  });

  it('clears the saved board only after the solve is reported', () => {
    const harness = play();
    solve(harness.view);

    // The last persist is the clear, and it comes after onSolved: a crash
    // between the two would leave a resumable board, not a lost solve.
    expect(harness.persisted.at(-1)).toBeNull();
    expect(harness.solved).toHaveLength(1);
    harness.view.destroy();
  });

  it('shows the card only once the win animation has run', () => {
    const harness = play();
    solve(harness.view);

    vi.advanceTimersByTime(stagger - 1);
    expect(harness.shown).toBe(0);
    vi.advanceTimersByTime(1);
    expect(harness.shown).toBe(1);
    harness.view.destroy();
  });

  it('keeps the solve when the player leaves during the animation', () => {
    const harness = play();
    solve(harness.view);
    // Back-chevron, hardware back, or any navigation: the view is destroyed
    // with the card still pending. This is the case that used to lose a solve.
    harness.view.destroy();

    vi.advanceTimersByTime(stagger * 4);
    expect(harness.solved).toHaveLength(1);
    expect(harness.shown).toBe(0);
  });

  it('reports the solve exactly once', () => {
    const harness = play();
    solve(harness.view);
    solve(harness.view);
    vi.advanceTimersByTime(stagger);

    expect(harness.solved).toHaveLength(1);
    expect(harness.shown).toBe(1);
    harness.view.destroy();
  });
});

describe('what a screen reader is told', () => {
  it('keeps the ticking clock out of the live region', () => {
    const harness = play();
    const live = harness.view.el.querySelector('[aria-live]');
    expect(live).not.toBeNull();

    const stats = [...harness.view.el.querySelectorAll('.stat')];
    const time = stats.at(-1);
    expect(time?.textContent).toMatch(/^\d+:\d\d$/);
    // The counters are announced; the clock, which changes four times a
    // second, is not inside anything that announces.
    expect(live?.contains(stats[0] ?? null)).toBe(true);
    expect(time?.closest('[aria-live]')).toBeNull();
    harness.view.destroy();
  });
});

describe('the play clock', () => {
  it('bills a sleeping device at most one tick', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const harness = play();
    harness.view.startTimer();

    // The phone slept in a pocket. `performance.now` kept running and the
    // interval never fired, so nothing folded the gap tick by tick.
    now = 8 * 60 * 60 * 1000;

    expect(harness.view.elapsedMs).toBeLessThanOrEqual(TIMER.maxTickDeltaMs);
    harness.view.destroy();
  });

  it('keeps normal time while the game is in front', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const harness = play();
    harness.view.startTimer();

    for (let i = 0; i < 8; i++) {
      now += TIMER.tickMs;
      vi.advanceTimersByTime(TIMER.tickMs);
    }

    expect(harness.view.elapsedMs).toBe(8 * TIMER.tickMs);
    harness.view.destroy();
  });

  it('stops accumulating once stopped', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const harness = play();
    harness.view.startTimer();
    now += TIMER.tickMs;
    harness.view.stopTimer();
    const held = harness.view.elapsedMs;

    now += 60_000;
    expect(harness.view.elapsedMs).toBe(held);
    harness.view.destroy();
  });
});

describe('resuming a saved board', () => {
  it('carries the move count in, so Perfect stays reachable', () => {
    const first = play();
    // Draw one pair, then save exactly what a real save would hold.
    const path = LEVEL.solution[0];
    if (path?.[0]) {
      first.view.engine.begin(path[0]);
      for (let i = 1; i < path.length; i++) {
        const cell = path[i];
        if (cell) first.view.engine.extend(cell);
      }
      first.view.engine.end();
    }
    const saved = first.view.snapshot();
    first.view.destroy();
    expect(saved.moves).toBe(1);

    const resumed = play(saved);
    expect(resumed.view.engine.moves).toBe(1);
    solve(resumed.view);
    expect(resumed.solved[0]?.moves).toBe(LEVEL.pairs.length);
    resumed.view.destroy();
  });

  it('drops a save it cannot restore instead of half-applying it', () => {
    const broken: PlaySnapshot = {
      // A path that does not start on its own endpoint: refused by the engine.
      paths: LEVEL.pairs.map((_, i) =>
        i === 0
          ? [
              [4, 4],
              [4, 3],
            ]
          : [],
      ),
      elapsedMs: 90_000,
      moves: 7,
      hintUsed: true,
      hintCount: 2,
    };

    const harness = play(broken);

    // Nothing from the rejected save leaks in: no clock, no spent hints.
    expect(harness.view.engine.moves).toBe(0);
    expect(harness.view.engine.hintUsed).toBe(false);
    expect(harness.view.elapsedMs).toBe(0);
    expect(harness.persisted).toContain(null);
    harness.view.destroy();
  });
});

describe('a solved board is inert', () => {
  /** The board keeps keyboard focus under the results card, so this is live. */
  function press(view: PlayView, key: string): void {
    const canvas = view.el.querySelector('canvas');
    canvas?.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
  }

  it('refuses undo, so a keypress cannot un-win a recorded level', () => {
    const harness = play();
    solve(harness.view);
    const before = harness.view.engine.snapshotPaths();

    press(harness.view, 'u');

    expect(harness.view.engine.won).toBe(true);
    expect(harness.view.engine.snapshotPaths()).toEqual(before);
    harness.view.destroy();
  });

  it('refuses restart, so no confirm dialog opens over the card', () => {
    const harness = play();
    solve(harness.view);

    press(harness.view, 'r');

    expect(harness.restarts).toBe(0);
    expect(harness.view.engine.won).toBe(true);
    harness.view.destroy();
  });

  it('hides the pause button', () => {
    const harness = play();
    const pause = harness.view.el.querySelector<HTMLButtonElement>(
      '.topbar .icon-button[aria-label="Pause"]',
    );
    expect(pause?.hidden).toBe(false);

    solve(harness.view);

    expect(pause?.hidden).toBe(true);
    harness.view.destroy();
  });
});
