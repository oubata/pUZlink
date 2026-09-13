import {
  createChecks,
  freshStart,
  seedSolved,
  sleep,
  waitForScreen,
} from '../helpers.mjs';

/**
 * The artwork behind every screen, and the ink on top of it. None of this can
 * be judged from a unit test: it is a real image decoding, a real fixed layer
 * behind three real screens, and computed styles on the text that sits on it.
 *
 * What it does NOT check is beauty. It checks that the picture is there, that
 * it is the picture as supplied — nothing dimming or tinting it — and that
 * every glyph over it carries the outline that makes it readable.
 */
export default {
  name: 'the artwork behind every screen',
  async run({ page, url, shot, results }) {
    const { check } = createChecks(results);

    await page.setViewport(390, 844, 3);
    await freshStart(page, url);
    if (!(await waitForScreen(page, '.screen--home'))) {
      throw new Error('the app never reached Home');
    }

    // ---- It is there, and it is the file, decoded ------------------------
    const layer = await page.evaluate(`
      const before = getComputedStyle(document.body, '::before');
      const match = /url\\("?([^"')]+)/.exec(before.backgroundImage || '');
      return {
        image: match ? match[1] : null,
        position: before.position,
        size: before.backgroundSize,
        repeat: before.backgroundRepeat,
        opacity: before.opacity,
        filter: before.filter,
      };
    `);
    check(
      'a fixed artwork layer sits behind the app',
      layer.image !== null &&
        layer.image.includes('backdrop') &&
        layer.position === 'fixed',
      `${layer.position} ${layer.image}`,
    );
    // Two layers: the artwork, then the ground colour under it. Only the
    // first is the picture.
    check(
      'it covers the screen without repeating',
      layer.size.split(',')[0].trim() === 'cover' &&
        layer.repeat.split(',')[0].trim() === 'no-repeat',
      `${layer.size} / ${layer.repeat}`,
    );
    check(
      'nothing dims or tints it',
      layer.opacity === '1' && layer.filter === 'none',
      `opacity ${layer.opacity}, filter ${layer.filter}`,
    );

    const decoded = await page.evaluate(`
      const before = getComputedStyle(document.body, '::before');
      const match = /url\\("?([^"')]+)/.exec(before.backgroundImage || '');
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve({ w: 0, h: 0 });
        img.src = match[1];
      });
    `);
    check(
      'the artwork decodes at its full size',
      decoded.w === 1452 && decoded.h === 1083,
      `${decoded.w}x${decoded.h}`,
    );

    // ---- Everything on it carries the outline ----------------------------
    const ON_ART = `
      const outlined = (el) => {
        const s = getComputedStyle(el);
        return s.textShadow !== 'none' && s.textShadow.length > 0;
      };
      const report = (selector) => {
        const nodes = [...document.querySelectorAll(selector)];
        return { selector, count: nodes.length, bare: nodes.filter(n => !outlined(n)).length };
      };
    `;
    const home = await page.evaluate(`
      ${ON_ART}
      return ['.home__title', '.home__tagline', '.home__footer .text-button'].map(report);
    `);
    check(
      'the Home masthead and footer are outlined against the artwork',
      home.every((r) => r.count > 0 && r.bare === 0),
      home
        .map((r) => `${r.selector} ${r.count - r.bare}/${r.count}`)
        .join(', '),
    );
    await shot('60-artwork-home');

    // ---- The level grid lets the artwork through -------------------------
    await seedSolved(page, 'easy', 12);
    await page.reload();
    await waitForScreen(page, '.screen--home');
    await page.evaluate(
      `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
    );
    await sleep(400);

    const tiles = await page.evaluate(`
      ${ON_ART}
      const opaque = (el) => {
        const bg = getComputedStyle(el).backgroundColor;
        const m = /rgba?\\(([^)]+)\\)/.exec(bg);
        if (!m) return true;
        const parts = m[1].split(',').map(Number);
        return parts.length < 4 || parts[3] > 0.9;
      };
      const open = [...document.querySelectorAll('.level-tile:not(.level-tile--solved)')];
      const solved = [...document.querySelectorAll('.level-tile--solved')];
      return {
        open: open.length,
        openOpaque: open.filter(opaque).length,
        openBare: open.filter(t => getComputedStyle(t).backgroundColor === 'rgba(0, 0, 0, 0)').length,
        solved: solved.length,
        solvedFill: solved.length ? getComputedStyle(solved[0]).backgroundImage.slice(0, 24) : '',
      };
    `);
    // A tile carries its own pane, so it does not need the outline — but it
    // does need to be a pane rather than a panel, or the picture is gone.
    check(
      'an unsolved level tile is glass, not a panel over the artwork',
      tiles.open > 0 && tiles.openOpaque === 0 && tiles.openBare === 0,
      `${tiles.open} open, ${tiles.openOpaque} opaque, ${tiles.openBare} bare`,
    );
    // The counter beside the title sits on the artwork like the title does.
    // A later rule in the stylesheet used to give it --text-secondary, which is
    // grey on deep blue at about 2.7:1.
    const trailing = await page.evaluate(`
      const el = document.querySelector('.topbar__trailing');
      if (!el) return null;
      const style = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      const hex = root.getPropertyValue('--ink-on-art').trim();
      const rgb = hex.startsWith('#')
        ? 'rgb(' + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ') + ')'
        : hex;
      return { color: style.color, expected: rgb, shadow: style.textShadow !== 'none' };
    `);
    check(
      'the level counter takes the on-artwork ink, not the theme grey',
      trailing !== null &&
        trailing.color === trailing.expected &&
        trailing.shadow === true,
      trailing
        ? `${trailing.color} vs ${trailing.expected}, outlined ${trailing.shadow}`
        : 'no counter found',
    );

    check(
      'a solved tile is filled with its tier colour',
      tiles.solved === 12 && tiles.solvedFill.startsWith('linear-gradient'),
      `${tiles.solved} solved, ${tiles.solvedFill}`,
    );
    await shot('61-artwork-levels');

    // ---- And on the board screen -----------------------------------------
    await page.evaluate(
      `[...document.querySelectorAll('.level-tile')].find(t => !t.disabled).click(); return 1;`,
    );
    if (!(await waitForScreen(page, '.screen--play'))) {
      throw new Error('the app never reached a board');
    }
    const play = await page.evaluate(`
      ${ON_ART}
      const board = document.querySelector('.board');
      return {
        chrome: ['.topbar__title', '.stats', '.tool'].map(report),
        boardEdge: getComputedStyle(board).boxShadow !== 'none',
        artVisibleUnderBoard:
          board.getBoundingClientRect().width < window.innerWidth,
      };
    `);
    check(
      'the play chrome is outlined against the artwork',
      play.chrome.every((r) => r.count > 0 && r.bare === 0),
      play.chrome
        .map((r) => `${r.selector} ${r.count - r.bare}/${r.count}`)
        .join(', '),
    );
    check(
      'the board is edged and lifted off the picture',
      play.boardEdge && play.artVisibleUnderBoard,
      `edge ${play.boardEdge}, inset ${play.artVisibleUnderBoard}`,
    );
    await shot('62-artwork-play');
  },
};
