import { APP_NAME } from './config';

/**
 * Every user-facing string in the app. Keeping them here makes a later
 * localisation a drop-in replacement of this module.
 */
export const S = {
  appName: APP_NAME,
  tagline: 'Connect the dots. Fill the board.',

  // Boot failure, shown in place of the app when it cannot start at all.
  bootError: 'Something went wrong starting the game. Please reload.',

  // Home
  howToPlay: 'How to play',
  settings: 'Settings',
  tierProgress: (solved: number, total: number) => `${solved}/${total}`,
  tierSize: (size: number) => `${size}×${size}`,
  unlockHint: (count: number, tierName: string) =>
    `Solve ${count} ${tierName} levels to unlock`,

  // Level select
  back: 'Back',
  levelSelectTitle: (tierName: string, size: number) =>
    `${tierName} · ${size}×${size}`,
  levelTileLabel: (index: number) => `Level ${index}`,
  /* Appended to the tile label above, so a screen reader hears the state as
     part of the name rather than only seeing it in the tile's colour. */
  levelSolvedLabel: (index: number) => `Level ${index}, solved`,
  levelSolvedWithHintLabel: (index: number) =>
    `Level ${index}, solved with a hint`,
  levelLockedLabel: (index: number) =>
    `Level ${index}, locked. Solve level ${index - 1} first.`,
  /* Shown on a level the pUZles hub is holding back. Deliberately not a threshold to
     solve — there is nothing the player can do about it inside this game. */
  unlockInHub: 'Unlock in pUZles',
  levelHubLockedLabel: (index: number) =>
    `Level ${index}, locked. Unlock in pUZles.`,

  // Play
  playTitle: (tierName: string, index: number) =>
    `${tierName} · Level ${index}`,
  pause: 'Pause',
  statLines: (done: number, total: number) => `Lines ${done}/${total}`,
  statFilled: (percent: number) => `Filled ${percent}%`,
  undo: 'Undo',
  hint: 'Hint',
  /** The toolbar shows what is left, so the cap is visible before it bites. */
  hintWithCount: (remaining: number) => `Hint (${remaining})`,
  hintLabel: (remaining: number) =>
    remaining === 0
      ? 'Hint, none left on this level'
      : remaining === 1
        ? 'Hint, 1 left'
        : `Hint, ${remaining} left`,
  restart: 'Restart',
  boardLabel: (tierName: string, index: number, size: number, pairs: number) =>
    `${tierName} level ${index}. ${size} by ${size} board with ${pairs} colour pairs.`,

  // Paused
  pausedTitle: 'Paused',
  resume: 'Resume',
  levelList: 'Level list',

  // Won
  solved: 'Solved',
  perfect: 'Perfect',
  perfectExplainer: 'No hints, every line drawn once',
  time: 'Time',
  best: 'Best',
  newBest: 'New best',
  hintsUsed: (count: number) =>
    count === 1 ? '1 hint used' : `${count} hints used`,
  nextLevel: 'Next level',
  replay: 'Replay',

  // Settings
  theme: 'Theme',
  themeSystem: 'System',
  themeLight: 'Light',
  themeDark: 'Dark',
  sound: 'Sound',
  haptics: 'Haptics',
  colorBlindLabels: 'Colour-blind labels',
  reducedMotion: 'Reduced motion',
  on: 'On',
  off: 'Off',
  resetProgress: 'Reset progress',
  versionLine: (appVersion: string, generatorVersion: number) =>
    `Version ${appVersion} · Generator v${generatorVersion}`,
  close: 'Close',

  // Confirm dialogs
  confirmResetTitle: 'Reset progress?',
  confirmResetBody:
    'This clears every solved level, best time and saved board. It cannot be undone.',
  confirmResetConfirm: 'Reset everything',
  confirmRestartTitle: 'Restart level?',
  confirmRestartBody: 'This clears every line you have drawn on this board.',
  confirmRestartConfirm: 'Restart',
  cancel: 'Cancel',

  // How to play
  howToPlayTitle: 'How to play',
  howToPlaySteps: [
    'Drag from a coloured dot to its twin to join them with a line.',
    "Lines can't cross. Drawing over another line cuts it back.",
    'Fill every cell on the board to solve the puzzle.',
  ],
} as const;
