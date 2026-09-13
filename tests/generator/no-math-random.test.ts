/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

/**
 * Read the sources through Vite's raw loader rather than node:fs, so the test
 * needs no dependency beyond the four the spec allows.
 */
const generatorSources = import.meta.glob('../../src/generator/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const engineSources = import.meta.glob('../../src/engine/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * Everything else. These layers may use the DOM and the clock — that is what
 * they are for — but a random number anywhere in the app would make a level, a
 * colour or an animation unreproducible, and every one of them is meant to be
 * derived from the seed or from state.
 */
const appSources = import.meta.glob(
  '../../src/{app,render,input,audio,storage}/**/*.ts',
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

function offenders(
  sources: Record<string, string>,
  tokens: readonly string[],
): string[] {
  const found: string[] = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const token of tokens) {
      if (source.includes(token)) found.push(`${file}: ${token}`);
    }
  }
  return found;
}

describe('generator purity (spec 7.1)', () => {
  it('finds the generator sources', () => {
    expect(Object.keys(generatorSources).length).toBeGreaterThanOrEqual(4);
  });

  it('never reaches for Math.random', () => {
    expect(offenders(generatorSources, ['Math.random'])).toEqual([]);
  });

  it('never touches the DOM or browser-only globals', () => {
    expect(
      offenders(generatorSources, [
        'window.',
        'document.',
        'localStorage',
        'navigator.',
        'requestAnimationFrame',
      ]),
    ).toEqual([]);
  });
});

describe('engine purity (spec 11.1)', () => {
  it('finds the engine sources', () => {
    expect(Object.keys(engineSources).length).toBeGreaterThanOrEqual(3);
  });

  it('never imports from the app, render, input or audio layers', () => {
    expect(
      offenders(engineSources, [
        '../app/',
        '../render/',
        '../input/',
        '../audio/',
        '../storage/',
      ]),
    ).toEqual([]);
  });

  it('never reaches for Math.random or the DOM', () => {
    expect(
      offenders(engineSources, ['Math.random', 'document.', 'window.']),
    ).toEqual([]);
  });
});

describe('the rest of the app is deterministic too', () => {
  it('finds the app, render, input, audio and storage sources', () => {
    expect(Object.keys(appSources).length).toBeGreaterThanOrEqual(20);
  });

  it('never reaches for Math.random', () => {
    expect(offenders(appSources, ['Math.random'])).toEqual([]);
  });
});
