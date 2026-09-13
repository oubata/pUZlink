/**
 * Browser checks for the acceptance criteria that can only be judged by running
 * the app (spec 12, the "(R)" rows). Starts the dev server, drives a headless
 * browser through it, and prints one pass/fail line per check.
 *
 *   npm run verify                    # start a dev server and check against it
 *   npm run verify -- --url=...       # check an already-running server
 *   npm run verify -- --only=keyboard # run one suite by name
 *   CHROME_PATH=... npm run verify    # point at a specific browser
 */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';
import { consoleNoise, createChecks } from './helpers.mjs';

import coreLoop from './suites/core-loop.mjs';
import keyboardA11y from './suites/keyboard-a11y.mjs';
import edgeCases from './suites/edge-cases.mjs';
import winRule from './suites/win-rule.mjs';
import unlock from './suites/unlock.mjs';
import artwork from './suites/artwork.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SHOTS = join(HERE, 'screenshots');
const PROFILE = join(HERE, '.browser-profile');

const SUITES = [coreLoop, keyboardA11y, edgeCases, winRule, unlock, artwork];

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const port = Number(process.env['VERIFY_PORT'] ?? 5179);

async function waitForServer(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // Not listening yet.
    }
    await sleep(250);
  }
  return false;
}

function startDevServer() {
  // Spawn Vite's own entry rather than `npm run dev`, so killing the child
  // actually kills the server on every platform.
  const child = spawn(
    process.execPath,
    [
      join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: ROOT, stdio: 'ignore' },
  );
  return child;
}

const started = Date.now();
let server = null;
let page = null;
let failures = 0;
let total = 0;

try {
  const url = urlArg
    ? urlArg.slice('--url='.length)
    : `http://localhost:${port}/`;

  if (!urlArg) {
    server = startDevServer();
    if (!(await waitForServer(url))) {
      throw new Error(`The dev server never came up on ${url}`);
    }
  } else if (!(await waitForServer(url, 8))) {
    throw new Error(`Nothing is serving ${url}`);
  }

  rmSync(SHOTS, { recursive: true, force: true });
  page = await launch({ port: 9333, profile: PROFILE });

  for (const suite of SUITES) {
    if (only && !suite.name.includes(only)) continue;

    const before = page.logs.length;
    const shot = (name) => page.screenshot(join(SHOTS, `${name}.png`));

    console.log(`\n${suite.name}`);
    console.log('-'.repeat(suite.name.length));

    // Own the array, so a suite that throws still reports what it proved.
    const { results, check } = createChecks();
    try {
      await suite.run({ page, url, shot, results, check });
    } catch (error) {
      check('suite ran to completion', false, error.message);
    }

    const noise = consoleNoise({ logs: page.logs.slice(before) });
    results.push({
      name: 'no console errors or warnings',
      pass: noise.length === 0,
      detail: noise
        .map((l) => l.text)
        .join(' | ')
        .slice(0, 200),
    });

    for (const result of results) {
      total++;
      if (!result.pass) failures++;
      const mark = result.pass ? 'PASS' : 'FAIL';
      console.log(
        `  ${mark} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`,
      );
    }
  }
} catch (error) {
  failures++;
  total++;
  console.error(`\nFAIL harness — ${error.message}`);
} finally {
  await page?.close();
  server?.kill();
  // The profile is wiped on the next launch; deleting it now races the browser
  // shutting down and fails with EPERM on Windows.

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${total - failures}/${total} checks passed in ${seconds}s` +
      (failures === 0 ? `\nScreenshots: ${SHOTS}` : ''),
  );
  process.exit(failures > 0 ? 1 : 0);
}
