import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { login, signup, logout, ssoCallback, loadStoredUser } from '../../../src/api/auth';

// ── login() ───────────────────────────────────────────────────────────────────

describe('login()', () => {
  it('stores the access token in localStorage on success', async () => {
    await login('admin@acme.com', 'correct-password');
    expect(localStorage.getItem('candy.token')).toBe('test-jwt-abc123');
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
    expect(localStorage.getItem('candy.token')).toBeNull();
  });

  it('throws and does not store token on 500', async () => {
    server.use(
      http.post('http://localhost:8002/v1/auth/login', () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 })
      )
    );
    await expect(login('admin@acme.com', 'pass')).rejects.toThrow();
    expect(localStorage.getItem('candy.token')).toBeNull();
  });
});

// ── signup() ─────────────────────────────────────────────────────────────────

describe('signup()', () => {
  const args = { company_name: 'New Corp', email: 'new@corp.com', password: 'secret123' };

  it('stores the access token in localStorage on success', async () => {
    await signup(args);
    expect(localStorage.getItem('candy.token')).toBe('test-jwt-abc123');
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
  it('removes candy.token from localStorage', () => {
    localStorage.setItem('candy.token', 'live-token');
    logout();
    expect(localStorage.getItem('candy.token')).toBeNull();
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
    expect(localStorage.getItem('candy.token')).toBe('test-jwt-abc123');
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
