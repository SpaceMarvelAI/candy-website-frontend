/**
 * ChatbotWorkspace — configurable workspace for a single chatbot use-case.
 *
 * Accepts the same kind of props as AgentWorkspace so every use-case page
 * (customer_support, technical_support, healthcare_coaching, banking_support,
 * appointment_booking, hr_operations) can render its own isolated view.
 *
 * Layout (matches voice-agent workspaces):
 *   AgentShell (header + back + publish)
 *     AgentPicker — list / create / delete agents for this slug
 *     Embed URL banner (after publish)
 *     ┌──────────────────────────────┬────────────────┐
 *     │ KnowledgeBase                │ ChatTestPanel  │
 *     │ PromptEditor                 │ (Try Now)      │
 *     └──────────────────────────────┴────────────────┘
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import AgentShell from './AgentShell';
import AgentPicker from './AgentPicker';
import KnowledgeBase from './KnowledgeBase';
import PromptEditor from './PromptEditor';
import ChatTestPanel from './ChatTestPanel';
import { listAgents, createAgent, deleteAgent, type Agent } from '../../api/agents';
import { getRequirements } from '../../api/requirements';
import { listKnowledge, type KnowledgeDoc } from '../../api/knowledge';
import { publishAgent } from '../../api/agents';
import { ApiError, getToken } from '../../api/client';
import { useApp } from '../../context/AppContext';

interface Props {
  slug: string;       // DB use_case_slug: 'cs' | 'tech' | 'health' | 'bank' | 'appt' | 'hr'
  category: string;   // Display name e.g. 'Customer Support'
  icon: string;       // Icon name for AgentShell
  tint?: 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'pink';
  defaultPrompt: string;
  presets: { label: string; body: string }[];
}

export default function ChatbotWorkspace({
  slug, category, icon, tint = 'purple', defaultPrompt, presets,
}: Props) {
  const { addToast } = useApp();

  const [agents, setAgents]           = useState<Agent[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);

  const [promptText, setPromptText]   = useState('');
  const [docs, setDocs]               = useState<KnowledgeDoc[]>([]);

  // Persona + brand — same fields as voice AgentWorkspace
  const [personaName,  setPersonaName]  = useState('');
  const [personaStyle, setPersonaStyle] = useState('professional');
  const [brandName,    setBrandName]    = useState('');

  const [publishing, setPublishing]   = useState(false);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);

  const initRef = useRef(false);

  const agent  = agents.find(a => a.id === selectedId) ?? null;
  const status = statusOverride || agent?.agent_flow_status || null;
  const canPublish = !!agent && (status === 'ready_to_test' || status === 'published');

  // Hosted widget URL shown after publish
  const widgetUrl = (agent?.agent_flow_status === 'published' || statusOverride === 'published')
    ? `${window.location.protocol}//${window.location.host}/chat/${agent?.id}`
    : null;

  // ── Data loaders ──────────────────────────────────────────────────────────

  const refreshDocs = useCallback(async () => {
    if (!selectedId) return;
    try { setDocs(await listKnowledge(selectedId)); }
    catch (e) { console.warn('listKnowledge failed', e); }
  }, [selectedId]);

  const reloadAgents = useCallback(async () => {
    if (!getToken()) return;
    try {
      // Chatbot workspace is already scoped to its use_case slug — no need to
      // further filter by call_direction ('chat' may not be set on older agents).
      const bots = await listAgents({ use_case: slug });
      setAgents(bots);
      // Keep selection if still valid; otherwise pick first
      setSelectedId(prev => bots.find(a => a.id === prev) ? prev : (bots[0]?.id ?? null));
    } catch (e) { console.warn('reloadAgents failed', e); }
  }, [slug]);

  // Bootstrap — load agents on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (!getToken()) { setError('Not signed in'); setLoading(false); return; }

    let cancelled = false;
    (async () => {
      try {
        const bots = await listAgents({ use_case: slug });
        if (cancelled) return;
        setAgents(bots);
        if (bots.length > 0) setSelectedId(bots[0].id);
      } catch (e: any) {
        if (cancelled) return;
        setError(e instanceof ApiError
          ? `${e.status}: ${typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message)}`
          : (e?.message || 'Failed to load agents'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Load requirements + docs when selection changes
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setStatusOverride(null);
      try {
        const [reqRes, kbRes] = await Promise.allSettled([
          getRequirements(selectedId),
          listKnowledge(selectedId),
        ]);
        if (cancelled) return;
        if (reqRes.status === 'fulfilled') {
          const r = reqRes.value;
          setPromptText(r.requirements_text ?? '');
          setPersonaName(r.persona_name ?? '');
          setPersonaStyle(r.persona_style ?? 'professional');
          setBrandName(r.brand_name ?? '');
        }
        if (kbRes.status === 'fulfilled')  setDocs(kbRes.value);
      } catch (e) {
        console.warn('load agent data failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function createNewAgent(name: string) {
    const created = await createAgent({
      use_case_slug:  slug,
      name,
      call_direction: 'chat',
    } as any);
    setAgents(prev => [...prev, created]);
    setSelectedId(created.id);
  }

  async function removeAgent(id: string) {
    await deleteAgent(id);
    setAgents(prev => prev.filter(a => a.id !== id));
    setSelectedId(prev => {
      if (prev !== id) return prev;
      const remaining = agents.filter(a => a.id !== id);
      return remaining[0]?.id ?? null;
    });
  }

  async function onPublish() {
    if (!agent || publishing) return;
    setPublishing(true);
    try {
      const res = await publishAgent(agent.id);
      setStatusOverride(res.status);
      addToast(`${category} chatbot published!`, 'success');
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? (e as Error).message))
        : (e as Error).message;
      addToast(`Publish failed: ${msg}`, 'error');
    } finally {
      setPublishing(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AgentShell
      category={category}
      icon={icon}
      tint={tint}
      status={status}
      onPublish={onPublish}
      publishing={publishing}
      publishDisabled={!canPublish}
      publishHint={canPublish ? undefined : 'Save the requirements first — wait for them to compile, then publish.'}
    >
      {/* Error banner */}
      {error && (
        <div style={{
          background: 'rgba(255,90,120,0.10)', border: '1px solid rgba(255,90,120,0.40)',
          color: '#ff8194', padding: '12px 14px', borderRadius: 10,
          fontSize: 13, marginBottom: 16,
        }}>
          <strong>Couldn\'t load agents:</strong> {error}
        </div>
      )}

      {/* Empty state */}
      {!error && !loading && agents.length === 0 && (
        <div style={{
          background: 'rgba(117,91,227,0.08)', border: '1px solid rgba(117,91,227,0.30)',
          color: 'var(--text-1)', padding: '12px 14px', borderRadius: 10,
          fontSize: 13, marginBottom: 16,
        }}>
          No {category} agents yet. Click <strong>+ New agent</strong> below to create one.
        </div>
      )}

      {/* Agent picker */}
      <AgentPicker
        tint={tint}
        category={category}
        slug={slug}
        agents={agents}
        selectedId={agent?.id ?? null}
        onSelect={id => { setSelectedId(id); setStatusOverride(null); }}
        onCreate={createNewAgent}
        onDelete={removeAgent}
        onReload={reloadAgents}
      />

      {/* Embed URL after publish */}
      {widgetUrl && (
        <div style={{
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.35)',
          borderRadius: 10, padding: '12px 16px',
          marginBottom: 4,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4ade80' }}>
            ✓ {category} chatbot published — here\'s your hosted link
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code style={{
              flex: 1, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              padding: '6px 10px', fontSize: 12, color: 'var(--text-1)',
              overflowX: 'auto', whiteSpace: 'nowrap',
            }}>
              {widgetUrl}
            </code>
            <button
              onClick={() => { navigator.clipboard.writeText(widgetUrl); addToast('URL copied!', 'success'); }}
              style={{
                flexShrink: 0, background: 'rgba(74,222,128,0.15)',
                border: '1px solid rgba(74,222,128,0.35)', borderRadius: 7,
                color: '#4ade80', fontSize: 11, padding: '5px 12px', cursor: 'pointer',
              }}
            >
              Copy
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)' }}>
            Embed as an <code style={{ fontSize: 11 }}>&lt;iframe&gt;</code> or link directly from your website or the Candy frontend.
          </div>
        </div>
      )}

      {/* Main 2-column layout */}
      <div style={layoutStyle}>
        {/* Left column: KB + Prompt */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <KnowledgeBase
            tint={tint}
            agentId={agent?.id ?? null}
            docs={docs}
            refreshDocs={refreshDocs}
          />
          <PromptEditor
            tint={tint}
            agentId={agent?.id ?? null}
            value={promptText || defaultPrompt}
            onChange={setPromptText}
            presets={presets}
            supportedLanguageCodes={[]}
            multilingual={false}
            callDirection="outbound"
            onCallDirectionChange={() => {}}
            onSaved={reloadAgents}
            hideCallDirection
            personaName={personaName}
            onPersonaNameChange={setPersonaName}
            personaStyle={personaStyle}
            onPersonaStyleChange={setPersonaStyle}
            brandName={brandName}
            onBrandNameChange={setBrandName}
          />
        </div>

        {/* Right column: Chat test panel */}
        <ChatTestPanel
          tint={tint}
          agentId={agent?.id ?? null}
          disabled={!agent}
          disabledHint={!agent ? `Pick or create a ${category} agent above to start testing` : undefined}
        />
      </div>
    </AgentShell>
  );
}

const layoutStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 360px',
  gap: 20,
};
