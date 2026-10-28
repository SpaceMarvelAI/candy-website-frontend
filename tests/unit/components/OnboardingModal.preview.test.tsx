import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../../src/api/onboarding', () => ({
  getOnboarding: vi.fn(), saveOnboardingStep: vi.fn(), skipOnboardingStep: vi.fn(),
  completeOnboarding: vi.fn(), dismissOnboarding: vi.fn(), enrichOrg: vi.fn(),
  uploadOrgTree: vi.fn(), downloadOrgTreeTemplate: vi.fn(),
}));

import * as api from '../../../src/api/onboarding';
import OnboardingModal from '../../../src/components/OnboardingModal';

describe('OnboardingModal preview (Help → Onboarding)', () => {
  it('walks all 4 screens (no connectors) locally and never touches the server', () => {
    // Order: org_gate -> organisation -> invite -> number. 'choose' was removed as its own step
    // 2026-10-27 (merged into the profile pre-step's chip picker); `invite` was reordered ahead of
    // `number` 2026-10-28 to match the design (organisation is immediately followed by the
    // org-tree-upload screen, not by connectors/number).
    const onClose = vi.fn();
    render(<OnboardingModal preview onClose={onClose} />);

    expect(screen.getByText('Are you setting up for an organisation?')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Tell us about your organisation')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText('Upload your organisation tree')).toBeTruthy();
    fireEvent.click(screen.getByText('Next'));
    expect(screen.getByText("You're all set!")).toBeTruthy();
    fireEvent.click(screen.getByText('Finish'));

    expect(screen.queryByText('Connect your tools, unlock your workflow')).toBeNull();
    expect(onClose).toHaveBeenCalledOnce();
    for (const fn of Object.values(api)) expect(fn).not.toHaveBeenCalled();
  });
});
