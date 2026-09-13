import { STORAGE_PREFIX, STORAGE_KEYS } from '../app/config';
import type { Cell, TierId } from '../engine/types';
import { TIERS } from '../generator/difficulty';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SolvedRecord {
  bestMs: number;
  hint: boolean;
  perfect: boolean;
  /** ISO timestamp of the first solve. */
  at: string;
}

export interface TierProgress {
  solved: Record<number, SolvedRecord>;
}

export interface Progress {
  tiers: Record<TierId, TierProgress>;
}

export type ThemeSetting = 'system' | 'light' | 'dark';
export type MotionSetting = 'system' | 'on' | 'off';

export interface Settings {
  theme: ThemeSetting;
  sound: boolean;
  haptics: boolean;
  colorBlind: boolean;
  reducedMotion: MotionSetting;
}

export interface InProgress {
  levelId: string;
  paths: Cell[][];
  elapsedMs: number;
  moves: number;
  hintUsed: boolean;
  hintCount: number;
}

/*
 * Derived, not hand-listed. `parseProgress` walks this to read a saved file, so
 * a second copy that fell behind `difficulty.ts` would silently drop a whole
 * tier's solved levels on every load.
 */
const TIER_IDS: readonly TierId[] = TIERS.map((tier) => tier.id);

export function defaultProgress(): Progress {
  const tiers = {} as Record<TierId, TierProgress>;
  for (const id of TIER_IDS) tiers[id] = { solved: {} };
  return { tiers };
}

export function defaultSettings(): Settings {
  return {
    theme: 'system',
    sound: true,
    // Spec 2.12 defaults this on. Off is the kinder first run: a buzz on every
    // connected pair is a strong opinion to impose before anyone asks for it,
    // and the toggle is right there in Settings.
    haptics: false,
    colorBlind: false,
    reducedMotion: 'system',
  };
}

/**
 * Typed load/save for the three keys (spec 11.2). Anything unparseable or
 * shaped wrong falls back to defaults rather than throwing: a corrupt save must
 * never stop the game from starting.
 */
export class Persistence {
  private readonly storage: StorageLike | null;

  constructor(storage: StorageLike | null = defaultStorage()) {
    this.storage = storage;
  }

  loadProgress(): Progress {
    const raw = this.read(STORAGE_KEYS.progress);
    return parseProgress(raw) ?? defaultProgress();
  }

  saveProgress(progress: Progress): void {
    this.write(STORAGE_KEYS.progress, progress);
  }

  loadSettings(): Settings {
    const raw = this.read(STORAGE_KEYS.settings);
    return parseSettings(raw) ?? defaultSettings();
  }

  saveSettings(settings: Settings): void {
    this.write(STORAGE_KEYS.settings, settings);
  }

  loadInProgress(): InProgress | null {
    return parseInProgress(this.read(STORAGE_KEYS.inProgress));
  }

  saveInProgress(value: InProgress | null): void {
    if (value === null) this.clearInProgress();
    else this.write(STORAGE_KEYS.inProgress, value);
  }

  clearInProgress(): void {
    this.remove(STORAGE_KEYS.inProgress);
  }

  resetAll(): void {
    for (const key of Object.values(STORAGE_KEYS)) this.remove(key);
  }

  private read(key: string): unknown {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(key);
      if (raw === null) return null;
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota or private-mode failure: the game keeps working unsaved.
    }
  }

  /*
   * Wrapped for the same reason as `write`. A store can start refusing after it
   * was writable at boot, and this one runs on the win path — an exception here
   * would have thrown straight through the code that shows the results card.
   */
  private remove(key: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch {
      // Nothing to do: the value stays, and every read of it is validated.
    }
  }
}

// ---- Parsing ------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseProgress(raw: unknown): Progress | null {
  if (!isRecord(raw) || !isRecord(raw['tiers'])) return null;
  const source = raw['tiers'];
  const progress = defaultProgress();

  for (const id of TIER_IDS) {
    const tier = source[id];
    if (!isRecord(tier) || !isRecord(tier['solved'])) continue;
    const solved: Record<number, SolvedRecord> = {};
    for (const [key, value] of Object.entries(tier['solved'])) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 1) continue;
      const record = parseSolved(value);
      if (record) solved[index] = record;
    }
    progress.tiers[id] = { solved };
  }
  return progress;
}

function parseSolved(raw: unknown): SolvedRecord | null {
  if (!isRecord(raw)) return null;
  const bestMs = raw['bestMs'];
  if (typeof bestMs !== 'number' || !Number.isFinite(bestMs) || bestMs < 0) {
    return null;
  }
  return {
    bestMs,
    hint: raw['hint'] === true,
    perfect: raw['perfect'] === true,
    at: typeof raw['at'] === 'string' ? raw['at'] : '',
  };
}

export function parseSettings(raw: unknown): Settings | null {
  if (!isRecord(raw)) return null;
  const defaults = defaultSettings();
  const theme = raw['theme'];
  const motion = raw['reducedMotion'];
  return {
    theme: isTheme(theme) ? theme : defaults.theme,
    sound: typeof raw['sound'] === 'boolean' ? raw['sound'] : defaults.sound,
    haptics:
      typeof raw['haptics'] === 'boolean' ? raw['haptics'] : defaults.haptics,
    colorBlind:
      typeof raw['colorBlind'] === 'boolean'
        ? raw['colorBlind']
        : defaults.colorBlind,
    reducedMotion: isMotion(motion) ? motion : defaults.reducedMotion,
  };
}

export function parseInProgress(raw: unknown): InProgress | null {
  if (!isRecord(raw)) return null;
  const levelId = raw['levelId'];
  const paths = raw['paths'];
  const elapsedMs = raw['elapsedMs'];
  if (typeof levelId !== 'string' || levelId.length === 0) return null;
  if (!Array.isArray(paths)) return null;
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs)) return null;

  const parsed: Cell[][] = [];
  for (const path of paths) {
    if (!Array.isArray(path)) return null;
    const cells: Cell[] = [];
    for (const cell of path) {
      if (!Array.isArray(cell) || cell.length !== 2) return null;
      const [row, col] = cell as unknown[];
      if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
      cells.push([row as number, col as number]);
    }
    parsed.push(cells);
  }

  // Boards saved before the tally existed only recorded that a hint happened,
  // so one is the most that can honestly be claimed for them.
  const storedCount = raw['hintCount'];
  const hintCount =
    typeof storedCount === 'number' && Number.isFinite(storedCount)
      ? Math.max(0, Math.trunc(storedCount))
      : raw['hintUsed'] === true
        ? 1
        : 0;

  return {
    levelId,
    paths: parsed,
    elapsedMs: Math.max(0, elapsedMs),
    moves: typeof raw['moves'] === 'number' ? raw['moves'] : 0,
    hintUsed: hintCount > 0,
    hintCount,
  };
}

function isTheme(value: unknown): value is ThemeSetting {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isMotion(value: unknown): value is MotionSetting {
  return value === 'system' || value === 'on' || value === 'off';
}

function defaultStorage(): StorageLike | null {
  try {
    const probe = globalThis.localStorage;
    if (!probe) return null;
    // Prefixed like everything else the app writes, so `resetAll` would sweep
    // it up if the remove below ever failed.
    const key = `${STORAGE_PREFIX}probe`;
    probe.setItem(key, '1');
    probe.removeItem(key);
    return probe;
  } catch {
    return null;
  }
}
