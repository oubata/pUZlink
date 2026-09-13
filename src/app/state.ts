import type { TierId } from '../engine/types';
import { isPaywalled } from './freeLimit';

export interface WonResult {
  elapsedMs: number;
  bestMs: number;
  newBest: boolean;
  hintUsed: boolean;
  hintCount: number;
  perfect: boolean;
}

export type Screen =
  | { name: 'boot' }
  | { name: 'home' }
  | { name: 'levelSelect'; tier: TierId }
  | { name: 'playing'; tier: TierId; index: number }
  | { name: 'won'; tier: TierId; index: number; result: WonResult };

export type ModalName =
  'settings' | 'howToPlay' | 'confirmReset' | 'confirmRestart' | 'paused';

export interface AppState {
  screen: Screen;
  modal: ModalName | null;
}

export type StateListener = (state: AppState, previous: AppState) => void;

/**
 * The screen/modal machine of spec 6. Exactly one screen, at most one modal.
 * Illegal transitions are ignored rather than throwing, so a stray click during
 * an animation cannot wedge the app.
 */
export class AppStateMachine {
  private current: AppState = { screen: { name: 'boot' }, modal: null };
  private listeners: StateListener[] = [];

  get state(): AppState {
    return this.current;
  }

  get screen(): Screen {
    return this.current.screen;
  }

  get modal(): ModalName | null {
    return this.current.modal;
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  toHome(): void {
    this.set({ screen: { name: 'home' }, modal: null });
  }

  toLevelSelect(tier: TierId): void {
    this.set({ screen: { name: 'levelSelect', tier }, modal: null });
  }

  toPlaying(tier: TierId, index: number): void {
    // The pUZles free limit, enforced once: a level tile, Next after a solve and a
    // resumed board all arrive here. Past it the player lands on that tier's grid,
    // where the padlock and its label say why.
    if (isPaywalled(tier, index)) {
      this.set({ screen: { name: 'levelSelect', tier }, modal: null });
      return;
    }
    this.set({ screen: { name: 'playing', tier, index }, modal: null });
  }

  toWon(result: WonResult): void {
    const screen = this.current.screen;
    if (screen.name !== 'playing') return;
    this.set({
      screen: { name: 'won', tier: screen.tier, index: screen.index, result },
      modal: null,
    });
  }

  openModal(modal: ModalName): void {
    if (modal === 'paused' && this.current.screen.name !== 'playing') return;
    this.set({ ...this.current, modal });
  }

  closeModal(): void {
    if (this.current.modal === null) return;
    this.set({ ...this.current, modal: null });
  }

  /** Pause is only meaningful over a live board. */
  pause(): void {
    this.openModal('paused');
  }

  resume(): void {
    if (this.current.modal === 'paused') this.closeModal();
  }

  get isPaused(): boolean {
    return this.current.modal === 'paused';
  }

  private set(next: AppState): void {
    const previous = this.current;
    if (
      previous.modal === next.modal &&
      sameScreen(previous.screen, next.screen)
    ) {
      return;
    }
    this.current = next;
    for (const listener of this.listeners) listener(next, previous);
  }
}

export function sameScreen(a: Screen, b: Screen): boolean {
  if (a.name !== b.name) return false;
  switch (a.name) {
    case 'levelSelect':
      return b.name === 'levelSelect' && a.tier === b.tier;
    case 'playing':
      return b.name === 'playing' && a.tier === b.tier && a.index === b.index;
    case 'won':
      return b.name === 'won' && a.tier === b.tier && a.index === b.index;
    default:
      return true;
  }
}
