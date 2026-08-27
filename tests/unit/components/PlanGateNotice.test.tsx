import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlanGateNotice from '../../../src/components/PlanGateNotice';
import { gateInfo } from '../../../src/utils/apiError';
import { ApiError } from '../../../src/api/client';

describe('PlanGateNotice', () => {
  beforeEach(() => { localStorage.clear(); });

  it('renders the plan-gate message and the plan/feature context', () => {
    const gate = gateInfo(new ApiError(403, {
      detail: {
        error: 'upgrade_required',
        message: 'This feature is not included in your current plan. Upgrade to access it.',
        current_plan: 'free',
        feature: 'workflows',
      },
    }))!;
    render(<PlanGateNotice gate={gate} />);
    expect(screen.getByText('Not included in your plan')).toBeTruthy();
    expect(screen.getByText(/Upgrade to access it/)).toBeTruthy();
    expect(screen.getByText(/Current plan: free · Feature: workflows/)).toBeTruthy();
  });

  it('renders a credit gate', () => {
    const gate = gateInfo(new ApiError(402, {
      detail: { error: 'no_credits', message: 'This workspace is out of credits. Please add credits to continue.' },
    }))!;
    render(<PlanGateNotice gate={gate} />);
    expect(screen.getByText('Out of credits')).toBeTruthy();
  });

  it('renders a role gate with the stored user role and announces politely', () => {
    sessionStorage.setItem('candy.user', JSON.stringify({ user_id: 'u1', email: 'a@b.com', role: 'member' }));
    const gate = gateInfo(new ApiError(403, { detail: "Role 'member' cannot perform this action" }))!;
    const { container } = render(<PlanGateNotice gate={gate} />);
    expect(screen.getByText(/Your role can/)).toBeTruthy();
    expect(screen.getByText('Signed in as member')).toBeTruthy();
    // Not colour-only: the notice is a live region with text.
    expect(container.querySelector('[role="status"]')).toBeTruthy();
  });
});
