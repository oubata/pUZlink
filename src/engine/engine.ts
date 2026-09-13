import {
  cellEquals,
  cellIndex,
  clonePaths,
  EMPTY,
  isAdjacent,
  pathsEqual,
  type Cell,
  type EngineEvent,
  type EngineListener,
  type Level,
  type Paths,
} from './types';
import { isPathComplete, isWon, MAX_HINTS_PER_LEVEL } from './queries';

/**
 * The rules of pUZlink, exactly as tabulated in spec 5.2.
 *
 * Pure: no DOM, no randomness, no timers. The app owns the clock; the engine
 * owns the board.
 */
export class Engine {
  readonly level: Level;

  private readonly size: number;
  private readonly colorCount: number;
  private readonly pathsArr: Cell[][];
  /** Colour occupying each cell, or EMPTY. Endpoints always hold their colour. */
  private readonly occupant: Int32Array;
  /** Colour of the endpoint at each cell, or EMPTY. Never changes. */
  private readonly endpointColor: Int32Array;

  private undoStack: Cell[][][] = [];
  private strokeColor = EMPTY;
  private strokeSnapshot: Cell[][] | null = null;
  private movesCount = 0;
  /** Hints taken in the current attempt. Reset by restart. */
  private hintCounter = 0;
  /** Whether this level has ever been hinted. Survives restart (spec 5.2). */
  private hintWasUsed = false;
  private wonFlag = false;
  /** Bumped on every actual state change; drives the interpolation stop rule. */
  private mutations = 0;
  private listeners: EngineListener[] = [];

  constructor(level: Level) {
    this.level = level;
    this.size = level.size;
    this.colorCount = level.pairs.length;
    this.pathsArr = level.pairs.map(() => []);
    this.occupant = new Int32Array(this.size * this.size).fill(EMPTY);
    this.endpointColor = new Int32Array(this.size * this.size).fill(EMPTY);
    for (const pair of level.pairs) {
      this.endpointColor[cellIndex(this.size, pair.a)] = pair.color;
      this.endpointColor[cellIndex(this.size, pair.b)] = pair.color;
      this.occupant[cellIndex(this.size, pair.a)] = pair.color;
      this.occupant[cellIndex(this.size, pair.b)] = pair.color;
    }
  }

  // ---- Read-only views -------------------------------------------------

  get paths(): Paths {
    return this.pathsArr;
  }

  get moves(): number {
    return this.movesCount;
  }

  get hintUsed(): boolean {
    return this.hintWasUsed;
  }

  /** How many times hint() has been taken on this level. */
  get hintCount(): number {
    return this.hintCounter;
  }

  /** Hints still available on this level. */
  get hintsRemaining(): number {
    return Math.max(0, MAX_HINTS_PER_LEVEL - this.hintCounter);
  }

  get won(): boolean {
    return this.wonFlag;
  }

  get strokeActive(): boolean {
    return this.strokeColor !== EMPTY;
  }

  /** Colour of the active stroke, or EMPTY when idle. */
  get activeColor(): number {
    return this.strokeColor;
  }

  get canUndo(): boolean {
    return !this.strokeActive && this.undoStack.length > 0;
  }

  /** True once the player has drawn anything beyond the endpoints. */
  get hasDrawnCells(): boolean {
    return this.pathsArr.some((p) => p.length > 1);
  }

  occupantAt(cell: Cell): number {
    if (!this.inBounds(cell)) return EMPTY;
    return this.occupant[cellIndex(this.size, cell)] ?? EMPTY;
  }

  endpointColorAt(cell: Cell): number {
    if (!this.inBounds(cell)) return EMPTY;
    return this.endpointColor[cellIndex(this.size, cell)] ?? EMPTY;
  }

  isComplete(color: number): boolean {
    return isPathComplete(this.level, this.pathsArr, color);
  }

  /** Deep copy, for persistence and tests. */
  snapshotPaths(): Cell[][] {
    return clonePaths(this.pathsArr);
  }

  on(listener: EngineListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  // ---- Operations (spec 5.2) -------------------------------------------

  /** Start a stroke. Returns true when a stroke became active. */
  begin(cell: Cell): boolean {
    if (this.strokeActive) this.end();
    if (this.wonFlag || !this.inBounds(cell)) return false;

    const index = cellIndex(this.size, cell);
    const endpoint = this.endpointColor[index] ?? EMPTY;
    const occupied = this.occupant[index] ?? EMPTY;

    if (endpoint !== EMPTY) {
      const snapshot = clonePaths(this.pathsArr);
      this.truncatePath(endpoint, 0);
      this.appendCell(endpoint, cell);
      this.strokeColor = endpoint;
      this.strokeSnapshot = snapshot;
      this.mutations++;
      this.emit({ type: 'change' });
      return true;
    }

    if (occupied !== EMPTY) {
      const position = this.indexInPath(occupied, cell);
      if (position < 0) return false;
      const snapshot = clonePaths(this.pathsArr);
      this.truncatePath(occupied, position + 1);
      this.strokeColor = occupied;
      this.strokeSnapshot = snapshot;
      this.mutations++;
      this.emit({ type: 'change' });
      return true;
    }

    return false;
  }

  extend(cell: Cell): void {
    if (!this.strokeActive || this.wonFlag) return;
    if (!this.inBounds(cell)) return;

    const color = this.strokeColor;
    const path = this.path(color);
    const head = path[path.length - 1];
    if (!head) return;
    if (cellEquals(cell, head)) return;
    if (this.isComplete(color)) return;

    if (!isAdjacent(head, cell)) {
      if (head[0] === cell[0] || head[1] === cell[1]) {
        this.interpolate(head, cell);
      }
      return;
    }

    this.extendAdjacent(color, cell);
  }

  end(): void {
    if (!this.strokeActive) return;
    const snapshot = this.strokeSnapshot;
    this.strokeColor = EMPTY;
    this.strokeSnapshot = null;
    this.normalize();
    if (snapshot && !pathsEqual(snapshot, this.pathsArr)) {
      this.undoStack.push(snapshot);
      this.movesCount++;
      this.emit({ type: 'change' });
    }
  }

  undo(): boolean {
    if (this.strokeActive) return false;
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    this.setPaths(snapshot);
    this.wonFlag = isWon(this.level, this.pathsArr);
    this.mutations++;
    this.emit({ type: 'change' });
    return true;
  }

  restart(): void {
    if (this.strokeActive) return;
    this.setPaths(this.level.pairs.map(() => []));
    this.undoStack = [];
    this.movesCount = 0;
    // A restart is a fresh attempt at the level, so it gets the full hint
    // allowance back. `hintWasUsed` deliberately does not reset: spec 5.2
    // keeps it, which stops a restart laundering away the Perfect badge.
    this.hintCounter = 0;
    this.wonFlag = false;
    this.mutations++;
    this.emit({ type: 'change' });
  }

  /** Draw the solution for the lowest colour that is not already solution-shaped. */
  hint(): boolean {
    if (this.strokeActive || this.wonFlag) return false;
    if (this.hintsRemaining === 0) return false;
    const color = this.firstUnsolvedColor();
    if (color === EMPTY) return false;

    const solution = this.level.solution[color];
    if (!solution) return false;

    const snapshot = clonePaths(this.pathsArr);
    const wanted = new Set(solution.map((c) => cellIndex(this.size, c)));

    for (let d = 0; d < this.colorCount; d++) {
      if (d === color) continue;
      const other = this.path(d);
      let cutAt = -1;
      for (let i = 0; i < other.length; i++) {
        const c = other[i];
        if (c && wanted.has(cellIndex(this.size, c))) {
          cutAt = i;
          break;
        }
      }
      if (cutAt >= 0) {
        const removed = this.truncatePath(d, cutAt);
        this.emit({ type: 'pathCut', color: d, removed });
      }
    }

    this.truncatePath(color, 0);
    for (const c of solution) this.appendCell(color, c);
    this.normalize();

    this.undoStack.push(snapshot);
    this.movesCount++;
    this.hintCounter++;
    this.hintWasUsed = true;
    this.mutations++;
    this.emit({ type: 'pathCompleted', color });
    this.emit({ type: 'change' });
    this.evaluateWin();
    return true;
  }

  /**
   * Which colour the next hint would draw, or EMPTY when there is none.
   *
   * The board screen needs this to animate the right path, and it must be the
   * engine's own answer: a second copy in the view that compared path *lengths*
   * once picked a different colour than the hint actually drew, so the reveal
   * played over an untouched path.
   */
  nextHintColor(): number {
    return this.firstUnsolvedColor();
  }

  /** Restore the hint tally of a saved board. */
  markHintUsed(count = 1): void {
    this.hintWasUsed = true;
    this.hintCounter = Math.max(
      this.hintCounter,
      Math.max(0, Math.trunc(count)),
    );
  }

  /**
   * Replace the board with a previously saved set of paths. Returns false and
   * leaves the engine untouched when the paths break any invariant.
   *
   * `moves` carries the saved move count back in, and it matters: Perfect is
   * "one move per pair with no hint" (spec 5.4), so a resumed board that
   * restarted its tally at zero could never earn the badge however it was
   * finished. The undo stack is deliberately not restored — it is not saved.
   */
  restore(paths: readonly (readonly Cell[])[], moves = 0): boolean {
    if (!this.isValidPathSet(paths)) return false;
    this.strokeColor = EMPTY;
    this.strokeSnapshot = null;
    this.setPaths(clonePaths(paths));
    this.normalize();
    this.undoStack = [];
    this.movesCount = Math.max(0, Math.trunc(moves));
    this.wonFlag = isWon(this.level, this.pathsArr);
    this.mutations++;
    this.emit({ type: 'change' });
    return true;
  }

  // ---- Internals -------------------------------------------------------

  private interpolate(from: Cell, to: Cell): void {
    const dr = Math.sign(to[0] - from[0]);
    const dc = Math.sign(to[1] - from[1]);
    let current: Cell = from;
    while (!cellEquals(current, to)) {
      const next: Cell = [current[0] + dr, current[1] + dc];
      const before = this.mutations;
      this.extend(next);
      if (this.mutations === before) return;
      if (!this.strokeActive) return;
      current = next;
    }
  }

  private extendAdjacent(color: number, cell: Cell): void {
    const index = cellIndex(this.size, cell);
    const existing = this.indexInPath(color, cell);

    if (existing >= 0) {
      this.truncatePath(color, existing + 1);
      this.afterMutation();
      return;
    }

    const endpoint = this.endpointColor[index] ?? EMPTY;
    if (endpoint !== EMPTY && endpoint !== color) return;

    if (endpoint === color) {
      this.appendCell(color, cell);
      this.emit({ type: 'pathCompleted', color });
      this.afterMutation();
      return;
    }

    const occupied = this.occupant[index] ?? EMPTY;
    if (occupied !== EMPTY && occupied !== color) {
      const cutAt = this.indexInPath(occupied, cell);
      if (cutAt >= 0) {
        const removed = this.truncatePath(occupied, cutAt);
        this.emit({ type: 'pathCut', color: occupied, removed });
      }
    }

    this.appendCell(color, cell);
    this.afterMutation();
  }

  private afterMutation(): void {
    this.mutations++;
    this.emit({ type: 'change' });
    this.evaluateWin();
  }

  private evaluateWin(): void {
    if (this.wonFlag) return;
    if (!isWon(this.level, this.pathsArr)) return;
    this.wonFlag = true;
    if (this.strokeActive) this.end();
    this.emit({ type: 'won' });
  }

  /**
   * A path holding nothing but its own start endpoint is indistinguishable on
   * the board from no path at all, so it is stored as none. Only an in-flight
   * stroke is allowed to sit at length 1.
   */
  private normalize(): void {
    for (let c = 0; c < this.colorCount; c++) {
      if (c === this.strokeColor) continue;
      if (this.path(c).length === 1) this.truncatePath(c, 0);
    }
  }

  private appendCell(color: number, cell: Cell): void {
    this.path(color).push(cell);
    this.occupant[cellIndex(this.size, cell)] = color;
  }

  /** Returns the cells that were dropped, so the renderer can fade them out. */
  private truncatePath(color: number, length: number): Cell[] {
    const path = this.path(color);
    const removed = path.slice(length);
    for (const cell of removed) {
      const index = cellIndex(this.size, cell);
      this.occupant[index] = this.endpointColor[index] ?? EMPTY;
    }
    path.length = length;
    return removed;
  }

  private setPaths(paths: Cell[][]): void {
    for (let c = 0; c < this.colorCount; c++) {
      this.truncatePath(c, 0);
    }
    for (let c = 0; c < this.colorCount; c++) {
      const replacement = paths[c] ?? [];
      for (const cell of replacement) this.appendCell(c, cell);
    }
  }

  private indexInPath(color: number, cell: Cell): number {
    const path = this.pathsArr[color];
    if (!path) return -1;
    for (let i = 0; i < path.length; i++) {
      const c = path[i];
      if (c && cellEquals(c, cell)) return i;
    }
    return -1;
  }

  private firstUnsolvedColor(): number {
    for (let c = 0; c < this.colorCount; c++) {
      const solution = this.level.solution[c];
      const path = this.pathsArr[c];
      if (!solution || !path) continue;
      if (path.length !== solution.length) return c;
      const wanted = new Set(
        solution.map((cell) => cellIndex(this.size, cell)),
      );
      for (const cell of path) {
        if (!wanted.has(cellIndex(this.size, cell))) return c;
      }
    }
    return EMPTY;
  }

  private inBounds(cell: Cell): boolean {
    return (
      Number.isInteger(cell[0]) &&
      Number.isInteger(cell[1]) &&
      cell[0] >= 0 &&
      cell[0] < this.size &&
      cell[1] >= 0 &&
      cell[1] < this.size
    );
  }

  private path(color: number): Cell[] {
    const path = this.pathsArr[color];
    if (!path) throw new Error(`Engine: no path for colour ${color}`);
    return path;
  }

  private isValidPathSet(paths: readonly (readonly Cell[])[]): boolean {
    if (paths.length !== this.colorCount) return false;
    const seen = new Set<number>();
    for (let c = 0; c < paths.length; c++) {
      const path = paths[c];
      const pair = this.level.pairs[c];
      if (!path || !pair) return false;
      if (path.length === 0) continue;

      const first = path[0];
      if (!first || !this.inBounds(first)) return false;
      if (!cellEquals(first, pair.a) && !cellEquals(first, pair.b))
        return false;
      const far = cellEquals(first, pair.a) ? pair.b : pair.a;

      for (let i = 0; i < path.length; i++) {
        const cell = path[i];
        if (!cell || !this.inBounds(cell)) return false;
        const index = cellIndex(this.size, cell);
        if (seen.has(index)) return false;
        seen.add(index);
        const endpoint = this.endpointColor[index] ?? EMPTY;
        if (endpoint !== EMPTY && endpoint !== c) return false;
        if (cellEquals(cell, far) && i !== path.length - 1) return false;
        if (i > 0) {
          const previous = path[i - 1];
          if (!previous || !isAdjacent(previous, cell)) return false;
        }
      }
    }
    return true;
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
