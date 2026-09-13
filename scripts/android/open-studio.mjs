/**
 * Open the Android project in Android Studio, with the current web build in it.
 *
 *   npm run android:open              # build the native bundle, sync, then open
 *   npm run android:open -- --open-only   # just open what is already there
 *
 * The same first two steps as `npm run apk`; Studio then owns the Gradle build,
 * the device picker and the logcat. Unlike `npm run apk` this needs no JDK or
 * `ANDROID_HOME` of its own — Studio brings both — so it is the shorter road to
 * a build on a machine that has never had the command-line SDK set up.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const ANDROID = join(ROOT, 'android');
const openOnly = process.argv.slice(2).includes('--open-only');

/** Node is spawned without a shell, so a space in the path cannot split it. */
function run(command, args, { cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

if (!existsSync(ANDROID)) {
  console.error('No android/ project. Run `npx cap add android` first.');
  process.exit(1);
}

const vite = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const cap = join(ROOT, 'node_modules', '@capacitor', 'cli', 'bin', 'capacitor');

if (!openOnly) {
  console.log(
    '\n1/3  building the web bundle (native mode, no service worker)',
  );
  await run(process.execPath, [vite, 'build', '--mode', 'native']);

  console.log('\n2/3  copying it into the Android project');
  await run(process.execPath, [cap, 'sync', 'android']);
}

console.log(`\n${openOnly ? '1/1' : '3/3'}  opening Android Studio`);
try {
  // Capacitor knows where Studio lives on each platform, and respects
  // CAPACITOR_ANDROID_STUDIO_PATH when it is installed somewhere unusual.
  await run(process.execPath, [cap, 'open', 'android']);
} catch (error) {
  // macOS keeps it in one place; `open` there also raises a window that is
  // already up, which `cap open` does not always manage.
  if (process.platform === 'darwin') {
    console.log('  cap open failed, asking macOS to open it instead');
    await run('open', ['-a', 'Android Studio', ANDROID]);
  } else {
    console.error(
      `\nCould not start Android Studio: ${error.message}\n` +
        'Set CAPACITOR_ANDROID_STUDIO_PATH to the executable, or open\n' +
        `${ANDROID}\nfrom Studio's own File → Open.`,
    );
    process.exit(1);
  }
}

console.log(
  '\nStudio is opening ' +
    ANDROID +
    '\nThe first Gradle sync takes a few minutes. Then Run ▶ builds and installs' +
    '\nto a connected phone or an emulator.' +
    (openOnly
      ? '\n\nOpened without rebuilding: Studio has whatever web bundle was last' +
        '\nsynced. Drop --open-only to refresh it.'
      : ''),
);
