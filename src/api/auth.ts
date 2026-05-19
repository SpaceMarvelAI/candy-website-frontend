import { api, setToken, setSessionToken } from './client';

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
  const tok = await api<TokenResponse>('/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: { email, password },
  });
  setToken(tok.access_token);
  const user = await me();
  storeUser(user);
  return { token: tok, user };
}

export async function signup(args: {
  company_name: string;
  email: string;
  password: string;
  full_name?: string;
}): Promise<{ token: TokenResponse; user: AuthUser }> {
  const tok = await api<TokenResponse>('/v1/auth/signup', {
    method: 'POST',
    auth: false,
    body: args,
  });
  setToken(tok.access_token);
  const user = await me();
  storeUser(user);
  return { token: tok, user };
}

export async function me(): Promise<AuthUser> {
  return api<AuthUser>('/v1/auth/me');
}

export function logout() {
  setToken(null);
  storeUser(null);
  setSessionToken(null);
  storeSessionUser(null);
}

export async function ssoCallback(token: string): Promise<{ user: AuthUser }> {
  const tok = await api<TokenResponse>(`/v1/auth/sso/callback?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    auth: false,
  });
  // Store token + user in sessionStorage (tab-scoped, not persisted across sessions)
  setSessionToken(tok.access_token);
  const user: AuthUser = {
    user_id:      tok.user_id,
    email:        tok.email,
    role:         tok.role,
    company_id:   tok.company_id,
    company_name: tok.company_name,
    full_name:    null,
  };
  storeSessionUser(user);
  return { user };
}
