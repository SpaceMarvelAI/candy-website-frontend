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
import { useEffect, useState } from 'react';
import Icon from '../../assets/icons';
import { listAgents, type Agent } from '../../api/agents';
import { useApp } from '../../context/AppContext';
import { ApiError, API_BASE } from '../../api/client';
import { SkeletonBox } from '../Skeleton';

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
}

const SLUG_LABEL: Record<string, string> = {
  ecom: 'E-commerce', fin: 'Financial', log: 'Logistics',
  health: 'Healthcare', hr: 'HR & Hiring', mkt: 'Marketing',
  cs: 'Customer Support', tech: 'Technical Support',
  bank: 'Banking Support', appt: 'Appointment Booking',
};

export default function AgentPicker({
  tint = 'purple', category, slug,
  agents, loading = false, selectedId, onSelect, onCreate, onDelete, onReload,
}: Props) {
  const { user, addToast } = useApp();
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
    if (!window.confirm(
      `Delete "${a.name}" permanently?\n\nThis removes the agent and ALL of its knowledge base, recordings, prompt history, and demo sessions. This cannot be undone.`,
    )) return;
    setDeletingId(a.id);
    try {
      await onDelete(a.id);
      addToast(`Deleted "${a.name}"`, 'success');
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message))
        : (e as Error).message;
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
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message))
        : (e as Error).message;
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
          <span style={pill}>{agents.length}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
            style={{ ...newBtn, background: showAll ? `${tintColor[tint]}1f` : 'var(--tint-2)' }}
          >
            <Icon name="grid" size={11} /> {showAll ? 'Showing all' : 'Show all my agents'}
          </button>
          <button
            onClick={() => setDebug(v => !v)}
            title="Show debug info"
            style={{ ...newBtn, padding: '6px 9px' }}
          >
            <Icon name="settings" size={11} />
          </button>
          <button onClick={openNewModal} disabled={creating} style={newBtn}>
            <Icon name="plus" size={12} /> {creating ? 'Creating…' : 'New agent'}
          </button>
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visible.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', padding: '6px 0' }}>
            {loadingAll ? 'Loading…'
              : showAll
                ? 'No agents at all on this account. Click "New agent" to create one.'
                : `No ${category} agents yet — click "New agent", or "Show all my agents" if you created one under a different category.`}
          </div>
        )}
        {visible.map(a => {
          const active = a.id === selectedId;
          const wrongSlug = a.use_case_slug !== slug;
          const deleting  = deletingId === a.id;
          return (
            <div
              key={a.id}
              style={{
                display: 'inline-flex', alignItems: 'stretch',
                borderRadius: 9, overflow: 'hidden',
                background: active ? `${tintColor[tint]}1f` : 'var(--tint-1)',
                border: `1px solid ${active ? tintColor[tint] : 'var(--border)'}`,
                opacity: wrongSlug ? 0.65 : 1,
                transition: 'all 0.15s',
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                title={wrongSlug ? `This agent belongs to "${SLUG_LABEL[a.use_case_slug] ?? a.use_case_slug}"` : undefined}
                style={{
                  padding: '8px 10px 8px 12px',
                  background: 'transparent', border: 'none',
                  color: 'var(--text-1)',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  textAlign: 'left',
                }}
              >
                {active && <Icon name="check" size={11} style={{ color: tintColor[tint] }} />}
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>
                  {a.name}
                </span>
                {wrongSlug && (
                  <span
                    style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 99,
                      background: 'var(--tint-2)', color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
                    }}
                  >
                    {SLUG_LABEL[a.use_case_slug] ?? a.use_case_slug}
                  </span>
                )}
                {statusBadge(a.agent_flow_status)}
                <span
                  style={{
                    fontSize: 10.5, color: 'var(--text-4)',
                    fontFamily: "'Zalando Sans'",
                  }}
                >
                  {a.id.slice(0, 8)}
                </span>
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={(ev) => handleDelete(a, ev)}
                  disabled={deleting}
                  title={`Delete ${a.name}`}
                  aria-label={`Delete ${a.name}`}
                  style={{
                    padding: '0 10px',
                    background: deleting ? 'rgba(255,90,120,0.15)' : 'transparent',
                    border: 'none',
                    borderLeft: '1px solid var(--border)',
                    color: deleting ? 'var(--red)' : 'var(--text-3)',
                    cursor: deleting ? 'wait' : 'pointer',
                    display: 'inline-grid', placeItems: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'rgba(255,90,120,0.1)';
                      e.currentTarget.style.color = 'var(--red)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!deleting) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-3)';
                    }
                  }}
                >
                  <Icon name={deleting ? 'refresh' : 'x'} size={12} />
                </button>
              )}
            </div>
          );
        })}
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
                background: 'var(--tint-2)', border: '1px solid var(--border-strong)',
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
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 16,
  marginBottom: 16,
};
const sectionHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  flexWrap: 'wrap' as const, gap: 8,
  marginBottom: 12,
};
const sectionTitle = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)', margin: 0 };
const pill = {
  fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)',
  padding: '2px 7px', borderRadius: 99,
  background: 'var(--tint-1)', border: '1px solid var(--border)',
};
const newBtn = {
  fontSize: 12, fontWeight: 600,
  padding: '6px 11px', borderRadius: 8,
  background: 'var(--tint-2)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-1)', cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', gap: 6,
  transition: 'all 0.15s',
};
