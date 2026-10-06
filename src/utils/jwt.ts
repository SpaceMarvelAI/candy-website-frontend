/**
 * Decodes the subscription-workspace id out of a Candy JWT.
 *
 * `_mint_jwt` puts the workspace under `org_id`, `workspace_id`, AND
 * `subscription_workspace_id` (same value, all three — mid-rename), so read the
 * final name first and fall back through the older ones — tokens minted before
 * this change carry only `org_id`, and live for hours.
 *
 * Extracted from WorkspaceSwitcher.tsx's local `activeWorkspaceFromToken` so the
 * SSO/login identify() call sites (src/pages/sso/index.tsx, src/context/
 * AppContext.tsx) can read the same workspace id to tag PostHog's "workspace"
 * group, instead of only ever tagging "company".
 */
interface _WorkspaceClaims {
  subscription_workspace_id?: string; workspace_id?: string; org_id?: string;
  org_name?: string; workspace_name?: string;
}

function _decodeClaims(token: string | null | undefined): _WorkspaceClaims | null {
  if (!token) return null;
  try {
    const body = token.split('.')[1];
    if (!body) return null;
    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as _WorkspaceClaims;
  } catch {
    return null;
  }
}

export function decodeWorkspaceIdFromToken(token: string | null | undefined): string | null {
  const claims = _decodeClaims(token);
  return claims?.subscription_workspace_id || claims?.workspace_id || claims?.org_id || null;
}

/** Same JWT, the real SubscriptionWorkspace.name — backend's candy_auth.py already mints this
 *  as `org_name` (or `workspace_name` on older tokens); PostHog's "workspace" group needs it
 *  so a PM sees a real name instead of a bare UUID. */
export function decodeWorkspaceNameFromToken(token: string | null | undefined): string | null {
  const claims = _decodeClaims(token);
  return claims?.org_name || claims?.workspace_name || null;
}
