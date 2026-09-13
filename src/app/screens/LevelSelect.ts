import { tierById, type TierConfig } from '../../generator/difficulty';
import type { Progress } from '../../storage/persistence';
import type { TierId } from '../../engine/types';
import { el, type View } from '../dom';
import { ICONS } from '../icons';
import { tierSurface } from '../../render/theme';
import {
  firstUnsolved,
  isLevelUnlocked,
  lockReason,
  solvedCount,
  solvedRecord,
} from '../progress';
import { S } from '../strings';

export interface LevelSelectProps {
  tier: TierId;
  progress: Progress;
  onBack(): void;
  onLevel(index: number): void;
}

export function createLevelSelect(props: LevelSelectProps): View {
  const tier: TierConfig = tierById(props.tier);
  const solved = solvedCount(props.progress, tier.id);
  const suggested = firstUnsolved(props.progress, tier.id);

  const tiles: HTMLElement[] = [];
  for (let index = 1; index <= tier.levelCount; index++) {
    tiles.push(tile(tier, index, suggested, props));
  }

  // The grid carries its tier's capsule colours, exactly as the Home row does,
  // so a solved level is filled in with the colour that opened it — and the
  // artwork stays visible between the tiles instead of behind a wall of white.
  const surface = tierSurface(tier.id);
  const style = [
    `--tier-face: ${surface.face}`,
    `--tier-top: ${surface.top}`,
    `--tier-bottom: ${surface.bottom}`,
    `--tier-edge: ${surface.edge}`,
    `--tier-ink: ${surface.ink}`,
  ].join('; ');

  const root = el(
    'main',
    {
      class: 'screen screen--levels',
      attrs: { style },
    },
    [
      el('header', { class: 'topbar' }, [
        el('button', {
          class: 'icon-button',
          html: ICONS.back,
          attrs: { type: 'button', 'aria-label': S.back },
          on: { click: props.onBack },
        }),
        el('h1', {
          class: 'topbar__title',
          text: S.levelSelectTitle(tier.name, tier.size),
        }),
        el('span', {
          class: 'topbar__trailing',
          text: S.tierProgress(solved, tier.levelCount),
        }),
      ]),
      el('ul', { class: 'levels' }, tiles),
    ],
  );

  return { el: root };
}

function tile(
  tier: TierConfig,
  index: number,
  suggested: number,
  props: LevelSelectProps,
): HTMLElement {
  const record = solvedRecord(props.progress, tier.id, index);
  const unlocked = isLevelUnlocked(props.progress, tier.id, index);

  const classes = ['level-tile'];
  if (record && record.hint) classes.push('level-tile--hinted');
  else if (record) classes.push('level-tile--solved');
  else if (!unlocked) classes.push('level-tile--locked');
  if (unlocked && !record && index === suggested) {
    classes.push('level-tile--suggested');
  }

  const label = record
    ? record.hint
      ? S.levelSolvedWithHintLabel(index)
      : S.levelSolvedLabel(index)
    : unlocked
      ? S.levelTileLabel(index)
      : lockReason(props.progress, tier.id, index) === 'hub'
        ? S.levelHubLockedLabel(index)
        : S.levelLockedLabel(index);

  // A locked tile is a disabled button: dimmed, unclickable, and skipped by
  // Tab rather than trapping a keyboard user on something that does nothing.
  const button = el(
    'button',
    {
      class: classes.join(' '),
      attrs: {
        type: 'button',
        'aria-label': label,
        ...(unlocked ? {} : { disabled: 'true' }),
      },
      ...(unlocked ? { on: { click: () => props.onLevel(index) } } : {}),
    },
    [el('span', { class: 'level-tile__number', text: String(index) })],
  );

  if (record?.hint) button.append(el('span', { class: 'level-tile__dot' }));

  return el('li', {}, [button]);
}
