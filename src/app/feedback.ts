import type { Haptics } from '../audio/haptics';
import type { Sfx } from '../audio/sfx';
import type { Settings } from '../storage/persistence';

/**
 * Sound and haptics, behind an interface so the screens never touch the Web
 * Audio API directly.
 */
export interface Feedback {
  /** A pair was joined. */
  connect(): void;
  /** Another colour's line was cut. */
  cut(): void;
  /** The board is solved. */
  win(): void;
  /** Undo, restart, and other chrome taps. */
  tick(): void;
  /** Called on the first user gesture, to unlock audio. */
  unlock(): void;
}

export const silentFeedback: Feedback = {
  connect() {},
  cut() {},
  win() {},
  tick() {},
  unlock() {},
};

/**
 * Wires the synthesiser and the vibration motor to the live settings, so
 * toggling sound or haptics takes effect on the very next event.
 */
export function createFeedback(
  sfx: Sfx,
  haptics: Haptics,
  getSettings: () => Settings,
): Feedback {
  const sound = (): boolean => getSettings().sound;
  const buzz = (): boolean => getSettings().haptics;

  return {
    connect() {
      if (sound()) sfx.connect();
      if (buzz()) haptics.connect();
    },
    cut() {
      if (sound()) sfx.cut();
    },
    win() {
      if (sound()) sfx.win();
      if (buzz()) haptics.win();
    },
    tick() {
      if (sound()) sfx.tick();
    },
    /*
     * Deliberately not gated on the sound setting. This is the one call that is
     * guaranteed to run inside a user gesture, and creating the AudioContext is
     * what it is for; playback is gated per sound above, so nothing is audible
     * while sound is off. Gated, turning sound on mid-level built the context
     * outside a gesture instead, where a browser can refuse to start it.
     */
    unlock() {
      sfx.unlock();
    },
  };
}
