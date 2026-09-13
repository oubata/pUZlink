# pUZlink

A grid path-connection puzzle. Drag a line from each coloured dot to its twin;
lines may not cross, and the board is only solved when every cell is covered.
Six tiers from a 5×5 warm-up to a 14×14 Master board, 100 levels each,
generated deterministically so every player gets the same level 42.

**Play it: [oubata.github.io/pUZlink](https://oubata.github.io/pUZlink/)**
Installable on Android, iOS and desktop; works offline once loaded.

The design and rules live in [`docs/pOZle_color-link_spec_v1.0.md`](docs/pOZle_color-link_spec_v1.0.md),
which is the source of truth for this build.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

No backend, no accounts, no network calls after the first load. Progress lives
in `localStorage`.

## Commands

| Command                                          | What it does                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                    | Dev server with hot reload                                                                                      |
| `npm run build`                                  | Type-check, then a production bundle in `dist/`                                                                 |
| `npm run preview`                                | Serve the built `dist/` locally                                                                                 |
| `npm test`                                       | 233 unit tests (Vitest)                                                                                         |
| `npm run verify`                                 | Drives a headless browser through the app and checks the spec 12 criteria that can only be judged by running it |
| `npm run verify:pwa`                             | Builds, then checks the manifest, icons, service worker, and a real offline reload                              |
| `npm run icons`                                  | Re-rasterises the PNG icons from the artwork in `scripts/icons/generate.mjs`                                    |
| `python3 scripts/textures/prepare-background.py` | Re-encodes the background artwork losslessly into `public/textures/` (needs Pillow)                             |
| `npm run apk`                                    | Builds the Android debug APK (needs a JDK and the Android SDK)                                                  |
| `npm run android:open`                           | Builds and syncs the native bundle, then opens `android/` in Android Studio                                     |
| `npm run unlock:device`                          | Unlocks every tier on a connected phone, for testing                                                            |
| `npm run format`                                 | Prettier                                                                                                        |

`npm run verify` and `npm run verify:pwa` need a Chromium-based browser. They
look for Edge and Chrome in the usual places; set `CHROME_PATH` if yours is
somewhere else.

## Deploying

The build uses a **relative base** (`base: './'` in `vite.config.ts`), so
`dist/` runs from any path on any static host without reconfiguration — a
domain root, a project subpath, even `file://`.

Everything is static. There is nothing to configure server-side beyond serving
the files.

### Netlify

Connect the repository and set:

- **Build command**: `npm run build`
- **Publish directory**: `dist`

Or from the CLI:

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

### GitHub Pages — already set up

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds and
publishes on every push to `main`. It runs the unit tests first and will not
publish a red build. Nothing to do but push:

```bash
git push
```

Pages is configured with GitHub Actions as its source. The relative base means
the project site at `https://oubata.github.io/pUZlink/` works with no extra
configuration.

After a deploy, check the live site rather than trusting the green tick:

```bash
npm run verify:pwa -- --url=https://oubata.github.io/pUZlink/
```

That runs the manifest, icon, service-worker and offline checks against the
deployed URL. The one check it skips is stopping the origin server, which is
not ours to stop; offline there rests on network emulation alone.

### Any other static host

Build and copy `dist/` wherever it is served from:

```bash
npm run build
```

Two things a host must get right for the installable app to work:

- **Serve over HTTPS.** Service workers are refused on plain HTTP, apart from
  `localhost`. Both Netlify and GitHub Pages do this for you.
- **Do not cache `sw.js` or `index.html` for long.** The hashed files under
  `assets/` are immutable and can be cached forever; the service worker and the
  HTML entry must be revalidated, or an update will not reach anyone. Netlify
  and GitHub Pages default to sensible values here.

## Installing it

The build is a PWA: an app manifest, maskable icons, and a service worker that
precaches the whole app shell.

- **Android / Chrome**: the browser offers "Install app" once the page has been
  visited. Also under ⋮ → _Add to Home screen_.
- **iOS / Safari**: Share → _Add to Home Screen_. iOS does not prompt on its own.
- **Desktop Chrome / Edge**: an install icon appears in the address bar.

After the first load the app works with no network at all — levels are
generated on the device, so every one of the 600 is available offline.
`npm run verify:pwa` proves this by stopping the server and playing a level to
completion.

## Android

```bash
npm run apk
```

Builds `android/app/build/outputs/apk/debug/app-debug.apk` — a self-contained
app with the whole game inside it. No server, no URL bar, offline from first
launch. Needs the Android SDK with `ANDROID_HOME` pointing at it, and a JDK of
21 or older on `JAVA_HOME`: Gradle 8.11.1 rejects the JDK 25 that current
Android Studio bundles, with "Unsupported class file major version 69".
`/usr/libexec/java_home -V` lists the JDKs installed. Install it on a connected
phone with:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The APK is debug-signed, so Android asks you to allow installation from an
unknown source the first time.

### Android Studio

```bash
npm run android:open
```

Builds the native bundle, copies it into `android/`, and opens the project in
Android Studio, where Run ▶ builds, installs and attaches a debugger in one go.
Studio brings its own JDK and SDK, so this needs neither a JDK on the `PATH` nor
`ANDROID_HOME` — it is the shorter road on a machine that has never had the
command-line SDK set up. The first Gradle sync takes a few minutes.

Add `-- --open-only` to skip the rebuild and open whatever was last synced. If
Studio lives somewhere other than the default location, point
`CAPACITOR_ANDROID_STUDIO_PATH` at it.

Three things worth knowing about the native build:

- **It runs edge to edge, with the navigation bar hidden.** The artwork reaches
  all four edges and the board gets the whole screen. The navigation bar is
  hidden, not disabled: a swipe up from the bottom edge brings it back as a
  transient overlay that fades on its own. The status bar stays, floating over
  the artwork, so the clock and battery are still visible during a game.

- It uses `vite build --mode native`, which **drops the service worker**.
  Capacitor serves every app version from the same `https://localhost` origin,
  so a worker left by an older install would keep serving its cached assets and
  a freshly installed APK would show the old app. Inside the APK the files are
  local anyway, so the worker buys nothing.
- The launcher icons come from `npm run icons`, same artwork as the web icons.
  Edit `scripts/icons/generate.mjs` and re-run it; do not hand-edit the PNGs.

### Testing the later tiers

Extreme, Expert and Master are gated behind 20 solves in the tier before them,
which is a long way to play to reach them. With the app open on a connected
phone and its WebView forwarded:

```bash
PID=$(adb shell pidof com.oubata.colorlink)
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
npm run unlock:device
```

It seeds the gate tiers over adb, so nothing in the repo changes and no rebuild
is needed. It backs the phone's real progress up first;
`npm run unlock:device -- --restore` puts it back, and Settings → Reset
progress clears everything. The backup is device state and stays out of git.

The Android back button is wired to the app's own back navigation, via a spare
history entry (`syncHistory` in `src/app/App.ts`). Without it, back would close
the app from any screen. The same code makes the browser's back button work on
the web.

## Layout

```
src/engine/      Pure rules: paths, cutting, undo, win. No DOM, no randomness.
src/generator/   Deterministic level generation from a seed. No DOM, no Math.random.
src/render/      Canvas board renderer and layout maths.
src/input/       Pointer and keyboard to engine operations.
src/app/         Screens, modals, state machine, progress, strings, config.
src/storage/     localStorage with schema guards.
src/audio/       Synthesised sound and haptics.
tests/           Mirrors src/.
scripts/verify/  Browser checks for the acceptance criteria.
scripts/icons/   Icon rasteriser, for the web and Android launcher icons.
scripts/android/ APK build.
scripts/device/  Test helpers that drive the app on a connected phone.
android/        Capacitor project: the APK wrapper around dist/.
```

`src/engine/` and `src/generator/` are pure TypeScript and are not allowed to
import from the DOM or from `app/`, `render/` or `input/`. See
[`CLAUDE.md`](CLAUDE.md) for the rest of the conventions.
