/**
 * WorkspaceSwitcher — subscription workspaces, for the top of the profile menu. Same place Claude
 * puts it, and where docs/workspace-onboarding/HANDOFF_TO_TEAMS.md specifies.
 *
 * NAMING is deliberate: no "Workspace" heading. In the SpaceMarvel products that word already
 * means something else (Workspace Agents in MetaSpace), and users of an AI product read it as
 * "where my agents live". So this shows the workspace names with a plan badge, exactly as Claude
 * does. Where a label is unavoidable elsewhere the copy is "subscription workspace".
 *
 * `workspace_type` from the API is `'business'`, never `'team'` — the column has said business
 * since migration 0029 and every check in four services depends on it. We display "Team".
 *
 * AFTER SWITCHING we store Candy's newly minted token and hard-reload. The backend re-mints it
 * because plan, role and the credit pool all follow the workspace; keeping the old one means the
 * user carries on spending the previous workspace's credits until it expires. And a partial
 * client refresh would leave some panel still showing the workspace they just left.
 */
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../assets/icons';
import { getToken, setToken } from '../api/client';
import { errorMessage } from '../utils/apiError';
import { listMyWorkspaces, switchWorkspace, type MyWorkspace } from '../api/workspaces';

/**
 * Which workspace is active, read from Candy's own token.
 *
 * `_mint_jwt` puts the workspace under `org_id`, `workspace_id`, AND `subscription_workspace_id`
 * (same value, all three — mid-rename), so read the final name first and fall back through the
 * older ones — tokens minted before this change carry only `org_id`, and live for hours. Nothing
 * else in this app decodes the token, hence the small local reader rather than a dependency.
 */
function activeWorkspaceFromToken(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    const body = t.split('.')[1];
    if (!body) return null;
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as {
      subscription_workspace_id?: string; workspace_id?: string; org_id?: string;
    };
    // FINAL name first — see the note above and Candy's own api/v1/auth.py:_mint_jwt.
    return claims.subscription_workspace_id || claims.workspace_id || claims.org_id || null;
  } catch {
    return null;   // not a JWT we can read — the tick just won't show
  }
}

export default function WorkspaceSwitcher({
  /** Override the active workspace; otherwise it is read from the token. */
  activeWorkspaceId,
  onSwitching,
}: {
  activeWorkspaceId?: string | null;
  onSwitching?: () => void;
} = {}) {
  const active = activeWorkspaceId ?? activeWorkspaceFromToken();
  const [items, setItems] = useState<MyWorkspace[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    listMyWorkspaces()
      .then((ws) => { if (alive.current) setItems(ws); })
      // Silent: the switcher is not something the user asked for, and a failure here must not
      // break the profile menu they actually opened.
      .catch(() => { if (alive.current) setItems([]); });
    return () => { alive.current = false; };
  }, []);

  // Nothing to switch between — don't take up room in the menu with a list of one.
  if (!items || items.length < 2) return null;

  async function pick(ws: MyWorkspace) {
    if (ws.org_id === active || busy) return;
    setError(null);
    setBusy(ws.org_id);
    onSwitching?.();
    try {
      const res = await switchWorkspace(ws.org_id);
      // Store the re-minted token BEFORE reloading — see the note at the top of this file.
      if (res.access_token) setToken(res.access_token);
      window.location.reload();
    } catch (e) {
      setError(errorMessage(e, 'Could not switch. Please try again.'));
      setBusy(null);
    }
  }

  return (
    <div style={{ paddingBottom: 4, marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
      {items.map((ws) => {
        const isActive = ws.org_id === active;
        const isTeam = ws.workspace_type === 'business';
        return (
          <button
            key={ws.org_id}
            onClick={() => void pick(ws)}
            disabled={!!busy}
            aria-current={isActive ? 'true' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 12px', background: 'transparent', border: 'none',
              borderRadius: 8, cursor: busy ? 'default' : 'pointer',
              fontSize: 13, color: 'var(--text)', textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!busy) (e.currentTarget as HTMLElement).style.background = 'var(--surface-hover, rgba(255,255,255,0.05))'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Icon name={isTeam ? 'team' : 'user'} size={14} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ws.org_name}
            </span>
            {/* Plan badge, like Claude's "Team" / "Free" */}
            <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>
              {isTeam ? 'Team' : ws.plan === 'free' ? 'Free' : ws.plan}
            </span>
            {busy === ws.org_id
              ? <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>…</span>
              : isActive ? <Icon name="check" size={13} /> : <span style={{ width: 13 }} />}
          </button>
        );
      })}
      {error && (
        <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--danger, #f87171)' }}>{error}</div>
      )}
    </div>
  );
}
