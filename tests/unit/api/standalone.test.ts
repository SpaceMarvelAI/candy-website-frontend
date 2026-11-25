// Standalone mode (no Dashboard): the frontend asks the backend once how sign-in works
// (GET /v1/auth/mode) and routes login to Candy's own pages or to the Dashboard. These pin the
// caching, the fallback when the question fails, the stored session, and the team API shapes.
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  _resetAuthModeCache, fetchAuthMode, isStandaloneMode, loadAuthMode, storeStandaloneSession, teamApi,
} from '../../../src/api/standalone';
import { loadStoredUser } from '../../../src/api/auth';

const BASE = 'http://localhost:8002';

beforeEach(() => {
  _resetAuthModeCache();
  sessionStorage.clear();
});

function answerMode(body: object, status = 200) {
  let calls = 0;
  server.use(http.get(`${BASE}/v1/auth/mode`, () => { calls += 1; return HttpResponse.json(body, { status }); }));
  return () => calls;
}

describe('auth mode', () => {
  it('is ecosystem until the backend says otherwise', () => {
    expect(isStandaloneMode()).toBe(false);
  });

  it('remembers a standalone answer across loads (install config, not auth data)', async () => {
    answerMode({ mode: 'standalone', signup_open: true, workspace_name: null });
    await fetchAuthMode();
    expect(isStandaloneMode()).toBe(true);
    expect(JSON.parse(localStorage.getItem('candy.auth_mode')!)).toEqual({ mode: 'standalone' });
  });

  it('keeps the Dashboard login when the question fails', async () => {
    answerMode({ detail: 'boom' }, 500);
    await expect(fetchAuthMode()).resolves.toEqual({ mode: 'ecosystem', signup_open: false });
    expect(isStandaloneMode()).toBe(false);
  });

  it('boot waits for the first answer, then uses the stored one and refreshes in the background', async () => {
    const calls = answerMode({ mode: 'standalone', signup_open: false, workspace_name: 'Acme' });
    await loadAuthMode();
    expect(isStandaloneMode()).toBe(true);
    expect(calls()).toBe(1);
    await loadAuthMode();            // stored → resolves at once, one more background check
    expect(isStandaloneMode()).toBe(true);
  });

  it('an ecosystem answer replaces a stored standalone one', async () => {
    localStorage.setItem('candy.auth_mode', JSON.stringify({ mode: 'standalone' }));
    answerMode({ mode: 'ecosystem', signup_open: false });
    await fetchAuthMode();
    expect(isStandaloneMode()).toBe(false);
  });
});

describe('storeStandaloneSession', () => {
  it('stores the token and user the same way the Dashboard login does', () => {
    const user = storeStandaloneSession({
      access_token: 'tok-1', refresh_token: 'r-1', token_type: 'bearer', user_id: 'u-1',
      company_id: 'c-1', company_name: 'Acme', role: 'owner', email: 'ada@acmecorp.io',
    });
    expect(sessionStorage.getItem('access_token')).toBe('tok-1');
    expect(loadStoredUser()).toEqual(user);
    expect(user).toMatchObject({ user_id: 'u-1', company_id: 'c-1', role: 'owner', email: 'ada@acmecorp.io' });
  });
});

describe('teamApi', () => {
  it('sends no company list for "all companies" and the ids for a selection', async () => {
    const bodies: unknown[] = [];
    server.use(http.post(`${BASE}/v1/team/invitations`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ status: 'success' }, { status: 201 });
    }));
    await teamApi.invite('a@acmecorp.io', 'viewer', null);
    await teamApi.invite('b@acmecorp.io', 'builder', []);
    await teamApi.invite('c@acmecorp.io', 'admin', ['c-2']);
    expect(bodies).toEqual([
      { email: 'a@acmecorp.io', role: 'viewer', company_ids: null },
      { email: 'b@acmecorp.io', role: 'builder', company_ids: null },
      { email: 'c@acmecorp.io', role: 'admin', company_ids: ['c-2'] },
    ]);
  });

  it('unwraps {status, data} lists', async () => {
    server.use(http.get(`${BASE}/v1/team/members`, () => HttpResponse.json({
      status: 'success',
      data: [{ user_id: 'u-1', email: 'a@acmecorp.io', full_name: 'A', role: 'owner', company_access: 'all', company_ids: [] }],
    })));
    const members = await teamApi.members();
    expect(members.map(m => m.user_id)).toEqual(['u-1']);
  });

  it('saves domain auto-join with ids only for a selection', async () => {
    const bodies: unknown[] = [];
    server.use(http.put(`${BASE}/v1/team/domains/settings`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ status: 'success', data: { domain_join_access: 'off', company_ids: [] } });
    }));
    await teamApi.saveDomainSettings('off', ['c-1']);
    await teamApi.saveDomainSettings('selected', ['c-1']);
    expect(bodies).toEqual([
      { domain_join_access: 'off', company_ids: null },
      { domain_join_access: 'selected', company_ids: ['c-1'] },
    ]);
  });
});
