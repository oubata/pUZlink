import type { TierId } from '../engine/types';
import { TIERS, tierById, type TierConfig } from '../generator/difficulty';
import { generate } from '../generator/generate';
import {
  applyMotionMode,
  applyThemeMode,
  prefersReducedMotion,
  watchSystemPreferences,
} from '../render/theme';
import {
  Persistence,
  type InProgress,
  type Progress,
  type Settings,
} from '../storage/persistence';
import { clear, type View } from './dom';
import { silentFeedback, type Feedback } from './feedback';
import {
  createConfirmReset,
  createConfirmRestart,
} from './modals/ConfirmReset';
import { createHowToPlay } from './modals/HowToPlay';
import { createPaused } from './modals/Paused';
import { createSettings } from './modals/Settings';
import { createWon } from './modals/Won';
import {
  isPerfect,
  isUnlocked,
  nextLevel,
  recordSolve,
  solvedRecord,
} from './progress';
import { createHome } from './screens/Home';
import { createLevelSelect } from './screens/LevelSelect';
import { PlayView, type PlaySnapshot } from './screens/Play';
import {
  AppStateMachine,
  sameScreen,
  type ModalName,
  type Screen,
  type WonResult,
} from './state';

export interface AppOptions {
  root: HTMLElement;
  persistence?: Persistence;
  feedback?: Feedback;
}

export class App {
  private readonly root: HTMLElement;
  private readonly persistence: Persistence;
  private readonly machine = new AppStateMachine();

  private settings: Settings;
  private progress: Progress;
  private feedback: Feedback;

  private screenView: View | null = null;
  private modalView: View | null = null;
  private watchSystem: (() => void) | null = null;
  private play: PlayView | null = null;
  private mountedScreen: Screen = { name: 'boot' };

  /**
   * A solve that has been recorded and is waiting on the win animation before
   * its card is shown. It holds no state the player can lose: if they leave
   * first, this is dropped and the level stays solved.
   */
  private pendingWon: {
    tier: TierId;
    index: number;
    result: WonResult;
  } | null = null;

  constructor(options: AppOptions) {
    this.root = options.root;
    this.persistence = options.persistence ?? new Persistence();
    this.feedback = options.feedback ?? silentFeedback;
    this.settings = this.persistence.loadSettings();
    this.progress = this.persistence.loadProgress();
  }

  setFeedback(feedback: Feedback): void {
    this.feedback = feedback;
  }

  /**
   * Release what `start` subscribed to. The shipped app runs one App for the
   * life of the process and never calls this; it exists so a test can build one
   * without leaving an OS-preference listener behind.
   */
  destroy(): void {
    this.watchSystem?.();
    this.watchSystem = null;
    this.play?.destroy();
    this.play = null;
  }

  get currentSettings(): Settings {
    return this.settings;
  }

  start(): void {
    this.applySettings();
    this.machine.subscribe(() => {
      this.render();
      this.syncHistory();
    });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    /*
     * visibilitychange covers backgrounding; pagehide covers the rest — a tab
     * closing, a navigation away, a WebView being torn down. Saving twice is
     * free, and the board is otherwise only written at the end of a stroke.
     */
    window.addEventListener('pagehide', () => this.savePlayState());
    window.addEventListener('popstate', () => this.onPopState());
    this.wireNativeBackButton().catch((error: unknown) => {
      // Without the listener the platform default finishes the activity from
      // any screen, which is the bug it exists to fix — so say so out loud.
      console.error('Native back button unavailable', error);
    });
    this.watchSystem = watchSystemPreferences(() => this.onSystemChange());

    /*
     * A dev-only handle for the verification harness. Hints are capped at two,
     * so pressing Hint can no longer finish a board. Vite strips this branch
     * from a production build, so nothing ships with it.
     */
    if (import.meta.env.DEV) {
      (window as unknown as { __colorlink?: unknown }).__colorlink = {
        solve: (): boolean => this.play?.solveFromSolution() ?? false,
      };
    }

    /*
     * Launched from the pUZles hub, always open on Home.
     *
     * The hub is a launcher: you pick a game from a list, and every other game in it
     * lands on its own menu. Resuming straight into a board made pUZlink the odd one
     * out — you tapped pUZlink and got a half-finished puzzle instead of the menu.
     *
     * Standalone, resuming is still the right behaviour and is untouched. Either way
     * the saved board stays in storage: it is not opened for you, not discarded.
     */
    const fromHub =
      new URLSearchParams(window.location.search).get('from') === 'hub' ||
      (import.meta.env as Record<string, string | undefined>).VITE_HUB === '1';

    const resumed = fromHub ? null : this.persistence.loadInProgress();
    const target = resumed ? locateLevel(resumed.levelId) : null;
    if (resumed && target) {
      this.machine.toPlaying(target.tier, target.index);
    } else {
      if (resumed) this.persistence.clearInProgress();
      this.machine.toHome();
    }
  }

  // ---- Settings ---------------------------------------------------------

  private applySettings(): void {
    const root = document.documentElement;
    applyThemeMode(root, this.settings.theme);
    applyMotionMode(root, this.settings.reducedMotion);
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.persistence.saveSettings(this.settings);
    this.applySettings();
    this.play?.setOptions({
      colorBlindLabels: this.settings.colorBlind,
      reducedMotion: this.reducedMotion,
    });
  }

  private get reducedMotion(): boolean {
    return prefersReducedMotion(this.settings.reducedMotion);
  }

  /**
   * The OS switched light/dark or reduced motion under us. Both settings resolve
   * `system` themselves, so re-applying whatever is stored is the whole job —
   * and it is the same path the Settings modal takes, which repaints the canvas
   * with the new palette rather than leaving it on the old one.
   */
  private onSystemChange(): void {
    this.applySettings();
    this.play?.setOptions({
      colorBlindLabels: this.settings.colorBlind,
      reducedMotion: this.reducedMotion,
    });
  }

  // ---- Visibility -------------------------------------------------------

  private onVisibility(): void {
    if (document.hidden) {
      if (this.machine.screen.name === 'playing' && !this.machine.isPaused) {
        this.pause();
      }
    }
  }

  /*
   * A solved board is never paused. The state machine already refuses Paused on
   * the `won` screen, but between the engine winning and the card appearing the
   * screen is still `playing` — and Paused offers Restart, which wiped the board
   * out from under the solve that was about to be shown.
   */
  private pause(): void {
    if (this.play?.engine.won) return;
    this.play?.stopTimer();
    this.savePlayState();
    this.machine.pause();
  }

  private resume(): void {
    this.machine.resume();
    this.play?.resumeTimer();
  }

  private savePlayState(): void {
    const play = this.play;
    if (!play || play.engine.won) return;
    this.persistence.saveInProgress(toInProgress(play));
  }

  // ---- Rendering --------------------------------------------------------

  private render(): void {
    const { screen, modal } = this.machine.state;

    const keepBoard =
      (screen.name === 'won' || screen.name === 'playing') &&
      this.play !== null &&
      boardMatches(this.mountedScreen, screen);

    if (!sameScreen(this.mountedScreen, screen) && !keepBoard) {
      /*
       * The modal goes first. `clear` detaches everything, so tearing the modal
       * down afterwards ran its destroy on nodes that were already out of the
       * document — which is where focus restoration and the How to play board
       * renderer both live.
       */
      this.teardownModal();
      this.screenView?.destroy?.();
      clear(this.root);
      this.screenView = this.buildScreen(screen);
      if (this.screenView) {
        this.root.append(this.screenView.el);
        this.screenView.mounted?.();
      }
    }
    this.mountedScreen = screen;

    // The results card sits below the board rather than over it, so the solved
    // puzzle stays visible. The play screen has to give up its centring and the
    // controls that no longer apply.
    this.screenView?.el.classList.toggle('is-won', screen.name === 'won');

    this.teardownModal();
    this.modalView = modal ? this.buildModal(modal) : null;
    if (this.modalView) {
      this.root.append(this.modalView.el);
      this.modalView.mounted?.();
    }

    if (screen.name === 'won' && !modal) {
      this.modalView = this.buildWonCard(screen);
      this.root.append(this.modalView.el);
      this.modalView.mounted?.();
    }

    /*
     * Everything behind an open modal is inert: not clickable, not tabbable,
     * and not reachable by a screen reader's virtual cursor. `aria-modal` alone
     * only tells assistive technology to behave; it does not stop a click or a
     * keypress, and under the results card the board keeps real focus and live
     * keyboard shortcuts without it.
     */
    this.screenView?.el.toggleAttribute('inert', this.modalView !== null);
  }

  private teardownModal(): void {
    this.modalView?.destroy?.();
    this.modalView?.el.remove();
    this.modalView = null;
  }

  private buildScreen(screen: Screen): View | null {
    if (screen.name !== 'playing' && screen.name !== 'won') {
      this.play?.destroy();
      this.play = null;
    }

    switch (screen.name) {
      case 'boot':
        return null;
      case 'home':
        return createHome({
          progress: this.progress,
          onTier: (tier) => this.openTier(tier),
          onHowToPlay: () => this.machine.openModal('howToPlay'),
          onSettings: () => this.machine.openModal('settings'),
        });
      case 'levelSelect':
        return createLevelSelect({
          tier: screen.tier,
          progress: this.progress,
          onBack: () => this.machine.toHome(),
          onLevel: (index) => this.machine.toPlaying(screen.tier, index),
        });
      case 'playing':
      case 'won':
        return this.buildPlay(screen.tier, screen.index);
    }
  }

  private buildPlay(tierId: TierId, index: number): View {
    const tier = tierById(tierId);
    const level = generate(tier, index);
    const saved = this.persistence.loadInProgress();
    const restore = saved && saved.levelId === level.id ? saved : null;

    this.play?.destroy();
    this.pendingWon = null;
    this.play = new PlayView({
      level,
      tier,
      restore,
      colorBlindLabels: this.settings.colorBlind,
      reducedMotion: this.reducedMotion,
      feedback: this.feedback,
      onBack: () => this.machine.toLevelSelect(tierId),
      onPause: () => this.pause(),
      onSolved: (snapshot) => this.recordWin(tier, index, snapshot),
      onWinShown: () => this.showWon(),
      onPersist: (snapshot) =>
        this.persistence.saveInProgress(
          snapshot ? { levelId: level.id, ...snapshot } : null,
        ),
      onConfirmRestart: () => this.machine.openModal('confirmRestart'),
    });
    return this.play;
  }

  private buildModal(modal: ModalName): View | null {
    switch (modal) {
      case 'paused':
        return createPaused({
          elapsedMs: this.play?.elapsedMs ?? 0,
          onResume: () => this.resume(),
          onRestart: () => {
            this.machine.closeModal();
            this.play?.restartLevel();
            this.play?.resumeTimer();
          },
          onLevelList: () => {
            const screen = this.machine.screen;
            this.savePlayState();
            if (screen.name === 'playing')
              this.machine.toLevelSelect(screen.tier);
          },
          onSettings: () => this.machine.openModal('settings'),
          onHowToPlay: () => this.machine.openModal('howToPlay'),
        });
      case 'settings':
        return createSettings({
          settings: this.settings,
          hapticsAvailable: typeof navigator.vibrate === 'function',
          onChange: (patch) => this.updateSettings(patch),
          onReset: () => this.machine.openModal('confirmReset'),
          onClose: () => this.closeOverlay(),
        });
      case 'howToPlay':
        return createHowToPlay({
          colorBlindLabels: this.settings.colorBlind,
          onClose: () => this.closeOverlay(),
        });
      case 'confirmReset':
        return createConfirmReset({
          onConfirm: () => this.resetProgress(),
          onCancel: () => this.machine.openModal('settings'),
        });
      case 'confirmRestart':
        return createConfirmRestart({
          onConfirm: () => {
            this.machine.closeModal();
            this.play?.restartLevel();
          },
          onCancel: () => this.machine.closeModal(),
        });
    }
  }

  // ---- Back navigation ---------------------------------------------------

  /**
   * Android's back button, and the browser's, are the same gesture. Neither
   * knows about a screen machine that never touches the URL, so a spare history
   * entry stands in for "there is somewhere to go back to". Without it, back
   * closes the app from any screen.
   */
  private historyGuard = false;

  private get atRoot(): boolean {
    return this.machine.screen.name === 'home' && this.machine.modal === null;
  }

  /**
   * Android's back button never reaches the popstate above. Capacitor 6 ships
   * no back handling of its own, so `MainActivity` inherits the default and
   * finishes the activity: back closed the app from any screen. The App plugin
   * is what puts the press in reach of JS.
   *
   * Imported dynamically and only on a device, so the web build never loads it.
   */
  private async wireNativeBackButton(): Promise<void> {
    const capacitor = (
      window as unknown as {
        Capacitor?: { isNativePlatform?: () => boolean };
      }
    ).Capacitor;
    if (!capacitor?.isNativePlatform?.()) return;

    const { App: NativeApp } = await import('@capacitor/app');
    await NativeApp.addListener('backButton', () => {
      if (this.atRoot) {
        /*
         * Back at Home behaves like Home: the task goes to the background and
         * stays in Recents with its board intact. `exitApp` finished the
         * activity instead, which threw away the resume state the app had just
         * saved and made a return a cold start.
         */
        void NativeApp.minimizeApp();
        return;
      }
      this.goBack();
    });
  }

  private syncHistory(): void {
    /*
     * Back at the root: the guard entry has to go, or it sits on the stack
     * unconsumed and swallows the next back press — the player pressed back at
     * Home, nothing happened, and only a second press left the app. Popping it
     * here fires a popstate that the handler below ignores, because by then
     * there is nothing left to unwind.
     */
    if (this.atRoot) {
      // Only ever pop an entry this app pushed. Checking the state as well as
      // the flag keeps it honest if anything else has navigated in between.
      if (this.historyGuard) {
        this.historyGuard = false;
        if (isGuardEntry(history.state)) history.back();
      }
      return;
    }
    if (this.historyGuard) return;
    history.pushState({ colorlink: true }, '');
    this.historyGuard = true;
  }

  private onPopState(): void {
    // The guard entry has just been consumed.
    this.historyGuard = false;
    if (this.atRoot) return; // Nothing left to unwind: let the platform exit.
    this.goBack();
    this.syncHistory();
  }

  /** What the back chevron does on each screen, driven by the back gesture. */
  private goBack(): void {
    if (this.machine.modal !== null) {
      this.closeOverlay();
      return;
    }
    const screen = this.machine.screen;
    switch (screen.name) {
      case 'levelSelect':
        this.machine.toHome();
        return;
      case 'playing':
      case 'won':
        this.machine.toLevelSelect(screen.tier);
        return;
      default:
        return;
    }
  }

  /** Settings and How to play can be opened from Paused; close returns there. */
  private closeOverlay(): void {
    if (
      this.machine.screen.name === 'playing' &&
      this.play &&
      !this.play.engine.won
    ) {
      this.machine.pause();
    } else {
      this.machine.closeModal();
    }
  }

  private buildWonCard(screen: Extract<Screen, { name: 'won' }>): View {
    const tier = tierById(screen.tier);
    const next = nextLevel(tier, screen.index);
    return createWon({
      result: screen.result,
      hasNext: next !== null,
      onNext: () => {
        if (next !== null) this.machine.toPlaying(screen.tier, next);
        else this.machine.toLevelSelect(screen.tier);
      },
      onReplay: () => {
        this.persistence.clearInProgress();
        this.play?.destroy();
        this.play = null;
        this.mountedScreen = { name: 'boot' };
        this.machine.toPlaying(screen.tier, screen.index);
      },
      onLevelList: () => this.machine.toLevelSelect(screen.tier),
    });
  }

  // ---- Actions ----------------------------------------------------------

  private openTier(tierId: TierId): void {
    const tier = tierById(tierId);
    if (!isUnlocked(tier, this.progress)) return;
    this.machine.toLevelSelect(tierId);
  }

  /**
   * Write the solve, the instant the board is solved. Nothing here waits for the
   * animation: leaving the screen while the pairs are still lighting up cancels
   * the card, and used to cancel the record with it.
   */
  private recordWin(
    tier: TierConfig,
    index: number,
    snapshot: PlaySnapshot,
  ): void {
    const pairs = this.play?.engine.level.pairs.length ?? 0;
    const perfect = isPerfect(snapshot.moves, pairs, snapshot.hintUsed);
    const { progress, newBest } = recordSolve(
      this.progress,
      tier.id,
      index,
      {
        elapsedMs: snapshot.elapsedMs,
        hintUsed: snapshot.hintUsed,
        perfect,
      },
      new Date().toISOString(),
    );
    this.progress = progress;
    this.persistence.saveProgress(progress);
    this.persistence.clearInProgress();

    const record = solvedRecord(progress, tier.id, index);
    this.pendingWon = {
      tier: tier.id,
      index,
      result: {
        elapsedMs: snapshot.elapsedMs,
        bestMs: record?.bestMs ?? snapshot.elapsedMs,
        newBest,
        hintUsed: snapshot.hintUsed,
        hintCount: snapshot.hintCount,
        perfect,
      },
    };
  }

  /** The animation is over: show the card, if the player is still on it. */
  private showWon(): void {
    const pending = this.pendingWon;
    if (!pending) return;
    this.pendingWon = null;

    const screen = this.machine.screen;
    if (
      screen.name !== 'playing' ||
      screen.tier !== pending.tier ||
      screen.index !== pending.index
    ) {
      return;
    }
    this.machine.toWon(pending.result);
  }

  private resetProgress(): void {
    this.persistence.resetAll();
    this.progress = this.persistence.loadProgress();
    this.settings = this.persistence.loadSettings();
    this.applySettings();
    this.play?.destroy();
    this.play = null;
    this.pendingWon = null;
    this.mountedScreen = { name: 'boot' };
    this.machine.toHome();
  }
}

function toInProgress(play: PlayView): InProgress {
  return { levelId: play.engine.level.id, ...play.snapshot() };
}

/** The spare history entry `syncHistory` pushes, and nothing else. */
function isGuardEntry(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { colorlink?: unknown }).colorlink === true
  );
}

function boardMatches(a: Screen, b: Screen): boolean {
  const key = (screen: Screen): string =>
    screen.name === 'playing' || screen.name === 'won'
      ? `${screen.tier}:${screen.index}`
      : screen.name;
  return key(a) === key(b);
}

function locateLevel(levelId: string): { tier: TierId; index: number } | null {
  const match = /^([a-z]+)-(\d{3})$/.exec(levelId);
  if (!match) return null;
  const [, tierId, digits] = match;
  const tier = TIERS.find((t) => t.id === tierId);
  const index = Number(digits);
  if (
    !tier ||
    !Number.isInteger(index) ||
    index < 1 ||
    index > tier.levelCount
  ) {
    return null;
  }
  return { tier: tier.id, index };
}
