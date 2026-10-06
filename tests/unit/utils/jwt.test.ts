import { describe, it, expect } from 'vitest';
import { decodeWorkspaceIdFromToken } from '../../../src/utils/jwt';

function fakeJwt(claims: Record<string, unknown>): string {
  const base64url = btoa(JSON.stringify(claims)).replace(/\+/g, '-').replace(/\//g, '_');
  return `header.${base64url}.signature`;
}

describe('decodeWorkspaceIdFromToken', () => {
  it('returns null for a null/undefined token', () => {
    expect(decodeWorkspaceIdFromToken(null)).toBeNull();
    expect(decodeWorkspaceIdFromToken(undefined)).toBeNull();
    expect(decodeWorkspaceIdFromToken('')).toBeNull();
  });

  it('returns null when the token has no payload segment', () => {
    expect(decodeWorkspaceIdFromToken('justoneSegment')).toBeNull();
  });

  it('prefers subscription_workspace_id over the older fields', () => {
    const token = fakeJwt({ subscription_workspace_id: 'ws_new', workspace_id: 'ws_mid', org_id: 'org_old' });
    expect(decodeWorkspaceIdFromToken(token)).toBe('ws_new');
  });

  it('falls back to workspace_id when subscription_workspace_id is absent', () => {
    const token = fakeJwt({ workspace_id: 'ws_mid', org_id: 'org_old' });
    expect(decodeWorkspaceIdFromToken(token)).toBe('ws_mid');
  });

  it('falls back to org_id for a pre-rename token with only that field', () => {
    const token = fakeJwt({ org_id: 'org_old' });
    expect(decodeWorkspaceIdFromToken(token)).toBe('org_old');
  });

  it('returns null when none of the three fields are present', () => {
    const token = fakeJwt({ sub: 'user_1' });
    expect(decodeWorkspaceIdFromToken(token)).toBeNull();
  });

  it('decodes base64url payloads (- and _ swapped back to + and /)', () => {
    // Pick a workspace id whose JSON happens to base64-encode with + and / in
    // the standard alphabet, so the url-safe swap is actually exercised.
    const token = fakeJwt({ org_id: '>>>???' });
    expect(decodeWorkspaceIdFromToken(token)).toBe('>>>???');
  });

  it('returns null for a malformed (non-JSON) payload instead of throwing', () => {
    expect(decodeWorkspaceIdFromToken('header.not-valid-base64!!!.sig')).toBeNull();
  });
});
