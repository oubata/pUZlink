import { describe, expect, it } from 'vitest';
import { Engine } from '../../src/engine/engine';
import { MAX_HINTS_PER_LEVEL } from '../../src/engine/queries';
import { EMPTY } from '../../src/engine/types';
import { drawPath, EASY_001, TINY_3x3 } from '../fixtures';

describe('the colour the next hint will draw', () => {
  /*
   * The board screen animates the reveal, so it has to know which colour the
   * hint is about to draw. It used to work that out itself by comparing path
   * *lengths*, which is not the same question: a path can be exactly as long as
   * its solution and still be a different route. When that happened the hint
   * redrew one colour and the animation played over another.
   */
  it('picks a same-length path that takes a different route', () => {
    const engine = new Engine(TINY_3x3);
    // Colour 0 joined the long way round: five cells, like its solution, but
    // through [1,1] and [1,2] instead of along the top row.
    drawPath(engine, [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [2, 2],
    ]);

    const solution = TINY_3x3.solution[0] ?? [];
    expect(engine.paths[0]).toHaveLength(solution.length);
    expect(engine.paths[0]).not.toEqual(solution);

    // The length-only answer was 1. The right answer is 0.
    expect(engine.nextHintColor()).toBe(0);

    engine.hint();
    expect(engine.paths[0]).toEqual(solution);
  });

  it('agrees with what hint() actually redraws', () => {
    const engine = new Engine(EASY_001);
    drawPath(engine, EASY_001.solution[0] ?? []);

    const predicted = engine.nextHintColor();
    expect(predicted).toBe(1);
    engine.hint();
    expect(engine.paths[predicted]).toEqual(EASY_001.solution[predicted]);
  });

  it('reports EMPTY once every colour is solution-shaped', () => {
    const engine = new Engine(TINY_3x3);
    for (const path of TINY_3x3.solution) drawPath(engine, path);
    expect(engine.won).toBe(true);
    expect(engine.nextHintColor()).toBe(EMPTY);
  });
});

describe('hint (spec 5.2)', () => {
  it('draws the lowest colour whose path differs from the solution', () => {
    const engine = new Engine(EASY_001);
    expect(engine.hint()).toBe(true);
    expect(engine.paths[0]).toEqual(EASY_001.solution[0]);
    expect(engine.hintUsed).toBe(true);
    expect(engine.moves).toBe(1);
    expect(engine.isComplete(0)).toBe(true);
  });

  it('skips a colour already drawn as its solution, in either direction', () => {
    const engine = new Engine(EASY_001);
    const reversed = [...(EASY_001.solution[0] ?? [])].reverse();
    drawPath(engine, reversed);

    engine.hint();
    expect(engine.paths[1]).toEqual(EASY_001.solution[1]);
    expect(engine.paths[0]).toEqual(reversed);
  });

  it('cuts a conflicting path back to the cell before the conflict', () => {
    const engine = new Engine(EASY_001);
    // Colour 1 squats on (0,2), which colour 0's solution needs.
    drawPath(engine, [
      [1, 3],
      [1, 2],
      [0, 2],
      [0, 3],
    ]);
    expect(engine.paths[1]).toHaveLength(4);

    engine.hint();
    expect(engine.paths[0]).toEqual(EASY_001.solution[0]);
    expect(engine.paths[1]).toEqual([
      [1, 3],
      [1, 2],
    ]);
  });

  it('is a no-op once the level is won', () => {
    const engine = new Engine(TINY_3x3);
    for (const path of TINY_3x3.solution) drawPath(engine, path);
    expect(engine.won).toBe(true);
    expect(engine.hint()).toBe(false);
  });

  it('can finish a level on its own', () => {
    const engine = new Engine(TINY_3x3);
    engine.hint();
    engine.hint();
    expect(engine.won).toBe(true);
  });

  it('drops a cut path that is left holding only its endpoint', () => {
    const engine = new Engine(EASY_001);
    drawPath(engine, [
      [1, 3],
      [0, 3],
    ]);
    engine.hint();
    expect(engine.paths[1]).toHaveLength(0);
    expect(engine.occupantAt([1, 3])).toBe(1);
  });

  it('is undoable', () => {
    const engine = new Engine(EASY_001);
    engine.hint();
    expect(engine.canUndo).toBe(true);
    engine.undo();
    expect(engine.paths[0]).toHaveLength(0);
    expect(engine.hintUsed).toBe(true);
  });

  it('is refused while a stroke is active', () => {
    const engine = new Engine(EASY_001);
    engine.begin([0, 0]);
    expect(engine.hint()).toBe(false);
  });
});

describe('hint tally', () => {
  it('starts at zero and counts each hint taken', () => {
    const engine = new Engine(EASY_001);
    expect(engine.hintCount).toBe(0);
    expect(engine.hintUsed).toBe(false);
    expect(engine.hintsRemaining).toBe(MAX_HINTS_PER_LEVEL);

    engine.hint();
    expect(engine.hintCount).toBe(1);
    expect(engine.hintUsed).toBe(true);
    expect(engine.hintsRemaining).toBe(MAX_HINTS_PER_LEVEL - 1);
  });

  it('refuses a hint once the cap is reached', () => {
    const engine = new Engine(EASY_001);
    for (let i = 0; i < MAX_HINTS_PER_LEVEL; i++) {
      expect(engine.hint()).toBe(true);
    }
    expect(engine.hintsRemaining).toBe(0);

    const before = engine.snapshotPaths();
    expect(engine.hint()).toBe(false);
    expect(engine.hintCount).toBe(MAX_HINTS_PER_LEVEL);
    // A refused hint must change nothing: no path, no move, no undo entry.
    expect(engine.snapshotPaths()).toEqual(before);
  });

  it('hands the allowance back on restart, as a fresh attempt', () => {
    // Leaving a level and returning already refilled it, because only one
    // board is saved at a time. Restart doing something different was the
    // inconsistency; both are now a fresh attempt at the level.
    const engine = new Engine(EASY_001);
    for (let i = 0; i < MAX_HINTS_PER_LEVEL; i++) engine.hint();
    expect(engine.hintsRemaining).toBe(0);

    engine.restart();
    expect(engine.hintsRemaining).toBe(MAX_HINTS_PER_LEVEL);
    expect(engine.hint()).toBe(true);
  });

  it('gives a fresh level its own allowance', () => {
    const spent = new Engine(EASY_001);
    for (let i = 0; i < MAX_HINTS_PER_LEVEL; i++) spent.hint();
    expect(spent.hintsRemaining).toBe(0);

    // Replay builds a new engine, which is what makes this the right boundary.
    expect(new Engine(EASY_001).hintsRemaining).toBe(MAX_HINTS_PER_LEVEL);
  });

  it('still remembers the level was hinted after a restart', () => {
    // Spec 5.2 keeps hintUsed across a restart, which is what stops a restart
    // laundering away the Perfect badge. Only the allowance comes back.
    const engine = new Engine(EASY_001);
    engine.hint();
    engine.restart();
    expect(engine.hintUsed).toBe(true);
    expect(engine.hintCount).toBe(0);
    expect(engine.hintsRemaining).toBe(MAX_HINTS_PER_LEVEL);
  });

  it('keeps the tally through an undo', () => {
    const engine = new Engine(EASY_001);
    engine.hint();
    engine.undo();
    expect(engine.hintCount).toBe(1);
  });

  it('restores the tally of a saved board', () => {
    const engine = new Engine(EASY_001);
    engine.markHintUsed(4);
    expect(engine.hintCount).toBe(4);
    expect(engine.hintUsed).toBe(true);
  });

  it('treats a board saved before the tally as one hint', () => {
    const engine = new Engine(EASY_001);
    engine.markHintUsed();
    expect(engine.hintCount).toBe(1);
  });

  it('never lets a restore lower a tally already earned', () => {
    const engine = new Engine(EASY_001);
    engine.hint();
    engine.hint();
    engine.markHintUsed(1);
    expect(engine.hintCount).toBe(2);
    expect(engine.hintsRemaining).toBe(0);
  });
});
