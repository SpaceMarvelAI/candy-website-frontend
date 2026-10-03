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
export function decodeWorkspaceIdFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const body = token.split('.')[1];
    if (!body) return null;
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      subscription_workspace_id?: string; workspace_id?: string; org_id?: string;
    };
    return claims.subscription_workspace_id || claims.workspace_id || claims.org_id || null;
  } catch {
    return null;
  }
}
