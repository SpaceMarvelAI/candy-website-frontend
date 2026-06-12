import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { api, ApiError, setToken, getToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';

// ── Successful responses ──────────────────────────────────────────────────────

describe('api() — successful responses', () => {
  it('returns parsed JSON on 200', async () => {
    server.use(http.get(`${API_BASE}/v1/ok`, () => HttpResponse.json({ value: 42 })));
    const result = await api('/v1/ok');
    expect(result).toEqual({ value: 42 });
  });

  it('returns undefined on 204 (no body)', async () => {
    server.use(http.delete(`${API_BASE}/v1/item`, () => new HttpResponse(null, { status: 204 })));
    const result = await api('/v1/item', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  it('attaches Authorization header when a token is stored', async () => {
    setToken('my-test-token');
    let capturedAuth = '';
    server.use(
      http.get(`${API_BASE}/v1/protected`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization') ?? '';
        return HttpResponse.json({ ok: true });
      })
    );
    await api('/v1/protected');
    expect(capturedAuth).toBe('Bearer my-test-token');
  });

  it('does not attach Authorization header for auth:false calls', async () => {
    let capturedAuth: string | null = 'present';
    server.use(
      http.post(`${API_BASE}/v1/public`, ({ request }) => {
        capturedAuth = request.headers.get('Authorization');
        return HttpResponse.json({ ok: true });
      })
    );
    await api('/v1/public', { method: 'POST', auth: false, body: { data: 1 } });
    expect(capturedAuth).toBeNull();
  });

  it('sends Content-Type: application/json for JSON bodies', async () => {
    let contentType = '';
    server.use(
      http.post(`${API_BASE}/v1/data`, ({ request }) => {
        contentType = request.headers.get('Content-Type') ?? '';
        return HttpResponse.json({ ok: true });
      })
    );
    await api('/v1/data', { method: 'POST', body: { name: 'test' } });
    expect(contentType).toContain('application/json');
  });
});

// ── Error responses ───────────────────────────────────────────────────────────

describe('api() — HTTP error responses', () => {
  it('throws ApiError with the correct status on 404', async () => {
    server.use(
      http.get(`${API_BASE}/v1/missing`, () =>
        HttpResponse.json({ detail: 'Not found' }, { status: 404 })
      )
    );
    await expect(api('/v1/missing')).rejects.toThrow(ApiError);
    await expect(api('/v1/missing')).rejects.toMatchObject({ status: 404 });
  });

  it('throws ApiError with the correct status on 500', async () => {
    server.use(
      http.get(`${API_BASE}/v1/boom`, () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 })
      )
    );
    await expect(api('/v1/boom')).rejects.toMatchObject({ status: 500 });
  });

  it('throws ApiError with status 0 on network failure', async () => {
    server.use(http.get(`${API_BASE}/v1/offline`, () => HttpResponse.error()));
    await expect(api('/v1/offline')).rejects.toMatchObject({ status: 0 });
  });

  it('ApiError.message contains the server detail string', async () => {
    server.use(
      http.get(`${API_BASE}/v1/forbidden`, () =>
        HttpResponse.json({ detail: 'Access denied' }, { status: 403 })
      )
    );
    try {
      await api('/v1/forbidden');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ApiError).message).toContain('Access denied');
    }
  });
});

// ── 401 auth-expiry behaviour ─────────────────────────────────────────────────

describe('api() — 401 auth-expiry side-effects', () => {
  beforeEach(() => {
    localStorage.setItem('candy.token', 'expired-token');
    localStorage.setItem('candy.user', JSON.stringify({ user_id: 'u1', email: 'a@b.com' }));
    server.use(
      http.get(`${API_BASE}/v1/secure`, () =>
        HttpResponse.json({ detail: 'Token expired' }, { status: 401 })
      )
    );
  });

  it('dispatches candy:auth-expired on 401', async () => {
    const handler = vi.fn();
    window.addEventListener('candy:auth-expired', handler);
    await expect(api('/v1/secure')).rejects.toThrow();
    expect(handler).toHaveBeenCalledOnce();
    window.removeEventListener('candy:auth-expired', handler);
  });

  it('removes candy.token from localStorage on 401', async () => {
    await expect(api('/v1/secure')).rejects.toThrow();
    expect(localStorage.getItem('candy.token')).toBeNull();
  });

  it('removes candy.user from localStorage on 401', async () => {
    await expect(api('/v1/secure')).rejects.toThrow();
    expect(localStorage.getItem('candy.user')).toBeNull();
  });

  it('does NOT dispatch candy:auth-expired for auth:false calls returning 401', async () => {
    server.use(
      http.post(`${API_BASE}/v1/auth/login`, () =>
        HttpResponse.json({ detail: 'Wrong password' }, { status: 401 })
      )
    );
    const handler = vi.fn();
    window.addEventListener('candy:auth-expired', handler);
    await expect(
      api('/v1/auth/login', { method: 'POST', auth: false, body: { email: 'x', password: 'y' } })
    ).rejects.toThrow();
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('candy:auth-expired', handler);
  });
});

// ── Token helpers ─────────────────────────────────────────────────────────────

describe('getToken / setToken', () => {
  it('setToken stores value in localStorage', () => {
    setToken('hello-world');
    expect(localStorage.getItem('candy.token')).toBe('hello-world');
  });

  it('setToken(null) removes the key', () => {
    setToken('some-token');
    setToken(null);
    expect(localStorage.getItem('candy.token')).toBeNull();
  });

  it('getToken reads from localStorage', () => {
    localStorage.setItem('candy.token', 'stored-token');
    expect(getToken()).toBe('stored-token');
  });

  it('getToken returns null when nothing is stored', () => {
    expect(getToken()).toBeNull();
  });
});
