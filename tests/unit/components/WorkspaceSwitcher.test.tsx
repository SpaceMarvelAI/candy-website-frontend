/**
 * Tests for src/components/WorkspaceSwitcher.tsx — isolation audit Pass 6 finding:
 * on switchWorkspace() success but a FAILED me() refetch, the pre-switch company_id stayed
 * cached. AppContext's mount effect (which runs on the reload that always follows, success or
 * failure) reads that cached company_id straight into posthog.group('company', ...), so the
 * reload tagged every event with the OLD company crossed with the NEW workspace. Fixed by
 * clearing the cached company fields instead of leaving a wrong one behind.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import WorkspaceSwitcher from '../../../src/components/WorkspaceSwitcher';
import { storeUser, loadStoredUser, me } from '../../../src/api/auth';
import { switchWorkspace, listMyWorkspaces } from '../../../src/api/workspaces';

vi.mock('../../../src/api/client', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
}));

vi.mock('../../../src/api/auth', () => ({
  me: vi.fn(),
  storeUser: vi.fn(),
  loadStoredUser: vi.fn(),
}));

vi.mock('../../../src/api/workspaces', () => ({
  listMyWorkspaces: vi.fn(),
  switchWorkspace: vi.fn(),
}));

vi.mock('../../../src/utils/jwt', () => ({
  decodeWorkspaceIdFromToken: vi.fn(() => 'ws-current'),
}));

const WORKSPACES = [
  { org_id: 'ws-current', org_name: 'Current', workspace_type: 'personal', plan: 'free' },
  { org_id: 'ws-target', org_name: 'Target', workspace_type: 'business', plan: 'pro' },
];

beforeEach(() => {
  vi.mocked(listMyWorkspaces).mockResolvedValue(WORKSPACES as any);
  vi.mocked(switchWorkspace).mockResolvedValue({ access_token: 'new-token' } as any);
  vi.mocked(storeUser).mockClear();
  vi.mocked(loadStoredUser).mockReturnValue({
    user_id: 'u1', email: 'u1@example.com', company_id: 'co-old', company_name: 'Old Co',
  } as any);
  // jsdom doesn't implement navigation; stub it so the component's unconditional
  // window.location.reload() after a switch doesn't throw.
  Object.defineProperty(window, 'location', {
    value: { ...window.location, reload: vi.fn() },
    writable: true,
  });
});

describe('WorkspaceSwitcher — switch with a failed me() refetch', () => {
  it('clears the cached company fields instead of leaving the pre-switch company cached', async () => {
    vi.mocked(me).mockRejectedValue(new Error('network error'));
    render(<WorkspaceSwitcher />);

    const target = await screen.findByText('Target');
    fireEvent.click(target);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
    expect(storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', company_id: '', company_name: '' }),
    );
  });

  it('stores the fresh user when me() succeeds (no regression on the happy path)', async () => {
    vi.mocked(me).mockResolvedValue({
      user_id: 'u1', email: 'u1@example.com', company_id: 'co-new', company_name: 'New Co',
    } as any);
    render(<WorkspaceSwitcher />);

    const target = await screen.findByText('Target');
    fireEvent.click(target);

    await waitFor(() => expect(window.location.reload).toHaveBeenCalled());
    expect(storeUser).toHaveBeenCalledWith(
      expect.objectContaining({ company_id: 'co-new', company_name: 'New Co' }),
    );
  });
});
