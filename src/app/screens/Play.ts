import { Engine } from '../../engine/engine';
import { completedCount, coveragePercent } from '../../engine/queries';
import { EMPTY, type Cell, type Level } from '../../engine/types';
import type { TierConfig } from '../../generator/difficulty';
import { attachKeyboardInput } from '../../input/keyboard';
import { attachPointerInput } from '../../input/pointer';
import { BoardRenderer } from '../../render/BoardRenderer';
import { ANIM, TIMER } from '../config';
import { el, type View } from '../dom';
import type { Feedback } from '../feedback';
import { formatTime } from '../format';
import { ICONS } from '../icons';
import { S } from '../strings';

export interface PlaySnapshot {
  paths: Cell[][];
  elapsedMs: number;
  moves: number;
  hintUsed: boolean;
  hintCount: number;
}

export interface PlayProps {
  level: Level;
  tier: TierConfig;
  restore: PlaySnapshot | null;
  colorBlindLabels: boolean;
  reducedMotion: boolean;
  feedback: Feedback;
  onBack(): void;
  onPause(): void;
  /**
   * The level is solved. Called synchronously at the moment the engine says so,
   * before anything is animated, because this is what records the solve.
   */
  onSolved(snapshot: PlaySnapshot): void;
  /** The win animation has finished and the results card can be shown. */
  onWinShown(): void;
  onPersist(snapshot: PlaySnapshot | null): void;
  onConfirmRestart(): void;
}

/**
 * The board screen: canvas, HUD and toolbar, plus the per-attempt clock. The
 * timer does not start until the first pointer-down (spec 6).
 */
export class PlayView implements View {
  readonly el: HTMLElement;
  readonly engine: Engine;

  private readonly props: PlayProps;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: BoardRenderer;
  private readonly statLines: HTMLElement;
  private readonly statFilled: HTMLElement;
  private readonly statTime: HTMLElement;
  private readonly pauseButton: HTMLButtonElement;
  private readonly undoButton: HTMLButtonElement;
  private readonly hintButton: HTMLButtonElement;
  private readonly restartButton: HTMLButtonElement;

  private detach: (() => void)[] = [];
  private elapsedBase = 0;
  private runningSince: number | null = null;
  private ticker = 0;
  private winTimer = 0;
  private updateFrame = 0;
  private finished = false;

  constructor(props: PlayProps) {
    this.props = props;
    this.engine = new Engine(props.level);

    this.canvas = el('canvas', {
      class: 'board',
      attrs: {
        role: 'application',
        tabindex: '0',
        'aria-label': S.boardLabel(
          props.tier.name,
          props.level.index,
          props.level.size,
          props.level.pairs.length,
        ),
      },
    });

    this.statLines = el('span', { class: 'stat' });
    this.statFilled = el('span', { class: 'stat' });
    this.statTime = el('span', { class: 'stat' });

    this.pauseButton = el('button', {
      class: 'icon-button',
      html: ICONS.pause,
      attrs: { type: 'button', 'aria-label': S.pause },
      on: { click: () => this.props.onPause() },
    });

    this.undoButton = toolButton(ICONS.undo, S.undo, () => this.undo());
    this.hintButton = toolButton(ICONS.hint, S.hint, () => this.hint());
    this.restartButton = toolButton(ICONS.restart, S.restart, () =>
      this.askRestart(),
    );

    this.el = el('main', { class: 'screen screen--play' }, [
      el('header', { class: 'topbar' }, [
        el('button', {
          class: 'icon-button',
          html: ICONS.back,
          attrs: { type: 'button', 'aria-label': S.back },
          on: { click: () => this.leave() },
        }),
        el('h1', {
          class: 'topbar__title',
          text: S.playTitle(props.tier.name, props.level.index),
        }),
        this.pauseButton,
      ]),
      el('div', { class: 'board-wrap' }, [this.canvas]),
      /*
       * Only the two counters are announced. The clock ticks four times a
       * second, and while it sat inside this atomic live region every tick
       * re-announced the whole row — "Lines 2/5, Filled 40%, 1:23" over and
       * over, which drowns out the changes the region exists to report and
       * makes the board unusable with a screen reader.
       */
      el('p', { class: 'stats' }, [
        el(
          'span',
          {
            class: 'stats__counts',
            attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' },
          },
          [this.statLines, this.statFilled],
        ),
        this.statTime,
      ]),
      el('div', { class: 'toolbar' }, [
        this.undoButton,
        this.hintButton,
        this.restartButton,
      ]),
    ]);

    this.renderer = new BoardRenderer(this.canvas, document.documentElement);
    this.renderer.setOptions({
      colorBlindLabels: props.colorBlindLabels,
      reducedMotion: props.reducedMotion,
    });
    this.renderer.setEngine(this.engine);

    /*
     * A saved board is all-or-nothing. `restore` refuses a path set that breaks
     * an invariant — a hand-edited store, or a level that generates differently
     * than it did when the board was saved — and the clock and the hint tally
     * must not be applied on top of the empty board that leaves behind. Drop
     * the save and start the level clean.
     */
    if (props.restore) {
      const restored = this.engine.restore(
        props.restore.paths,
        props.restore.moves,
      );
      if (restored) {
        if (props.restore.hintUsed) {
          this.engine.markHintUsed(props.restore.hintCount);
        }
        this.elapsedBase = props.restore.elapsedMs;
      } else {
        props.onPersist(null);
      }
    }

    this.wire();
    this.update();
  }

  mounted(): void {
    this.relayout();
    this.canvas.focus();
  }

  destroy(): void {
    this.stopTimer();
    window.clearTimeout(this.winTimer);
    cancelAnimationFrame(this.updateFrame);
    for (const off of this.detach) off();
    this.detach = [];
    this.renderer.destroy();
  }

  // ---- Timer ------------------------------------------------------------

  /*
   * The clock accumulates tick by tick rather than measuring one span from the
   * moment it started, so that no single stretch of wall time can add more than
   * `TIMER.maxTickDeltaMs`. `performance.now()` keeps advancing while a device
   * sleeps, and the pause that would stop the clock hangs off visibilitychange,
   * which a hard suspend does not always fire.
   */
  private fold(now: number): number {
    if (this.runningSince === null) return 0;
    const delta = Math.min(now - this.runningSince, TIMER.maxTickDeltaMs);
    this.runningSince = now;
    return Math.max(0, delta);
  }

  get elapsedMs(): number {
    if (this.runningSince === null) return this.elapsedBase;
    // Reading the clock also folds: the getter is called on every repaint, so
    // the live tail is never longer than one tick either.
    this.elapsedBase += this.fold(performance.now());
    return this.elapsedBase;
  }

  startTimer(): void {
    if (this.runningSince !== null || this.finished) return;
    this.runningSince = performance.now();
    this.ticker = window.setInterval(() => this.updateTime(), TIMER.tickMs);
  }

  stopTimer(): void {
    this.elapsedBase += this.fold(performance.now());
    this.runningSince = null;
    window.clearInterval(this.ticker);
    this.ticker = 0;
    this.updateTime();
  }

  /** True once the clock has been started at least once this attempt. */
  get timerStarted(): boolean {
    return this.runningSince !== null || this.elapsedBase > 0;
  }

  resumeTimer(): void {
    if (this.timerStarted) this.startTimer();
  }

  // ---- Options ----------------------------------------------------------

  setOptions(options: {
    colorBlindLabels: boolean;
    reducedMotion: boolean;
  }): void {
    this.renderer.setOptions(options);
    this.renderer.refreshColors();
  }

  relayout(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  snapshot(): PlaySnapshot {
    return {
      paths: this.engine.snapshotPaths(),
      elapsedMs: this.elapsedMs,
      moves: this.engine.moves,
      hintUsed: this.engine.hintUsed,
      hintCount: this.engine.hintCount,
    };
  }

  restartLevel(): void {
    this.engine.restart();
    this.props.feedback.tick();
    this.persist();
    this.update();
  }

  // ---- Internals --------------------------------------------------------

  private wire(): void {
    this.detach.push(
      this.engine.on((event) => {
        if (event.type === 'pathCompleted') this.props.feedback.connect();
        if (event.type === 'pathCut') this.props.feedback.cut();
        if (event.type === 'won') {
          // The win is not deferred: it records the solve.
          this.onWon();
          return;
        }
        this.scheduleUpdate();
      }),
    );

    const started = (): void => {
      this.props.feedback.unlock();
      this.startTimer();
    };

    this.detach.push(
      attachPointerInput(this.canvas, this.renderer, () => this.engine, {
        onStrokeStart: started,
        onStrokeEnd: () => this.persist(),
      }),
      attachKeyboardInput(this.canvas, this.renderer, () => this.engine, {
        undo: () => this.undo(),
        restart: () => this.askRestart(),
        hint: () => this.hint(),
        togglePause: () => this.props.onPause(),
        onStrokeStart: started,
        onStrokeEnd: () => this.persist(),
      }),
    );

    const onResize = (): void => this.relayout();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    this.detach.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    });
  }

  /*
   * `won` guards the three tools as well as the buttons, because the keyboard
   * reaches them directly. `Engine.undo` recomputes the win flag, so a `u` press
   * under the results card used to un-win a level that was already recorded.
   */
  private undo(): void {
    if (this.engine.strokeActive || this.engine.won || !this.engine.canUndo) {
      return;
    }
    this.engine.undo();
    this.props.feedback.tick();
    this.persist();
    this.update();
  }

  private hint(): void {
    if (this.engine.strokeActive || this.engine.won) return;
    // Ask the engine which colour it is about to draw, rather than working it
    // out again here: the two answers used to be able to disagree.
    const color = this.engine.nextHintColor();
    if (!this.engine.hint()) return;
    this.props.feedback.unlock();
    this.startTimer();
    if (color !== EMPTY) this.renderer.revealHint(color);
    this.persist();
    this.update();
  }

  private askRestart(): void {
    if (this.engine.strokeActive || this.engine.won) return;
    if (!this.engine.hasDrawnCells) {
      this.restartLevel();
      return;
    }
    this.props.onConfirmRestart();
  }

  private leave(): void {
    this.stopTimer();
    this.props.onPersist(this.engine.won ? null : this.snapshot());
    this.props.onBack();
  }

  /*
   * The solve is recorded here, synchronously, and only the results card waits
   * for the animation. The two used to be one deferred call: the saved board was
   * cleared immediately but the progress write sat behind this timer, so leaving
   * the screen during the win animation — which `destroy()` does by cancelling
   * the timer — lost the solve for good.
   */
  private onWon(): void {
    if (this.finished) return;
    this.finished = true;
    this.stopTimer();
    this.props.feedback.win();
    this.renderer.playWin();
    this.props.onSolved(this.snapshot());
    this.props.onPersist(null);
    this.update();

    const stagger = this.props.reducedMotion
      ? 0
      : ANIM.winStagger * this.props.level.pairs.length + ANIM.cardSlide;
    this.winTimer = window.setTimeout(() => this.props.onWinShown(), stagger);
  }

  private persist(): void {
    if (this.engine.won) return;
    this.props.onPersist(this.snapshot());
  }

  /*
   * One HUD repaint per frame. A fast drag interpolates through every cell it
   * crossed and emits a `change` for each, and `update` rebuilds the whole
   * occupancy grid to work out the filled percentage — fourteen full rebuilds
   * inside one pointermove, synchronously, on the biggest boards.
   */
  private scheduleUpdate(): void {
    if (this.updateFrame !== 0) return;
    this.updateFrame = requestAnimationFrame(() => {
      this.updateFrame = 0;
      this.update();
    });
  }

  private update(): void {
    const { level } = this.props;
    this.statLines.textContent = S.statLines(
      completedCount(level, this.engine.paths),
      level.pairs.length,
    );
    this.statFilled.textContent = S.statFilled(
      coveragePercent(level, this.engine.paths),
    );
    this.updateTime();

    // Pausing a solved board does nothing — the machine refuses it — so the
    // button goes rather than sitting there live and silent.
    this.pauseButton.hidden = this.engine.won;

    const busy = this.engine.strokeActive || this.engine.won;
    setDisabled(this.undoButton, busy || !this.engine.canUndo);
    setDisabled(this.restartButton, busy);

    // Hints are capped, so the button carries what is left and goes flat when
    // there is none, the same way Undo does with an empty stack.
    const remaining = this.engine.hintsRemaining;
    setDisabled(this.hintButton, busy || remaining === 0);
    setToolLabel(
      this.hintButton,
      S.hintWithCount(remaining),
      S.hintLabel(remaining),
    );
  }

  /**
   * Replay the level's own solution, as a player would drag it.
   *
   * Only reachable through the dev-only hook in App, and only exists because
   * hints are capped at two: the verification harness used to finish a board by
   * pressing Hint until it was solved, and no longer can.
   */
  solveFromSolution(): boolean {
    if (this.engine.won) return true;
    this.engine.restart();
    for (const path of this.props.level.solution) {
      const first = path[0];
      if (!first) continue;
      this.engine.begin(first);
      for (let i = 1; i < path.length; i++) {
        const cell = path[i];
        if (cell) this.engine.extend(cell);
      }
      this.engine.end();
    }
    return this.engine.won;
  }

  private updateTime(): void {
    this.statTime.textContent = formatTime(this.elapsedMs);
  }
}

function toolButton(
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = el(
    'button',
    {
      class: 'tool',
      attrs: { type: 'button', 'aria-label': label },
      on: { click: onClick },
    },
    [
      el('span', { class: 'tool__icon', html: icon }),
      el('span', { class: 'tool__label', text: label }),
    ],
  );
  return button;
}

/** Update a tool's visible text and the label a screen reader announces. */
function setToolLabel(
  button: HTMLButtonElement,
  text: string,
  ariaLabel: string,
): void {
  const label = button.querySelector('.tool__label');
  if (label && label.textContent !== text) label.textContent = text;
  if (button.getAttribute('aria-label') !== ariaLabel) {
    button.setAttribute('aria-label', ariaLabel);
  }
}

function setDisabled(button: HTMLButtonElement, disabled: boolean): void {
  button.disabled = disabled;
  button.classList.toggle('tool--disabled', disabled);
}
