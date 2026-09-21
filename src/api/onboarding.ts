/**
 * Onboarding — the 4-step setup pop-up.
 *
 * These hit CANDY's own backend (`/v1/onboarding`), which forwards to the dashboard using the
 * dashboard token it already stores against the user. Candy's frontend has no dashboard token of
 * its own, which is the whole reason the hop exists.
 *
 * Candy stores NO onboarding state. The dashboard owns one row per user, shared across all four
 * products — so someone who starts the flow here and finishes it in MetaSpace is not asked twice.
 * Reasoning: docs/shared/BFF_PATTERN.md ("duplicate code freely, never duplicate state").
 *
 * Errors arrive with the dashboard's own status and `error` code intact — Candy's backend forwards
 * them rather than flattening them to 502 — so `invalid_step`, `value_required` and
 * `already_completed` can be branched on here exactly as MetaSpace does.
 */
import { api } from './client';

export type OnboardingStep = 'choose' | 'connectors' | 'number' | 'invite';

export interface OnboardingState {
  current_step: OnboardingStep | null;
  steps: OnboardingStep[];
  selections: Partial<Record<OnboardingStep, unknown>>;
  skipped_steps: OnboardingStep[];
  completed: boolean;
  completed_at: string | null;
  dismissed: boolean;
  dismissed_at: string | null;
  steps_done: number;
  steps_total: number;
  /**
   * The ONE flag to branch on:
   *   true                  -> open the pop-up at `current_step`
   *   false && !completed    -> show the "Finish setup — 2 of 4" widget
   *   completed              -> show nothing, ever again
   *
   * The backend returns this so the frontend does not re-derive it from
   * `completed`/`dismissed` and drift out of step with the server.
   */
  auto_open: boolean;
}

interface Envelope { status: string; data: OnboardingState }

/** Where is this user in the flow? Call after login. */
export async function getOnboarding(): Promise<OnboardingState> {
  const res = await api<Envelope>('/v1/onboarding?product=candy');
  return res.data;
}

/** Save one step's answer. Returns the state already advanced — use it, don't re-fetch. */
export async function saveOnboardingStep(step: OnboardingStep, value: unknown): Promise<OnboardingState> {
  const res = await api<Envelope>('/v1/onboarding', { method: 'PATCH', body: { step, value } });
  return res.data;
}

/** Skip a step. Every step is skippable; a skip is recorded separately from an answer. */
export async function skipOnboardingStep(step: OnboardingStep): Promise<OnboardingState> {
  const res = await api<Envelope>('/v1/onboarding', { method: 'PATCH', body: { step, skip: true } });
  return res.data;
}

/**
 * The ✕. Stops the pop-up auto-opening but KEEPS the remaining steps reachable from the widget.
 * Deliberately not the same call as completing — treating a close as a finish would mean anyone
 * who closes it on step 1 never sees steps 2-4 again.
 */
export async function dismissOnboarding(): Promise<OnboardingState> {
  const res = await api<Envelope>('/v1/onboarding', { method: 'POST', body: { action: 'dismiss' } });
  return res.data;
}

/** "Done" on the last step. Finished for good — no pop-up, no widget. Idempotent. */
export async function completeOnboarding(): Promise<OnboardingState> {
  const res = await api<Envelope>('/v1/onboarding', { method: 'POST', body: { action: 'complete' } });
  return res.data;
}
