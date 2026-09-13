/**
 * "‹ pUZles" — the way back to the hub, rendered on this game's Home screen only.
 *
 * The hub used to inject a floating pill over the running game, but from outside it could
 * not tell which of the game's screens was on display: it turned up over result cards,
 * calendars, tab screens and modals. Rendering it here is what spec §11.5.2 asked for from
 * the start, and it cannot leak onto another screen because Home is the only thing that
 * mounts it.
 *
 * Plain DOM and inline styles on purpose. This is hub chrome rather than part of this
 * game's design system, and it should look identical in all five games.
 */
export function hubReturnButton(): HTMLButtonElement | null {
  const params = new URLSearchParams(window.location.search);
  const fromHub =
    params.get('from') === 'hub' ||
    (import.meta.env as Record<string, string | undefined>).VITE_HUB === '1';
  // Launched on its own, this game has no hub to go back to.
  if (!fromHub) return null;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'hub-return';
  button.setAttribute('aria-label', 'Back to pUZles');
  button.textContent = '‹ pUZles';
  button.style.cssText = [
    'align-self:flex-start',
    'display:inline-flex',
    'align-items:center',
    'min-height:32px',
    'margin:0 0 6px',
    'padding:6px 12px 6px 9px',
    'font:600 13px/1 -apple-system,Roboto,"Segoe UI",sans-serif',
    'letter-spacing:.02em',
    'color:#fff',
    'background:rgba(17,17,17,.78)',
    'border:0',
    'border-radius:999px',
    'box-shadow:0 1px 6px rgba(0,0,0,.28)',
    'cursor:pointer',
  ].join(';');

  button.addEventListener('click', (event) => {
    event.preventDefault();
    /*
     * The hub injects __puzlesHubReturn into every bundle it serves. The fallback is for a
     * build running outside the hub that still somehow carries ?from=hub.
     */
    const back = (window as { __puzlesHubReturn?: () => void }).__puzlesHubReturn;
    if (back) back();
    else window.location.replace('/index.html');
  });

  return button;
}
