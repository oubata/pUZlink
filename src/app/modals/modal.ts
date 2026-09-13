import { el, trapFocus, focusableWithin, type View } from '../dom';

export interface ModalOptions {
  title: string;
  /** Adds `modal--cover` so the board behind is hidden (used by Paused). */
  cover?: boolean;
  /** Drops the scrim entirely, leaving what is behind at full opacity. */
  clear?: boolean;
  /** A visible heading, or a screen-reader-only one when false. */
  showTitle?: boolean;
  onClose: () => void;
  /** Escape and backdrop clicks close by default. */
  dismissible?: boolean;
}

/*
 * A counter, not a hash of the title: two modals share a title often enough
 * ("How to play" is both a button and a heading, "Restart" is both a tool and a
 * confirmation), and during a swap the outgoing panel is still in the document
 * while the incoming one is added — two live elements with the same id, and an
 * `aria-labelledby` that could resolve to either.
 */
let modalSeq = 0;

export function createModal(
  options: ModalOptions,
  body: (Node | string | null | undefined)[],
): View {
  const dismissible = options.dismissible ?? true;
  const titleId = `modal-title-${++modalSeq}`;

  const heading = el(
    'h2',
    {
      class: options.showTitle === false ? 'visually-hidden' : 'modal__title',
      text: options.title,
      attrs: { id: titleId },
    },
    [],
  );

  const panel = el(
    'div',
    {
      class: 'modal__panel',
      attrs: {
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': titleId,
      },
      on: {
        keydown: (event) => {
          const key = event as KeyboardEvent;
          trapFocus(panel, key);
          if (key.key === 'Escape' && dismissible) {
            key.preventDefault();
            options.onClose();
          }
        },
      },
    },
    [heading, ...body],
  );

  const root = el(
    'div',
    {
      class: [
        'modal',
        options.cover ? 'modal--cover' : '',
        options.clear ? 'modal--clear' : '',
      ]
        .filter(Boolean)
        .join(' '),
      on: {
        pointerdown: (event) => {
          if (dismissible && event.target === root) options.onClose();
        },
      },
    },
    [panel],
  );

  const previouslyFocused = document.activeElement;

  return {
    el: root,
    mounted() {
      const first = focusableWithin(panel)[0];
      if (first) {
        first.focus();
      } else {
        panel.setAttribute('tabindex', '-1');
        panel.focus();
      }
    },
    destroy() {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    },
  };
}

export function modalRow(label: string, value: string): HTMLElement {
  return el('div', { class: 'modal__row' }, [
    el('span', { class: 'modal__row-label', text: label }),
    el('span', { class: 'modal__row-value', text: value }),
  ]);
}

export function pillButton(
  label: string,
  onClick: () => void,
  variant: 'primary' | 'text' = 'primary',
): HTMLButtonElement {
  return el('button', {
    class: variant === 'primary' ? 'pill' : 'text-button',
    text: label,
    attrs: { type: 'button' },
    on: { click: onClick },
  });
}
