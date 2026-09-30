import type { OnboardingState, OnboardingStep } from '../api/onboarding';

/**
 * Steps the shared onboarding flow contains but Candy never shows (see the note at the top of
 * OnboardingModal: the `connectors` tiles only recorded intent and never opened a connection).
 *
 * The flow row lives on the Dashboard and is shared with MetaSpace and Finixy, which DO show this
 * step — so the server's `steps_total` is 4 and must stay 4 for them. Candy is the only product
 * that hides it, so Candy is the one that has to reconcile the count before displaying it.
 */
export const HIDDEN_STEPS: readonly OnboardingStep[] = ['connectors'];

export interface OnboardingProgress { done: number; total: number }

/**
 * "N of M" for the Finish-setup pill and the modal's progress bar, counting only steps the user
 * can actually see. Both numbers are derived from the visible steps rather than by subtracting
 * from the server's `steps_done`/`steps_total`, so they cannot drift from what the modal shows.
 * A step counts as done once it has been answered or skipped — the same rule the modal uses when
 * it advances.
 */
export function visibleProgress(
  s: Pick<OnboardingState, 'steps' | 'selections' | 'skipped_steps' | 'steps_total'>,
): OnboardingProgress {
  const steps = s.steps ?? [];
  const visible = steps.filter((step) => !HIDDEN_STEPS.includes(step));
  // No step list at all (should not happen): fall back to the server's total.
  if (!steps.length) return { done: 0, total: Math.max(0, s.steps_total ?? 0) };

  const selections = s.selections ?? {};
  const skipped = s.skipped_steps ?? [];
  const done = visible.filter((step) => selections[step] !== undefined || skipped.includes(step)).length;
  return { done, total: visible.length };
}
