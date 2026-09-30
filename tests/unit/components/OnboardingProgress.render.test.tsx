/**
 * Regression: the server flow has 4 steps (it includes the `connectors` step Candy hides). The
 * visible "Finish setup" pill and the modal's progress bar must reflect Candy's 3 screens.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../../src/api/onboarding', () => ({
  getOnboarding: vi.fn(), saveOnboardingStep: vi.fn(), skipOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(), dismissOnboarding: vi.fn(),
}));
vi.mock('../../../src/api/client', async (orig) => ({
  ...(await orig<typeof import('../../../src/api/client')>()),
  getToken: () => 'test-token',
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
  it('shows "1 of 3" for a 4-step server flow, never "of 4"', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState());
    render(<OnboardingGate />);

    expect(await screen.findByText('1 of 3')).toBeTruthy();
    expect(screen.queryByText(/of 4/)).toBeNull();
    expect(screen.getByLabelText('Finish setup, 1 of 3 done')).toBeTruthy();
  });

  it('shows "0 of 3" for a brand-new user', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState({
      current_step: 'choose', selections: {}, skipped_steps: [], steps_done: 0,
    }));
    render(<OnboardingGate />);

    expect(await screen.findByText('0 of 3')).toBeTruthy();
    expect(screen.queryByText(/of 4/)).toBeNull();
  });
});

describe('Modal progress bar', () => {
  it('fills by visible steps: 1 of 3 answered is 33%, not 50%', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState());
    const { container } = render(<OnboardingModal onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("What's your number?")).toBeTruthy());
    expect(container.ownerDocument.querySelector('div[style*="width: 33%"]')).toBeTruthy();
    expect(container.ownerDocument.querySelector('div[style*="width: 50%"]')).toBeNull();
  });

  it('still has exactly 3 screens and does not bring back connectors', async () => {
    vi.mocked(api.getOnboarding).mockResolvedValue(serverState({ current_step: 'connectors' }));
    render(<OnboardingModal onClose={() => {}} />);

    // A server parked on `connectors` is shown the next visible screen.
    await waitFor(() => expect(screen.getByText("What's your number?")).toBeTruthy());
    expect(screen.queryByText('Connect your tools, unlock your workflow')).toBeNull();
  });
});
