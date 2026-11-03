/**
 * Onboarding — the setup pop-up. The shared flow has 4 steps (`OnboardingStep`); Candy shows 3 and
 * hides `connectors`, so display counts go through utils/onboardingProgress, not `steps_total`.
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
import { api, API_BASE, getToken } from './client';

export type OnboardingStep = 'choose' | 'org_gate' | 'connectors' | 'number' | 'organisation' | 'invite';

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
   *   false && !completed    -> show the "Finish setup — N of M" widget
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

export interface OnboardingGithubProfile {
  connected: boolean;
  login?: string | null;
  avatar_url?: string | null;
  company?: string | null;
  location?: string | null;
  top_languages?: string[];
  public_repos?: number | null;
  followers?: number | null;
}

interface ProfileEnvelope {
  status: string;
  data: {
    full_name?: string | null;
    avatar_url?: string | null;
    github?: OnboardingGithubProfile | null;
  };
}

/** The dashboard's full profile — avatar/name plus the GitHub-connected enrichment
 *  (company/location/top_languages), for the onboarding pre-step that shows whatever was pulled
 *  from GitHub at login. */
export async function getOnboardingProfile(): Promise<ProfileEnvelope['data']> {
  const res = await api<ProfileEnvelope>('/v1/onboarding/profile');
  return res.data;
}

/** The organisation profile collected during the onboarding `organisation` step — for the
 *  Organisation section of the Profile panel. */
export interface OrganisationProfile {
  name: string | null;
  industry: string | null;
  org_size: string | null;
  website: string | null;
  description: string | null;
  logo_url: string | null;
  org_tree_url: string | null;
}
interface OrgProfileEnvelope { status: string; data: OrganisationProfile | null }

/** Null when this user has no current workspace (a personal-workspace user). */
export async function getOrganisationProfile(): Promise<OrganisationProfile | null> {
  try {
    const res = await api<OrgProfileEnvelope>('/v1/onboarding/organisation');
    return res.data;
  } catch {
    return null;
  }
}

export interface EnrichedOrgProfile {
  id: string;
  name: string;
  industry?: string | null;
  org_size?: string | null;
  website?: string | null;
  description?: string | null;
  logo_url?: string | null;
  enriched: Record<string, unknown>;
}

/** Best-effort org enrichment from a domain, with optional explicit overrides (name_override/
 *  org_size/industry/description) from the organisation-profile form — the user confirming or
 *  editing a dropdown, not passive PDL inference. These always win over whatever PDL finds.
 *  Never throws, callers fire-and-forget this. */
export async function enrichOrg(params: {
  domain: string;
  name_override?: string;
  org_size?: string;
  industry?: string;
  description?: string;
}): Promise<EnrichedOrgProfile | null> {
  try {
    const res = await api<{ status: string; data: EnrichedOrgProfile }>('/v1/onboarding/enrich', {
      method: 'POST',
      body: params,
    });
    return res.data;
  } catch {
    return null;
  }
}

/** Upload the organisation-tree (org chart) file for the `invite` onboarding step — parsed and
 *  stored by our own backend first (works with zero Dashboard configured), then pushed on to
 *  the Dashboard too when combined mode is configured.
 *  Best-effort, never throws — callers should not block advancing on this failing. */
export async function uploadOrgTree(file: File): Promise<void> {
  try {
    const form = new FormData();
    form.append('org_tree', file);
    await api('/v1/onboarding/org-tree', { method: 'POST', body: form });
  } catch { /* best-effort */ }
}

/** Fetch the downloadable organisation-tree .xlsx template, through our own backend (not
 *  dashboard-direct from the browser) — same reasoning as every other onboarding call. Returns
 *  null in standalone mode or on any failure; caller decides what to show. */
export async function downloadOrgTreeTemplate(): Promise<Blob | null> {
  try {
    const token = getToken();
    const res = await fetch(`${API_BASE}/v1/onboarding/org-tree/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
