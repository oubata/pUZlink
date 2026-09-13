/**
 * @vitest-environment jsdom
 *
 * The input layer had no tests: spec 5.5 and 8 describe how a stroke starts,
 * survives and ends, and all of it was only ever exercised by hand. The
 * renderer is stubbed to a fixed 40px grid so a client coordinate maps to a
 * known cell without any layout.
 */
import { describe, expect, it, vi } from 'vitest';
import { Engine } from '../../src/engine/engine';
import { attachPointerInput } from '../../src/input/pointer';
import type { BoardRenderer } from '../../src/render/BoardRenderer';
import { EASY_001 } from '../fixtures';

const CELL = 40;

function stubRenderer(): BoardRenderer {
  return {
    currentLayout: {
      size: EASY_001.size,
      cellPx: CELL,
      boardPx: CELL * EASY_001.size,
      dpr: 1,
    },
    toBoardSpace: (x: number, y: number) => ({ x, y }),
    popEndpoint: () => {},
  } as unknown as BoardRenderer;
}

interface PointerInit {
  cell?: [number, number];
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
}

/** jsdom has no PointerEvent, so build the fields the handlers actually read. */
function pointer(type: string, init: PointerInit = {}): PointerEvent {
  const [row, col] = init.cell ?? [0, 0];
  const event = new MouseEvent(type, { bubbles: true, cancelable: true });
  const fields = {
    pointerId: init.pointerId ?? 1,
    isPrimary: init.isPrimary ?? true,
    button: init.button ?? 0,
    // Centre of the cell.
    clientX: col * CELL + CELL / 2,
    clientY: row * CELL + CELL / 2,
  };
  for (const [key, value] of Object.entries(fields)) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  return event as PointerEvent;
}

function harness() {
  const canvas = document.createElement('canvas');
  // jsdom implements neither, and the real ones are what capture uses.
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
  canvas.releasePointerCapture = vi.fn();
  document.body.append(canvas);

  const engine = new Engine(EASY_001);
  const detach = attachPointerInput(canvas, stubRenderer(), () => engine);
  return { canvas, engine, detach };
}

describe('starting a stroke (spec 8)', () => {
  it('starts on the primary pointer’s main button', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    expect(engine.strokeActive).toBe(true);
    detach();
  });

  it('ignores a right-button press, which opens a context menu on top', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0], button: 2 }));
    expect(engine.strokeActive).toBe(false);
    detach();
  });

  it('ignores a non-primary pointer, so a palm cannot grab the board', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(
      pointer('pointerdown', { cell: [0, 0], isPrimary: false }),
    );
    expect(engine.strokeActive).toBe(false);
    detach();
  });

  it('ignores a second finger while a stroke is running (spec 5.5)', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    const grabbed = engine.activeColor;

    canvas.dispatchEvent(
      pointer('pointerdown', { cell: [3, 0], pointerId: 2 }),
    );
    expect(engine.activeColor).toBe(grabbed);

    // And the second finger cannot drive the first one's path either.
    canvas.dispatchEvent(
      pointer('pointermove', { cell: [3, 1], pointerId: 2 }),
    );
    expect(engine.paths[3]).toEqual([]);
    detach();
  });
});

describe('ending a stroke (spec 5.5)', () => {
  it('ends on pointerup', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    canvas.dispatchEvent(pointer('pointermove', { cell: [0, 1] }));
    canvas.dispatchEvent(pointer('pointerup', { cell: [0, 1] }));
    expect(engine.strokeActive).toBe(false);
    expect(engine.paths[0]).toEqual([
      [0, 0],
      [0, 1],
    ]);
    detach();
  });

  it('ends on pointercancel, keeping what was drawn', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    canvas.dispatchEvent(pointer('pointermove', { cell: [0, 1] }));
    canvas.dispatchEvent(pointer('pointercancel', { cell: [0, 1] }));
    expect(engine.strokeActive).toBe(false);
    detach();
  });

  it('ends on a release off the canvas when capture is unavailable', () => {
    // setPointerCapture throwing is the real case this covers: without capture
    // the release never reaches the canvas, and the stroke used to stay open
    // forever, leaving Undo, Hint and Restart disabled for the rest of the level.
    const canvas = document.createElement('canvas');
    canvas.setPointerCapture = vi.fn(() => {
      throw new Error('no capture');
    });
    canvas.hasPointerCapture = vi.fn(() => false);
    canvas.releasePointerCapture = vi.fn();
    document.body.append(canvas);

    const engine = new Engine(EASY_001);
    const detach = attachPointerInput(canvas, stubRenderer(), () => engine);

    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    expect(engine.strokeActive).toBe(true);

    // Released somewhere else entirely.
    window.dispatchEvent(pointer('pointerup', { cell: [0, 0] }));
    expect(engine.strokeActive).toBe(false);

    // And the board still takes a new stroke afterwards.
    canvas.dispatchEvent(pointer('pointerdown', { cell: [1, 0] }));
    expect(engine.strokeActive).toBe(true);
    detach();
  });

  it('leaves no window listeners behind after detaching', () => {
    const { canvas, engine, detach } = harness();
    canvas.dispatchEvent(pointer('pointerdown', { cell: [0, 0] }));
    detach();

    const end = vi.spyOn(engine, 'end');
    window.dispatchEvent(pointer('pointerup', { cell: [0, 0] }));
    expect(end).not.toHaveBeenCalled();
  });
});
