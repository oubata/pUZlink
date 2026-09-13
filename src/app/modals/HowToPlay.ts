import { GENERATOR_VERSION } from '../../generator/difficulty';
import { Engine } from '../../engine/engine';
import type { Level } from '../../engine/types';
import { BoardRenderer } from '../../render/BoardRenderer';
import { el, type View } from '../dom';
import { S } from '../strings';
import { createModal, pillButton } from './modal';

/** A hand-made 4×4 board, drawn by the real renderer so the art cannot drift. */
const DEMO: Level = {
  id: 'demo',
  tier: 'easy',
  index: 1,
  size: 4,
  pairs: [
    { color: 0, a: [0, 0], b: [1, 0] },
    { color: 1, a: [2, 0], b: [3, 0] },
  ],
  solution: [
    [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 3],
      [1, 2],
      [1, 1],
      [1, 0],
    ],
    [
      [2, 0],
      [2, 1],
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 2],
      [3, 1],
      [3, 0],
    ],
  ],
  seed: 0,
  generatorVersion: GENERATOR_VERSION,
};

export interface HowToPlayProps {
  colorBlindLabels: boolean;
  onClose(): void;
}

export function createHowToPlay(props: HowToPlayProps): View {
  const canvas = el('canvas', { class: 'howto__board' });
  // One pair joined, one still to draw: the picture the three steps describe.
  const engine = new Engine(DEMO);
  const drawn = DEMO.solution[0] ?? [];
  const start = drawn[0];
  if (start) {
    engine.begin(start);
    for (const cell of drawn.slice(1)) engine.extend(cell);
    engine.end();
  }

  const renderer = new BoardRenderer(canvas, document.documentElement);
  renderer.setEngine(engine);
  renderer.setOptions({
    colorBlindLabels: props.colorBlindLabels,
    reducedMotion: true,
  });

  const modal = createModal(
    { title: S.howToPlayTitle, onClose: props.onClose },
    [
      el('div', { class: 'howto__figure' }, [canvas]),
      el(
        'ol',
        { class: 'howto__steps' },
        S.howToPlaySteps.map((step) =>
          el('li', { class: 'howto__step', text: step }),
        ),
      ),
      el('div', { class: 'modal__actions' }, [
        pillButton(S.close, props.onClose),
      ]),
    ],
  );

  const mounted = modal.mounted;
  const destroy = modal.destroy;
  return {
    el: modal.el,
    mounted() {
      renderer.resize(4 * 34 + 32, 4 * 34 + 220);
      renderer.draw();
      mounted?.call(modal);
    },
    destroy() {
      renderer.destroy();
      destroy?.call(modal);
    },
  };
}
