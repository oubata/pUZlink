import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  APP_VERSION,
  STORAGE_KEYS,
  STORAGE_PREFIX,
} from '../../src/app/config';
import { S } from '../../src/app/strings';

describe('config', () => {
  it('exposes an app name that the strings table reuses', () => {
    expect(APP_NAME).toBeTruthy();
    expect(S.appName).toBe(APP_NAME);
  });

  it('namespaces every storage key under the schema prefix', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith(STORAGE_PREFIX)).toBe(true);
    }
  });

  /*
   * The version lives in three files by hand: here, package.json, and the
   * Android build.gradle. This pins the two that a test can reach, so a release
   * cannot ship a Settings screen showing the previous version. The gradle copy
   * is on the release checklist.
   */
  it('shows the same version the package declares', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { version?: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});
