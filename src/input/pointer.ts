import type { Engine } from '../engine/engine';
import { EMPTY, type Cell } from '../engine/types';
import type { BoardRenderer } from '../render/BoardRenderer';
import { cellAt } from '../render/layout';

export interface PointerHooks {
  /** Fired when a stroke actually starts, with the colour that was grabbed. */
  onStrokeStart?: (color: number, cell: Cell) => void;
  onStrokeEnd?: () => void;
}

/**
 * Maps Pointer Events on the board canvas to engine operations (spec 8).
 * Only the first active pointer is tracked; the rest are ignored until it ends.
 */
export function attachPointerInput(
  canvas: HTMLCanvasElement,
  renderer: BoardRenderer,
  getEngine: () => Engine | null,
  hooks: PointerHooks = {},
): () => void {
  let activePointer: number | null = null;

  const resolve = (event: PointerEvent): Cell | null => {
    const { x, y } = renderer.toBoardSpace(event.clientX, event.clientY);
    return cellAt(renderer.currentLayout, x, y);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (activePointer !== null) return;
    /*
     * The main button of the primary pointer, and nothing else. Without this a
     * right-click starts a stroke and then the context menu opens on top of it,
     * and a stylus barrel button does the same.
     */
    if (!event.isPrimary || event.button !== 0) return;
    const engine = getEngine();
    if (!engine || engine.won) return;

    const cell = resolve(event);
    if (!cell) return;

    if (engine.begin(cell)) {
      activePointer = event.pointerId;
      capture(canvas, event.pointerId);
      listenForRelease();
      event.preventDefault();
      const color = engine.activeColor;
      if (color !== EMPTY) {
        renderer.popEndpoint(color);
        hooks.onStrokeStart?.(color, cell);
      }
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    const engine = getEngine();
    if (!engine) return;
    const cell = resolve(event);
    // Off the board is simply "no cell": the stroke waits for the pointer back.
    if (cell) engine.extend(cell);
    event.preventDefault();
  };

  const finish = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    stopListeningForRelease();
    release(canvas, event.pointerId);
    getEngine()?.end();
    hooks.onStrokeEnd?.();
  };

  /*
   * Capture normally guarantees the release event comes back to the canvas even
   * when the finger has left it. When `setPointerCapture` throws — it can, and
   * the catch below is why the drag survives — nothing guarantees that, and a
   * pointer released off the canvas left the stroke open forever: the engine
   * stayed mid-stroke and Undo, Hint and Restart stayed disabled for good.
   * These are the fallback, live only while a stroke is running.
   */
  const listenForRelease = (): void => {
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const stopListeningForRelease = (): void => {
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  canvas.addEventListener('lostpointercapture', finish);

  return () => {
    activePointer = null;
    stopListeningForRelease();
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', finish);
    canvas.removeEventListener('pointercancel', finish);
    canvas.removeEventListener('lostpointercapture', finish);
  };
}

/** Capture keeps the stroke alive off the edge of the canvas, but a pointer
 * that is already gone makes the call throw, and that must not kill the drag. */
function capture(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.setPointerCapture(pointerId);
  } catch {
    // No capture available; pointermove on the canvas still drives the stroke.
  }
}

function release(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    if (canvas.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
  } catch {
    // Already released.
  }
}
