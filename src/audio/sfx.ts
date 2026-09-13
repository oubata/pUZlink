import { AUDIO_MASTER_GAIN } from '../app/config';

type Wave = OscillatorType;

interface Note {
  hz: number;
  ms: number;
  wave: Wave;
}

const C5 = 523.25;
const E5 = 659.25;
const G5 = 783.99;
const C6 = 1046.5;

/**
 * The four sounds of spec 9, synthesised with Web Audio. No audio files, so no
 * network request and no decode cost.
 *
 * The AudioContext is created on the first sound, which by construction only
 * happens after a user gesture.
 */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private failed = false;

  /** Called on the first gesture so the context is warm before the first note. */
  unlock(): void {
    const context = this.ensure();
    if (context) resume(context);
  }

  /** Two-note rising blip: a pair just joined. */
  connect(): void {
    this.play([
      { hz: C5, ms: 80, wave: 'sine' },
      { hz: E5, ms: 80, wave: 'sine' },
    ]);
  }

  /** Soft low tick: another colour's line was cut. */
  cut(): void {
    this.play([{ hz: 120, ms: 40, wave: 'triangle' }]);
  }

  /** Four-note arpeggio: the board is solved. */
  win(): void {
    this.play([
      { hz: C5, ms: 90, wave: 'sine' },
      { hz: E5, ms: 90, wave: 'sine' },
      { hz: G5, ms: 90, wave: 'sine' },
      { hz: C6, ms: 90, wave: 'sine' },
    ]);
  }

  /** Chrome tap: undo, restart. */
  tick(): void {
    this.play([{ hz: 1000, ms: 20, wave: 'sine' }]);
  }

  private ensure(): AudioContext | null {
    if (this.context) return this.context;
    if (this.failed) return null;
    try {
      const context = new AudioContext();
      const master = context.createGain();
      master.gain.value = AUDIO_MASTER_GAIN;
      master.connect(context.destination);
      this.context = context;
      this.master = master;
      return context;
    } catch {
      this.failed = true;
      return null;
    }
  }

  private play(notes: Note[]): void {
    const context = this.ensure();
    const master = this.master;
    if (!context || !master) return;
    resume(context);

    let at = context.currentTime;
    for (const note of notes) {
      const seconds = note.ms / 1000;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = note.wave;
      oscillator.frequency.value = note.hz;

      // Short ramps at both ends; a bare start/stop clicks.
      const attack = Math.min(0.008, seconds / 4);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(1, at + attack);
      gain.gain.setValueAtTime(1, at + seconds - attack);
      gain.gain.linearRampToValueAtTime(0, at + seconds);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(at);
      oscillator.stop(at + seconds);
      at += seconds;
    }
  }
}

/**
 * Wake a context that is not running.
 *
 * Two things beyond the obvious `suspended`. iOS parks a context at
 * `interrupted` after a phone call or a switch away, which is not in the spec'd
 * `AudioContextState` union but is what Safari reports; and `resume()` returns a
 * promise that rejects if the context has been closed or the call is not
 * gesture-backed. Neither should reach the player as an unhandled rejection.
 */
function resume(context: AudioContext): void {
  const state: string = context.state;
  if (state === 'running' || state === 'closed') return;
  void context.resume().catch(() => {
    // Nothing to do: the next gesture tries again.
  });
}
