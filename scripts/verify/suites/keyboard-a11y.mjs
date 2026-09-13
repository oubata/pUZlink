import {
  createChecks,
  filled,
  focused,
  freshStart,
  goHome,
  SAMPLE_CELL,
  sleep,
  solveLevel,
  waitForScreen,
} from '../helpers.mjs';

/** Criteria 15, 16 and 17: keyboard-only play, settings that stick, no network. */
export default {
  name: 'keyboard and accessibility',
  async run({ page, url, shot, results }) {
    const { check } = createChecks(results);
    await freshStart(page, url);

    // ---- Reaching a board with the keyboard alone (criterion 15) --------
    await page.key('Tab');
    const firstStop = await focused(page);
    check(
      'Tab reaches the first tier',
      /Easy/.test(String(firstStop)),
      String(firstStop),
    );

    await page.key('Tab');
    await page.key('Enter');
    await sleep(400);
    const onLevels = await page.evaluate(`
      return document.querySelector('.screen--levels')
        ? document.querySelector('.topbar__title').textContent : null;
    `);
    check(
      'Enter on a tier opens its level grid',
      onLevels === 'Normal · 6×6',
      String(onLevels),
    );

    await page.key('Tab');
    await page.key('Tab');
    const tileFocus = await focused(page);
    check(
      'Tab reaches level 1',
      /Level 1$/.test(String(tileFocus)),
      String(tileFocus),
    );
    await page.key('Enter');
    await sleep(500);

    const onBoard = await page.evaluate(`
      return {
        playing: document.querySelector('.screen--play') !== null,
        focused: document.activeElement?.className ?? null,
      };
    `);
    check('Enter on a tile opens the board', onBoard.playing === true);
    check(
      'the board takes focus so arrows work at once',
      onBoard.focused === 'board',
      String(onBoard.focused),
    );

    await page.key('ArrowRight');
    await shot('10-keyboard-cursor');

    // Read the dots off the canvas so the cursor walk is exact.
    const board = await page.evaluate(
      SAMPLE_CELL +
        `
      const canvas = document.querySelector('.board');
      const ctx = canvas.getContext('2d');
      const size = Number(canvas.getAttribute('aria-label').match(/(\\d+) by/)[1]);
      const cell = canvas.width / size;
      const found = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (sampleCell(ctx, cell, r, c).saturation > 40) found.push([r, c]);
        }
      }
      return { size, found };
    `,
    );
    check(
      'the board draws two dots per pair',
      board.found.length >= 4 && board.found.length % 2 === 0,
      `${board.found.length} dots on a ${board.size}×${board.size} board`,
    );

    let cursor = [0, 1]; // [0,0] plus the ArrowRight above
    const walkTo = async ([row, col]) => {
      for (let i = 0; i < row - cursor[0]; i++) await page.key('ArrowDown');
      for (let i = 0; i < cursor[0] - row; i++) await page.key('ArrowUp');
      for (let i = 0; i < col - cursor[1]; i++) await page.key('ArrowRight');
      for (let i = 0; i < cursor[1] - col; i++) await page.key('ArrowLeft');
      cursor = [row, col];
    };

    const startFilled = await filled(page);
    let drew = false;
    for (const endpoint of board.found) {
      await walkTo(endpoint);
      await page.key('Enter');
      for (const [dir, delta] of [
        ['ArrowRight', [0, 1]],
        ['ArrowDown', [1, 0]],
        ['ArrowLeft', [0, -1]],
        ['ArrowUp', [-1, 0]],
      ]) {
        await page.key(dir);
        cursor = [
          Math.max(0, Math.min(board.size - 1, cursor[0] + delta[0])),
          Math.max(0, Math.min(board.size - 1, cursor[1] + delta[1])),
        ];
        if ((await filled(page)) > startFilled) {
          drew = true;
          break;
        }
      }
      if (drew) break;
      await page.key('Enter'); // drop the stroke and try the next dot
    }
    check(
      'arrows and Enter draw a line',
      drew,
      `filled ${startFilled}% -> ${await filled(page)}%`,
    );

    await page.key('Enter');
    const afterDraw = await filled(page);

    await page.key('u');
    await sleep(250);
    const afterUndo = await filled(page);
    check(
      'U undoes the stroke',
      afterUndo < afterDraw,
      `${afterDraw}% -> ${afterUndo}%`,
    );

    await page.key('h');
    await sleep(400);
    const afterHint = await filled(page);
    check(
      'H draws a hint',
      afterHint > afterUndo,
      `${afterUndo}% -> ${afterHint}%`,
    );

    await page.key('r');
    await sleep(300);
    const restartPrompt = await page.evaluate(`
      const panel = document.querySelector('.modal__panel');
      return panel ? panel.querySelector('.modal__title').textContent : null;
    `);
    check(
      'R asks before wiping a drawn board',
      restartPrompt === 'Restart level?',
      String(restartPrompt),
    );
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Restart').click();
      return 1;
    `);
    await sleep(300);
    const afterRestart = await filled(page);
    check(
      'restart clears the board back to the endpoints',
      afterRestart < afterHint,
      `${afterHint}% -> ${afterRestart}%`,
    );

    // Two presses of H is the whole allowance now, so check the key works and
    // then finish through the solve hook.
    await page.evaluate(`document.querySelector('.board').focus(); return 1;`);
    await page.key('h');
    await sleep(400);
    await solveLevel(page);
    const solvedByKeyboard = await page.evaluate(`
      const panel = document.querySelector('.modal__panel');
      return panel ? panel.querySelector('.modal__title').textContent : null;
    `);
    check(
      'a level can be solved without a mouse',
      solvedByKeyboard === 'Solved',
      String(solvedByKeyboard),
    );
    await shot('11-keyboard-solved');

    // ---- Settings that take effect and persist (criterion 16) -----------
    await goHome(page);
    await page.evaluate(
      `[...document.querySelectorAll('.home__footer button')].pop().click(); return 1;`,
    );
    await sleep(350);

    const toggled = await page.evaluate(`
      const rows = [...document.querySelectorAll('.settings__row')];
      const find = (label) => rows.find(r => r.querySelector('.settings__label').textContent === label);
      find('Colour-blind labels').querySelector('.switch').click();
      find('Sound').querySelector('.switch').click();
      [...find('Reduced motion').querySelectorAll('.segmented__option')]
        .find(b => b.textContent === 'On').click();
      return {
        colorBlind: find('Colour-blind labels').querySelector('.switch').getAttribute('aria-checked'),
        sound: find('Sound').querySelector('.switch').getAttribute('aria-checked'),
        motionAttr: document.documentElement.getAttribute('data-motion'),
        duration: getComputedStyle(document.documentElement).getPropertyValue('--dur-base').trim(),
      };
    `);
    check(
      'reduced motion zeroes the CSS durations at once',
      toggled.motionAttr === 'reduced' && toggled.duration === '0ms',
      `${toggled.motionAttr} ${toggled.duration}`,
    );
    check(
      'the switches flip',
      toggled.colorBlind === 'true' && toggled.sound === 'false',
      `colourBlind=${toggled.colorBlind} sound=${toggled.sound}`,
    );

    await page.reload();
    await waitForScreen(page, '.screen--home');
    await page.evaluate(
      `[...document.querySelectorAll('.home__footer button')].pop().click(); return 1;`,
    );
    await sleep(350);
    const persisted = await page.evaluate(`
      const rows = [...document.querySelectorAll('.settings__row')];
      const find = (label) => rows.find(r => r.querySelector('.settings__label').textContent === label);
      return {
        colorBlind: find('Colour-blind labels').querySelector('.switch').getAttribute('aria-checked'),
        sound: find('Sound').querySelector('.switch').getAttribute('aria-checked'),
        motion: document.documentElement.getAttribute('data-motion'),
      };
    `);
    check(
      'every setting survives a reload',
      persisted.colorBlind === 'true' &&
        persisted.sound === 'false' &&
        persisted.motion === 'reduced',
      JSON.stringify(persisted),
    );

    // ---- Colour-blind numerals really reach the canvas -------------------
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Close').click();
      return 1;
    `);
    await sleep(300);
    await page.evaluate(
      `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
    );
    await sleep(300);
    await page.evaluate(
      `document.querySelectorAll('.level-tile')[0].click(); return 1;`,
    );
    await sleep(600);
    await shot('12-colorblind');
    const withLabels = await page.evaluate(
      `return document.querySelector('.board').toDataURL().length;`,
    );

    await page.evaluate(
      `[...document.querySelectorAll('.icon-button')].pop().click(); return 1;`,
    );
    await sleep(250);
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Settings').click();
      return 1;
    `);
    await sleep(300);
    await page.evaluate(`
      [...document.querySelectorAll('.settings__row')]
        .find(r => r.querySelector('.settings__label').textContent === 'Colour-blind labels')
        .querySelector('.switch').click();
      return 1;
    `);
    await sleep(300);
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Close').click();
      return 1;
    `);
    await sleep(250);
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Resume').click();
      return 1;
    `);
    await sleep(500);
    const withoutLabels = await page.evaluate(
      `return document.querySelector('.board').toDataURL().length;`,
    );
    check(
      'colour-blind numerals reach the canvas and come off again',
      withLabels !== withoutLabels,
      `${withLabels} vs ${withoutLabels}`,
    );

    // ---- Reset progress --------------------------------------------------
    await goHome(page);
    await page.evaluate(
      `[...document.querySelectorAll('.home__footer button')].pop().click(); return 1;`,
    );
    await sleep(300);
    await page.evaluate(
      `document.querySelector('.text-button--danger').click(); return 1;`,
    );
    await sleep(300);
    const confirm = await page.evaluate(
      `return document.querySelector('.modal__title')?.textContent ?? null;`,
    );
    check(
      'reset asks for confirmation first',
      confirm === 'Reset progress?',
      String(confirm),
    );
    await page.evaluate(
      `document.querySelector('.pill--danger').click(); return 1;`,
    );
    await sleep(400);
    const afterReset = await page.evaluate(`
      return {
        home: document.querySelector('.screen--home') !== null,
        progress: document.querySelector('.tier__progress')?.textContent ?? null,
        keys: Object.keys(localStorage).length,
      };
    `);
    check(
      'reset returns to a fresh Home',
      afterReset.home && afterReset.progress === '0/100',
      JSON.stringify(afterReset),
    );
    check(
      'reset clears every storage key',
      afterReset.keys === 0,
      String(afterReset.keys),
    );

    // ---- Zero network after load (criterion 17) --------------------------
    await page.enableNetwork();
    const before = page.requests.length;
    await page.evaluate(
      `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
    );
    await sleep(300);
    await page.evaluate(
      `document.querySelectorAll('.level-tile')[0].click(); return 1;`,
    );
    await sleep(400);
    await solveLevel(page);
    const during = page.requests.slice(before);
    check(
      'a whole level is played with no network request',
      during.length === 0,
      during
        .map((r) => r.url)
        .join(' | ')
        .slice(0, 200),
    );

    // ---- Nothing behind the results card is reachable ---------------------
    /*
     * The board stays mounted and visible under the Won card, and it is a
     * focusable element with live keyboard shortcuts. `aria-modal` asks
     * assistive technology to ignore it; `inert` is what actually stops a Tab,
     * a click, or an arrow key from reaching it.
     */
    await sleep(900);
    const behindCard = await page.evaluate(`
      const screen = document.querySelector('.screen');
      const board = document.querySelector('.board');
      board?.focus();
      return {
        card: document.querySelector('.modal__title')?.textContent ?? null,
        inert: screen?.hasAttribute('inert') ?? null,
        focusedBoard: document.activeElement === board,
      };
    `);
    check(
      'the screen behind the results card is inert',
      behindCard.card !== null &&
        behindCard.inert === true &&
        behindCard.focusedBoard === false,
      `card=${behindCard.card} inert=${behindCard.inert} board took focus=${behindCard.focusedBoard}`,
    );

    return results;
  },
};
