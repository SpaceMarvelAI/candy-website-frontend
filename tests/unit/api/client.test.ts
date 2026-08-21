import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { api, ApiError, setToken, getToken, setSessionToken, purgeLegacyAuthStorage } from '../../../src/api/client';
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

  it('uses the path as-is when it is already an absolute URL', async () => {
    server.use(http.get('http://localhost:9999/external', () => HttpResponse.json({ ok: true })));
    const result = await api('http://localhost:9999/external');
    expect(result).toEqual({ ok: true });
  });

  it('omits the JSON Content-Type and forwards FormData bodies untouched', async () => {
    let contentType = '';
    server.use(
      http.post(`${API_BASE}/v1/upload`, ({ request }) => {
        contentType = request.headers.get('Content-Type') ?? '';
        return HttpResponse.json({ ok: true });
      })
    );
    const form = new FormData();
    form.append('file', 'contents');
    await api('/v1/upload', { method: 'POST', body: form });
    expect(contentType).toContain('multipart/form-data');
  });

  it('returns the raw text when a non-204 response has an empty body', async () => {
    server.use(http.get(`${API_BASE}/v1/empty`, () => new HttpResponse('', { status: 200 })));
    const result = await api('/v1/empty');
    expect(result).toBe('');
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

  it('falls back to a generic network-error message when the thrown error has no message', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error(''));
    try {
      await api('/v1/no-message');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ApiError).status).toBe(0);
      expect((e as ApiError).message).toContain('Network error — is the backend running on');
    }
    fetchSpy.mockRestore();
  });

  it('uses the raw response text as the error detail when the body is not JSON', async () => {
    server.use(
      http.get(`${API_BASE}/v1/plaintext-error`, () => new HttpResponse('Internal Server Error', { status: 500 }))
    );
    try {
      await api('/v1/plaintext-error');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ApiError).detail).toBe('Internal Server Error');
      expect((e as ApiError).message).toBe('Internal Server Error');
    }
  });

  it('falls back to "HTTP <status>" when a JSON error body has no detail field', async () => {
    server.use(
      http.get(`${API_BASE}/v1/no-detail-field`, () => HttpResponse.json({ message: 'oops' }, { status: 400 }))
    );
    try {
      await api('/v1/no-detail-field');
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ApiError).message).toBe('HTTP 400');
    }
  });

  it('handles a nested object as the detail field', async () => {
    server.use(
      http.get(`${API_BASE}/v1/nested-detail`, () =>
        HttpResponse.json({ detail: { field: 'email', msg: 'invalid' } }, { status: 422 })
      )
    );
    await expect(api('/v1/nested-detail')).rejects.toMatchObject({
      status: 422,
      detail: { detail: { field: 'email', msg: 'invalid' } },
    });
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
    localStorage.setItem('access_token', 'expired-token');
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

  it('removes access_token from localStorage on 401', async () => {
    await expect(api('/v1/secure')).rejects.toThrow();
    expect(localStorage.getItem('access_token')).toBeNull();
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
  it('setToken stores value in sessionStorage, not localStorage', () => {
    setToken('hello-world');
    expect(sessionStorage.getItem('access_token')).toBe('hello-world');
    // Session-scoped: nothing may leak into localStorage, or the session would
    // survive a browser close.
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('setToken(null) removes the key', () => {
    setToken('some-token');
    setToken(null);
    expect(sessionStorage.getItem('access_token')).toBeNull();
  });

  it('getToken reads from sessionStorage', () => {
    sessionStorage.setItem('access_token', 'stored-token');
    expect(getToken()).toBe('stored-token');
  });

  it('getToken returns null when nothing is stored', () => {
    expect(getToken()).toBeNull();
  });

  it('IGNORES a localStorage token — the session must not survive a browser close', () => {
    localStorage.setItem('access_token', 'stale-token-from-an-earlier-build');
    expect(getToken()).toBeNull();
  });

  it('purgeLegacyAuthStorage clears legacy localStorage auth but keeps the live session', () => {
    localStorage.setItem('access_token', 'stale');
    localStorage.setItem('candy.user', '{"email":"old@candy.cx"}');
    sessionStorage.setItem('access_token', 'live');
    purgeLegacyAuthStorage();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('candy.user')).toBeNull();
    expect(getToken()).toBe('live');
  });

  it('getToken returns null instead of throwing when storage access throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(getToken()).toBeNull();
    spy.mockRestore();
  });

  it('setSessionToken stores value in sessionStorage', () => {
    setSessionToken('sess-abc');
    expect(sessionStorage.getItem('access_token')).toBe('sess-abc');
  });

  it('setSessionToken(null) removes the key from sessionStorage', () => {
    setSessionToken('sess-abc');
    setSessionToken(null);
    expect(sessionStorage.getItem('access_token')).toBeNull();
  });
});

// ── Plan / credit / role gate classification (402 · 403) ──────────────────────

describe('api() — gate errors (402 / 403)', () => {
  it('exposes the object detail as .payload and the gate code as .code on a 403 plan gate', async () => {
    server.use(
      http.get(`${API_BASE}/v1/workflows`, () =>
        HttpResponse.json({
          detail: {
            error: 'upgrade_required',
            message: 'This feature is not included in your current plan. Upgrade to access it.',
            current_plan: 'free',
            feature: 'workflows',
          },
        }, { status: 403 })
      )
    );
    try {
      await api('/v1/workflows');
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(403);
      expect(err.code).toBe('upgrade_required');
      expect(err.payload).toMatchObject({ current_plan: 'free', feature: 'workflows' });
    }
  });

  it('uses the object detail message for ApiError.message instead of "[object Object]"', async () => {
    server.use(
      http.post(`${API_BASE}/v1/agents/a1/demo/s1/turn/stream`, () =>
        HttpResponse.json({
          detail: { error: 'no_credits', message: 'This workspace is out of credits. Please add credits to continue.' },
        }, { status: 402 })
      )
    );
    try {
      await api('/v1/agents/a1/demo/s1/turn/stream', { method: 'POST', body: {} });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(402);
      expect(err.code).toBe('no_credits');
      expect(err.message).toBe('This workspace is out of credits. Please add credits to continue.');
      expect(err.message).not.toContain('[object Object]');
    }
  });

  it('leaves .code undefined for a 403 role gate (string detail)', async () => {
    server.use(
      http.delete(`${API_BASE}/v1/webhooks/w1`, () =>
        HttpResponse.json({ detail: "Role 'member' cannot perform this action" }, { status: 403 })
      )
    );
    try {
      await api('/v1/webhooks/w1', { method: 'DELETE' });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ApiError;
      expect(err.code).toBeUndefined();
      expect(err.payload).toBe("Role 'member' cannot perform this action");
      expect(err.message).toBe("Role 'member' cannot perform this action");
    }
  });

  it('never lets an object detail reach ApiError.message (falls back to JSON)', () => {
    const err = new ApiError(400, { detail: { field: 'email' } });
    expect(typeof err.message).toBe('string');
    expect(err.message).toBe('{"field":"email"}');
  });

  it('uses the first validation msg for a FastAPI 422 array detail', () => {
    const err = new ApiError(422, { detail: [{ loc: ['body', 'email'], msg: 'field required' }] });
    expect(err.message).toBe('field required');
  });
});

// ── Request timeout ───────────────────────────────────────────────────────────

describe('api() — request timeout', () => {
  it('throws ApiError with status 408 when the server does not respond in time', async () => {
    server.use(
      http.get(`${API_BASE}/v1/hangs`, async () => {
        await new Promise(r => setTimeout(r, 300));
        return HttpResponse.json({ ok: true });
      })
    );
    try {
      await api('/v1/hangs', { timeoutMs: 25 });
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ApiError;
      expect(err.status).toBe(408);
      expect(err.message).toContain('timed out');
    }
  });

  it('does not time out a request that answers within the budget', async () => {
    server.use(http.get(`${API_BASE}/v1/fast`, () => HttpResponse.json({ ok: true })));
    await expect(api('/v1/fast', { timeoutMs: 2000 })).resolves.toEqual({ ok: true });
  });

  it('hands cancellation to a caller-supplied signal instead of the default timeout', async () => {
    server.use(
      http.get(`${API_BASE}/v1/caller-aborts`, async () => {
        await new Promise(r => setTimeout(r, 200));
        return HttpResponse.json({ ok: true });
      })
    );
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 20);
    try {
      await api('/v1/caller-aborts', { signal: ctl.signal, timeoutMs: 5 });
      expect.fail('should have thrown');
    } catch (e) {
      // Caller abort, not our timeout → status 0 (generic fetch failure), not 408.
      expect((e as ApiError).status).toBe(0);
    }
  });
});
