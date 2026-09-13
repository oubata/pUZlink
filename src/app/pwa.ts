import { APP_NAME } from './config';

/**
 * Web app manifest (spec 14.2, phase 6). Kept here rather than inline in
 * `vite.config.ts` so it reuses `APP_NAME` and can be unit-tested.
 */
export interface PwaIcon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

/** Rasterised from the favicon artwork by `npm run icons`. */
export const PWA_ICONS: PwaIcon[] = [
  { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  {
    src: 'icon-maskable-512.png',
    sizes: '512x512',
    type: 'image/png',
    purpose: 'maskable',
  },
];

/** iOS ignores the manifest icons and wants this one from a <link>. */
export const APPLE_TOUCH_ICON = { src: 'apple-touch-icon.png', size: 180 };

export const PWA_MANIFEST = {
  name: APP_NAME,
  short_name: APP_NAME,
  description: 'Connect the dots. Fill the board.',
  // Relative, so the app runs from any path on any static host.
  start_url: '.',
  scope: '.',
  display: 'standalone' as const,
  // The board re-lays out on rotation (spec 5.5), so neither way is locked.
  orientation: 'any' as const,
  // The artwork's own ground: what a launch screen and the task switcher show
  // before the first paint, so neither flashes white over a dark app.
  background_color: '#0A2A63',
  theme_color: '#0A2A63',
  categories: ['games', 'puzzle'],
  icons: PWA_ICONS,
};
