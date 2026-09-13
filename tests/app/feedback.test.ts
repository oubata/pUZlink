import { describe, expect, it } from 'vitest';
import { createFeedback, silentFeedback } from '../../src/app/feedback';
import type { Haptics } from '../../src/audio/haptics';
import type { Sfx } from '../../src/audio/sfx';
import { defaultSettings, type Settings } from '../../src/storage/persistence';

function spies(): {
  sfx: Sfx;
  haptics: Haptics;
  calls: string[];
} {
  const calls: string[] = [];
  const record = (name: string) => (): void => {
    calls.push(name);
  };
  const sfx = {
    connect: record('sfx.connect'),
    cut: record('sfx.cut'),
    win: record('sfx.win'),
    tick: record('sfx.tick'),
    unlock: record('sfx.unlock'),
  } as unknown as Sfx;
  const haptics = {
    connect: record('haptics.connect'),
    win: record('haptics.win'),
  } as unknown as Haptics;
  return { sfx, haptics, calls };
}

describe('feedback routing (spec 9)', () => {
  it('plays sound and haptics when both are on', () => {
    const { sfx, haptics, calls } = spies();
    const feedback = createFeedback(sfx, haptics, () => ({
      ...defaultSettings(),
      sound: true,
      haptics: true,
    }));

    feedback.connect();
    feedback.cut();
    feedback.win();
    feedback.tick();

    expect(calls).toEqual([
      'sfx.connect',
      'haptics.connect',
      'sfx.cut',
      'sfx.win',
      'haptics.win',
      'sfx.tick',
    ]);
  });

  it('stays silent with sound off but still buzzes', () => {
    const { sfx, haptics, calls } = spies();
    const settings: Settings = {
      ...defaultSettings(),
      sound: false,
      haptics: true,
    };
    const feedback = createFeedback(sfx, haptics, () => settings);

    feedback.connect();
    feedback.win();
    feedback.tick();

    expect(calls).toEqual(['haptics.connect', 'haptics.win']);
  });

  it('reads the settings afresh on every event', () => {
    const { sfx, haptics, calls } = spies();
    let settings: Settings = defaultSettings();
    const feedback = createFeedback(sfx, haptics, () => settings);

    feedback.tick();
    settings = { ...settings, sound: false };
    feedback.tick();

    expect(calls).toEqual(['sfx.tick']);
  });

  it('drops haptics alone when they are switched off', () => {
    const { sfx, haptics, calls } = spies();
    const settings: Settings = { ...defaultSettings(), haptics: false };
    const feedback = createFeedback(sfx, haptics, () => settings);

    feedback.connect();
    expect(calls).toEqual(['sfx.connect']);
  });

  it('the silent default does nothing at all', () => {
    expect(() => {
      silentFeedback.connect();
      silentFeedback.cut();
      silentFeedback.win();
      silentFeedback.tick();
      silentFeedback.unlock();
    }).not.toThrow();
  });
});

describe('settings defaults', () => {
  it('starts a fresh install with haptics off and sound on', () => {
    const defaults = defaultSettings();
    expect(defaults.haptics).toBe(false);
    expect(defaults.sound).toBe(true);
  });

  it('stays silent on a fresh install where haptics are concerned', () => {
    const { sfx, haptics, calls } = spies();
    const feedback = createFeedback(sfx, haptics, () => defaultSettings());

    feedback.connect();
    feedback.win();

    expect(calls).toEqual(['sfx.connect', 'sfx.win']);
  });
});
