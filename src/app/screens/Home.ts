import type { TierId } from '../../engine/types';
import { TIERS, tierById, type TierConfig } from '../../generator/difficulty';
import type { Progress } from '../../storage/persistence';
import { APP_NAME } from '../config';
import { el, type View } from '../dom';
import { hubReturnButton } from '../hubReturn';
import { APP_MARK, ICONS } from '../icons';
import {
  lockedTierSurface,
  tierColor,
  tierSurface,
  withAlpha,
} from '../../render/theme';
import { isUnlocked, solvedCount } from '../progress';
import { isTierPaywalled, promptUnlock } from '../freeLimit';
import { S } from '../strings';

export interface HomeProps {
  progress: Progress;
  onTier(tier: TierId): void;
  onHowToPlay(): void;
  onSettings(): void;
}

export function createHome(props: HomeProps): View {
  const rows = TIERS.map((tier) => tierRow(tier, props));

  /*
   * How to play and Settings live at the TOP of Home (Tob, 2026-09-14).
   *
   * They used to be a footer under the ladder. Inside the pUZles hub the ad banner takes
   * the bottom ~60px of the viewport, and with six tiers above them the footer fell off
   * the end of the screen — the two controls were simply gone unless you knew to scroll.
   * Up here they share the row with the hub pill and cannot be pushed anywhere.
   *
   * The hub pill returns null outside the hub, and the spacer keeps the cluster hard
   * right either way rather than letting it slide left in a standalone build.
   */
  const root = el('main', { class: 'screen screen--home' }, [
    el('div', { class: 'home__top' }, [
      hubReturnButton() ?? el('span', { class: 'home__top-spacer' }),
      el('div', { class: 'home__tools' }, [
        el('button', {
          class: 'icon-button',
          html: ICONS.help,
          attrs: { type: 'button', 'aria-label': S.howToPlay },
          on: { click: props.onHowToPlay },
        }),
        el('button', {
          class: 'icon-button',
          html: ICONS.gear,
          attrs: { type: 'button', 'aria-label': S.settings },
          on: { click: props.onSettings },
        }),
      ]),
    ]),
    el('header', { class: 'home__header' }, [
      el('div', { class: 'home__mark', html: APP_MARK }),
      el('h1', { class: 'home__title', text: APP_NAME }),
      el('p', { class: 'home__tagline', text: S.tagline }),
    ]),
    el('ul', { class: 'tiers' }, rows),
  ]);

  return { el: root };
}

function tierRow(tier: TierConfig, props: HomeProps): HTMLElement {
  const unlocked = isUnlocked(tier, props.progress);
  const solved = solvedCount(props.progress, tier.id);
  const fraction = solved / tier.levelCount;

  const content = [
    el('span', { class: 'tier__name', text: tier.name }),
    el('span', { class: 'tier__size', text: S.tierSize(tier.size) }),
    el('span', {
      class: 'tier__progress',
      text: S.tierProgress(solved, tier.levelCount),
    }),
    el('div', { class: 'tier__bar' }, [
      el('div', {
        class: 'tier__bar-fill',
        attrs: { style: `width: ${(fraction * 100).toFixed(1)}%` },
      }),
    ]),
  ];

  if (!unlocked && isTierPaywalled(tier.id)) {
    /*
     * Held back by the pUZles hub, not by the ladder. Without this branch the row
     * simply went quiet — no padlock, no reason — because the tiers the hub locks
     * (Normal, Hard) have no `unlock` gate of their own to explain them.
     */
    content.push(
      el('span', { class: 'tier__lock', html: ICONS.lock }),
      el('span', { class: 'tier__unlock', text: S.unlockInHub }),
    );
  } else if (!unlocked && tier.unlock) {
    const gate = tierById(tier.unlock.tier);
    content.push(
      el('span', { class: 'tier__lock', html: ICONS.lock }),
      el('span', {
        class: 'tier__unlock',
        text: S.unlockHint(tier.unlock.solved, gate.name),
      }),
    );
  }

  // No aria-label: the row's own text already reads "Easy 5×5 0/100", and an
  // added label that does not contain the visible text confuses voice control.
  const hubLocked = !unlocked && isTierPaywalled(tier.id);
  const inner =
    unlocked || hubLocked
      ? el(
          'button',
          {
            class: 'tier__button',
            attrs: { type: 'button' },
            on: {
              click: () => (hubLocked ? promptUnlock() : props.onTier(tier.id)),
            },
          },
          content,
        )
      : el(
          'div',
          {
            class: 'tier__button tier__button--locked',
            attrs: { 'aria-disabled': 'true' },
          },
          content,
        );

  // Every part of the capsule — face, highlight, moulded edge, label and
  // progress strip — is derived from the tier's one palette colour and handed
  // to the stylesheet as custom properties, so the CSS states the shape and
  // this states the colour.
  // A locked capsule is moulded from grey rather than dimmed with opacity:
  // the artwork behind the screen would otherwise show straight through it.
  const color = tierColor(tier.id);
  const surface = unlocked ? tierSurface(tier.id) : lockedTierSurface();
  const style = [
    `--tier-color: ${color}`,
    `--tier-face: ${surface.face}`,
    `--tier-top: ${surface.top}`,
    `--tier-bottom: ${surface.bottom}`,
    `--tier-edge: ${surface.edge}`,
    `--tier-ink: ${surface.ink}`,
    `--tier-track: ${withAlpha(surface.ink, 0.25)}`,
    `--tier-fill: ${withAlpha(surface.ink, 0.85)}`,
  ].join('; ');
  return el(
    'li',
    {
      class: `tier${unlocked ? '' : ' tier--locked'}`,
      attrs: { style },
    },
    [inner],
  );
}
