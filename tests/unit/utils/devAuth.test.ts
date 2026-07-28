/**
 * Unit tests for utils/devAuth.ts — localhost-only dev auto-login.
 *
 * Note: this module writes to the SAME localStorage key api/client.ts reads
 * ('access_token') — a real bug (it wrote 'candy.token' instead) was found and
 * fixed while adding these tests. See the fix in src/utils/devAuth.ts.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installDevAuth } from '../../../src/utils/devAuth';

const ORIGINAL_ENV = { ...import.meta.env };

function setHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { ...window.location, hostname },
    writable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const key of Object.keys(import.meta.env)) {
    if (key.startsWith('VITE_DEV_')) delete (import.meta.env as any)[key];
  }
});

afterEach(() => {
  Object.assign(import.meta.env, ORIGINAL_ENV);
  setHostname('localhost');
});

describe('installDevAuth', () => {
  it('is a no-op when not on localhost', () => {
    setHostname('app.candy.cx');
    (import.meta.env as any).VITE_DEV_TOKEN = 'dev-token';
    (import.meta.env as any).VITE_DEV_USER = JSON.stringify({ email: 'dev@candy.internal' });

    installDevAuth();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('is a no-op on localhost when VITE_DEV_TOKEN is unset', () => {
    setHostname('localhost');
    installDevAuth();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it('seeds access_token and candy.user on localhost when configured', () => {
    setHostname('localhost');
    (import.meta.env as any).VITE_DEV_TOKEN = 'dev-token-abc';
    const user = JSON.stringify({ email: 'dev@candy.internal', user_id: 'u1' });
    (import.meta.env as any).VITE_DEV_USER = user;

    installDevAuth();

    // The exact key api/client.ts's getToken() reads — this is the bug this
    // test guards against regressing.
    expect(localStorage.getItem('access_token')).toBe('dev-token-abc');
    expect(localStorage.getItem('candy.user')).toBe(user);
  });

  it('clears sessionStorage token/user so localStorage wins', () => {
    setHostname('localhost');
    (import.meta.env as any).VITE_DEV_TOKEN = 'dev-token-abc';
    (import.meta.env as any).VITE_DEV_USER = JSON.stringify({ email: 'dev@candy.internal' });
    sessionStorage.setItem('access_token', 'stale-sso-token');
    sessionStorage.setItem('candy.user', 'stale-sso-user');

    installDevAuth();

    expect(sessionStorage.getItem('access_token')).toBeNull();
    expect(sessionStorage.getItem('candy.user')).toBeNull();
  });

  it('never throws even if localStorage access fails', () => {
    setHostname('localhost');
    (import.meta.env as any).VITE_DEV_TOKEN = 'dev-token-abc';
    (import.meta.env as any).VITE_DEV_USER = 'user';
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota exceeded'); });

    expect(() => installDevAuth()).not.toThrow();
    spy.mockRestore();
  });
});
