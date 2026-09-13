/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../../src/app/config';
import { APPLE_TOUCH_ICON, PWA_ICONS, PWA_MANIFEST } from '../../src/app/pwa';

/**
 * Read the files through Vite's raw loader rather than node:fs, so the test
 * needs no dependency beyond the four the spec allows.
 */
const iconFiles = import.meta.glob('../../public/*.png', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const html = Object.values(
  import.meta.glob('../../index.html', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
)[0] as string;

const iconNames = new Set(
  Object.keys(iconFiles).map((path) => path.split('/').pop() ?? ''),
);

describe('web app manifest (spec 14.2)', () => {
  it('takes its name from the one app-name constant', () => {
    expect(PWA_MANIFEST.name).toBe(APP_NAME);
    expect(PWA_MANIFEST.short_name).toBe(APP_NAME);
  });

  it('asks for a standalone window', () => {
    expect(PWA_MANIFEST.display).toBe('standalone');
  });

  it('keeps start_url and scope relative, so any host path works', () => {
    expect(PWA_MANIFEST.start_url).toBe('.');
    expect(PWA_MANIFEST.scope).toBe('.');
  });

  it('does not lock orientation, because the board re-lays out', () => {
    expect(PWA_MANIFEST.orientation).toBe('any');
  });

  it('uses the light-theme background from the spec 10 palette', () => {
    expect(PWA_MANIFEST.background_color).toBe('#0A2A63');
    expect(PWA_MANIFEST.theme_color).toBe('#0A2A63');
  });

  it('declares the two sizes and the maskable variant installers want', () => {
    expect(PWA_ICONS.map((i) => `${i.sizes} ${i.purpose}`)).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
  });

  it('names every icon as a PNG', () => {
    for (const icon of PWA_ICONS) {
      expect(icon.type).toBe('image/png');
      expect(icon.src.endsWith('.png')).toBe(true);
    }
  });
});

describe('the icon files exist (npm run icons)', () => {
  for (const src of [...PWA_ICONS.map((i) => i.src), APPLE_TOUCH_ICON.src]) {
    it(`public/${src} is present`, () => {
      expect(iconNames.has(src)).toBe(true);
    });
  }
});

describe('index.html', () => {
  it('links the apple-touch-icon, which iOS needs from the markup', () => {
    expect(html).toContain(`href="./${APPLE_TOUCH_ICON.src}"`);
  });

  it('still allows zoom, for the accessibility audit', () => {
    expect(html).not.toContain('user-scalable=no');
    expect(html).not.toContain('maximum-scale');
  });
});
