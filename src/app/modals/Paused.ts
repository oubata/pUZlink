import { el, type View } from '../dom';
import { formatTime } from '../format';
import { S } from '../strings';
import { createModal, pillButton } from './modal';

export interface PausedProps {
  elapsedMs: number;
  onResume(): void;
  onRestart(): void;
  onHome(): void;
}

/**
 * Hides the board behind it, both to prevent clock-watching and per spec 9.
 *
 * Three rows, the same three every game offers (2026-11-02): Resume, Restart, Home.
 * Settings, Level list and How to play all came off — mid-level is not where anyone goes
 * looking for any of them. Settings and How to play are on Home; the level grid is one tap
 * away on the ‹ in the header, which is where hierarchical back belongs anyway.
 */
export function createPaused(props: PausedProps): View {
  return createModal(
    { title: S.pausedTitle, cover: true, onClose: props.onResume },
    [
      el('p', { class: 'modal__time', text: formatTime(props.elapsedMs) }),
      el('div', { class: 'modal__actions' }, [
        pillButton(S.resume, props.onResume),
        pillButton(S.restart, props.onRestart, 'text'),
        pillButton(S.home, props.onHome, 'text'),
      ]),
    ],
  );
}
