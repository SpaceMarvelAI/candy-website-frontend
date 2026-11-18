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
// hijacking an unrelated later login. 10 minutes, not 2: a real login round-trip through the
// SpaceMarvel dashboard (account picker, password/2FA, then two more redirects through Candy's
// own OIDC callback) is a lot of screens for a human to click through — 2 minutes measured as
// too tight in practice and silently dropped the intent before the round-trip even finished.
const SSO_INTENT_MAX_AGE_MS = 10 * 60 * 1000;

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
    if (!res.ok) {
      // Was a fully silent null before — "jump to another app" failing with zero visibility
      // into whether it was a 401 (bad/expired bearer), a 4xx (app_url not allow-listed on
      // the dashboard), or a 5xx, is exactly what made this bug take three rounds to pin down.
      const body = await res.text().catch(() => '');
      logger.warn('[sso] generateSsoToken rejected', { status: res.status, appUrl, body: body.slice(0, 300) });
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const token = data.sso_token || data.token || null;
    if (!token) logger.warn('[sso] generateSsoToken: 200 OK but no sso_token/token in response', { appUrl, keys: Object.keys(data) });
    return token;
  } catch (err) {
    logger.warn('[sso] generateSsoToken network error', { appUrl, err });
    return null;
  }
}

/**
 * Open Metaspace/Finixy already signed in: mint a one-time SSO token and navigate to
 * `appUrl?sso_token=…&access_token=<bearer used>` — the shape both apps read on arrival.
 *
 * MUST authenticate with the dashboard's OWN token (`dashboard_token`, a real OAuth2
 * access token minted during the OIDC login round-trip), not Candy's own session JWT.
 * The dashboard's /api/rbac/auth/sso/generate/ only accepts its own HS256 JWT or a real
 * OAuth2 access token (WorkOSJWTAuthentication / OAuth2Authentication) — Candy signs its
 * session token with Candy's own SECRET_KEY, a different secret, so the dashboard can
 * never verify it. Confirmed live (401 Unauthorized) 2026-10-30: this call had been
 * silently broken since whenever it started using Candy's token, for every caller, in
 * every environment — "jump to another product while already logged in" always fell
 * through to a full re-login that (via this same broken call) dead-ended back in Candy
 * instead of reaching the target app. See docs/user-profiling-onboarding edge case #10.
 *
 * Falls back to Candy's own token only if no dashboard_token is stored yet (e.g. a user
 * who signed in with email/password and never went through the dashboard's OIDC flow) —
 * that attempt will still 401, but it's no worse than today and keeps this from silently
 * refusing to even try. Resolves false when there's no usable bearer or the dashboard
 * rejects it, so the caller can fall back to the SpaceMarvel login.
 */
export async function redirectWithSso(appUrl: string): Promise<boolean> {
  const storedDashboardToken = (() => { try { return localStorage.getItem('dashboard_token'); } catch { return null; } })();
  let bearer = storedDashboardToken || getToken();
  if (!bearer) {
    logger.warn('[sso] redirectWithSso: no bearer at all (no dashboard_token, no Candy session) — cannot even attempt', { appUrl });
    return false;
  }
  logger.debug('[sso] redirectWithSso: attempting', { appUrl, usingDashboardToken: !!storedDashboardToken });
  let token = await generateSsoToken(bearer, appUrl);

  // Stored dashboard token missing/expired: Candy's own session (what `bearer` falls back to
  // above) easily outlives the dashboard's much shorter-lived access token, so this is the
  // common case, not the exceptional one. Ask Candy's backend to refresh it via the stored
  // refresh token before giving up — only a dead/revoked refresh token (credentials actually
  // exhausted) should still fall through to the full SpaceMarvel re-login below.
  if (!token) {
    logger.debug('[sso] redirectWithSso: first generate failed — asking Candy backend to refresh the dashboard token', { appUrl });
    const refreshed = await refreshDashboardToken();
    if (refreshed) {
      try { localStorage.setItem('dashboard_token', refreshed); } catch { /* best-effort */ }
      bearer = refreshed;
      token = await generateSsoToken(refreshed, appUrl);
    } else {
      logger.warn('[sso] redirectWithSso: dashboard-token refresh returned nothing — falling back to full re-login', { appUrl });
    }
  }

  if (!token) return false;
  logger.debug('[sso] redirectWithSso: got sso_token, navigating', { appUrl });
  const target = new URL(appUrl);
  target.searchParams.set('sso_token', token);
  target.searchParams.set('access_token', bearer);
  window.location.href = target.toString();
  return true;
}

/** Ask Candy's backend for a currently-valid dashboard access token (it holds the refresh
 * token this browser never sees, and refreshes server-side if the stored access token has
 * expired). Null only when there's no usable Candy session, or the backend reports the
 * dashboard session itself is unrecoverable (refresh token dead/revoked).
 *
 * Backend contract: GET {API_BASE}/v1/auth/sso/oidc/dashboard-token, authenticated with
 * Candy's own bearer token, returning `{ dashboard_token: string }` on 200 or 401 otherwise.
 * Implemented server-side (api/v1/sso_oidc.py get_fresh_dashboard_token) — confirmed 2026-11-16.
 */
async function refreshDashboardToken(): Promise<string | null> {
  const candyToken = getToken();
  if (!candyToken) {
    logger.warn('[sso] refreshDashboardToken: no Candy session token — cannot even ask');
    return null;
  }
  try {
    const res = await fetch(`${API_BASE}/v1/auth/sso/oidc/dashboard-token`, {
      headers: { Authorization: `Bearer ${candyToken}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn('[sso] refreshDashboardToken rejected', { status: res.status, body: body.slice(0, 300) });
      return null;
    }
    const data = await res.json().catch(() => ({}));
    if (!data.dashboard_token) logger.warn('[sso] refreshDashboardToken: 200 OK but no dashboard_token in response', { keys: Object.keys(data) });
    return data.dashboard_token || null;
  } catch (err) {
    logger.warn('[sso] refreshDashboardToken network error', { err });
    return null;
  }
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
  // Always derive from the current origin — this was previously hardcoded to
  // app.candy.cx for every non-localhost host, which silently sent
  // candy-staging.spacemarvel.ai logins back to production after SSO instead
  // of back to staging (same bug already fixed in Finixy_workflow's sso.ts).
  const callbackUrl = encodeURIComponent(`${window.location.origin}/sso/callback`);
  const loginUrl = import.meta.env.VITE_SM_LOGIN_URL || 'https://staging.spacemarvel.ai';
  window.location.href = `${loginUrl}/login?redirect_uri=${callbackUrl}`;
}

/**
 * Start the OIDC Authorization Code flow. Navigates the browser to the Candy
 * backend's /login, which sets the CSRF/PKCE cookies and bounces to the dashboard.
 * After auth the backend redirects back to this app's /sso/oidc/callback with the
 * minted Candy token. `return_to` tells the backend which frontend origin to come
 * back to (must be allow-listed there) — this lets localhost dev complete the flow.
 * `?ticket=` is passed to the backend and stashed in a cookie so it survives the
 * OIDC round-trip (query strings don't).
 *
 * `ticketOverride` — for callers whose own ticket already came from a URL this
 * function can no longer see (AppContext's SSO-exchange effect strips ?ticket=
 * from the address bar before it can fail and fall back here). Takes priority
 * over reading the current URL.
 */
export function redirectToOIDC(ticketOverride?: string): void {
  // Flagged High in debug/AUDIT.md — this is the app's only unauthenticated
  // entry point (landing page mount + CTA, App.tsx's ProtectedRoute) and had no
  // error visibility if URL/storage construction throws (e.g. malformed
  // VITE_API_BASE_URL, storage blocked). Logging only — rethrows unchanged so
  // callers see the exact same failure as before.
  try {
    logger.debug('[redirectToOIDC] start', { origin: window.location.origin, search: window.location.search });
    const params = new URLSearchParams(window.location.search);
    const ticket = ticketOverride ?? params.get('ticket');

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
