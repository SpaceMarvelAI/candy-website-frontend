import { api, setToken, setSessionToken } from './client';
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

export function logout() {
  logger.info('[auth] logout — clearing tokens and stored user');
  setToken(null);
  storeUser(null);
  setSessionToken(null);
  storeSessionUser(null);
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
