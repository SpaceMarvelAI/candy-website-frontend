/**
 * Candy shows 3 onboarding steps but the shared server flow has 4 (it includes `connectors`,
 * which MetaSpace and Finixy show and Candy hides). The pill used to print the server's
 * steps_total, so it read "N of 4" over a 3-screen pop-up.
 */
import { describe, it, expect } from 'vitest';
import { visibleProgress, HIDDEN_STEPS } from '../../../src/utils/onboardingProgress';
import type { OnboardingState } from '../../../src/api/onboarding';

type Input = Pick<OnboardingState, 'steps' | 'selections' | 'skipped_steps' | 'steps_total'>;

const four: Input = {
  steps: ['choose', 'connectors', 'number', 'invite'],
  selections: {},
  skipped_steps: [],
  steps_total: 4,
};

describe('visibleProgress', () => {
  it('hides the connectors step, so a fresh user sees 0 of 3, never of 4', () => {
    expect(visibleProgress(four)).toEqual({ done: 0, total: 3 });
  });

  it('counts an answered visible step', () => {
    expect(visibleProgress({ ...four, selections: { choose: ['Workflow Automation'] } }))
      .toEqual({ done: 1, total: 3 });
  });

  it('counts a skipped visible step as done', () => {
    expect(visibleProgress({ ...four, skipped_steps: ['choose', 'number'] }))
      .toEqual({ done: 2, total: 3 });
  });

  it('ignores connectors progress made in another product', () => {
    // Started in MetaSpace: connectors answered there, nothing done here yet.
    expect(visibleProgress({ ...four, selections: { connectors: ['Gmail'] } }))
      .toEqual({ done: 0, total: 3 });
    expect(visibleProgress({ ...four, skipped_steps: ['connectors'] }))
      .toEqual({ done: 0, total: 3 });
  });

  it('reaches 3 of 3 when every visible step is finished', () => {
    expect(visibleProgress({
      ...four,
      selections: { choose: ['x'], number: '+91 98765 43210' },
      skipped_steps: ['invite', 'connectors'],
    })).toEqual({ done: 3, total: 3 });
  });

  it('leaves a flow that already has 3 steps unchanged', () => {
    expect(visibleProgress({
      steps: ['choose', 'number', 'invite'], selections: { choose: ['x'] },
      skipped_steps: [], steps_total: 3,
    })).toEqual({ done: 1, total: 3 });
  });

  it('never reports a total that includes a hidden step', () => {
    const { total } = visibleProgress(four);
    expect(total).toBe(four.steps.length - HIDDEN_STEPS.length);
  });

  it('falls back to the server total if the step list is missing', () => {
    expect(visibleProgress({ ...four, steps: [] as never, steps_total: 3 }))
      .toEqual({ done: 0, total: 3 });
  });

  it('defaults to 0 when the step list AND steps_total are both missing (defensive, malformed server response)', () => {
    expect(visibleProgress({ steps: undefined, steps_total: undefined } as unknown as Input))
      .toEqual({ done: 0, total: 0 });
  });

  it('never reports a negative total even if the server sends one', () => {
    expect(visibleProgress({ steps: [] as never, steps_total: -5 } as unknown as Input))
      .toEqual({ done: 0, total: 0 });
  });

  it('treats missing selections/skipped_steps as none done (defensive, malformed server response)', () => {
    expect(visibleProgress({
      steps: ['choose', 'number', 'invite'], selections: undefined, skipped_steps: undefined, steps_total: 3,
    } as unknown as Input)).toEqual({ done: 0, total: 3 });
  });
});
