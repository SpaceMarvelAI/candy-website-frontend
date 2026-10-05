import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import { api, ApiError } from '../../../src/api/client';
import {
  CASE_TRANSITIONS, CRM_MAX_LIMIT, CRM_MAX_OFFSET, TASK_TRANSITIONS, clampLimit, clampOffset, createCase,
  createPatientNote, createTask, listConsents, listCurrentConsents, listPatients, nextOffset, prevOffset, recordConsent,
  searchPatients, updateCase, updatePatient, updateTask,
} from '../../../src/api/crm';
import { classifyCrmError } from '../../../src/utils/crmErrors';

// Synthetic values only.
const PHONE = '+910000000001';
const EMAIL = 'synthetic.patient@example.test';

const CONSOLE_METHODS = ['log', 'info', 'debug', 'warn', 'error', 'group', 'groupCollapsed'] as const;

/** Captures everything written to the console as one string. */
function captureConsole() {
  const lines: string[] = [];
  const spies = CONSOLE_METHODS.map((m) =>
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      for (const a of args) {
        try { lines.push(typeof a === 'string' ? a : JSON.stringify(a)); } catch { lines.push(String(a)); }
      }
    }));
  return { text: () => lines.join('\n'), restore: () => spies.forEach((s) => s.mockRestore()) };
}

afterEach(() => vi.restoreAllMocks());

describe('api() sensitive mode', () => {
  it('does not log the request body, response body or query string', async () => {
    server.use(http.post(`${API_BASE}/v1/crm/echo`, () =>
      HttpResponse.json({ phone: PHONE, email: EMAIL })));
    const cap = captureConsole();
    await api(`/v1/crm/echo?q=${EMAIL}`, { method: 'POST', body: { value: PHONE }, sensitive: true });
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain('/v1/crm/echo'); // method + path are still traceable
  });

  it('does not log an error body that echoes patient data', async () => {
    server.use(http.get(`${API_BASE}/v1/crm/bad`, () =>
      HttpResponse.json({ detail: `no patient ${PHONE}` }, { status: 404 })));
    const cap = captureConsole();
    await expect(api('/v1/crm/bad', { sensitive: true })).rejects.toMatchObject({ status: 404 });
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain(PHONE);
  });

  it('control: the default mode still logs bodies (the flag is opt-in)', async () => {
    server.use(http.post(`${API_BASE}/v1/other/echo`, () => HttpResponse.json({ ok: true })));
    const cap = captureConsole();
    await api('/v1/other/echo', { method: 'POST', body: { marker: 'visible-in-default-mode' } });
    const out = cap.text();
    cap.restore();
    expect(out).toContain('visible-in-default-mode');
  });
});

describe('api() caller-cancelled requests', () => {
  it('does not log a caller abort as an error, and still rejects with ApiError status 0', async () => {
    server.use(http.get(`${API_BASE}/v1/crm/slow`, async () => {
      await new Promise((r) => setTimeout(r, 200));
      return HttpResponse.json({});
    }));
    const ctl = new AbortController();
    const cap = captureConsole();
    const p = api('/v1/crm/slow', { sensitive: true, signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ status: 0 });
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain('Network error');
  });

  it('still logs a caller-side timeout (AbortSignal.timeout) as a real failure — only a plain abort is silent', async () => {
    server.use(http.get(`${API_BASE}/v1/crm/slow2`, async () => {
      await new Promise((r) => setTimeout(r, 300));
      return HttpResponse.json({});
    }));
    const cap = captureConsole();
    await expect(api('/v1/crm/slow2', { sensitive: true, signal: AbortSignal.timeout(30) })).rejects.toMatchObject({ status: 0 });
    const out = cap.text();
    cap.restore();
    expect(out).toContain('Network error');
  });

  it('still logs a genuine network failure as an error', async () => {
    server.use(http.get(`${API_BASE}/v1/crm/offline`, () => HttpResponse.error()));
    const cap = captureConsole();
    await expect(api('/v1/crm/offline', { sensitive: true })).rejects.toMatchObject({ status: 0 });
    const out = cap.text();
    cap.restore();
    expect(out).toContain('Network error');
  });
});

describe('paging contract', () => {
  it('clamps limit to 1..100 and offset to 0..10,000', () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(1000)).toBe(CRM_MAX_LIMIT);
    expect(clampLimit(NaN)).toBe(25);
    expect(clampOffset(-5)).toBe(0);
    expect(clampOffset(99_999)).toBe(CRM_MAX_OFFSET);
  });

  it('never produces a next offset above the cap', () => {
    expect(nextOffset(0, 25, true)).toBe(25);
    expect(nextOffset(0, 25, false)).toBeNull();
    expect(nextOffset(CRM_MAX_OFFSET - 10, 25, true)).toBeNull();
    expect(nextOffset(CRM_MAX_OFFSET - 25, 25, true)).toBe(CRM_MAX_OFFSET);
  });

  it('computes the previous offset', () => {
    expect(prevOffset(0, 25)).toBeNull();
    expect(prevOffset(10, 25)).toBe(0);
    expect(prevOffset(50, 25)).toBe(25);
  });

  it('listPatients sends clamped paging params', async () => {
    let seen = '';
    server.use(http.get(`${API_BASE}/v1/crm/patients`, ({ request }) => {
      seen = new URL(request.url).search;
      return HttpResponse.json({ items: [], limit: 100, offset: CRM_MAX_OFFSET, has_more: false });
    }));
    await listPatients({ limit: 5000, offset: 50_000 });
    const p = new URLSearchParams(seen);
    expect(p.get('limit')).toBe('100');
    expect(p.get('offset')).toBe(String(CRM_MAX_OFFSET));
  });
});

describe('CRM write contracts', () => {
  const seen: { method: string; path: string; body: unknown }[] = [];
  const record = (method: string, path: string, status = 200, response: unknown = { id: 'x' }) =>
    server.use(http[method.toLowerCase() as 'post' | 'patch'](`${API_BASE}${path}`, async ({ request }) => {
      seen.push({ method, path: new URL(request.url).pathname, body: await request.json() });
      return HttpResponse.json(response as object, { status });
    }));

  it('uses the exact methods, endpoints and bodies the backend defines', async () => {
    seen.length = 0;
    record('POST', '/v1/crm/patients/p1/notes', 201);
    record('POST', '/v1/crm/cases', 201);
    record('PATCH', '/v1/crm/cases/c1');
    record('POST', '/v1/crm/tasks', 201);
    record('PATCH', '/v1/crm/tasks/t1');
    await createPatientNote('p1', { body: 'b', note_type: 'intake' });
    await createCase({ subject: 's', priority: 'P2' });
    await updateCase('c1', { status: 'resolved', assigned_to_user_id: null });
    await createTask({ title: 't', case_id: 'c1' });
    await updateTask('t1', { status: 'done', due_at: null });
    expect(seen).toEqual([
      { method: 'POST', path: '/v1/crm/patients/p1/notes', body: { body: 'b', note_type: 'intake' } },
      { method: 'POST', path: '/v1/crm/cases', body: { subject: 's', priority: 'P2' } },
      { method: 'PATCH', path: '/v1/crm/cases/c1', body: { status: 'resolved', assigned_to_user_id: null } },
      { method: 'POST', path: '/v1/crm/tasks', body: { title: 't', case_id: 'c1' } },
      { method: 'PATCH', path: '/v1/crm/tasks/t1', body: { status: 'done', due_at: null } },
    ]);
  });

  it('never logs a write body or an error body', async () => {
    server.use(http.post(`${API_BASE}/v1/crm/patients/p1/notes`, () => HttpResponse.json({ detail: `echo ${EMAIL}` }, { status: 500 })));
    const cap = captureConsole();
    await expect(createPatientNote('p1', { body: `note for ${PHONE}` })).rejects.toMatchObject({ status: 500 });
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
  });

  it('mirrors the backend status transitions (advisory) and never allows leaving a terminal state', () => {
    expect(CASE_TRANSITIONS.closed).toEqual([]);
    expect(CASE_TRANSITIONS.open).toEqual(['in_progress', 'resolved', 'closed']);
    expect(TASK_TRANSITIONS.done).toEqual([]);
    expect(TASK_TRANSITIONS.expired).toEqual([]);
    for (const next of Object.values(TASK_TRANSITIONS)) expect(next).not.toContain('expired');
  });

  it('classifies 409 as a fixed-copy conflict', () => {
    expect(classifyCrmError(new ApiError(409, { detail: 'a closed case cannot be changed' })).kind).toBe('conflict');
    expect(classifyCrmError(new ApiError(409, { detail: 'x' })).message).not.toContain('closed case');
  });
});

describe('consent and patient-update contracts', () => {
  it('records consent and updates a patient with the exact methods, endpoints and bodies', async () => {
    const seen: { method: string; path: string; body: unknown }[] = [];
    server.use(
      http.post(`${API_BASE}/v1/crm/patients/p1/consents`, async ({ request }) => {
        seen.push({ method: 'POST', path: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json({ id: 'e' }, { status: 201 });
      }),
      http.patch(`${API_BASE}/v1/crm/patients/p1`, async ({ request }) => {
        seen.push({ method: 'PATCH', path: new URL(request.url).pathname, body: await request.json() });
        return HttpResponse.json({ id: 'p1' });
      }),
    );
    await recordConsent('p1', { consent_type: 'call_consent', action: 'denied', channel: 'phone', idempotency_key: 'k1' });
    await updatePatient('p1', { full_name: 'N', preferred_provider: null, status: 'inactive' });
    expect(seen).toEqual([
      { method: 'POST', path: '/v1/crm/patients/p1/consents', body: { consent_type: 'call_consent', action: 'denied', channel: 'phone', idempotency_key: 'k1' } },
      { method: 'PATCH', path: '/v1/crm/patients/p1', body: { full_name: 'N', preferred_provider: null, status: 'inactive' } },
    ]);
  });

  it('reads current consent and paged history from the exact endpoints, with clamped paging', async () => {
    const urls: string[] = [];
    server.use(
      http.get(`${API_BASE}/v1/crm/patients/p1/consents/current`, ({ request }) => { urls.push(request.url); return HttpResponse.json([]); }),
      http.get(`${API_BASE}/v1/crm/patients/p1/consents`, ({ request }) => { urls.push(request.url); return HttpResponse.json({ items: [], limit: 100, offset: 10000, has_more: false }); }),
    );
    await listCurrentConsents('p1');
    await listConsents('p1', { limit: 5000, offset: 99999 });
    expect(new URL(urls[0]).pathname).toBe('/v1/crm/patients/p1/consents/current');
    const q = new URL(urls[1]).searchParams;
    expect(new URL(urls[1]).pathname).toBe('/v1/crm/patients/p1/consents');
    expect(q.get('limit')).toBe('100');
    expect(q.get('offset')).toBe('10000');
  });

  it('never logs consent or patient write bodies', async () => {
    server.use(
      http.post(`${API_BASE}/v1/crm/patients/p1/consents`, () => HttpResponse.json({ detail: `echo ${EMAIL}` }, { status: 500 })),
      http.patch(`${API_BASE}/v1/crm/patients/p1`, () => HttpResponse.json({ detail: `echo ${EMAIL}` }, { status: 500 })),
    );
    const cap = captureConsole();
    await expect(recordConsent('p1', { consent_type: 'x_type', action: 'granted', language: PHONE })).rejects.toMatchObject({ status: 500 });
    await expect(updatePatient('p1', { full_name: `Name ${PHONE}` })).rejects.toMatchObject({ status: 500 });
    const out = cap.text();
    cap.restore();
    expect(out).not.toContain(PHONE);
    expect(out).not.toContain(EMAIL);
  });
});

describe('searchPatients', () => {
  it('sends the search value in the POST body and never in the URL', async () => {
    let url = '';
    let body: unknown;
    server.use(http.post(`${API_BASE}/v1/crm/patients/search`, async ({ request }) => {
      url = request.url;
      body = await request.json();
      return HttpResponse.json([]);
    }));
    await searchPatients({ kind: 'phone', value: PHONE });
    expect(url).not.toContain(encodeURIComponent(PHONE));
    expect(url).not.toContain('910000000001');
    expect(body).toEqual({ kind: 'phone', value: PHONE });
  });
});
