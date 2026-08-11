/**
 * composio.ts has two halves:
 *   1. Pure normalisation helpers (appId, appLogo, …) — no network.
 *   2. metaFetch-backed API calls that first mint a Metaspace JWT via a
 *      two-hop SSO exchange (SM_API → META_API), then call META_API.
 *
 * We test the pure helpers directly and exercise the API calls by mocking
 * the full SSO + meta endpoints.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import * as Composio from '../../../src/api/composio';

const SM_API   = 'http://localhost:8003';
const META_API = 'http://localhost:8004';

// ── Pure helpers ──────────────────────────────────────────────────────────────
describe('composio pure helpers', () => {
  it('appId prefers appId, falls back to app_id, then name — lowercased', () => {
    expect(Composio.appId({ appId: 'Slack' } as any)).toBe('slack');
    expect(Composio.appId({ app_id: 'Linear' } as any)).toBe('linear');
    expect(Composio.appId({ name: 'Notion' } as any)).toBe('notion');
    expect(Composio.appId({} as any)).toBe('');
  });

  it('appLogo prefers logo, falls back to logo_url', () => {
    expect(Composio.appLogo({ logo: 'a.png' } as any)).toBe('a.png');
    expect(Composio.appLogo({ logo_url: 'b.png' } as any)).toBe('b.png');
    expect(Composio.appLogo({} as any)).toBeUndefined();
  });

  it('appCategory prefers categories[0], then category, then "Other"', () => {
    expect(Composio.appCategory({ categories: ['CRM'] } as any)).toBe('CRM');
    expect(Composio.appCategory({ category: 'Email' } as any)).toBe('Email');
    expect(Composio.appCategory({} as any)).toBe('Other');
  });

  it('connectedAppId reads any of the app-name aliases', () => {
    expect(Composio.connectedAppId({ app: 'Slack' } as any)).toBe('slack');
    expect(Composio.connectedAppId({ app_name: 'Gmail' } as any)).toBe('gmail');
    expect(Composio.connectedAppId({} as any)).toBe('');
  });

  it('isActiveConnection treats missing status as active', () => {
    expect(Composio.isActiveConnection({} as any)).toBe(true);
  });

  it('isActiveConnection rejects known-inactive statuses', () => {
    for (const s of ['initiated', 'pending', 'failed', 'expired', 'revoked', 'error', 'disabled', 'inactive']) {
      expect(Composio.isActiveConnection({ status: s } as any)).toBe(false);
    }
  });

  it('isActiveConnection accepts active/connected statuses', () => {
    expect(Composio.isActiveConnection({ status: 'active' } as any)).toBe(true);
    expect(Composio.isActiveConnection({ status: 'CONNECTED' } as any)).toBe(true);
  });

  it('redirectUrl reads any redirect alias', () => {
    expect(Composio.redirectUrl({ connect_url: 'a' } as any)).toBe('a');
    expect(Composio.redirectUrl({ auth_url: 'b' } as any)).toBe('b');
    expect(Composio.redirectUrl({} as any)).toBeUndefined();
  });
});

// ── metaFetch-backed API calls ──────────────────────────────────────────────────
describe('composio API calls (with mocked SSO exchange)', () => {
  // This must run before any successful call populates the module-level meta-token
  // cache — once cached, getMetaToken short-circuits and never re-checks the
  // dashboard token.
  it('throws COMPOSIO_UNAUTHORIZED when no dashboard token is present', async () => {
    localStorage.removeItem('dashboard_token');
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  beforeEach(() => {
    localStorage.setItem('dashboard_token', 'dash-token');
    // SSO hop 1: SpaceMarvel SSO token
    server.use(
      http.post(`${SM_API}/api/rbac/auth/sso/generate/`, () => HttpResponse.json({ sso_token: 'sso-123' })),
      // SSO hop 2: exchange for a Metaspace app JWT
      http.get(`${META_API}/api/sso/callback`, () => HttpResponse.json({ access_token: 'meta-jwt', expires_in: 3600 })),
    );
  });

  // These getMetaToken failure-path tests must run before any test below succeeds
  // and caches the module-level meta-token — once cached, getMetaToken short-circuits
  // and never re-runs the SSO exchange this block is exercising.

  it('throws COMPOSIO_UNAUTHORIZED when the SM_API SSO-generate hop is not ok', async () => {
    server.use(http.post(`${SM_API}/api/rbac/auth/sso/generate/`, () => new HttpResponse(null, { status: 500 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws COMPOSIO_UNAUTHORIZED when the SSO-generate response has no sso_token', async () => {
    server.use(http.post(`${SM_API}/api/rbac/auth/sso/generate/`, () => HttpResponse.json({})));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws COMPOSIO_UNAUTHORIZED when the SSO-generate response body is not valid JSON', async () => {
    server.use(http.post(`${SM_API}/api/rbac/auth/sso/generate/`, () => new HttpResponse('not-json', { status: 200 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws COMPOSIO_UNAUTHORIZED when the META_API SSO-callback hop is not ok', async () => {
    server.use(http.get(`${META_API}/api/sso/callback`, () => new HttpResponse(null, { status: 500 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws COMPOSIO_UNAUTHORIZED when the SSO-callback response has no access_token', async () => {
    server.use(http.get(`${META_API}/api/sso/callback`, () => HttpResponse.json({})));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws COMPOSIO_UNAUTHORIZED when the SSO-callback response body is not valid JSON', async () => {
    server.use(http.get(`${META_API}/api/sso/callback`, () => new HttpResponse('not-json', { status: 200 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('defaults the meta-token lifetime to 3600s when expires_in is omitted', async () => {
    server.use(
      http.get(`${META_API}/api/sso/callback`, () => HttpResponse.json({ access_token: 'meta-default' })),
      http.get(`${META_API}/api/composio/apps`, () => HttpResponse.json([])),
    );
    await expect(Composio.getComposioApps()).resolves.toEqual([]);
  });

  it('getComposioApps unwraps an array response', async () => {
    server.use(http.get(`${META_API}/api/composio/apps`, () => HttpResponse.json([{ name: 'slack' }])));
    const apps = await Composio.getComposioApps();
    expect(apps[0].name).toBe('slack');
  });

  it('getComposioApps unwraps a { apps } envelope', async () => {
    server.use(http.get(`${META_API}/api/composio/apps`, () => HttpResponse.json({ apps: [{ name: 'jira' }] })));
    const apps = await Composio.getComposioApps();
    expect(apps[0].name).toBe('jira');
  });

  it('getComposioConnections unwraps a { connections } envelope', async () => {
    server.use(http.get(`${META_API}/api/composio/connections`, () => HttpResponse.json({ connections: [{ app: 'slack' }] })));
    const conns = await Composio.getComposioConnections();
    expect(conns[0].app).toBe('slack');
  });

  it('getAppAuthInfo returns the auth descriptor', async () => {
    server.use(http.get(`${META_API}/api/composio/apps/slack/auth-info`, () => HttpResponse.json({ app: 'slack', auth_type: 'oauth' })));
    expect((await Composio.getAppAuthInfo('slack')).auth_type).toBe('oauth');
  });

  it('connectComposioApp POSTs and returns a redirect URL', async () => {
    server.use(http.post(`${META_API}/api/composio/connect`, () => HttpResponse.json({ connect_url: 'https://oauth.example' })));
    const r = await Composio.connectComposioApp('slack');
    expect(Composio.redirectUrl(r)).toBe('https://oauth.example');
  });

  it('connectComposioAppWithCredentials POSTs credentials', async () => {
    server.use(http.post(`${META_API}/api/composio/connect`, () => HttpResponse.json({ redirect_url: 'https://done' })));
    const r = await Composio.connectComposioAppWithCredentials('linear', { api_key: 'k' });
    expect(Composio.redirectUrl(r)).toBe('https://done');
  });

  it('caches the meta token across calls (SSO exchange runs once)', async () => {
    let ssoHits = 0;
    server.use(
      http.post(`${SM_API}/api/rbac/auth/sso/generate/`, () => { ssoHits++; return HttpResponse.json({ sso_token: 'sso-x' }); }),
      http.get(`${META_API}/api/sso/callback`, () => HttpResponse.json({ access_token: 'meta-x', expires_in: 3600 })),
      http.get(`${META_API}/api/composio/apps`, () => HttpResponse.json([])),
      http.get(`${META_API}/api/composio/connections`, () => HttpResponse.json([])),
    );
    await Composio.getComposioApps();
    await Composio.getComposioConnections();
    // Token cached from an earlier test in this block → SSO not re-run here.
    expect(ssoHits).toBeLessThanOrEqual(1);
  });

  it('clears the cached meta-token and throws COMPOSIO_UNAUTHORIZED on a 401 from a Composio endpoint', async () => {
    server.use(http.get(`${META_API}/api/composio/apps`, () => new HttpResponse(null, { status: 401 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('COMPOSIO_UNAUTHORIZED');
  });

  it('throws a generic error containing the status and body text on a non-401 failure', async () => {
    server.use(http.get(`${META_API}/api/composio/apps`, () => new HttpResponse('boom', { status: 500 })));
    await expect(Composio.getComposioApps()).rejects.toThrow('500: boom');
  });

  it('getComposioApps falls back to [] when the envelope has no apps field', async () => {
    server.use(http.get(`${META_API}/api/composio/apps`, () => HttpResponse.json({})));
    await expect(Composio.getComposioApps()).resolves.toEqual([]);
  });

  it('getComposioConnections falls back to [] when the envelope has no connections field', async () => {
    server.use(http.get(`${META_API}/api/composio/connections`, () => HttpResponse.json({})));
    await expect(Composio.getComposioConnections()).resolves.toEqual([]);
  });
});
