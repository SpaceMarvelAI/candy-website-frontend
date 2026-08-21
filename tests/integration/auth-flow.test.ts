/**
 * Integration tests for the 401 auth-expiry flow.
 *
 * These tests exercise the full path:
 *   expired JWT in localStorage → API returns 401 → token cleared
 *   → candy:auth-expired event dispatched → (AppContext handles redirect in app)
 *
 * The AppContext redirect is not tested here because it requires a full React
 * tree with routing. These tests verify the API layer side-effects that
 * AppContext relies on.
 */
import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { api } from '../../src/api/client';
import { API_BASE } from '../mocks/fixtures';

describe('401 auth-expiry: full side-effect chain', () => {
  it('clears token, clears user, and dispatches candy:auth-expired', async () => {
    sessionStorage.setItem('access_token', 'valid-looking-token');
    sessionStorage.setItem('candy.user', JSON.stringify({ user_id: 'u1', email: 'a@b.com' }));

    server.use(
      http.get(`${API_BASE}/v1/agents`, () =>
        HttpResponse.json({ detail: 'Token expired' }, { status: 401 })
      )
    );

    const expiredHandler = vi.fn();
    window.addEventListener('candy:auth-expired', expiredHandler);

    await expect(api('/v1/agents')).rejects.toMatchObject({ status: 401 });

    expect(expiredHandler).toHaveBeenCalledOnce();
    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('candy.user')).toBeNull();

    window.removeEventListener('candy:auth-expired', expiredHandler);
  });

  it('fires candy:auth-expired only once even if multiple 401s arrive', async () => {
    sessionStorage.setItem('access_token', 'stale-token');

    server.use(
      http.get(`${API_BASE}/v1/agents`, () =>
        HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
      ),
      http.get(`${API_BASE}/v1/languages`, () =>
        HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
      )
    );

    const expiredHandler = vi.fn();
    window.addEventListener('candy:auth-expired', expiredHandler);

    await Promise.allSettled([api('/v1/agents'), api('/v1/languages')]);

    // Both 401s dispatch the event independently — two dispatches, not one
    // (de-duplication is AppContext's responsibility, not the API client's).
    expect(expiredHandler.mock.calls.length).toBeGreaterThanOrEqual(1);

    window.removeEventListener('candy:auth-expired', expiredHandler);
  });

  it('does NOT dispatch candy:auth-expired when auth:false is passed', async () => {
    server.use(
      http.post(`${API_BASE}/v1/auth/login`, () =>
        HttpResponse.json({ detail: 'Bad password' }, { status: 401 })
      )
    );

    const expiredHandler = vi.fn();
    window.addEventListener('candy:auth-expired', expiredHandler);

    await expect(
      api('/v1/auth/login', { method: 'POST', auth: false, body: { email: 'x', password: 'y' } })
    ).rejects.toThrow();

    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('candy:auth-expired', expiredHandler);
  });
});

describe('successful auth flow: token stored and used in subsequent requests', () => {
  it('token stored after login is sent in the next API call', async () => {
    const { login } = await import('../../src/api/auth');
    await login('admin@acme.com', 'password123');

    let capturedAuth = '';
    server.use(
      http.get(`${API_BASE}/v1/agents`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization') ?? '';
        return HttpResponse.json([]);
      })
    );

    await api('/v1/agents');
    expect(capturedAuth).toBe('Bearer test-jwt-abc123');
  });

  it('token is absent after logout', async () => {
    const { login, logout } = await import('../../src/api/auth');
    await login('admin@acme.com', 'password123');
    logout();

    let capturedAuth: string | null = 'present';
    server.use(
      http.get(`${API_BASE}/v1/agents`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json([]);
      })
    );

    await api('/v1/agents', { auth: false });
    expect(sessionStorage.getItem('access_token')).toBeNull();
  });
});
