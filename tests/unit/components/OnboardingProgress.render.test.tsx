/**
 * Regression: Candy used to hide the shared flow's `connectors` step (server had 4 steps, Candy
 * showed 3). As of 2026-10-30 Candy shows `connectors` too (see OnboardingModal's module
 * docstring) — the visible "Finish setup" pill and the modal's progress bar now match the
 * server's own total exactly, same as Metaspace and Finixy.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('../../../src/api/onboarding', () => ({
  getOnboarding: vi.fn(), saveOnboardingStep: vi.fn(), skipOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(), dismissOnboarding: vi.fn(),
}));
vi.mock('../../../src/api/client', async (orig) => ({
  ...(await orig<typeof import('../../../src/api/client')>()),
  getToken: () => 'test-token',
}));
// OnboardingGate re-checks onboarding once AppContext's `user` is set (fixes a race where a
// fresh SSO login's async token exchange hadn't finished when the gate's effect first ran) --
// mocked here the same lightweight way as getToken above, rather than mounting the real
// AppProvider and its own SSO/API side effects into what is otherwise a plain render test.
vi.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ user: { user_id: 'u1', email: 'a@b.com', role: 'admin', company_id: 'c1', company_name: 'Acme', full_name: null } }),
}));
// The connectors screen fetches live connection status on mount — stub it out so these
// progress/navigation tests never make a real (Metaspace-proxied) network call.
vi.mock('../../../src/api/composio', () => ({
  getComposioConnections: vi.fn().mockResolvedValue([]),
  getAppAuthInfo: vi.fn(),
  connectComposioApp: vi.fn(),
  connectedAppId: () => '',
  isActiveConnection: () => true,
  redirectUrl: () => undefined,
}));

import * as api from '../../../src/api/onboarding';
import OnboardingGate from '../../../src/components/OnboardingGate';
import OnboardingModal from '../../../src/components/OnboardingModal';

/** What the shared Dashboard flow returns: 4 steps, connectors included. */
const serverState = (over: Partial<api.OnboardingState> = {}): api.OnboardingState => ({
  current_step: 'number',
  steps: ['choose', 'connectors', 'number', 'invite'],
  selections: { choose: ['Workflow Automation'] },
  skipped_steps: ['connectors'],           // skipped in another product
  completed: false, completed_at: null,
  dismissed: true, dismissed_at: '2026-09-30T00:00:00Z',
  steps_done: 2,                            // the server counts choose + connectors
  steps_total: 4,
  auto_open: false,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('Finish-setup pill', () => {
  it('shows "2 of 4" — choose answered, connectors skipped, nothing hidden anymore', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState());
    render(<OnboardingGate />);

    expect(await screen.findByText('2 of 4')).toBeTruthy();
    expect(screen.getByLabelText('Finish setup, 2 of 4 done')).toBeTruthy();
  });

  it('shows "0 of 4" for a brand-new user', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState({
      current_step: 'choose', selections: {}, skipped_steps: [], steps_done: 0,
    }));
    render(<OnboardingGate />);

    expect(await screen.findByText('0 of 4')).toBeTruthy();
  });
});

describe('Modal progress bar', () => {
  it('fills by the server total: 2 of 4 answered/skipped is 50%', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState());
    const { container } = render(<OnboardingModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("You're all set!")).toBeTruthy());
    expect(container.ownerDocument.querySelector('div[style*="width: 50%"]')).toBeTruthy();
    expect(container.ownerDocument.querySelector('div[style*="width: 33%"]')).toBeNull();
  });

  it('shows the connectors screen itself when current_step is connectors (no longer hidden)', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState({ current_step: 'connectors' }));
    render(<OnboardingModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Connect your tools, unlock your workflow')).toBeTruthy());
    expect(screen.queryByText("You're all set!")).toBeNull();
    // Same 6 apps as Metaspace's and Finixy's onboarding (see docs/user-profiling-onboarding/
    // candy-onboarding-edge-cases-2026-10-30.md #12).
    for (const name of ['Google', 'LinkedIn', 'Instagram', 'Jira', 'Slack', 'Facebook']) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });
});

describe('Final screen reached via a skipped org_gate cascade', () => {
  // Regression (found 2026-10-30): 'connectors' was once filtered OUT of the local `steps`
  // array instead of being mapped to its display name 'number', so steps.indexOf('number') was
  // -1 -- clamped to 0 by Math.max, making Back wrongly read as "step 0" and isLast wrongly read
  // as false. The second part meant advance() never called completeOnboarding() on this screen
  // at all. Now that `connectors` is a real, directly-shown step (no remapping at all), these
  // guard the same index/isLast correctness a different way.
  const skippedToEnd = (over: Partial<api.OnboardingState> = {}) => serverState({
    current_step: 'connectors',
    steps: ['org_gate', 'organisation', 'invite', 'connectors'],
    skipped_steps: ['org_gate', 'organisation', 'invite'],
    selections: {},
    steps_done: 0,
    ...over,
  });

  it('does not disable Back -- there are earlier (skipped) steps to return to', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(skippedToEnd());
    render(<OnboardingModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('Connect your tools, unlock your workflow')).toBeTruthy());
    expect(screen.getByText('Back').closest('button')).not.toBeDisabled();
  });

  it('shows "Finish" (isLast true) and calls completeOnboarding on click', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(skippedToEnd());
    vi.mocked(api.skipOnboardingStep).mockResolvedValue(skippedToEnd());
    vi.mocked(api.completeOnboarding).mockResolvedValue(skippedToEnd({ completed: true, completed_at: '2026-10-30T00:00:00Z', auto_open: false }));
    const onFinished = vi.fn();
    render(<OnboardingModal onClose={() => {}} onFinished={onFinished} />);

    await waitFor(() => expect(screen.getByText('Finish')).toBeTruthy());
    fireEvent.click(screen.getByText('Finish'));

    await waitFor(() => expect(api.completeOnboarding).toHaveBeenCalled());
  });
});
