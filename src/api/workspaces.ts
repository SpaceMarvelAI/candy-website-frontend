/**
 * Subscription workspaces — the switcher's list, and switching between them.
 *
 * Both go through CANDY's backend, which forwards to the dashboard with the token it already
 * stores per user. This frontend holds no dashboard token, which is why the hop exists.
 *
 * A subscription workspace is what one subscription pays for: plan, credits, cards. Everyone has
 * a free personal one; a team workspace is a second one under a company. Switching changes what
 * you see — companies, credits, your role.
 */
import { api } from './client';

export interface MyWorkspace {
  /** Both names carry the same value during the org_id -> workspace_id rename. */
  org_id: string;
  org_name: string;
  /** Stored as 'business', never 'team' — we say "Team" in copy, the column says business. */
  workspace_type: 'personal' | 'business';
  plan: string;
  your_role: string;
  joined_at?: string;
  created_at?: string;
}

export interface SwitchWorkspaceResult {
  status: string;
  workspace_id: string;
  org_id: string;
  workspace_name: string;
  workspace_type: 'personal' | 'business';
  plan: string;
  role: string;
  /** Candy re-mints its own token for the new workspace and returns it. */
  access_token?: string;
  refresh_token?: string;
}

/** Every workspace this user can switch into. */
export async function listMyWorkspaces(): Promise<MyWorkspace[]> {
  const res = await api<{ status: string; count: number; data: MyWorkspace[] }>(
    '/v1/auth/sso/oidc/workspaces',
  );
  return res.data ?? [];
}

/**
 * Switch. Candy's backend asks the dashboard, then re-mints Candy's OWN token for the new
 * workspace and hands it back — plan, role and the credit pool all follow the workspace, so the
 * caller MUST store the new token, or the user keeps spending the previous workspace's credits
 * until the old one expires.
 */
export async function switchWorkspace(workspaceId: string): Promise<SwitchWorkspaceResult> {
  return api<SwitchWorkspaceResult>('/v1/auth/sso/oidc/switch-workspace', {
    method: 'POST',
    body: { workspace_id: workspaceId },
  });
}
