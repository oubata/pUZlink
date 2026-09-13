/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import {
  createConfirmReset,
  createConfirmRestart,
} from '../../src/app/modals/ConfirmReset';
import { createPaused } from '../../src/app/modals/Paused';
import { createSettings } from '../../src/app/modals/Settings';
import { createWon } from '../../src/app/modals/Won';
import type { View } from '../../src/app/dom';
import type { WonResult } from '../../src/app/state';
import { defaultSettings, type Settings } from '../../src/storage/persistence';

function noop(): void {}

function mount(view: View): HTMLElement {
  document.body.append(view.el);
  view.mounted?.();
  return view.el;
}

function labelled(root: HTMLElement, label: string): HTMLElement | null {
  return (
    [...root.querySelectorAll<HTMLElement>('.settings__row')].find(
      (row) => row.querySelector('.settings__label')?.textContent === label,
    ) ?? null
  );
}

describe('Settings (spec 9)', () => {
  function settings(
    initial: Settings = defaultSettings(),
    hapticsAvailable = true,
  ) {
    const patches: Partial<Settings>[] = [];
    const view = createSettings({
      settings: initial,
      hapticsAvailable,
      onChange: (patch) => patches.push(patch),
      onReset: noop,
      onClose: noop,
    });
    return { root: mount(view), patches, view };
  }

  it('turns a switch off when it starts on', () => {
    const { root, patches } = settings();
    const button = labelled(root, 'Sound')?.querySelector('.switch');
    expect(button?.getAttribute('aria-checked')).toBe('true');
    (button as HTMLButtonElement).click();
    expect(button?.getAttribute('aria-checked')).toBe('false');
    expect(patches).toEqual([{ sound: false }]);
    root.remove();
  });

  it('turns a switch on when it starts off', () => {
    const { root, patches } = settings();
    const button = labelled(root, 'Colour-blind labels')?.querySelector(
      '.switch',
    );
    expect(button?.getAttribute('aria-checked')).toBe('false');
    (button as HTMLButtonElement).click();
    expect(button?.getAttribute('aria-checked')).toBe('true');
    expect(patches).toEqual([{ colorBlind: true }]);
    root.remove();
  });

  it('keeps flipping on repeated taps', () => {
    const { root, patches } = settings();
    const button = labelled(root, 'Sound')?.querySelector(
      '.switch',
    ) as HTMLButtonElement;
    button.click();
    button.click();
    button.click();
    expect(patches).toEqual([
      { sound: false },
      { sound: true },
      { sound: false },
    ]);
    root.remove();
  });

  it('reflects the settings it was given', () => {
    const { root } = settings({
      ...defaultSettings(),
      sound: false,
      colorBlind: true,
    });
    expect(
      labelled(root, 'Sound')
        ?.querySelector('.switch')
        ?.getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      labelled(root, 'Colour-blind labels')
        ?.querySelector('.switch')
        ?.getAttribute('aria-checked'),
    ).toBe('true');
    root.remove();
  });

  it('marks the selected segment and moves it on choice', () => {
    const { root, patches } = settings();
    const theme = labelled(root, 'Theme');
    const options = [
      ...(theme?.querySelectorAll<HTMLButtonElement>('.segmented__option') ??
        []),
    ];
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);

    options[2]?.click();
    expect(options.map((o) => o.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    expect(patches).toEqual([{ theme: 'dark' }]);
    root.remove();
  });

  it('sends the reduced-motion choice through', () => {
    const { root, patches } = settings();
    const motion = labelled(root, 'Reduced motion');
    const options = [
      ...(motion?.querySelectorAll<HTMLButtonElement>('.segmented__option') ??
        []),
    ];
    options[1]?.click();
    expect(patches).toEqual([{ reducedMotion: 'on' }]);
    root.remove();
  });

  it('hides the haptics row where the device cannot vibrate', () => {
    const { root } = settings(defaultSettings(), false);
    expect(labelled(root, 'Haptics')).toBeNull();
    root.remove();
  });

  it('shows the haptics row where it can', () => {
    const { root } = settings(defaultSettings(), true);
    expect(labelled(root, 'Haptics')).not.toBeNull();
    root.remove();
  });

  it('exposes the segmented groups as radio groups', () => {
    const { root } = settings();
    const groups = [...root.querySelectorAll('.segmented')];
    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.getAttribute('role')).toBe('radiogroup');
      expect(group.getAttribute('aria-label')).toBeTruthy();
    }
    root.remove();
  });

  it('prints the version and generator version', () => {
    const { root } = settings();
    expect(root.querySelector('.settings__version')?.textContent).toMatch(
      /^Version .+ · Generator v\d+$/,
    );
    root.remove();
  });
});

describe('Won card (spec 9)', () => {
  const base: WonResult = {
    elapsedMs: 84_000,
    bestMs: 62_000,
    newBest: false,
    hintUsed: false,
    hintCount: 0,
    perfect: false,
  };

  function won(result: WonResult, hasNext = true) {
    const pressed: string[] = [];
    const view = createWon({
      result,
      hasNext,
      onNext: () => pressed.push('next'),
      onReplay: () => pressed.push('replay'),
      onLevelList: () => pressed.push('levels'),
    });
    return { root: mount(view), pressed };
  }

  it('shows the time and the standing best on one line', () => {
    const { root } = won(base);
    const items = [...root.querySelectorAll('.modal__summary-item')].map(
      (r) => r.textContent,
    );
    expect(root.querySelector('.modal__title')?.textContent).toBe('Solved');
    // One line, not two bordered rows: the card has to clear the board.
    expect(items).toEqual(['Time1:24', 'Best1:02']);
    root.remove();
  });

  it('keeps the card short enough to sit under the board', () => {
    const { root } = won({ ...base, hintUsed: true });
    // Every element that costs vertical height, in order. A bordered row list
    // is what made the old card tall enough to cover half the puzzle.
    expect(root.querySelectorAll('.modal__rows')).toHaveLength(0);
    expect(root.querySelectorAll('.modal__row')).toHaveLength(0);
    expect(root.querySelectorAll('.modal__summary')).toHaveLength(1);
    // Replay and Level list share a row rather than stacking.
    expect(root.querySelectorAll('.modal__actions-row button')).toHaveLength(2);
    root.remove();
  });

  it('swaps the best time for a badge on a new best', () => {
    const { root } = won({ ...base, newBest: true });
    expect(root.querySelector('.badge')?.textContent).toBe('New best');
    root.remove();
  });

  it('says Perfect and why, when it was', () => {
    const { root } = won({ ...base, perfect: true });
    expect(root.querySelector('.modal__title')?.textContent).toBe('Perfect');
    expect(root.querySelector('.modal__note')?.textContent).toBe(
      'No hints, every line drawn once',
    );
    root.remove();
  });

  it('says how many hints were taken', () => {
    const one = won({ ...base, hintUsed: true, hintCount: 1 });
    expect(one.root.textContent).toContain('1 hint used');
    one.root.remove();

    const several = won({ ...base, hintUsed: true, hintCount: 4 });
    expect(several.root.textContent).toContain('4 hints used');
    several.root.remove();
  });

  it('never says zero hints on a hinted level', () => {
    const { root } = won({ ...base, hintUsed: true, hintCount: 0 });
    expect(root.textContent).toContain('1 hint used');
    root.remove();
  });

  it('says nothing about hints when none were taken', () => {
    const { root } = won({ ...base, hintUsed: false, hintCount: 0 });
    expect(root.textContent).not.toContain('hint');
    root.remove();
  });

  it('offers Next level in the middle of a tier', () => {
    const { root, pressed } = won(base, true);
    const buttons = [...root.querySelectorAll('button')].map(
      (b) => b.textContent,
    );
    expect(buttons).toEqual(['Next level', 'Replay', 'Level list']);
    root.querySelector('button')?.click();
    expect(pressed).toEqual(['next']);
    root.remove();
  });

  it('drops Next level at the end of a tier', () => {
    const { root, pressed } = won(base, false);
    const buttons = [...root.querySelectorAll('button')].map(
      (b) => b.textContent,
    );
    expect(buttons).toEqual(['Level list', 'Replay']);
    root.querySelector('button')?.click();
    expect(pressed).toEqual(['levels']);
    root.remove();
  });

  it('leaves the board behind it at full opacity', () => {
    const { root } = won(base);
    expect(root.classList.contains('modal--clear')).toBe(true);
    root.remove();
  });

  it('cannot be dismissed by Escape or the backdrop', () => {
    const { root, pressed } = won(base);
    const panel = root.querySelector('.modal__panel');
    panel?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(pressed).toEqual([]);
    root.remove();
  });
});

describe('Paused card (spec 9)', () => {
  it('hides the board and offers the five ways out', () => {
    const pressed: string[] = [];
    const view = createPaused({
      elapsedMs: 84_000,
      onResume: () => pressed.push('resume'),
      onRestart: () => pressed.push('restart'),
      onLevelList: () => pressed.push('levels'),
      onSettings: () => pressed.push('settings'),
      onHowToPlay: () => pressed.push('howto'),
    });
    const root = mount(view);

    expect(root.classList.contains('modal--cover')).toBe(true);
    expect(root.querySelector('.modal__time')?.textContent).toBe('1:24');
    expect(
      [...root.querySelectorAll('button')].map((b) => b.textContent),
    ).toEqual(['Resume', 'Restart', 'Level list', 'Settings', 'How to play']);
    root.remove();
  });

  it('resumes on Escape', () => {
    const pressed: string[] = [];
    const view = createPaused({
      elapsedMs: 0,
      onResume: () => pressed.push('resume'),
      onRestart: noop,
      onLevelList: noop,
      onSettings: noop,
      onHowToPlay: noop,
    });
    const root = mount(view);
    root
      .querySelector('.modal__panel')
      ?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    expect(pressed).toEqual(['resume']);
    root.remove();
  });
});

describe('Confirm dialogs (spec 5.5)', () => {
  it('spells out what resetting destroys', () => {
    const pressed: string[] = [];
    const root = mount(
      createConfirmReset({
        onConfirm: () => pressed.push('confirm'),
        onCancel: () => pressed.push('cancel'),
      }),
    );
    expect(root.querySelector('.modal__title')?.textContent).toBe(
      'Reset progress?',
    );
    expect(root.querySelector('.pill--danger')?.textContent).toBe(
      'Reset everything',
    );
    root.querySelector<HTMLButtonElement>('.pill--danger')?.click();
    expect(pressed).toEqual(['confirm']);
    root.remove();
  });

  it('offers a way out of a restart', () => {
    const pressed: string[] = [];
    const root = mount(
      createConfirmRestart({
        onConfirm: () => pressed.push('confirm'),
        onCancel: () => pressed.push('cancel'),
      }),
    );
    expect(root.querySelector('.modal__title')?.textContent).toBe(
      'Restart level?',
    );
    [...root.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent === 'Cancel')
      ?.click();
    expect(pressed).toEqual(['cancel']);
    root.remove();
  });

  it('is a labelled dialog that takes focus', () => {
    const root = mount(createConfirmReset({ onConfirm: noop, onCancel: noop }));
    const panel = root.querySelector('.modal__panel');
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    const labelId = panel?.getAttribute('aria-labelledby');
    expect(root.querySelector(`#${labelId}`)?.textContent).toBe(
      'Reset progress?',
    );
    expect(document.activeElement).toBe(root.querySelector('.pill--danger'));
    root.remove();
  });
});

describe('modal identity and keyboard conventions', () => {
  it('gives two modals with the same title different heading ids', () => {
    // 'How to play' is both a Paused button and a modal heading; 'Restart' is
    // both a tool and a confirmation. A title hash gave them the same id.
    const first = createConfirmRestart({ onConfirm: noop, onCancel: noop });
    const second = createConfirmRestart({ onConfirm: noop, onCancel: noop });
    mount(first);
    mount(second);

    const idOf = (view: View): string | null =>
      view.el.querySelector('.modal__panel')?.getAttribute('aria-labelledby') ??
      null;

    expect(idOf(first)).not.toBeNull();
    expect(idOf(first)).not.toBe(idOf(second));
    first.el.remove();
    second.el.remove();
  });

  it('moves between segmented options with the arrow keys', () => {
    const patches: Partial<Settings>[] = [];
    const view = createSettings({
      settings: defaultSettings(),
      hapticsAvailable: true,
      onChange: (patch) => patches.push(patch),
      onReset: noop,
      onClose: noop,
    });
    const root = mount(view);

    const group = root.querySelector<HTMLElement>('[role="radiogroup"]');
    const radios = [...(group?.querySelectorAll('[role="radio"]') ?? [])];
    (radios[0] as HTMLElement).focus();

    group?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1]?.getAttribute('aria-checked')).toBe('true');
    expect(patches).toHaveLength(1);

    // And the ends wrap, as a radio group does.
    (radios[0] as HTMLElement).focus();
    group?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
    );
    expect(document.activeElement).toBe(radios.at(-1));
    view.el.remove();
  });
});
