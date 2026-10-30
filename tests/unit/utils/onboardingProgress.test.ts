/**
 * Candy used to hide the shared flow's `connectors` step (MetaSpace/Finixy showed it, Candy
 * didn't) — HIDDEN_STEPS was ['connectors'] and the pill read "N of 3" over a 4-step server flow.
 * As of 2026-10-30 Candy shows `connectors` too (see OnboardingModal's module docstring), so
 * HIDDEN_STEPS is empty and visibleProgress is just a straight count over every step the server
 * sends — these tests now cover that, plus the defensive cases that never depended on hiding
 * anything.
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
  it('shows connectors too — a fresh user sees 0 of 4, matching the server total', () => {
    expect(visibleProgress(four)).toEqual({ done: 0, total: 4 });
  });

  it('counts an answered step', () => {
    expect(visibleProgress({ ...four, selections: { choose: ['Workflow Automation'] } }))
      .toEqual({ done: 1, total: 4 });
  });

  it('counts a skipped step as done', () => {
    expect(visibleProgress({ ...four, skipped_steps: ['choose', 'number'] }))
      .toEqual({ done: 2, total: 4 });
  });

  it('counts connectors progress made in another product too (no longer ignored)', () => {
    // Started in MetaSpace: connectors answered there — Candy now sees that progress too.
    expect(visibleProgress({ ...four, selections: { connectors: ['Gmail'] } }))
      .toEqual({ done: 1, total: 4 });
    expect(visibleProgress({ ...four, skipped_steps: ['connectors'] }))
      .toEqual({ done: 1, total: 4 });
  });

  it('reaches 4 of 4 when every step is finished', () => {
    expect(visibleProgress({
      ...four,
      selections: { choose: ['x'], number: '+91 98765 43210' },
      skipped_steps: ['invite', 'connectors'],
    })).toEqual({ done: 4, total: 4 });
  });

  it('HIDDEN_STEPS is empty — nothing is hidden anymore', () => {
    expect(HIDDEN_STEPS).toEqual([]);
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
