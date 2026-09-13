/**
 * Phase 6 checks: manifest, icons, service worker, and a real offline reload.
 * These need the production build and a preview server rather than the dev
 * server, so they run separately from `npm run verify`.
 *
 *   npm run verify:pwa
 *   npm run verify:pwa -- --no-build   # reuse whatever is already in dist/
 *   npm run verify:pwa -- --url=https://…  # check a deployed site instead
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { consoleNoise, createChecks, waitForScreen } from './helpers.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PROFILE = join(HERE, '.pwa-profile');
const SHOTS = join(HERE, 'screenshots');
const VITE = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const port = Number(process.env['VERIFY_PWA_PORT'] ?? 5180);
const urlArg = process.argv.find((a) => a.startsWith('--url='));
/** A deployed site: nothing to build, nothing to serve, nothing to kill. */
const remote = Boolean(urlArg);
const url = remote
  ? urlArg.slice('--url='.length)
  : `http://localhost:${port}/`;

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'ignore' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
    );
  });
}

async function waitForServer(attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  return false;
}

const started = Date.now();
const { results, check } = createChecks();
let server = null;
let page = null;

try {
  if (remote) {
    console.log(`checking ${url}`);
    if (!(await waitForServer(8))) throw new Error(`nothing is serving ${url}`);
  } else {
    if (!process.argv.includes('--no-build')) {
      console.log('building...');
      await run([VITE, 'build']);
    }
    server = spawn(
      process.execPath,
      [VITE, 'preview', '--port', String(port), '--strictPort'],
      { cwd: ROOT, stdio: 'ignore' },
    );
    if (!(await waitForServer())) {
      throw new Error(`the preview server never came up on ${url}`);
    }
  }

  page = await launch({ port: 9336, profile: PROFILE });
  await page.setViewport(360, 640, 3);
  await page.enableNetwork();
  await page.navigate(url);
  if (!(await waitForScreen(page, '.screen--home'))) {
    throw new Error('the built app never rendered Home');
  }

  // ---- Manifest ----------------------------------------------------------
  const manifest = await page.evaluate(`
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    return fetch(link.href).then(r => r.json()).then(m => ({ href: link.href, ...m }));
  `);
  check('the page links a web app manifest', manifest !== null);
  check(
    'the manifest names the app',
    manifest?.name === 'pUZlink' && manifest?.short_name === 'pUZlink',
    `${manifest?.name} / ${manifest?.short_name}`,
  );
  check(
    'it asks for a standalone window',
    manifest?.display === 'standalone',
    String(manifest?.display),
  );
  check(
    'start_url and scope are relative, so any host path works',
    manifest?.start_url === '.' && manifest?.scope === '.',
    `start_url=${manifest?.start_url} scope=${manifest?.scope}`,
  );
  check(
    'it sets a background and theme colour',
    manifest?.background_color === '#0A2A63' &&
      manifest?.theme_color === '#0A2A63',
    `${manifest?.background_color} / ${manifest?.theme_color}`,
  );
  check(
    'it leaves orientation free, because the board re-lays out',
    manifest?.orientation === 'any',
    String(manifest?.orientation),
  );

  for (const want of [
    { sizes: '192x192', purpose: 'any' },
    { sizes: '512x512', purpose: 'any' },
    { sizes: '512x512', purpose: 'maskable' },
  ]) {
    const found = (manifest?.icons ?? []).find(
      (i) => i.sizes === want.sizes && i.purpose === want.purpose,
    );
    check(
      `it declares a ${want.sizes} ${want.purpose} icon`,
      Boolean(found),
      found?.src ?? 'missing',
    );
  }

  // ---- The icons really decode, at the size they claim --------------------
  const icons = await page.evaluate(`
    const link = document.querySelector('link[rel="manifest"]');
    return fetch(link.href).then(r => r.json()).then(async (m) => {
      const base = new URL('.', link.href).href;
      const out = [];
      for (const icon of m.icons) {
        const img = new Image();
        img.src = base + icon.src;
        try { await img.decode(); } catch { out.push({ ...icon, ok: false }); continue; }
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        out.push({
          ...icon,
          ok: true,
          real: img.width + 'x' + img.height,
          cornerAlpha: ctx.getImageData(1, 1, 1, 1).data[3],
          centreAlpha: ctx.getImageData(img.width >> 1, img.height >> 1, 1, 1).data[3],
        });
      }
      return out;
    });
  `);
  check(
    'every manifest icon loads at the size it declares',
    icons.every((i) => i.ok && i.real === i.sizes),
    icons.map((i) => `${i.src} ${i.ok ? i.real : 'failed'}`).join(', '),
  );
  const maskable = icons.find((i) => i.purpose === 'maskable');
  check(
    'the maskable icon is opaque to its corners, so the launcher mask has something to cut',
    maskable?.cornerAlpha === 255,
    `corner alpha ${maskable?.cornerAlpha}`,
  );
  const plain = icons.filter((i) => i.purpose === 'any');
  check(
    'the plain icons have their rounded corners cut out',
    plain.every((i) => i.cornerAlpha === 0 && i.centreAlpha === 255),
    plain.map((i) => `${i.src} corner=${i.cornerAlpha}`).join(', '),
  );

  const apple = await page.evaluate(`
    const link = document.querySelector('link[rel="apple-touch-icon"]');
    if (!link) return null;
    const img = new Image();
    img.src = link.href;
    return img.decode().then(() => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { size: img.width, cornerAlpha: ctx.getImageData(1, 1, 1, 1).data[3] };
    }).catch(() => ({ size: 0, cornerAlpha: -1 }));
  `);
  check(
    'iOS has an opaque apple-touch-icon to use',
    apple?.size === 180 && apple?.cornerAlpha === 255,
    `${apple?.size}px, corner alpha ${apple?.cornerAlpha}`,
  );

  // ---- Service worker -----------------------------------------------------
  const sw = await page.evaluate(`
    if (!('serviceWorker' in navigator)) return { supported: false };
    return navigator.serviceWorker.ready.then(async (reg) => {
      // ready resolves as soon as there is an active worker, which can still
      // be 'activating' for a tick.
      for (let i = 0; i < 50 && reg.active && reg.active.state !== 'activated'; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return {
        supported: true,
        scope: reg.scope,
        state: (reg.active || {}).state || null,
      };
    });
  `);
  check(
    'a service worker registers and activates',
    sw?.supported === true && sw?.state === 'activated',
    `state ${sw?.state}, scope ${sw?.scope}`,
  );

  const cached = await page.evaluate(`
    return caches.keys().then(async (keys) => {
      let total = 0;
      for (const key of keys) total += (await (await caches.open(key)).keys()).length;
      return { keys, total };
    });
  `);
  check(
    'the app shell is precached',
    cached.total >= 5,
    `${cached.total} entries in ${cached.keys.length} cache(s)`,
  );

  // The artwork is behind every screen, so an install that cached everything
  // except the picture would come up offline with a flat blue app.
  const art = await page.evaluate(`
    return caches.keys().then(async (keys) => {
      const urls = [];
      for (const key of keys) {
        for (const request of await (await caches.open(key)).keys()) urls.push(request.url);
      }
      return urls.filter(u => u.includes('backdrop'));
    });
  `);
  check(
    'the background artwork is precached with it',
    art.length > 0,
    art.length ? art[0].split('/').pop() : 'not in any cache',
  );

  // ---- Criterion 17 still holds once a worker is in the way ---------------
  const beforePlay = page.requests.length;
  await page.evaluate(
    `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
  );
  await sleep(300);
  await page.evaluate(
    `document.querySelectorAll('.level-tile')[0].click(); return 1;`,
  );
  await sleep(400);
  for (let i = 0; i < 12; i++) {
    const done = await page.evaluate(
      `return document.querySelector('.modal') !== null;`,
    );
    if (done) break;
    await page.evaluate(`
      const hint = [...document.querySelectorAll('.tool')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint'));
      if (hint && !hint.disabled) hint.click();
      return 1;
    `);
    await sleep(200);
  }
  const duringPlay = page.requests.slice(beforePlay);
  check(
    'the worker adds no network traffic during a level (spec 12.17)',
    duringPlay.length === 0,
    duringPlay
      .map((r) => r.url)
      .join(' | ')
      .slice(0, 200),
  );

  // Back to a clean Home before pulling the plug.
  await page.blank();
  await page.clearOriginData(new URL(url).origin);
  await page.navigate(url);
  if (!(await waitForScreen(page, '.screen--home'))) {
    throw new Error('the app never returned to Home before the offline checks');
  }

  // ---- Offline: the phase 6 definition of done ----------------------------
  await page.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  // Stop the server too, so a pass cannot be an artefact of the emulation.
  // A deployed host is not ours to stop, so there offline rests on emulation.
  if (server) {
    server.kill();
    server = null;
    await sleep(500);
  }

  // Probed from Node, not the page: in the page the service worker would
  // answer from cache, which is exactly the behaviour under test.
  if (!remote) {
    let reachable = 'gone';
    try {
      await fetch(url);
      reachable = 'reachable';
    } catch {
      // Expected: nothing is listening any more.
    }
    check('the origin server is really gone', reachable === 'gone', reachable);
  }

  await page.reload();
  const offlineHome = await waitForScreen(page, '.screen--home');
  check(
    remote
      ? 'the app still loads with the network off'
      : 'the app still loads with the network off and the server stopped',
    offlineHome,
    offlineHome ? '' : 'Home never rendered',
  );

  await page.evaluate(
    `document.querySelectorAll('.tier__button')[0].click(); return 1;`,
  );
  await sleep(400);
  await page.evaluate(
    `document.querySelectorAll('.level-tile')[0].click(); return 1;`,
  );
  const board = await waitForScreen(page, '.screen--play');
  const label = await page.evaluate(`
    const canvas = document.querySelector('.board');
    return canvas ? canvas.getAttribute('aria-label') : null;
  `);
  check(
    'a level generates and renders offline',
    board && /5 by 5/.test(String(label)),
    String(label),
  );

  /*
   * This is the production bundle, which carries no dev solve hook, and hints
   * are capped at two - not enough to finish a board. So this asserts the game
   * runs offline rather than that it can be completed offline: a level
   * generates, the engine responds, the board redraws and the HUD follows.
   * Completing a level is covered against the dev server, where nothing about
   * the win path touches the network anyway.
   */
  const hudBefore = await page.evaluate(`
    const stats = [...document.querySelectorAll('.stat')].map(s => s.textContent);
    return { lines: stats[0], filled: stats[1] };
  `);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(`
      const hint = [...document.querySelectorAll('.tool')]
        .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint'));
      if (hint && !hint.disabled) hint.click();
      return 1;
    `);
    await sleep(400);
  }
  const hudAfter = await page.evaluate(`
    const stats = [...document.querySelectorAll('.stat')].map(s => s.textContent);
    const hint = [...document.querySelectorAll('.tool')]
      .find(b => (b.getAttribute('aria-label') || '').startsWith('Hint'));
    return {
      lines: stats[0],
      filled: stats[1],
      hintLabel: hint ? hint.getAttribute('aria-label') : null,
      hintDisabled: hint ? hint.disabled : null,
    };
  `);
  check(
    'the board responds and redraws offline',
    hudAfter.lines !== hudBefore.lines && hudAfter.filled !== hudBefore.filled,
    `${hudBefore.lines}/${hudBefore.filled} -> ${hudAfter.lines}/${hudAfter.filled}`,
  );
  check(
    'the hint allowance runs out offline and the button goes flat',
    hudAfter.hintDisabled === true,
    `${hudAfter.hintLabel}, disabled=${hudAfter.hintDisabled}`,
  );
  await page.screenshot(join(SHOTS, '50-offline-played.png'));

  const stored = await page.evaluate(
    `return Object.keys(localStorage).length;`,
  );
  check('progress is still written offline', stored > 0, `${stored} keys`);

  const noise = consoleNoise(page);
  check(
    'no console errors or warnings',
    noise.length === 0,
    noise
      .map((l) => l.text)
      .join(' | ')
      .slice(0, 240),
  );
} catch (error) {
  check('the PWA checks ran to completion', false, error.message);
} finally {
  await page?.close();
  server?.kill();

  for (const result of results) {
    console.log(
      `  ${result.pass ? 'PASS' : 'FAIL'} ${result.name}` +
        (result.detail ? ` — ${result.detail}` : ''),
    );
  }
  const failed = results.filter((r) => !r.pass).length;
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${results.length - failed}/${results.length} PWA checks passed in ${seconds}s`,
  );
  process.exit(failed > 0 ? 1 : 0);
}
