import {
  createChecks,
  filled,
  freshStart,
  goHome,
  sleep,
  solveLevel,
  stats,
  waitForScreen,
} from '../helpers.mjs';

/** Spec 4 end to end, plus acceptance criteria 8, 9, 12, 13 and 14. */
export default {
  name: 'core loop',
  async run({ page, url, shot, results }) {
    const { check } = createChecks(results);
    await freshStart(page, url);

    // ---- Home (criterion 8) -------------------------------------------
    const home = await page.evaluate(`
      const rows = [...document.querySelectorAll('.tier')];
      return {
        count: rows.length,
        names: rows.map(r => r.querySelector('.tier__name').textContent),
        sizes: rows.map(r => r.querySelector('.tier__size').textContent),
        locked: rows.filter(r => r.classList.contains('tier--locked')).length,
        unlockText: rows.map(r => r.querySelector('.tier__unlock')?.textContent ?? null),
        progress: rows.map(r => r.querySelector('.tier__progress').textContent),
      };
    `);
    check(
      'home lists six tiers in ladder order',
      home.count === 6 &&
        home.names.join(',') === 'Easy,Normal,Hard,Extreme,Expert,Master',
      home.names.join(','),
    );
    check(
      'board sizes are right',
      home.sizes.join(',') === '5×5,6×6,8×8,10×10,12×12,14×14',
      home.sizes.join(','),
    );
    check(
      'three tiers are locked with their unlock sentence',
      home.locked === 3 &&
        home.unlockText[3] === 'Solve 20 Hard levels to unlock' &&
        home.unlockText[4] === 'Solve 20 Extreme levels to unlock' &&
        home.unlockText[5] === 'Solve 20 Expert levels to unlock',
      String(home.unlockText[3]),
    );
    check(
      'progress starts empty',
      home.progress.every((p) => p === '0/100'),
    );
    // Home has to fit without scrolling, footer included. A fresh install is
    // the tallest it ever gets: three locked tiers each carry an unlock line.
    for (const [w, h, label] of [
      [360, 640, 'spec minimum'],
      [320, 568, 'the shortest phone still in use'],
    ]) {
      await page.setViewport(w, h, 3);
      await sleep(400);
      const fit = await page.evaluate(`
        const doc = document.documentElement;
        const footer = document.querySelector('.home__footer');
        const rect = footer ? footer.getBoundingClientRect() : null;
        return {
          scrollH: doc.scrollHeight,
          innerH: window.innerHeight,
          footerBottom: rect ? Math.round(rect.bottom) : null,
          lockedRows: document.querySelectorAll('.tier--locked').length,
        };
      `);
      check(
        `Home fits without scrolling at ${w}x${h} (${label})`,
        fit.scrollH <= fit.innerH,
        `content ${fit.scrollH} vs viewport ${fit.innerH}, ${fit.lockedRows} locked rows`,
      );
      check(
        `the footer is reachable without scrolling at ${w}x${h}`,
        fit.footerBottom !== null && fit.footerBottom <= fit.innerH,
        `footer ends at ${fit.footerBottom} of ${fit.innerH}`,
      );
    }
    await page.setViewport(360, 640, 3);
    await sleep(300);

    await shot('01-home');

    // ---- Level select (criterion 9) ------------------------------------
    await page.evaluate(
      `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
    );
    await sleep(300);
    const grid = await page.evaluate(`
      const tiles = [...document.querySelectorAll('.level-tile')];
      return {
        count: tiles.length,
        suggested: tiles.findIndex(t => t.classList.contains('level-tile--suggested')),
        title: document.querySelector('.topbar__title').textContent,
        columns: getComputedStyle(document.querySelector('.levels'))
          .gridTemplateColumns.split(' ').length,
      };
    `);
    check(
      'level grid shows 100 tiles in 5 columns',
      grid.count === 100 && grid.columns === 5,
      `${grid.count} tiles, ${grid.columns} columns`,
    );
    check('first unsolved level is highlighted', grid.suggested === 0);
    check(
      'level select header names the tier',
      grid.title === 'Easy · 5×5',
      grid.title,
    );
    await shot('02-levels');

    // ---- Play (criterion 13) -------------------------------------------
    await page.evaluate(
      `document.querySelectorAll('.level-tile')[0].click(); return 1;`,
    );
    await sleep(400);
    const play = await page.evaluate(`
      const stats = [...document.querySelectorAll('.stat')].map(s => s.textContent);
      const canvas = document.querySelector('.board');
      return {
        stats,
        title: document.querySelector('.topbar__title').textContent,
        ariaLabel: canvas.getAttribute('aria-label'),
        role: canvas.getAttribute('role'),
        undoDisabled: document.querySelectorAll('.tool')[0].disabled,
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    `);
    check(
      'play screen names the level',
      play.title === 'Easy · Level 1',
      play.title,
    );
    check(
      'timer starts at zero and does not run',
      play.stats[2] === '0:00',
      play.stats.join(' '),
    );
    check('undo starts disabled', play.undoDisabled === true);
    check(
      'board canvas is an application with a label',
      play.role === 'application' && /5 by 5/.test(play.ariaLabel),
      play.ariaLabel,
    );
    check(
      'page does not scroll horizontally',
      play.docScrollWidth <= play.innerWidth,
      `${play.docScrollWidth} vs ${play.innerWidth}`,
    );

    await sleep(1200);
    const stillZero = (await stats(page))[2];
    check(
      'clock stays at zero before the first touch',
      stillZero === '0:00',
      stillZero,
    );

    // ---- Hint, then solve (criterion 12) -------------------------------
    await page.evaluate(`
      [...document.querySelectorAll('.tool')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint')).click();
      return 1;
    `);
    await sleep(1400);
    const afterHint = await stats(page);
    check(
      'hint draws a line and starts the clock',
      !afterHint[0].startsWith('Lines 0/') && afterHint[2] !== '0:00',
      afterHint.join(' '),
    );

    // Hints are capped at two, so finish through the dev-only solve hook.
    await solveLevel(page);

    const won = await page.evaluate(`
      const modal = document.querySelector('.modal__panel');
      if (!modal) return null;
      return {
        title: modal.querySelector('.modal__title').textContent,
        text: modal.textContent,
        buttons: [...modal.querySelectorAll('button')].map(b => b.textContent),
        boardVisible: document.querySelector('.board') !== null,
        clearBackdrop: document.querySelector('.modal').classList.contains('modal--clear'),
      };
    `);
    check('the won card appears', won !== null);
    check(
      'the won card says Solved, not Perfect',
      won?.title === 'Solved',
      String(won?.title),
    );
    // The level above was solved entirely with hints, so the card should name
    // the number taken, not just that one was.
    const hintNote = (won?.text ?? '').match(/(\d+) hints? used/);
    check(
      'the won card reports how many hints were taken',
      hintNote !== null && Number(hintNote[1]) >= 1,
      hintNote
        ? hintNote[0]
        : `no hint note in: ${(won?.text ?? '').slice(0, 80)}`,
    );
    check(
      'the solved board stays visible behind the card',
      won?.boardVisible === true,
    );
    check('the board behind is not dimmed', won?.clearBackdrop === true);
    check(
      'the card offers Next level',
      (won?.buttons ?? []).includes('Next level'),
      (won?.buttons ?? []).join(','),
    );
    // The solved board must stay fully visible above the card (spec 9). The
    // card used to be a bottom sheet that covered half the puzzle.
    const wonLayout = await page.evaluate(`
      const board = document.querySelector('.board');
      const panel = document.querySelector('.modal__panel');
      if (!board || !panel) return null;
      const b = board.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return {
        gap: Math.round(p.top - b.bottom),
        boardVisible: Math.round(b.bottom) <= Math.round(p.top),
        boardTop: Math.round(b.top),
        cardHeight: Math.round(p.height),
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
      };
    `);
    check(
      'the results card sits below the solved board, not over it',
      wonLayout !== null && wonLayout.boardVisible,
      wonLayout
        ? `gap ${wonLayout.gap}px, card ${wonLayout.cardHeight}px tall`
        : 'no card',
    );
    check(
      'the whole board is on screen with the card up',
      wonLayout !== null &&
        wonLayout.boardTop >= 0 &&
        wonLayout.scrollH <= wonLayout.innerH,
      wonLayout
        ? `board top ${wonLayout.boardTop}, scroll ${wonLayout.scrollH}/${wonLayout.innerH}`
        : 'no card',
    );
    await shot('03-won');

    // ---- Next level -----------------------------------------------------
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Next level').click();
      return 1;
    `);
    await sleep(500);
    const next = await page.evaluate(
      `return document.querySelector('.topbar__title').textContent;`,
    );
    check('next level opens level 2', next === 'Easy · Level 2', String(next));

    // ---- The grid remembers (criterion 9) -------------------------------
    await page.evaluate(
      `document.querySelector('.topbar .icon-button').click(); return 1;`,
    );
    await sleep(400);
    const tiles = await page.evaluate(`
      const tiles = [...document.querySelectorAll('.level-tile')];
      return {
        first: tiles[0].className,
        hasDot: tiles[0].querySelector('.level-tile__dot') !== null,
        suggested: tiles.findIndex(t => t.classList.contains('level-tile--suggested')),
        header: document.querySelector('.topbar__trailing').textContent,
      };
    `);
    check(
      'solved-with-hint tile is hollow with a dot',
      /level-tile--hinted/.test(tiles.first) && tiles.hasDot,
      tiles.first,
    );
    check(
      'the suggestion moves to level 2',
      tiles.suggested === 1,
      String(tiles.suggested),
    );
    check(
      'the tier counter reads 1/100',
      tiles.header === '1/100',
      tiles.header,
    );
    await shot('04-levels-solved');

    await page.evaluate(
      `document.querySelector('.topbar .icon-button').click(); return 1;`,
    );
    await sleep(300);
    const homeAfter = await page.evaluate(
      `return document.querySelector('.tier__progress').textContent;`,
    );
    check('home shows the tier progress', homeAfter === '1/100', homeAfter);

    // ---- Dark theme, immediate and persisted (criterion 16) -------------
    await page.evaluate(
      `[...document.querySelectorAll('.home__footer button')].pop().click(); return 1;`,
    );
    await sleep(300);
    await page.evaluate(`
      const groups = [...document.querySelectorAll('.segmented')];
      [...groups[0].querySelectorAll('button')].find(b => b.textContent === 'Dark').click();
      return 1;
    `);
    await sleep(200);
    // The body carries the artwork in both themes now, so what the theme moves
    // is the ink and the panels under it: --bg is what the board and the modal
    // cards are painted with.
    const themed = await page.evaluate(`
      const styles = getComputedStyle(document.documentElement);
      return {
        attr: document.documentElement.getAttribute('data-theme'),
        bg: styles.getPropertyValue('--bg').trim(),
        art: getComputedStyle(document.body).backgroundColor,
      };
    `);
    check(
      'dark theme applies immediately',
      themed.attr === 'dark' &&
        themed.bg.toLowerCase() === '#121212' &&
        themed.art === 'rgb(10, 42, 99)',
      `${themed.attr} panel ${themed.bg} art ${themed.art}`,
    );
    await shot('05-settings-dark');

    await page.reload();
    await waitForScreen(page, '.screen--play');
    const persisted = await page.evaluate(
      `return document.documentElement.getAttribute('data-theme');`,
    );
    check(
      'dark theme survives a reload',
      persisted === 'dark',
      String(persisted),
    );

    // Leaving level 2 saved it, so this reload resumed straight onto the board.
    const resumedFromBack = await page.evaluate(`
      return document.querySelector('.screen--play') !== null
        ? document.querySelector('.topbar__title').textContent : null;
    `);
    check(
      'leaving a level mid-play resumes it on the next launch',
      resumedFromBack === 'Easy · Level 2',
      String(resumedFromBack),
    );

    // ---- Resume with lines and clock intact (criterion 14) --------------
    await page.evaluate(
      `document.querySelector('.topbar .icon-button').click(); return 1;`,
    );
    await sleep(350);
    // Level 2 is the open one here: level 1 is solved, so level 3 is locked.
    await page.evaluate(
      `document.querySelectorAll('.level-tile')[1].click(); return 1;`,
    );
    await sleep(400);
    await page.evaluate(`
      [...document.querySelectorAll('.tool')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint')).click();
      return 1;
    `);
    await sleep(1500);
    const before = {
      title: await page.evaluate(
        `return document.querySelector('.topbar__title').textContent;`,
      ),
      stats: await stats(page),
    };
    await page.reload();
    await waitForScreen(page, '.screen--play');
    const after = {
      title: await page.evaluate(
        `return document.querySelector('.topbar__title')?.textContent ?? null;`,
      ),
      stats: await stats(page),
    };
    check(
      'reopening resumes the same level',
      after.title === before.title,
      `${before.title} -> ${after.title}`,
    );
    check(
      'the drawn lines come back',
      after.stats[0] === before.stats[0],
      `${before.stats[0]} -> ${after.stats[0]}`,
    );
    // Within a second: the clock can tick over between the save and the
    // reload, and the point is that the elapsed time survives, not that it is
    // frozen to the second.
    const seconds = (clock) => {
      const [m, sec] = String(clock).split(':').map(Number);
      return (m || 0) * 60 + (sec || 0);
    };
    check(
      'the elapsed time comes back',
      Math.abs(seconds(after.stats[2]) - seconds(before.stats[2])) <= 1,
      `${before.stats[2]} -> ${after.stats[2]}`,
    );
    await shot('06-resumed');

    // ---- Pause (criterion 13) -------------------------------------------
    await page.evaluate(
      `[...document.querySelectorAll('.icon-button')].pop().click(); return 1;`,
    );
    await sleep(300);
    const paused = await page.evaluate(`
      const panel = document.querySelector('.modal__panel');
      return {
        title: panel?.querySelector('.modal__title')?.textContent ?? null,
        cover: document.querySelector('.modal')?.classList.contains('modal--cover') ?? false,
        buttons: [...(panel?.querySelectorAll('button') ?? [])].map(b => b.textContent),
      };
    `);
    check(
      'pause opens the paused card',
      paused.title === 'Paused',
      String(paused.title),
    );
    check('pause hides the board behind a full scrim', paused.cover === true);
    check(
      'pause offers resume, restart, level list, settings, how to play',
      (paused.buttons ?? []).join(',') ===
        'Resume,Restart,Level list,Settings,How to play',
      (paused.buttons ?? []).join(','),
    );
    await shot('07-paused');

    const t1 = await page.evaluate(
      `return document.querySelector('.modal__time').textContent;`,
    );
    await sleep(1500);
    const t2 = await page.evaluate(
      `return document.querySelector('.modal__time').textContent;`,
    );
    check('the clock is stopped while paused', t1 === t2, `${t1} -> ${t2}`);

    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'Resume').click();
      return 1;
    `);
    await sleep(1400);
    const resumedTime = (await stats(page))[2];
    check(
      'the clock restarts on resume',
      resumedTime !== t1,
      `${t1} -> ${resumedTime}`,
    );

    // ---- Undo (criterion 12) --------------------------------------------
    // A resumed board starts with an empty undo stack, so draw something first.
    const undoBefore = await page.evaluate(`
      return [...document.querySelectorAll('.tool')]
        .find(b => b.getAttribute('aria-label') === 'Undo').disabled;
    `);
    check('a resumed board has nothing to undo', undoBefore === true);

    const beforeHint = await filled(page);
    await page.evaluate(`
      [...document.querySelectorAll('.tool')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint')).click();
      return 1;
    `);
    await sleep(400);
    const beforeUndo = await filled(page);
    check(
      'the hint fills more of the board',
      beforeUndo > beforeHint,
      `${beforeHint}% -> ${beforeUndo}%`,
    );

    await page.evaluate(`
      [...document.querySelectorAll('.tool')]
        .find(b => b.getAttribute('aria-label') === 'Undo').click();
      return 1;
    `);
    await sleep(300);
    const afterUndo = await filled(page);
    check(
      'undo takes the last stroke back',
      afterUndo === beforeHint,
      `${beforeUndo}% -> ${afterUndo}%, expected ${beforeHint}%`,
    );

    // ---- How to play -----------------------------------------------------
    await page.evaluate(
      `[...document.querySelectorAll('.icon-button')].pop().click(); return 1;`,
    );
    await sleep(250);
    await page.evaluate(`
      [...document.querySelectorAll('.modal__panel button')]
        .find(b => b.textContent === 'How to play').click();
      return 1;
    `);
    await sleep(400);
    const howto = await page.evaluate(`
      const panel = document.querySelector('.modal__panel');
      const canvas = panel?.querySelector('.howto__board');
      return {
        steps: [...(panel?.querySelectorAll('.howto__step') ?? [])].map(s => s.textContent),
        canvasWidth: canvas ? Math.round(canvas.getBoundingClientRect().width) : 0,
      };
    `);
    check(
      'how to play shows three steps',
      howto.steps.length === 3,
      howto.steps.join(' | '),
    );
    check(
      'how to play draws a demo board',
      howto.canvasWidth > 0,
      String(howto.canvasWidth),
    );
    await shot('08-howto');

    return results;

    // ---- The back gesture is never swallowed -----------------------------
    /*
     * The app keeps a spare history entry to stand in for "there is somewhere
     * to go back to". Returning to Home through the UI left that entry on the
     * stack unconsumed, so the first back press at Home did nothing at all and
     * the player had to press it twice to leave.
     */
    await goHome(page);
    const guard = await page.evaluate(`
      const before = history.length;
      // Home -> Level select -> back to Home through the chevron.
      document.querySelectorAll('.tier__button')[0].click();
      return new Promise((resolve) => setTimeout(() => {
        document.querySelector('.topbar .icon-button').click();
        setTimeout(() => resolve({
          before,
          after: history.length,
          screen: document.querySelector('.screen--home') !== null,
        }), 400);
      }, 400));
    `);
    check(
      'coming back to Home leaves no spare history entry behind',
      guard.screen === true && guard.after <= guard.before,
      `history ${guard.before} -> ${guard.after}, home=${guard.screen}`,
    );
  },
};
