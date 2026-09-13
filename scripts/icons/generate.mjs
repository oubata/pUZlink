/**
 * Rasterise the app icon into the PNGs the manifest, iOS and Android need.
 *
 *   npm run icons
 *
 * There is no image dependency in this project (spec 11.4), so the artwork is
 * drawn as SVG and screenshotted by the same headless browser the verification
 * harness already drives. Re-run this after editing the artwork below.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../verify/cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PUBLIC = join(ROOT, 'public');
const ANDROID_RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

/**
 * The favicon artwork on a 64-unit grid: two O's joined by a line. The line
 * stops at each ring's outer edge rather than running to its centre, so the
 * letters stay hollow — the same trick the board renderer uses.
 */
const ARTWORK = `
  <path d="M25 22 H40 a6 6 0 0 1 6 6 v7" fill="none" stroke="#118AB2"
        stroke-width="7" stroke-linecap="butt" stroke-linejoin="round" />
  <circle cx="18" cy="22" r="5.1" fill="none" stroke="#D62828" stroke-width="3.8" />
  <circle cx="46" cy="42" r="5.1" fill="none" stroke="#D62828" stroke-width="3.8" />
`;

/** The artwork's own colours dropped for a single flat one. */
function artworkIn(color) {
  return ARTWORK.replace(/stroke="#[0-9A-Fa-f]{6}"/g, `stroke="${color}"`);
}

/** The ground the app itself sits on, so a cold launch does not flash. */
const BRAND = '#0A2A63';

/**
 * `inset` is the share of the canvas left as margin around the 64-unit
 * artwork. `shape` is what sits behind it: a rounded square, a circle, or
 * nothing at all for an adaptive foreground, whose background is a separate
 * layer the launcher composites underneath.
 */
function svg({
  size,
  inset,
  shape = 'rounded',
  radius = 0.1875,
  fill = '#FFFFFF',
  ink = null,
}) {
  const box = 64 / (1 - 2 * inset);
  const offset = box * inset;
  const background =
    shape === 'circle'
      ? `<circle cx="${box / 2}" cy="${box / 2}" r="${box / 2}" fill="${fill}" />`
      : shape === 'rounded'
        ? `<rect width="${box}" height="${box}" rx="${radius * box}" fill="${fill}" />`
        : '';
  const art = ink === null ? ARTWORK : artworkIn(ink);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
    viewBox="0 0 ${box} ${box}">
    ${background}
    <g transform="translate(${offset} ${offset})">${art}</g>
  </svg>`;
}

/**
 * The launch screen: the mark on the app's own blue, at the exact sizes
 * Capacitor's template shipped. Android 12 and up ignore this drawable and use
 * `windowSplashScreenBackground` from the theme instead, which is set to the
 * same colour; these serve everything older.
 */
function splashSvg({ width, height }) {
  // The artwork fills about two thirds of its 64-unit box, so the box is set
  // larger than the mark should look.
  const mark = Math.round(Math.min(width, height) * 0.45);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
    viewBox="0 0 ${width} ${height}">
    <rect width="${width}" height="${height}" fill="${BRAND}" />
    <g transform="translate(${(width - mark) / 2} ${(height - mark) / 2}) scale(${mark / 64})">
      ${ARTWORK}
    </g>
  </svg>`;
}

const WEB_ICONS = [
  { file: join(PUBLIC, 'icon-192.png'), size: 192, inset: 0.06 },
  { file: join(PUBLIC, 'icon-512.png'), size: 512, inset: 0.06 },
  // Full-bleed square: the launcher applies its own mask.
  {
    file: join(PUBLIC, 'icon-maskable-512.png'),
    size: 512,
    inset: 0.18,
    radius: 0,
  },
  // iOS applies its own rounding and dislikes transparency.
  {
    file: join(PUBLIC, 'apple-touch-icon.png'),
    size: 180,
    inset: 0.08,
    radius: 0,
  },
];

/**
 * Android launcher icons. Adaptive foregrounds are 108dp with only the middle
 * 72dp guaranteed visible, so the artwork sits well inside that.
 */
const DENSITIES = [
  { dir: 'mdpi', legacy: 48, foreground: 108 },
  { dir: 'hdpi', legacy: 72, foreground: 162 },
  { dir: 'xhdpi', legacy: 96, foreground: 216 },
  { dir: 'xxhdpi', legacy: 144, foreground: 324 },
  { dir: 'xxxhdpi', legacy: 192, foreground: 432 },
];

const androidIcons = () =>
  DENSITIES.flatMap(({ dir, legacy, foreground }) => {
    const into = join(ANDROID_RES, `mipmap-${dir}`);
    return [
      { file: join(into, 'ic_launcher.png'), size: legacy, inset: 0.08 },
      {
        file: join(into, 'ic_launcher_round.png'),
        size: legacy,
        inset: 0.1,
        shape: 'circle',
      },
      {
        file: join(into, 'ic_launcher_foreground.png'),
        size: foreground,
        inset: 0.26,
        shape: 'none',
      },
      /*
       * Android 13's themed icons. The launcher tints this layer itself, so it
       * has to be one flat colour on transparency — anything else comes out as
       * a silhouette of the bounding box.
       */
      {
        file: join(into, 'ic_launcher_monochrome.png'),
        size: foreground,
        inset: 0.26,
        shape: 'none',
        ink: '#FFFFFF',
      },
    ];
  });

/** The launch screen, at the sizes the Android template defines. */
const SPLASHES = [
  { dir: 'drawable', width: 480, height: 320 },
  { dir: 'drawable-port-mdpi', width: 320, height: 480 },
  { dir: 'drawable-port-hdpi', width: 480, height: 800 },
  { dir: 'drawable-port-xhdpi', width: 720, height: 1280 },
  { dir: 'drawable-port-xxhdpi', width: 960, height: 1600 },
  { dir: 'drawable-port-xxxhdpi', width: 1280, height: 1920 },
  { dir: 'drawable-land-mdpi', width: 480, height: 320 },
  { dir: 'drawable-land-hdpi', width: 800, height: 480 },
  { dir: 'drawable-land-xhdpi', width: 1280, height: 720 },
  { dir: 'drawable-land-xxhdpi', width: 1600, height: 960 },
  { dir: 'drawable-land-xxxhdpi', width: 1920, height: 1280 },
];

const androidSplashes = () =>
  SPLASHES.map(({ dir, width, height }) => ({
    file: join(ANDROID_RES, dir, 'splash.png'),
    width,
    height,
    splash: true,
  }));

const targets = [...WEB_ICONS];
if (existsSync(ANDROID_RES)) {
  targets.push(...androidIcons(), ...androidSplashes());
} else {
  console.log('  (no android/ project yet, skipping launcher icons)');
}

const page = await launch({
  port: 9334,
  profile: join(HERE, '.icon-profile'),
});

try {
  // Keep the alpha channel, so the rounded corners are really cut out.
  await page.setTransparentBackground(true);

  for (const icon of targets) {
    const width = icon.splash ? icon.width : icon.size;
    const height = icon.splash ? icon.height : icon.size;
    const markup = icon.splash ? splashSvg(icon) : svg(icon);
    // The splash is opaque by definition; the icons keep their cut corners.
    await page.setTransparentBackground(!icon.splash);
    await page.blank();
    await page.setViewport(width, height, 1, false);
    await page.evaluate(`
      document.body.style.margin = '0';
      document.body.innerHTML = ${JSON.stringify(markup)};
      return 1;
    `);
    mkdirSync(dirname(icon.file), { recursive: true });
    await page.screenshot(icon.file);
    console.log(
      `  ${icon.file.replace(ROOT, '.').replace(/\\/g, '/')}  ${width}x${height}`,
    );
  }
} finally {
  await page.close();
}
