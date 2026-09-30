import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { redirectToSSO, redirectToOIDC, redirectWithSso, PENDING_PROMPT_TICKET_KEY } from '../../../src/utils/sso';

const originalLocation = window.location;

function stubLocation(hostname: string, search = '') {
  const loc = { ...originalLocation, hostname, origin: `https://${hostname}`, href: '', search };
  Object.defineProperty(window, 'location', { value: loc, writable: true, configurable: true });
  return loc;
}

afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true, configurable: true });
  vi.restoreAllMocks();
});

describe('redirectToSSO', () => {
  it('uses the local callback URL on localhost', () => {
    const loc = stubLocation('localhost');
    redirectToSSO();
    expect(loc.href).toContain('spacemarvel.com/login');
    expect(decodeURIComponent(loc.href)).toContain('localhost/sso/callback');
  });

  it('uses the production callback URL off-localhost', () => {
    const loc = stubLocation('app.candy.cx');
    redirectToSSO();
    expect(decodeURIComponent(loc.href)).toContain('app.candy.cx/sso/callback');
  });

  it('treats 127.0.0.1 as local', () => {
    const loc = stubLocation('127.0.0.1');
    redirectToSSO();
    expect(decodeURIComponent(loc.href)).toContain('127.0.0.1/sso/callback');
  });
});

describe('redirectToOIDC', () => {
  beforeEach(() => sessionStorage.clear());

  it('navigates to the backend OIDC /login endpoint with return_to=this origin', () => {
    const loc = stubLocation('app.candy.cx');
    redirectToOIDC();
    expect(loc.href).toContain('/v1/auth/sso/oidc/login');
    expect(decodeURIComponent(loc.href)).toContain('return_to=https://app.candy.cx');
  });

  it('forwards ?ticket= from the current URL as a query param', () => {
    const loc = stubLocation('app.candy.cx', '?ticket=abc123');
    redirectToOIDC();
    expect(loc.href).toContain('ticket=abc123');
  });

  it('stashes the ticket in sessionStorage as a cookie-failure fallback', () => {
    stubLocation('app.candy.cx', '?ticket=abc123');
    redirectToOIDC();
    expect(sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY)).toBe('abc123');
  });

  it('omits the ticket param and sessionStorage write when no ticket is present', () => {
    const loc = stubLocation('app.candy.cx');
    redirectToOIDC();
    expect(loc.href).not.toContain('ticket=');
    expect(sessionStorage.getItem(PENDING_PROMPT_TICKET_KEY)).toBeNull();
  });
});

describe('redirectWithSso (rail Home/Finixy → other app, already signed in)', () => {
  beforeEach(() => sessionStorage.clear());

  it('returns false without calling the dashboard when there is no Candy session token', async () => {
    const f = vi.spyOn(globalThis, 'fetch');
    expect(await redirectWithSso('https://app.finixy.ai')).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it('returns false when the dashboard rejects the token (caller falls back to login)', async () => {
    sessionStorage.setItem('access_token', 'candy-jwt');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
    expect(await redirectWithSso('https://app.finixy.ai')).toBe(false);
  });

  it('opens the app with ?sso_token=<minted>&access_token=<Candy token>', async () => {
    const loc = stubLocation('app.candy.cx');
    sessionStorage.setItem('access_token', 'candy-jwt');
    const f = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ sso_token: 'one-time' }));
    expect(await redirectWithSso('https://app.finixy.ai')).toBe(true);
    const [, init] = f.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer candy-jwt' });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ app_url: 'https://app.finixy.ai' });
    const url = new URL(loc.href);
    expect(url.origin).toBe('https://app.finixy.ai');
    expect(url.searchParams.get('sso_token')).toBe('one-time');
    expect(url.searchParams.get('access_token')).toBe('candy-jwt');
  });
});
