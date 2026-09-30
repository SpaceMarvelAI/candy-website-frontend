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
});
