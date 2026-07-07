/**
 * PromptAgentPickerModal — "Open in Candy" prompt handoff.
 *
 * Shown after a successful GET /v1/prompts/claim when matching_agents.length
 * !== 1 (i.e. zero or several candidates). Lets the user pick which agent
 * should receive the claimed prompt, or create a new one. Selecting an agent
 * (existing or freshly created) navigates to that agent's workspace route
 * with the prompt content staged in router state — the destination page
 * pre-fills the Requirements textarea but never auto-saves it (the user
 * still clicks the existing "Save requirements" button there).
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../../assets/icons';
import { listAgents, createAgent, type Agent } from '../../api/agents';
import { resolveAgentRoute, resolveAgentRouteFor } from '../../utils/agentRoutes';
import type { MatchingAgent } from '../../api/prompts';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { logger } from '../../utils/logger';

const SLUG_LABEL: Record<string, string> = {
  ecom: 'E-commerce', fin: 'Financial', log: 'Logistics',
  health: 'Healthcare', hr: 'HR & Hiring', mkt: 'Marketing',
  cs: 'Customer Support', tech: 'Technical Support',
  bank: 'Banking Support', appt: 'Appointment Booking',
};

interface Props {
  promptTitle: string;
  promptContent: string;
  matchingAgents: MatchingAgent[];
  onClose: () => void;
}

export default function PromptAgentPickerModal({
  promptTitle, promptContent, matchingAgents, onClose,
}: Props) {
  const navigate = useNavigate();
  const { addToast } = useApp();

  console.log('[PromptAgentPickerModal] render', { title: promptTitle, matches: matchingAgents.length });

  const [showAll, setShowAll]         = useState(matchingAgents.length === 0);
  const [allAgents, setAllAgents]     = useState<Agent[] | null>(null);
  const [loadingAll, setLoadingAll]   = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newSlug, setNewSlug]         = useState('cs');
  const [creating, setCreating]       = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const readyRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { readyRef.current = true; }, 100);
    return () => clearTimeout(timer);
  }, []);

  function goToAgent(agentId: string, route: string | null) {
    if (!route) {
      addToast("Couldn't find a workspace page for that agent's use case.", 'error');
      return;
    }
    setNavigatingId(agentId);
    navigate(route, { state: { selectAgentId: agentId, draftRequirements: promptContent } });
    onClose();
  }

  async function loadAllAgents() {
    if (allAgents !== null || loadingAll) return;
    setLoadingAll(true);
    try {
      const list = await listAgents();
      setAllAgents(list);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      addToast(`Couldn't load agents: ${msg}`, 'error');
    } finally {
      setLoadingAll(false);
    }
  }

  function toggleShowAll() {
    setShowAll(v => !v);
    if (allAgents === null) loadAllAgents();
  }

  async function confirmCreate() {
    const trimmed = newName.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const created = await createAgent({
        use_case_slug: newSlug,
        name: trimmed,
        call_direction: CHAT_SLUGS.has(newSlug) ? 'chat' : 'outbound',
      });
      logger.info('[PromptAgentPickerModal] created agent for prompt handoff', { agentId: created.id, slug: newSlug });
      goToAgent(created.id, resolveAgentRoute(created.use_case_slug, created.call_direction));
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message))
        : (e as Error).message;
      addToast(`Couldn't create agent: ${msg}`, 'error');
    } finally {
      setCreating(false);
    }
  }

  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    console.log('[PromptAgentPickerModal] backdrop click', {
      ready: readyRef.current,
      targetId: target.id,
      targetClass: target.className,
      willClose: readyRef.current && target.id === 'prompt-picker-backdrop',
    });
    if (readyRef.current && target.id === 'prompt-picker-backdrop') onClose();
  }

  const visibleList: { id: string; name: string; use_case_slug: string; call_direction: string; agent_flow_status: string }[] =
    showAll ? (allAgents ?? []) : matchingAgents;

  return (
    <div
      id="prompt-picker-backdrop"
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 560,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 24px 80px -8px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(117,91,227,0.15)',
                border: '1px solid rgba(117,91,227,0.3)',
                display: 'grid', placeItems: 'center',
                color: 'var(--purple)',
              }}
            >
              <Icon name="spark" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                {matchingAgents.length > 0 ? 'Which agent should use this prompt?' : 'Choose an agent for this prompt'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                {promptTitle}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-3)',
              display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {matchingAgents.length > 0 && (
            <div>
              <div style={sectionLabel}>Matching agents</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {matchingAgents.map(a => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    busy={navigatingId === a.id}
                    onClick={() => goToAgent(a.id, resolveAgentRouteFor(a))}
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <button onClick={toggleShowAll} style={linkBtn}>
              <Icon name="grid" size={12} />
              {showAll ? 'Hide other agents' : 'Use a different agent'}
            </button>
            {showAll && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {loadingAll && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading…</div>}
                {!loadingAll && allAgents && allAgents.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>You don't have any agents yet.</div>
                )}
                {!loadingAll && allAgents?.map(a => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    busy={navigatingId === a.id}
                    onClick={() => goToAgent(a.id, resolveAgentRoute(a.use_case_slug, a.call_direction))}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            {!showCreate ? (
              <button onClick={() => { setShowCreate(true); setNewName(promptTitle || ''); }} style={createBtn}>
                <Icon name="plus" size={13} /> Create new agent
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={sectionLabel}>New agent</div>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Agent name"
                  style={fieldInput}
                />
                <select value={newSlug} onChange={e => setNewSlug(e.target.value)} style={fieldInput}>
                  {Object.entries(SLUG_LABEL).map(([slug, label]) => (
                    <option key={slug} value={slug}>{label}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowCreate(false)} style={cancelBtn}>Cancel</button>
                  <button onClick={confirmCreate} disabled={!newName.trim() || creating} style={{ ...createBtn, opacity: !newName.trim() || creating ? 0.6 : 1 }}>
                    {creating ? 'Creating…' : 'Create & use'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const CHAT_SLUGS = new Set(['cs', 'tech', 'bank', 'appt']);

function AgentRow({
  agent, busy, onClick,
}: {
  agent: { id: string; name: string; use_case_slug: string; call_direction: string; agent_flow_status: string };
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--card-bg)',
        color: 'var(--text-1)',
        cursor: busy ? 'wait' : 'pointer',
        textAlign: 'left',
        opacity: busy ? 0.7 : 1,
        transition: 'all 0.15s',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon name="bot" size={14} style={{ color: 'var(--purple)', flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {agent.name}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={badge}>{SLUG_LABEL[agent.use_case_slug] ?? agent.use_case_slug}</span>
        {busy ? <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Opening…</span> : <Icon name="arrowRight" size={12} style={{ color: 'var(--text-3)' }} />}
      </span>
    </button>
  );
}

const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-4)', marginBottom: 8,
};

const badge: React.CSSProperties = {
  fontSize: 10, padding: '2px 7px', borderRadius: 99,
  background: 'var(--tint-2)', color: 'var(--text-3)',
  textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
};

const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 12.5, fontWeight: 600,
  color: 'var(--purple)', background: 'transparent', border: 'none',
  cursor: 'pointer', padding: 0,
};

const fieldInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--input-bg-strong)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text-1)',
  outline: 'none',
};

const createBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  fontSize: 13, fontWeight: 600,
  padding: '9px 16px', borderRadius: 9,
  background: 'var(--grad-brand)',
  color: '#fff', border: 'none',
  cursor: 'pointer',
  boxShadow: '0 4px 12px -4px rgba(117,91,227,0.5)',
};

const cancelBtn: React.CSSProperties = {
  padding: '9px 16px', borderRadius: 9,
  background: 'var(--card-bg)', border: '1px solid var(--border-strong)',
  color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
};
