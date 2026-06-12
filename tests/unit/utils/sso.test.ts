import { describe, it, expect, afterEach, vi } from 'vitest';
import { redirectToSSO } from '../../../src/utils/sso';

const originalLocation = window.location;

function stubLocation(hostname: string) {
  const loc = { ...originalLocation, hostname, origin: `https://${hostname}`, href: '' };
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
    expect(loc.href).toContain('spacemarvel.ai/login');
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
