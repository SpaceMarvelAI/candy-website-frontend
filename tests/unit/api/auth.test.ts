import { describe, it, expect, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
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

// ── loadStoredUser() — sessionStorage takes priority (SSO sessions) ──────────

describe('loadStoredUser() — storage precedence', () => {
  afterEach(() => {
    sessionStorage.removeItem('candy.user');
    localStorage.removeItem('candy.user');
  });

  it('reads from sessionStorage before falling back to localStorage', () => {
    sessionStorage.setItem('candy.user', JSON.stringify({ email: 'sso@candy.cx' }));
    localStorage.setItem('candy.user', JSON.stringify({ email: 'regular@candy.cx' }));
    expect(loadStoredUser()?.email).toBe('sso@candy.cx');
  });

  it('returns null when nothing is stored in either storage', () => {
    sessionStorage.removeItem('candy.user');
    localStorage.removeItem('candy.user');
    expect(loadStoredUser()).toBeNull();
  });
});

// ── fullLogout() ─────────────────────────────────────────────────────────────
// The actual single-logout mechanism used across the whole session's OIDC work:
// calls logout-everywhere (blocklist + revoke + broadcast) FIRST while the token is
// still valid, then always wipes EVERY localStorage/sessionStorage key synchronously.
// Only on confirmed backend success does it navigate the top-level tab to
// end_session_url — a real first-party request, since a hidden iframe can't get past
// browsers' third-party cookie blocking (that silently left the SSO session alive and
// let the IDP auto-reauth the user right after "signing out"). If the backend call
// itself failed, it must NOT guess a fallback URL and navigate there (that stranded
// users on a dead host — the original "must click sign-out multiple times" bug); the
// caller instead sends them home in the SPA on this same click.

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

  it('navigates to end_session_url on success and wipes every storage key', async () => {
    setToken('live-token');
    localStorage.setItem('candy.user', JSON.stringify({ email: 'a@b.com' }));
    localStorage.setItem('dashboard_token', 'sm-token');
    localStorage.setItem('candy.tts', 'some-preference');
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
    expect(localStorage.getItem('dashboard_token')).toBeNull();
    expect(localStorage.getItem('candy.tts')).toBeNull();
  });

  it('does not navigate, but still wipes state, when there is no token to call logout-everywhere with', async () => {
    setToken(null);
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();

    expect(loc.href).toBe('');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('does not navigate, but still wipes state, when logout-everywhere fails', async () => {
    setToken('live-token');
    localStorage.setItem('candy.user', JSON.stringify({ email: 'a@b.com' }));
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 })
      )
    );
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();

    expect(loc.href).toBe('');
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('does not navigate, but still wipes state, when the network call itself throws', async () => {
    setToken('live-token');
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () => HttpResponse.error())
    );
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();
    expect(loc.href).toBe('');
  });

  it('falls back to login_url when the backend omits end_session_url', async () => {
    setToken('live-token');
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () =>
        HttpResponse.json({ login_url: 'https://dashboard-api.spacemarvel.ai/login' })
      )
    );
    const loc = stubLocationForLogout();

    await fullLogout();

    expect(loc.href).toBe('https://dashboard-api.spacemarvel.ai/login');
  });

  it('does not navigate when the success response body is not valid JSON', async () => {
    setToken('live-token');
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', () =>
        new HttpResponse('not json at all', { status: 200 })
      )
    );
    const loc = stubLocationForLogout();

    await expect(fullLogout()).resolves.toBeUndefined();
    expect(loc.href).toBe('');
  });

  it('aborts the request and treats it as a failure when logout-everywhere exceeds the 6s timeout', async () => {
    setToken('live-token');
    server.use(
      http.post('http://localhost:8002/v1/auth/sso/oidc/logout-everywhere', async () => {
        await delay('infinite');
        return HttpResponse.json({ end_session_url: 'https://should-not-be-used' });
      })
    );
    const loc = stubLocationForLogout();

    vi.useFakeTimers();
    try {
      const promise = fullLogout();
      await vi.advanceTimersByTimeAsync(6000);
      await promise;
    } finally {
      vi.useRealTimers();
    }

    expect(loc.href).toBe('');
    expect(localStorage.getItem('access_token')).toBeNull();
  });
});
