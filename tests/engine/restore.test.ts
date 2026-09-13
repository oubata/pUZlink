import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/engine';
import type { Cell } from '../../src/engine/types';
import { isPerfect } from '../../src/app/progress';
import { EASY_001 } from '../fixtures';

/** Draw one pair end to end along its own solution. */
function draw(engine: Engine, color: number): void {
  const path = EASY_001.solution[color];
  if (!path) throw new Error(`no solution for colour ${color}`);
  const first = path[0];
  if (!first) throw new Error('empty solution path');
  engine.begin(first);
  for (let i = 1; i < path.length; i++) {
    const cell = path[i];
    if (cell) engine.extend(cell);
  }
  engine.end();
}

describe('restore (spec 11.2)', () => {
  it('carries the saved move count back in', () => {
    const engine = new Engine(EASY_001);
    draw(engine, 0);
    draw(engine, 1);
    const saved = engine.snapshotPaths();
    expect(engine.moves).toBe(2);

    const resumed = new Engine(EASY_001);
    expect(resumed.restore(saved, 2)).toBe(true);
    expect(resumed.moves).toBe(2);
  });

  it('defaults the move count to zero when none is given', () => {
    const engine = new Engine(EASY_001);
    draw(engine, 0);

    const resumed = new Engine(EASY_001);
    resumed.restore(engine.snapshotPaths());
    expect(resumed.moves).toBe(0);
  });

  it('leaves a resumed board able to earn Perfect', () => {
    // The whole point of carrying moves across: finish a board that was saved
    // part-drawn, and the tally still says one move per pair.
    const engine = new Engine(EASY_001);
    draw(engine, 0);
    draw(engine, 1);
    const saved = engine.snapshotPaths();

    const resumed = new Engine(EASY_001);
    resumed.restore(saved, engine.moves);
    for (let color = 2; color < EASY_001.pairs.length; color++) {
      draw(resumed, color);
    }

    expect(resumed.won).toBe(true);
    expect(resumed.moves).toBe(EASY_001.pairs.length);
    expect(isPerfect(resumed.moves, EASY_001.pairs.length, resumed.hintUsed)) //
      .toBe(true);
  });

  it('rejects an invalid path set and leaves the engine untouched', () => {
    const engine = new Engine(EASY_001);
    draw(engine, 0);
    const before = engine.snapshotPaths();

    // A path that does not start on its own endpoint.
    const bogus: Cell[][] = EASY_001.pairs.map(() => []);
    bogus[0] = [
      [4, 4],
      [4, 3],
    ];

    expect(engine.restore(bogus, 99)).toBe(false);
    expect(engine.snapshotPaths()).toEqual(before);
    expect(engine.moves).toBe(1);
  });

  it('clamps a nonsense move count rather than trusting the file', () => {
    const engine = new Engine(EASY_001);
    draw(engine, 0);
    const saved = engine.snapshotPaths();

    const resumed = new Engine(EASY_001);
    resumed.restore(saved, -5);
    expect(resumed.moves).toBe(0);

    const fractional = new Engine(EASY_001);
    fractional.restore(saved, 3.9);
    expect(fractional.moves).toBe(3);
  });
});
