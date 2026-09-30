import { API_BASE, getToken } from '../api/client';
import { logger } from './logger';

// Prompt Library handoff ("Open in Candy"): a `?ticket=` may be present on the
// URL when the user isn't signed in yet. The OIDC login redirect only round-trips
// the frontend ORIGIN via `return_to` (see Candy-Agents api/v1/sso_oidc.py
// `_safe_return_to`/ALLOWED_FRONTEND_ORIGINS) — a query string doesn't survive the
// trip. Stash it in sessionStorage so it can be claimed once the session exists,
// same pattern as Finixy_workflow's PENDING_TICKET_KEY.
export const PENDING_PROMPT_TICKET_KEY = 'candy_pending_prompt_ticket';

/**
 * The in-app route (hash path) the user was on when the session had to be renewed. Without it
 * an expired session dumped everyone on /healthcare after re-login, losing their place — which
 * reads as "logged out and everything reset". Same tab, same origin, so sessionStorage survives
 * the IDP round-trip.
 */
export const RETURN_ROUTE_KEY = 'candy.return_route';

/** Metaspace/Finixy URL the user clicked in the rail, kept across the SpaceMarvel login round-trip. */
export const SSO_INTENT_KEY = 'candy:sso_intent';

// How long a stashed intent stays valid. A re-login can come back via either the direct
// SpaceMarvel-login path OR Candy's own OIDC re-auth (ProtectedRoute fires redirectToOIDC()
// the instant a background 401 clears the session — see App.tsx) — whichever navigation wins
// that race is what the browser actually follows, so the intent must be honored either way.
// The age check is what still protects against a stale intent from a long-abandoned attempt
// hijacking an unrelated later login.
const SSO_INTENT_MAX_AGE_MS = 2 * 60 * 1000;

/** Stash the app the user clicked before sending them off to re-authenticate. */
export function setSsoIntent(appUrl: string): void {
  try {
    localStorage.setItem(SSO_INTENT_KEY, JSON.stringify({ appUrl, ts: Date.now() }));
  } catch { /* best-effort */ }
}

/** One-shot read of the stashed intent. Null (and discarded) if missing, malformed, or older
 * than SSO_INTENT_MAX_AGE_MS. */
export function takeSsoIntent(): string | null {
  try {
    const raw = localStorage.getItem(SSO_INTENT_KEY);
    localStorage.removeItem(SSO_INTENT_KEY);
    if (!raw) return null;
    const { appUrl, ts } = JSON.parse(raw);
    if (typeof appUrl !== 'string' || typeof ts !== 'number') return null;
    return Date.now() - ts <= SSO_INTENT_MAX_AGE_MS ? appUrl : null;
  } catch { return null; }
}

const SM_API =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? '/sm-api'
    : (import.meta.env.VITE_SM_API_URL || 'https://dashboard-api.spacemarvel.ai');

/** One sso/generate call with `bearer`. The one-time sso_token, or null on any failure. */
async function generateSsoToken(bearer: string, appUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${SM_API}/api/rbac/auth/sso/generate/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
      body: JSON.stringify({ app_url: appUrl }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data.sso_token || data.token || null;
  } catch {
    return null;
  }
}

/**
 * Open Metaspace/Finixy already signed in: mint a one-time SSO token and navigate to
 * `appUrl?sso_token=…&access_token=<bearer used>` — the shape both apps read on arrival.
 *
 * Uses Candy's own session token directly. It authenticates this call the same way it
 * always has in staging/prod (same signing key, same user ids the dashboard recognizes)
 * — a separate `dashboard_token` round-trip through the OIDC callback is not needed for
 * this. (An earlier version tried a stored `dashboard_token` first and fell back to
 * Candy's token on rejection — dropped after confirming live in dev that `dashboard_token`
 * was landing as null even right after a successful login, so the "correct" path was
 * silently never firing and every call already depended on this fallback anyway.)
 * Resolves false when there's no session or the dashboard rejects it, so the caller can
 * fall back to the SpaceMarvel login.
 */
export async function redirectWithSso(appUrl: string): Promise<boolean> {
  const bearer = getToken();
  if (!bearer) return false;
  const token = await generateSsoToken(bearer, appUrl);
  if (!token) return false;
  const target = new URL(appUrl);
  target.searchParams.set('sso_token', token);
  target.searchParams.set('access_token', bearer);
  window.location.href = target.toString();
  return true;
}

/** One-shot read of the saved route; only real app pages, never auth/callback screens. */
export function takeReturnRoute(): string | null {
  try {
    const r = sessionStorage.getItem(RETURN_ROUTE_KEY);
    sessionStorage.removeItem(RETURN_ROUTE_KEY);
    return r && r.startsWith('/') && r !== '/' && !/^\/(sso|auth)\b/.test(r) ? r : null;
  } catch { return null; }
}

export function redirectToSSO(): void {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const callbackUrl = encodeURIComponent(
    isLocalhost
      ? `${window.location.origin}/sso/callback`
      : 'https://app.candy.cx/sso/callback'
  );
  window.location.href = `https://spacemarvel.com/login?redirect_uri=${callbackUrl}`;
}

/**
 * Start the OIDC Authorization Code flow. Navigates the browser to the Candy
 * backend's /login, which sets the CSRF/PKCE cookies and bounces to the dashboard.
 * After auth the backend redirects back to this app's /sso/oidc/callback with the
 * minted Candy token. `return_to` tells the backend which frontend origin to come
 * back to (must be allow-listed there) — this lets localhost dev complete the flow.
 * `?ticket=` is passed to the backend and stashed in a cookie so it survives the
 * OIDC round-trip (query strings don't).
 */
export function redirectToOIDC(): void {
  // Flagged High in debug/AUDIT.md — this is the app's only unauthenticated
  // entry point (landing page mount + CTA, App.tsx's ProtectedRoute) and had no
  // error visibility if URL/storage construction throws (e.g. malformed
  // VITE_API_BASE_URL, storage blocked). Logging only — rethrows unchanged so
  // callers see the exact same failure as before.
  try {
    logger.debug('[redirectToOIDC] start', { origin: window.location.origin, search: window.location.search });
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('ticket');

    // Also stash in sessionStorage as a fallback (in case cookies fail).
    if (ticket) sessionStorage.setItem(PENDING_PROMPT_TICKET_KEY, ticket);
    const route = window.location.hash.replace(/^#/, '');
    if (route && route !== '/') sessionStorage.setItem(RETURN_ROUTE_KEY, route);

    const loginUrl = new URL(`${API_BASE}/v1/auth/sso/oidc/login`);
    loginUrl.searchParams.set('return_to', window.location.origin);
    if (ticket) loginUrl.searchParams.set('ticket', ticket);
    logger.debug('[redirectToOIDC] navigating', { href: loginUrl.href });
    window.location.href = loginUrl.href;
  } catch (error) {
    logger.error('[redirectToOIDC] failed', { error, stack: (error as Error)?.stack });
    throw error; // behavior unchanged — callers still see the same throw
  }
}
