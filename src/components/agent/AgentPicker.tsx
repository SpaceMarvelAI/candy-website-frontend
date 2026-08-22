/**
 * AgentPicker — dropdown showing every agent that exists for the current
 * industry slug, with a "+ New agent" button to create another one.
 * Sits above the workspace body so the user always knows which record
 * they're editing.
 *
 * Also has a "Show ALL my agents" toggle that bypasses the slug filter so
 * you can see records you may have created under a different category /
 * older session.
 */
import {
  useEffect, useState, useMemo, useCallback, useRef, type CSSProperties,
} from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import Icon from '../../assets/icons';
import { listAgents, type Agent } from '../../api/agents';
import { useApp } from '../../context/AppContext';
import { errorMessage } from '../../utils/apiError';
import { ApiError, API_BASE } from '../../api/client';
import { SkeletonBox } from '../Skeleton';
import { sectionHeader as sharedSectionHeader, sectionTitle, sectionPill } from '../../styles/tokens';
import { useConfirm } from '../ConfirmDialog';

const tintColor = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)',
};

interface Props {
  tint?: keyof typeof tintColor;
  category: string;
  slug: string;
  agents: Agent[];
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onReload?: () => Promise<void>;
  /** Rendered on the same row as the switcher — AgentWorkspace passes the
   *  Knowledge Base / Languages / Skills / Requirements triggers here so the
   *  whole top bar is one compact row. */
  inlineExtras?: React.ReactNode;
}

/**
 * Filter by query, then group by status and sort by name inside each group.
 *
 * Exported and pure so the ordering rules are testable: the previous picker
 * rendered whatever order the API returned, so an agent changed position between
 * refreshes. Search matches the name anywhere, or an id by prefix — the id is
 * the only way to tell two identically-named agents apart.
 */
export function groupAgents(
  agents: Agent[],
  query: string,
): { status: string; list: Agent[] }[] {
  const q = query.trim().toLowerCase();
  const matched = q
    ? agents.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().startsWith(q))
    : agents;

  const by = new Map<string, Agent[]>();
  for (const a of matched) {
    const k = a.agent_flow_status || 'not_designed';
    const bucket = by.get(k);
    if (bucket) bucket.push(a);
    else by.set(k, [a]);
  }

  // Most-actionable first; anything unrecognised sorts to the end.
  const ORDER = ['published', 'ready_to_test', 'not_designed', 'archived'];
  const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };

  return [...by.entries()]
    .sort((x, y) => rank(x[0]) - rank(y[0]) || x[0].localeCompare(y[0]))
    .map(([status, list]) => ({
      status,
      list: [...list].sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Group headings for the switcher — the status appears once per group here,
 *  instead of as a badge repeated on every row. */
const STATUS_GROUP_LABEL: Record<string, string> = {
  published:     'Live',
  ready_to_test: 'Ready to test',
  not_designed:  'Not designed',
  archived:      'Archived',
};

const SLUG_LABEL: Record<string, string> = {
  ecom: 'E-commerce', fin: 'Financial', log: 'Logistics',
  health: 'Healthcare', hr: 'HR & Hiring', mkt: 'Marketing',
  cs: 'Customer Support', tech: 'Technical Support',
  bank: 'Banking Support', appt: 'Appointment Booking',
};

export default function AgentPicker({
  tint = 'purple', category, slug,
  agents, loading = false, selectedId, onSelect, onCreate, onDelete, onReload,
  inlineExtras,
}: Props) {
  const { user, addToast } = useApp();
  const confirm = useConfirm();
  const [creating, setCreating]     = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName]           = useState('');
  const [showAll, setShowAll]       = useState(false);
  const [allAgents, setAll]         = useState<Agent[] | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  const [debug, setDebug]           = useState(false);

  async function handleRefresh() {
    if (refreshing || !onReload) return;
    setRefreshing(true);
    try { await onReload(); } finally { setRefreshing(false); }
    setAll(null);
  }

  async function handleDelete(a: Agent, ev?: React.MouseEvent) {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    if (!onDelete) return;
    if (deletingId) return;
    if (!await confirm({
      title: `Delete "${a.name}"?`,
      body: 'This removes the agent and everything attached to it.',
      consequence: 'Knowledge base, recordings, prompt history and demo sessions are all deleted. This cannot be undone.',
      confirmLabel: 'Delete agent',
    })) return;
    setDeletingId(a.id);
    try {
      await onDelete(a.id);
      addToast(`Deleted "${a.name}"`, 'success');
    } catch (e) {
      const msg = errorMessage(e);
      addToast(`Couldn't delete: ${msg}`, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  // Lazy-load the full unfiltered list when the user toggles "Show all".
  useEffect(() => {
    if (!showAll || allAgents !== null) return;
    let cancelled = false;
    setLoadingAll(true);
    listAgents()
      .then(list => { if (!cancelled) setAll(list); })
      .catch(e => {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        addToast(`Couldn't list agents: ${msg}`, 'error');
      })
      .finally(() => { if (!cancelled) setLoadingAll(false); });
    return () => { cancelled = true; };
  }, [showAll, allAgents, addToast]);

  function openNewModal() {
    setNewName(`${category} agent ${agents.length + 1}`);
    setShowNewModal(true);
  }

  async function confirmNewAgent() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setShowNewModal(false);
    try {
      await onCreate(trimmed);
      addToast(`Created "${trimmed}"`, 'success');
    } catch (e) {
      const msg = errorMessage(e);
      addToast(`Couldn't create agent: ${msg}`, 'error');
    } finally {
      setCreating(false);
    }
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, [string, string]> = {
      published:     ['rgba(76,175,80,0.15)',  'var(--green)'],
      ready_to_test: ['rgba(24,218,252,0.15)', 'var(--blue)'],
      not_designed:  ['var(--tint-2)',         'var(--text-3)'],
      archived:      ['rgba(255,90,120,0.12)', 'var(--red)'],
    };
    const [bg, fg] = colors[s] ?? ['var(--tint-2)', 'var(--text-3)'];
    return (
      <span
        style={{
          fontSize: 10, padding: '2px 7px', borderRadius: 99,
          background: bg, color: fg,
          textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
        }}
      >
        {s.replace(/_/g, ' ')}
      </span>
    );
  };

  // What we render: either the slug-filtered list, or the full unfiltered list.
  const visible = showAll && allAgents ? allAgents : agents;
  const otherSlugs = showAll && allAgents
    ? allAgents.filter(a => a.use_case_slug !== slug)
    : [];

  return (
    <>
    <section style={section}>
      <header style={sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="grid" size={16} style={{ color: tintColor[tint] }} />
          <h3 style={sectionTitle}>{category} agents</h3>
          <span style={sectionPill}>{agents.length}</span>
        </div>
      </header>

      {debug && (
        <div
          style={{
            background: 'var(--tint-1)',
            border: '1px dashed var(--border-strong)',
            color: 'var(--text-2)',
            fontSize: 11.5,
            padding: '8px 12px', borderRadius: 8,
            marginBottom: 10,
            fontFamily: "'Zalando Sans'",
            lineHeight: 1.6,
          }}
        >
          API: <span style={{ color: 'var(--text-1)' }}>{API_BASE}</span><br/>
          User: <span style={{ color: 'var(--text-1)' }}>{user?.email || '(not signed in)'} · company {user?.company_id?.slice(0, 8) || '–'}</span><br/>
          Slug filter: <span style={{ color: 'var(--text-1)' }}>{slug}</span> · matched {agents.length} · all-agents {allAgents ? allAgents.length : '?'}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[110, 130, 95, 120, 115].map((w, i) => (
            <SkeletonBox key={i} width={w} height={34} radius={10} />
          ))}
        </div>
      ) : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <AgentSwitcher
        agents={visible}
        selectedId={selectedId}
        slug={slug}
        tint={tint}
        category={category}
        showAll={showAll}
        loadingAll={loadingAll}
        deletingId={deletingId}
        statusBadge={statusBadge}
        onSelect={onSelect}
        onDelete={onDelete ? handleDelete : undefined}
        actions={
          <>
            {onReload && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                title="Re-fetch the agent list"
                style={{ ...newBtn, opacity: refreshing ? 0.7 : 1 }}
              >
                <Icon
                  name="refresh"
                  size={11}
                  style={refreshing ? { animation: 'spin 0.7s linear infinite' } : {}}
                />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            <button
              onClick={() => setShowAll(v => !v)}
              style={{ ...newBtn, background: showAll ? `${tintColor[tint]}1f` : 'var(--card-bg)' }}
            >
              <Icon name="grid" size={11} /> {showAll ? 'Showing all' : 'Show all'}
            </button>
            <button
              onClick={() => setDebug(v => !v)}
              title="Show debug info"
              style={{ ...newBtn, padding: '6px 9px' }}
            >
              <Icon name="settings" size={11} />
            </button>
            <button
              onClick={openNewModal}
              disabled={creating}
              style={{ ...newBtn, marginLeft: 'auto' }}
            >
              <Icon name="plus" size={12} /> {creating ? 'Creating…' : 'New agent'}
            </button>
          </>
        }
      />
      {inlineExtras}
      </div>
      )}

      {showAll && otherSlugs.length > 0 && (
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 10 }}>
          {otherSlugs.length} of those agents belong to a different category — they'll still load if you click them, but their KB and prompt are scoped to their own use case.
        </div>
      )}
    </section>

    {/* ── New agent modal ── */}

    {showNewModal && (
      <div
        onClick={() => setShowNewModal(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 420,
            background: 'var(--card-bg)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-xl)',
            padding: 28,
            boxShadow: 'var(--shadow-card)',
            animation: 'fadeUp 0.18s ease-out',
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
            New {category} agent
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
            Give your agent a name — you can rename it later.
          </div>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') confirmNewAgent(); if (e.key === 'Escape') setShowNewModal(false); }}
            placeholder={`${category} agent ${agents.length + 1}`}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px',
              background: 'var(--input-bg)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-1)', fontSize: 14,
              outline: 'none', marginBottom: 20,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--purple)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,113,227,0.12)'; }}
            onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setShowNewModal(false)}
              style={{
                padding: '9px 18px', borderRadius: 'var(--radius)',
                background: 'var(--card-bg)', border: '1px solid var(--border-strong)',
                color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={confirmNewAgent}
              disabled={!newName.trim()}
              style={{
                padding: '9px 18px', borderRadius: 'var(--radius)',
                background: 'var(--purple)', border: 'none',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                opacity: newName.trim() ? 1 : 0.5,
              }}
            >
              Create agent
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

const section = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 16,
  marginBottom: 16,
};
const sectionHeader: CSSProperties = {
  ...sharedSectionHeader,
  flexWrap: 'wrap', gap: 8,
};
const newBtn = {
  fontSize: 12, fontWeight: 600,
  padding: '6px 11px', borderRadius: 8,
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  color: 'var(--text-1)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  transition: 'all 0.15s',
};

/* ── Agent switcher ────────────────────────────────────────────────────────────
 * Replaces a wrapping row of pills — one per agent — that had grown to 17 and
 * cost ~350px of vertical space above the actual work area. At that count the
 * layout was ragged (pills sized to their text), the status badge was repeated
 * on every pill so it carried no information, there was no way to search, and a
 * delete × sat permanently on each pill at the same visual weight as the pill.
 *
 * Collapsed it is one line showing the current agent. Opening it gives a search
 * box and the full list grouped by status, so it scales past 100 agents.
 * ────────────────────────────────────────────────────────────────────────────── */
function AgentSwitcher({
  agents, selectedId, slug, tint, category, showAll, loadingAll, deletingId,
  statusBadge, onSelect, onDelete, actions,
}: {
  agents: Agent[];
  selectedId: string | null;
  slug: string;
  tint: keyof typeof tintColor;
  category: string;
  showAll: boolean;
  loadingAll: boolean;
  deletingId: string | null;
  statusBadge: (s: string) => React.ReactNode;
  onSelect: (id: string) => void;
  onDelete?: (a: Agent, ev: React.MouseEvent) => void;
  /** Refresh / Show all / debug / New agent. These act on the LIST, so they live
   *  with the list rather than in the page header — which also keeps the top bar
   *  to a single row of pickers. */
  actions?: React.ReactNode;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);
  useDialogA11y(panelRef, close, false);

  const selected = agents.find(a => a.id === selectedId) ?? null;

  // Group by status so the badge appears once per group instead of 17 times.
  // Sorted by name inside each group: the previous order was whatever the API
  // returned, so an agent moved position between refreshes.
  const groups = useMemo(() => groupAgents(agents, query), [agents, query]);

  const total = agents.length;
  const shown = groups.reduce((n, g) => n + g.list.length, 0);

  if (total === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>
        {loadingAll ? 'Loading…'
          : showAll
            ? 'No agents at all on this account. Click "New agent" to create one.'
            : `No ${category} agents yet — click "New agent", or "Show all my agents" if you created one under a different category.`}
      </div>
    );
  }

  return (
    // flex 2 vs the config pickers' 1: this cell carries a name, a status badge
    // and an id, and at an equal share the name truncated to "Patie…" and the
    // badge wrapped onto three lines.
    <div style={{ position: 'relative', flex: '2 1 300px', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          overflow: 'hidden',
          padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
          background: 'var(--card-bg)', border: `1px solid ${open ? tintColor[tint] : 'var(--border)'}`,
          textAlign: 'left', transition: 'border-color 0.15s',
        }}
      >
        <Icon name="grid" size={13} style={{ color: tintColor[tint], flex: 'none' }} />
        <span
          style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {selected ? selected.name : `Choose an agent — ${total} available`}
        </span>
        {selected && (
          <span style={{ flex: 'none', whiteSpace: 'nowrap', display: 'inline-flex' }}>
            {statusBadge(selected.agent_flow_status)}
          </span>
        )}
        {selected && (
          <span style={{ fontSize: 10.5, color: 'var(--text-4)', flex: 'none' }}>
            {selected.id.slice(0, 8)}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-3)', fontSize: 11 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <>
          {/* Click-away. Transparent, so the page stays visible behind the panel. */}
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            ref={panelRef}
            role="listbox"
            aria-label={`${category} agents`}
            tabIndex={-1}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 41,
              width: 'min(92vw, 470px)',
              background: 'var(--bg-1)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: '0 18px 44px rgba(8,12,20,0.22)',
              overflow: 'hidden', outline: 'none',
            }}
          >
            {actions && (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                  padding: 10, borderBottom: '1px solid var(--border)',
                }}
              >
                {actions}
              </div>
            )}

            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${total} agent${total === 1 ? '' : 's'}…`}
                aria-label="Search agents"
                style={{
                  width: '100%', padding: '8px 10px', fontSize: 13,
                  borderRadius: 'var(--radius)', border: '1px solid var(--border)',
                  background: 'var(--bg-2)', color: 'var(--text-1)', outline: 'none',
                }}
              />
            </div>

            <div style={{ maxHeight: 340, overflowY: 'auto', padding: 6 }}>
              {shown === 0 && (
                <div style={{ padding: '14px 8px', fontSize: 12.5, color: 'var(--text-3)' }}>
                  No agent matches “{query}”.
                </div>
              )}
              {groups.map(g => (
                <div key={g.status}>
                  <div
                    style={{
                      padding: '8px 8px 5px', fontSize: 10, fontWeight: 600,
                      letterSpacing: '0.07em', textTransform: 'uppercase',
                      color: 'var(--text-4)',
                    }}
                  >
                    {STATUS_GROUP_LABEL[g.status] ?? g.status} · {g.list.length}
                  </div>
                  {g.list.map(a => {
                    const active     = a.id === selectedId;
                    const wrongSlug  = a.use_case_slug !== slug;
                    const deleting   = deletingId === a.id;
                    return (
                      <div
                        key={a.id}
                        className="agent-row"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          borderRadius: 'var(--radius)',
                          background: active ? `${tintColor[tint]}1f` : 'transparent',
                          opacity: wrongSlug ? 0.7 : 1,
                        }}
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          onClick={() => { onSelect(a.id); close(); }}
                          title={wrongSlug
                            ? `This agent belongs to "${SLUG_LABEL[a.use_case_slug] ?? a.use_case_slug}"`
                            : undefined}
                          style={{
                            flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 10px', background: 'transparent', border: 'none',
                            cursor: 'pointer', textAlign: 'left', color: 'var(--text-1)',
                          }}
                        >
                          <span style={{ width: 12, flex: 'none', color: tintColor[tint] }}>
                            {active ? <Icon name="check" size={11} /> : null}
                          </span>
                          <span
                            style={{
                              fontSize: 13, fontWeight: active ? 600 : 500,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}
                          >
                            {a.name}
                          </span>
                          {wrongSlug && (
                            <span
                              style={{
                                fontSize: 9.5, padding: '2px 6px', borderRadius: 99, flex: 'none',
                                background: 'var(--tint-2)', color: 'var(--text-3)',
                                textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
                              }}
                            >
                              {SLUG_LABEL[a.use_case_slug] ?? a.use_case_slug}
                            </span>
                          )}
                          {/* The id is the only thing separating same-named agents,
                              so it stays visible rather than hiding on hover. */}
                          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-4)', flex: 'none' }}>
                            {a.id.slice(0, 8)}
                          </span>
                        </button>
                        {onDelete && (
                          <button
                            type="button"
                            onClick={ev => onDelete(a, ev)}
                            disabled={deleting}
                            title={`Delete ${a.name}`}
                            aria-label={`Delete ${a.name}`}
                            style={{
                              flex: 'none', width: 30, height: 30, marginRight: 4,
                              display: 'grid', placeItems: 'center',
                              background: 'transparent', border: 'none', borderRadius: 7,
                              color: deleting ? 'var(--red)' : 'var(--text-4)',
                              cursor: deleting ? 'wait' : 'pointer',
                            }}
                            onMouseEnter={e => {
                              if (!deleting) {
                                e.currentTarget.style.background = 'rgba(255,90,120,0.12)';
                                e.currentTarget.style.color = 'var(--red)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!deleting) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.color = 'var(--text-4)';
                              }
                            }}
                          >
                            <Icon name={deleting ? 'refresh' : 'trash'} size={12.5} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
