import { describe, it, expect, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { login, signup, logout, ssoCallback, loadStoredUser, fullLogout } from '../../../src/api/auth';
import { setToken } from '../../../src/api/client';

// ── login() ───────────────────────────────────────────────────────────────────

describe('login()', () => {
  it('stores the access token in localStorage on success', async () => {
    await login('admin@acme.com', 'correct-password');
    expect(localStorage.getItem('access_token')).toBe('test-jwt-abc123');
  });

  it('stores the user object in localStorage on success', async () => {
    await login('admin@acme.com', 'correct-password');
    const stored = loadStoredUser();
    expect(stored?.email).toBe('admin@acme.com');
    expect(stored?.user_id).toBe('user_001');
    expect(stored?.company_name).toBe('Acme Corp');
  });

  it('returns the token and user objects', async () => {
    const { token, user } = await login('admin@acme.com', 'correct-password');
    expect(token.access_token).toBe('test-jwt-abc123');
    expect(user.email).toBe('admin@acme.com');
    expect(user.role).toBe('admin');
  });

  it('throws and does not store token on 401', async () => {
    server.use(
      http.post('http://localhost:8002/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Invalid credentials' }, { status: 401 })
      )
    );
    await expect(login('bad@email.com', 'wrong')).rejects.toThrow();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('throws and does not store token on 500', async () => {
    server.use(
      http.post('http://localhost:8002/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 })
      )
    );
    await expect(login('admin@acme.com', 'pass')).rejects.toThrow();
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});

// ── signup() ─────────────────────────────────────────────────────────────────

describe('signup()', () => {
  const args = { company_name: 'New Corp', email: 'new@corp.com', password: 'secret123' };

  it('stores the access token in localStorage on success', async () => {
    await signup(args);
    expect(localStorage.getItem('access_token')).toBe('test-jwt-abc123');
  });

  it('returns the token and user objects', async () => {
    const { token, user } = await signup(args);
    expect(token.access_token).toBe('test-jwt-abc123');
    expect(user.user_id).toBe('user_001');
  });

  it('throws on 409 conflict (email already registered)', async () => {
    server.use(
      http.post('http://localhost:8002/v1/auth/signup', () =>
        HttpResponse.json({ detail: 'Email already in use' }, { status: 409 })
      )
    );
    await expect(signup(args)).rejects.toThrow();
  });
});

// ── logout() ─────────────────────────────────────────────────────────────────

describe('logout()', () => {
  it('removes access_token from localStorage', () => {
    localStorage.setItem('access_token', 'live-token');
    logout();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('removes candy.user from localStorage', () => {
    localStorage.setItem('candy.user', JSON.stringify({ email: 'test@test.com' }));
    logout();
    expect(localStorage.getItem('candy.user')).toBeNull();
  });

  it('is safe to call when nothing is stored', () => {
    expect(() => logout()).not.toThrow();
  });
});

// ── ssoCallback() ────────────────────────────────────────────────────────────

describe('ssoCallback()', () => {
  it('stores the access token in localStorage', async () => {
    await ssoCallback('sso-temp-token-xyz');
    expect(localStorage.getItem('access_token')).toBe('test-jwt-abc123');
  });

  it('stores the user object in localStorage', async () => {
    await ssoCallback('sso-temp-token-xyz');
    const stored = loadStoredUser();
    expect(stored?.email).toBe('admin@acme.com');
    expect(stored?.company_id).toBe('company_001');
  });

  it('returns the authenticated user', async () => {
    const { user } = await ssoCallback('sso-temp-token-xyz');
    expect(user.user_id).toBe('user_001');
    expect(user.company_name).toBe('Acme Corp');
  });

  it('throws when the SSO token is rejected', async () => {
    server.use(
      http.get('http://localhost:8002/v1/auth/sso/callback', () =>
        HttpResponse.json({ detail: 'Invalid SSO token' }, { status: 401 })
      )
    );
    await expect(ssoCallback('bad-sso-token')).rejects.toThrow();
  });
});

// ── loadStoredUser() — malformed data ────────────────────────────────────────

describe('loadStoredUser() — malformed storage', () => {
  it('returns null instead of throwing when stored JSON is corrupt', () => {
    localStorage.setItem('candy.user', '{not valid json');
    expect(() => loadStoredUser()).not.toThrow();
    expect(loadStoredUser()).toBeNull();
  });
});

// ── fullLogout() ─────────────────────────────────────────────────────────────
// The actual single-logout mechanism used across the whole session's OIDC work:
// calls logout-everywhere (blocklist + revoke + broadcast) FIRST while the token
// is still valid, then always wipes local state and navigates the browser to
// whatever end_session_url it got back (or a same-shape fallback if the call
// never succeeded) — a server-to-server call alone can't clear the browser's
// dashboard session cookie.

const originalLocation = window.location;
function stubLocationForLogout() {
  const loc = { ...originalLocation, origin: 'https://app.candy.cx', href: '' };
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
  return loc;
}

describe('fullLogout()', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  });

  it('navigates to the dashboard end_session_url on success and wipes local state', async () => {
    setToken('live-token');
    localStorage.setItem('candy.user', JSON.stringify({ email: 'a@b.com' }));
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () =>
        HttpResponse.json({ end_session_url: 'https://dashboard-api.spacemarvel.ai/o/logout/?done=1' })
      )
    );
    const loc = stubLocationForLogout();

    await fullLogout();

    expect(loc.href).toBe('https://dashboard-api.spacemarvel.ai/o/logout/?done=1');
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('candy.user')).toBeNull();
  });

  it('falls back to the OIDC login URL when there is no token to call logout-everywhere with', async () => {
    setToken(null);
    const loc = stubLocationForLogout();

    await fullLogout();

    expect(loc.href).toContain('/v1/auth/sso/oidc/login');
    expect(decodeURIComponent(loc.href)).toContain('return_to=https://app.candy.cx');
  });

  it('falls back to the OIDC login URL when logout-everywhere fails — never throws, still wipes state', async () => {
    setToken('live-token');
    localStorage.setItem('candy.user', JSON.stringify({ email: 'a@b.com' }));
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 })
      )
    );
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();

    expect(loc.href).toContain('/v1/auth/sso/oidc/login');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('falls back to the OIDC login URL when the network call itself throws', async () => {
    setToken('live-token');
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () => HttpResponse.error())
    );
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();
    expect(loc.href).toContain('/v1/auth/sso/oidc/login');
  });
});
