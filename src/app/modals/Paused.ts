import { el, type View } from '../dom';
import { formatTime } from '../format';
import { S } from '../strings';
import { createModal, pillButton } from './modal';

export interface PausedProps {
  elapsedMs: number;
  onResume(): void;
  onRestart(): void;
  onLevelList(): void;
  onHowToPlay(): void;
}

/**
 * Hides the board behind it, both to prevent clock-watching and per spec 9.
 *
 * No Settings row (2026-11-01): mid-level is not where anyone goes looking for it. Tob's
 * call; Settings is still on Home. Level list stays — that one IS navigation.
 */
export function createPaused(props: PausedProps): View {
  return createModal(
    { title: S.pausedTitle, cover: true, onClose: props.onResume },
    [
      el('p', { class: 'modal__time', text: formatTime(props.elapsedMs) }),
      el('div', { class: 'modal__actions' }, [
        pillButton(S.resume, props.onResume),
        pillButton(S.restart, props.onRestart, 'text'),
        pillButton(S.levelList, props.onLevelList, 'text'),
        pillButton(S.howToPlay, props.onHowToPlay, 'text'),
      ]),
    ],
  );
}
