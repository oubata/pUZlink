/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { PWA_MANIFEST } from './src/app/pwa';

/**
 * `--mode native` builds the bundle that goes inside the Android APK. It drops
 * the service worker: Capacitor serves every app version from the same
 * `https://localhost` origin, so a worker from a previous install would keep
 * serving its cached assets and a freshly installed APK would show the old
 * app. Inside the APK the files are local anyway, so the worker buys nothing.
 */
export default defineConfig(({ mode }) => ({
  // Relative, so a build runs from any path: a Netlify root, a GitHub Pages
  // project subpath, a file server, or Android's asset loader. See README.
  base: './',
  build: {
    target: 'es2020',
  },
  plugins:
    mode === 'native'
      ? []
      : [
          VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'auto',
            manifest: PWA_MANIFEST,
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            workbox: {
              // The whole app shell is precached; nothing is fetched at runtime.
              globPatterns: ['**/*.{js,css,html,svg,png,webp}'],
              navigateFallback: 'index.html',
              cleanupOutdatedCaches: true,
            },
          }),
        ],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
