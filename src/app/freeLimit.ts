/**
 * The pUZles free limit.
 *
 * pUZlink ships two ways: on its own, and inside the pUZles hub. Inside the hub it is
 * free up to a point — Easy levels 1–20 — after which the player buys the one-time unlock
 * in the hub. Standalone it is unrestricted, as it has always been.
 *
 * The hub says which is which through a flag its shim sets on `window` before any of this
 * bundle runs. A standalone build never sees that shim, so the flag is absent — which is
 * why the test below is "explicitly true", never "not false". Getting that backwards
 * would lock the standalone app.
 */

import type { TierId } from '../engine/types';

/** Free levels of the free tier, inside the hub. */
export const FREE_LEVELS = 20;

/** The one tier a free hub player can play. */
export const FREE_TIER: TierId = 'easy';

interface HubFlag {
  __puzlesFreeLimit?: { limited?: boolean };
}

/**
 * Read once and cached. The hub sets the flag before the first script runs and never
 * changes it within a page life — a purchase reloads the WebView — so re-reading it for
 * every tile of a 100-cell level grid would only cost time.
 */
let limited: boolean | null = null;

export function freeLimitActive(): boolean {
  if (limited === null) {
    limited = (globalThis as HubFlag).__puzlesFreeLimit?.limited === true;
  }
  return limited;
}

/** Whether the hub is holding this level back. False in a standalone build, always. */
export function isPaywalled(tier: TierId, index: number): boolean {
  return freeLimitActive() && !(tier === FREE_TIER && index <= FREE_LEVELS);
}

/** Whether the hub is holding a whole tier back. */
export function isTierPaywalled(tier: TierId): boolean {
  return freeLimitActive() && tier !== FREE_TIER;
}

/** Tests only: set the flag directly, or pass null to re-read it. */
export function __setFreeLimitForTest(value: boolean | null): void {
  limited = value;
}
