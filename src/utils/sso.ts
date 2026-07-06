import { API_BASE } from '../api/client';

// Prompt Library handoff ("Open in Candy"): a `?ticket=` may be present on the
// URL when the user isn't signed in yet. The OIDC login redirect only round-trips
// the frontend ORIGIN via `return_to` (see Candy-Agents api/v1/sso_oidc.py
// `_safe_return_to`/ALLOWED_FRONTEND_ORIGINS) — a query string doesn't survive the
// trip. Stash it in sessionStorage so it can be claimed once the session exists,
// same pattern as Finixy_workflow's PENDING_TICKET_KEY.
export const PENDING_PROMPT_TICKET_KEY = 'candy_pending_prompt_ticket';

export function redirectToSSO(): void {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const callbackUrl = encodeURIComponent(
    isLocalhost
      ? `${window.location.origin}/sso/callback`
      : 'https://app.candy.cx/sso/callback'
  );
  window.location.href = `https://spacemarvel.ai/login?redirect_uri=${callbackUrl}`;
}

/**
 * Start the OIDC Authorization Code flow. Navigates the browser to the Candy
 * backend's /login, which sets the CSRF/PKCE cookies and bounces to the dashboard.
 * After auth the backend redirects back to this app's /sso/oidc/callback with the
 * minted Candy token. `return_to` tells the backend which frontend origin to come
 * back to (must be allow-listed there) — this lets localhost dev complete the flow.
 */
export function redirectToOIDC(): void {
  // Stash a pending prompt ticket before leaving for login — return_to only
  // preserves the origin, so ?ticket= would otherwise be lost on the round trip.
  const ticket = new URLSearchParams(window.location.search).get('ticket');
  if (ticket) sessionStorage.setItem(PENDING_PROMPT_TICKET_KEY, ticket);

  const returnTo = encodeURIComponent(window.location.origin);
  window.location.href = `${API_BASE}/v1/auth/sso/oidc/login?return_to=${returnTo}`;
}
