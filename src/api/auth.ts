import { api, setToken, setSessionToken, getToken, API_BASE } from './client';
import { logger } from '../utils/logger';

export interface AuthUser {
  user_id: string;
  email: string;
  full_name?: string | null;
  role: string;
  company_id: string;
  company_name: string;
  plan_tier?: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  company_id: string;
  company_name: string;
  role: string;
  email: string;
}

const USER_KEY = 'candy.user';

// SSO sessions are stored in sessionStorage; regular login in localStorage.
export function loadStoredUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
export function storeUser(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else   localStorage.removeItem(USER_KEY);
  } catch {}
}
function storeSessionUser(u: AuthUser | null) {
  try {
    if (u) sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    else   sessionStorage.removeItem(USER_KEY);
  } catch {}
}

export async function login(email: string, password: string): Promise<{ token: TokenResponse; user: AuthUser }> {
  logger.info('[auth] login attempt', { email });
  try {
    const tok = await api<TokenResponse>('/v1/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
    setToken(tok.access_token);
    const user = await me();
    storeUser(user);
    logger.info('[auth] login OK', { userId: user.user_id, email: user.email, role: user.role });
    return { token: tok, user };
  } catch (e: any) {
    logger.error('[auth] login failed', { email, error: e, stack: e?.stack });
    throw e;
  }
}

export async function signup(args: {
  company_name: string;
  email: string;
  password: string;
  full_name?: string;
}): Promise<{ token: TokenResponse; user: AuthUser }> {
  logger.info('[auth] signup attempt', { email: args.email, company: args.company_name });
  try {
    const tok = await api<TokenResponse>('/v1/auth/signup', {
      method: 'POST',
      auth: false,
      body: args,
    });
    setToken(tok.access_token);
    const user = await me();
    storeUser(user);
    logger.info('[auth] signup OK', { userId: user.user_id, email: user.email });
    return { token: tok, user };
  } catch (e: any) {
    logger.error('[auth] signup failed', { email: args.email, error: e, stack: e?.stack });
    throw e;
  }
}

export async function me(): Promise<AuthUser> {
  return api<AuthUser>('/v1/auth/me');
}

/** Local-only wipe: clears stored tokens/user. No backend call, no redirect.
 *  Use for pre-login cleanup (e.g. before writing fresh SSO creds). Does NOT blocklist the
 *  user server-side or clear the dashboard cookie — that's what fullLogout() does. */
export function logout() {
  logger.info('[auth] logout — clearing local tokens and stored user');
  setToken(null);
  storeUser(null);
  setSessionToken(null);
  storeSessionUser(null);
}

/** Full single-logout (mirrors Chat/Finixy). Calls the backend logout-everywhere FIRST (it needs
 *  the token) → it blocklists the user, revokes dashboard OAuth tokens, and broadcasts back-channel
 *  logout to the other apps. On success it returns end_session_url — navigating the BROWSER there
 *  (a real top-level request, not a hidden iframe: browsers block third-party cookie access inside
 *  iframes, which silently left the SSO session alive and let the IDP auto-reauth the user right
 *  after "signing out") clears the dashboard's httpOnly session cookie, which a server-to-server
 *  call alone can't touch. We only navigate when the backend confirmed success — if the call itself
 *  failed (unreachable/5xx), we skip navigating instead of guessing a URL on a host we already know
 *  is down (that guessed-fallback redirect was the earlier "must click sign-out multiple times" bug).
 *  Local state (every key in localStorage/sessionStorage, not just the known auth ones — a
 *  hand-maintained key list is exactly how a stale token survives a "complete" sign-out) is wiped
 *  unconditionally before any of that, so the app is logged out immediately either way. */
export async function fullLogout() {
  logger.info('[auth] fullLogout — initiating single-logout across all apps');

  // 1. Capture the token + origin BEFORE wiping anything (the backend call needs the token).
  const token = getToken();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // 2. Call logout-everywhere (6s timeout). Capture the end-session target, if any.
  let endSessionUrl: string | null = null;
  if (token) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${API_BASE}/v1/auth/sso/oidc/logout-everywhere`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'X-Return-To': origin },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json().catch(() => ({} as any));
        endSessionUrl = data.end_session_url ?? data.login_url ?? null;
      }
    } catch (err) {
      logger.warn('[auth] logout-everywhere failed (clearing local state anyway)', { error: err });
    }
  }

  // 3. Wipe EVERYTHING in local/session storage — not a curated list of "known" keys.
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
  // Tell devAuth (localhost-only auto-login) to skip its next reseed — otherwise a dev
  // machine with VITE_DEV_TOKEN set silently logs the user back in on the next page load.
  // Set AFTER the clear() above, which would otherwise wipe this flag too.
  try { localStorage.setItem('candy.dev_logout', '1'); } catch {}

  // 4. Only now, with local state already gone, attempt the real cookie-clearing redirect.
  if (endSessionUrl && typeof window !== 'undefined') {
    window.location.href = endSessionUrl;
  }
}

export async function ssoCallback(token: string): Promise<{ user: AuthUser }> {
  logger.info('[auth] ssoCallback starting', { tokenPreview: token.slice(0, 12) + '…' });
  try {
    const tok = await api<TokenResponse>(`/v1/auth/sso/callback?token=${encodeURIComponent(token)}`, {
      method: 'GET',
      auth: false,
    });
    // Persist in localStorage so the session survives tab close/reopen
    setToken(tok.access_token);
    const user: AuthUser = {
      user_id:      tok.user_id,
      email:        tok.email,
      role:         tok.role,
      company_id:   tok.company_id,
      company_name: tok.company_name,
      full_name:    null,
    };
    storeUser(user);
    logger.info('[auth] ssoCallback OK', { userId: user.user_id, email: user.email });
    return { user };
  } catch (e: any) {
    logger.error('[auth] ssoCallback failed', { error: e, stack: e?.stack });
    throw e;
  }
}
