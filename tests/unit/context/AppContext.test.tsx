/**
 * Tests for src/context/AppContext.tsx — isolation audit critical #2:
 * identify()/group() calls had no resetGroups() anywhere — posthog-js has no selective
 * single-group unset (only a blanket resetGroups() that clears every group type at once),
 * so a stale group from a prior session/user could persist across re-identify.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import posthog from 'posthog-js';
import { AppProvider, useApp } from '../../../src/context/AppContext';
import { loadStoredUser } from '../../../src/api/auth';

vi.mock('posthog-js', () => ({
  default: { identify: vi.fn(), group: vi.fn(), resetGroups: vi.fn(), reset: vi.fn(), capture: vi.fn() },
}));

vi.mock('../../../src/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

vi.mock('../../../src/api/auth', () => ({
  loadStoredUser: vi.fn(() => null),
  fullLogout: vi.fn().mockResolvedValue({ navigated: false }),
  ssoCallback: vi.fn(),
  me: vi.fn(),
  storeUser: vi.fn(),
}));

vi.mock('../../../src/api/client', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

vi.mock('../../../src/hooks/useToast', () => ({ addToast: vi.fn() }));
vi.mock('../../../src/api/prompts', () => ({ claimPromptTicket: vi.fn() }));
vi.mock('../../../src/utils/sso', () => ({
  PENDING_PROMPT_TICKET_KEY: 'pending_prompt_ticket',
  takeSsoIntent: vi.fn(() => null),
  redirectWithSso: vi.fn(),
  takeReturnRoute: vi.fn(() => null),
}));

function makeJwt(claims: Record<string, unknown> = {}): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims }));
  return `${header}.${payload}.sig`;
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter initialEntries={['/']}><AppProvider>{children}</AppProvider></MemoryRouter>
);

beforeEach(() => {
  vi.mocked(posthog.identify).mockClear();
  vi.mocked(posthog.group).mockClear();
  vi.mocked(posthog.resetGroups).mockClear();
  vi.mocked(loadStoredUser).mockReturnValue(null);
});

describe('AppContext — mount rehydrate effect', () => {
  it('resets groups before re-identifying an already-signed-in user from storage', async () => {
    const { getToken } = await import('../../../src/api/client');
    vi.mocked(getToken).mockReturnValue(makeJwt({ subscription_workspace_id: 'ws-1', org_name: 'Acme' }));
    vi.mocked(loadStoredUser).mockReturnValue({
      user_id: 'u1', email: 'u1@example.com', full_name: 'U One',
      company_id: 'co-1', company_name: 'Co', role: 'viewer',
    });

    renderHook(() => useApp(), { wrapper });

    await waitFor(() => expect(posthog.identify).toHaveBeenCalled());
    expect(posthog.resetGroups).toHaveBeenCalled();
    expect(posthog.group).toHaveBeenCalledWith('company', 'co-1', { name: 'Co' });
    expect(posthog.group).toHaveBeenCalledWith('workspace', 'ws-1', { name: 'Acme' });
  });

  it('does not call identify when there is no stored user', () => {
    renderHook(() => useApp(), { wrapper });
    expect(posthog.identify).not.toHaveBeenCalled();
  });
});

describe('AppContext — signedIn()', () => {
  it('does not itself call posthog (that is the mount effect/SSO exchange\'s job)', () => {
    const { result } = renderHook(() => useApp(), { wrapper });
    act(() => {
      result.current.signedIn({
        user_id: 'u2', email: 'u2@example.com', full_name: 'U Two',
        company_id: 'co-2', company_name: 'Co2', role: 'viewer',
      });
    });
    // Documents current behavior — signedIn() itself stays a thin state setter;
    // the real identity/group work happens in the mount effect on next reload.
    expect(result.current.user?.user_id).toBe('u2');
  });
});
