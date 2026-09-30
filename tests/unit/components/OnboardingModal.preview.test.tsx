import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../src/api/onboarding', () => ({
  getOnboarding: vi.fn(), saveOnboardingStep: vi.fn(), skipOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(), dismissOnboarding: vi.fn(),
}));

import * as api from '../../../src/api/onboarding';
import OnboardingModal from '../../../src/components/OnboardingModal';

describe('OnboardingModal preview (Help → Onboarding)', () => {
  it('walks all 3 screens (no connectors) locally and never touches the server', () => {
    const onClose = vi.fn();
    render(<OnboardingModal preview onClose={onClose} />);

    expect(screen.getByText('What would you like to manage?')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText("What's your number?")).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Invite people to your workspace')).toBeTruthy();
    fireEvent.click(screen.getByText('Finish'));

    expect(screen.queryByText('Connect your tools, unlock your workflow')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });
});
