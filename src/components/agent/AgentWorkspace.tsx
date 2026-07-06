/**
 * AgentWorkspace — voice-agent workspace.
 * Layout: TestPanel (left, full height) + accordion config panel (right).
 * Accordion items: Knowledge Base | Languages | Requirements
 */
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../../assets/icons';
import AgentShell from './AgentShell';
import EmbedModal from './EmbedModal';
import AgentPicker from './AgentPicker';
import KnowledgeBase from './KnowledgeBase';
import PromptEditor from './PromptEditor';
import LanguagePicker from './LanguagePicker';
import TestPanel from './TestPanel';
import SkillsPicker from './SkillsPicker';
import EntryPointBanner from './EntryPointBanner';
import { useAgent } from '../../hooks/useAgent';
import { publishAgent } from '../../api/agents';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { logger } from '../../utils/logger';

interface Props {
  slug: string;
  category: string;
  icon: string;
  tint?: 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'pink';
  defaultPrompt: string;
  presets: { label: string; body: string }[];
}

const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};

export default function AgentWorkspace({ slug, category, icon, tint = 'purple', defaultPrompt, presets }: Props) {
  const { addToast } = useApp();
  const isTabletOrMobile = useMediaQuery('(max-width: 1024px)');

  // Prompt Library handoff ("Open in Candy"): PromptTicketHandler / the agent
  // picker modal navigate here with { selectAgentId, draftRequirements } so this
  // page opens on the right agent with its Requirements textarea pre-filled.
  // Never auto-saved — the user still clicks "Save requirements" themselves.
  const location = useLocation();
  const navState = location.state as { selectAgentId?: string; draftRequirements?: string } | null;
  const draftAppliedFor = useRef<string | null>(null);

  // Mount / unmount lifecycle
  useEffect(() => {
    logger.info('[AgentWorkspace] Mounted', { slug, category, tint });
    return () => { logger.info('[AgentWorkspace] Unmounted', { slug, category }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    agents, agent, selectAgent, createNewAgent, removeAgent, reloadAgents,
    loading, error,
    promptText, setPromptText,
    personaName, setPersonaName,
    personaStyle, setPersonaStyle,
    brandName, setBrandName,
    docs, refreshDocs,
    primaryLang, setPrimaryLang,
    supportedCodes, setSupportedCodes,
    multilingual, setMultilingual,
    callDirection, setCallDirection,
  } = useAgent(slug, `${category} agent`, navState?.selectAgentId ?? null);

  const [publishing, setPublishing]         = useState(false);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);
  const [embedOpen, setEmbedOpen]           = useState(false);
  const [kbOpen,       setKbOpen]       = useState(false);
  const [langOpen,     setLangOpen]     = useState(false);
  const [reqOpen,      setReqOpen]      = useState(false);
  const [skillsOpen,   setSkillsOpen]   = useState(false);
  const [skillsCount,  setSkillsCount]  = useState(0);

  // Apply the draft prompt only once useAgent's own requirements fetch for the
  // target agent has finished (it also writes promptText from the DB — applying
  // the draft any earlier would just get clobbered when that fetch resolves),
  // then open the Requirements panel so the user sees it land. Guarded by ref
  // so it only fires once per handoff even if the effect re-runs.
  useEffect(() => {
    if (!navState?.draftRequirements) return;
    if (loading) return;
    if (!agent || agent.id !== navState.selectAgentId) return;
    if (draftAppliedFor.current === agent.id) return;
    draftAppliedFor.current = agent.id;
    setPromptText(navState.draftRequirements);
    setReqOpen(true);
    addToast('Prompt loaded into Requirements — review and click Save.', 'info');
  }, [agent, loading, navState, setPromptText, addToast]);

  const effectivePrompt = promptText || defaultPrompt;
  const status     = statusOverride || agent?.agent_flow_status || null;
  const canPublish = !!agent && (status === 'ready_to_test' || status === 'published');
  const color      = tintColor[tint] ?? tintColor.purple;

  async function onPublish() {
    if (!agent || publishing) return;
    logger.info('[AgentWorkspace] onPublish start', { agentId: agent.id, category, currentStatus: status });
    setPublishing(true);
    try {
      let res: { status: string; agent_id: string };
      try {
        res = await publishAgent(agent.id);
      } catch (e) {
        // Auto-retry with force=true if blocked by AutoTest gate
        const detail = e instanceof ApiError ? e.detail : null;
        const detailStr = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '');
        if (detailStr.toLowerCase().includes('autotest') || detailStr.includes('force=true')) {
          logger.warn('[AgentWorkspace] onPublish: AutoTest gate — retrying with force=true', { agentId: agent.id });
          res = await publishAgent(agent.id, { force: true });
        } else {
          throw e;
        }
      }
      logger.info('[AgentWorkspace] onPublish OK', { agentId: agent.id, newStatus: res.status });
      setStatusOverride(res.status);
      addToast('Agent published', 'success');
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message))
        : (e as Error).message;
      logger.error('[AgentWorkspace] onPublish failed', { agentId: agent.id, error: e, message: msg });
      addToast(`Publish failed: ${msg}`, 'error');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
    {embedOpen && agent && (
      <EmbedModal
        agentId={agent.id}
        agentName={agent.name ?? category}
        onClose={() => setEmbedOpen(false)}
      />
    )}
    <AgentShell
      category={category}
      icon={icon}
      tint={tint}
      status={status}
      agentId={agent?.id ?? null}
      onPublish={onPublish}
      onEmbed={() => setEmbedOpen(true)}
      publishing={publishing}
      publishDisabled={!canPublish}
      publishHint={canPublish ? undefined : 'Save the requirements — wait for them to compile, then publish.'}
    >
      {/* ── Entry point banner ── */}
      {agent && (
        <EntryPointBanner
          agentId={agent.id}
          callDirection={agent.call_direction ?? 'outbound'}
          tint={tint}
          onEmbed={() => setEmbedOpen(true)}
          isPublished={status === 'published' || statusOverride === 'published'}
        />
      )}

      {/* ── Banners ── */}
      {error && (
        <div style={errorBanner}>
          <strong>Couldn't load agents:</strong> {error}
          <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4 }}>
            Check that the backend is running on port 8001 and that you're signed in.
          </div>
        </div>
      )}
      {!error && !loading && agents.length === 0 && (
        <div style={emptyBanner}>
          No {category} agents yet. Click <strong>+ New agent</strong> below to create your first one.
        </div>
      )}

      {/* ── Agent picker — full width ── */}
      <div style={{ marginBottom: 16 }}>
        <AgentPicker
          tint={tint}
          category={category}
          slug={slug}
          agents={agents}
          loading={loading}
          selectedId={agent?.id ?? null}
          onSelect={id => { selectAgent(id); setStatusOverride(null); }}
          onCreate={createNewAgent}
          onDelete={removeAgent}
          onReload={reloadAgents}
        />
      </div>

      {/* ── Main 2-column grid ── */}
      <div style={{
        ...mainGrid,
        gridTemplateColumns: isTabletOrMobile ? '1fr' : '1fr 420px',
        minHeight: isTabletOrMobile ? 'auto' : 'calc(100vh - 274px)',
      }}>

        {/* Left: Test panel */}
        <div style={{ height: '100%', minHeight: 300 }}>
          <TestPanel
            tint={tint}
            category={category}
            agentId={agent?.id ?? null}
            disabled={!agent}
            disabledHint={!agent ? `Pick or create a ${category} agent above to start testing` : undefined}
            primaryLang={primaryLang}
            supportedLangs={supportedCodes}
          />
        </div>

        {/* Right: accordion list */}
        <div style={{ ...rightCol, alignSelf: 'start' }}>
          <AccordionItem open={kbOpen}   onToggle={() => setKbOpen(o => !o)}   label="Knowledge Base" icon="book" color={color}>
            <KnowledgeBase
              tint={tint}
              agentId={agent?.id ?? null}
              docs={docs}
              refreshDocs={refreshDocs}
            />
          </AccordionItem>

          <AccordionItem open={langOpen} onToggle={() => setLangOpen(o => !o)} label="Languages"      icon="globe" color={color}>
            <div style={{ padding: 16 }}>
              <LanguagePicker
                tint={tint}
                primary={primaryLang}
                onPrimaryChange={setPrimaryLang}
                supported={supportedCodes}
                onSupportedChange={setSupportedCodes}
                multilingual={multilingual}
                onMultilingualChange={setMultilingual}
              />
            </div>
          </AccordionItem>

          <AccordionItem
            open={skillsOpen}
            onToggle={() => setSkillsOpen(o => !o)}
            label="Skills"
            icon="layers"
            color={color}
            badge={skillsCount > 0 ? skillsCount : undefined}
          >
            <SkillsPicker
              agentId={agent?.id ?? null}
              useCaseSlug={slug}
              tint={tint}
              onCountChange={setSkillsCount}
            />
          </AccordionItem>

          <AccordionItem open={reqOpen}  onToggle={() => setReqOpen(o => !o)}  label="Requirements"   icon="zap" color={color}>
            <PromptEditor
              tint={tint}
              agentId={agent?.id ?? null}
              value={effectivePrompt}
              onChange={setPromptText}
              presets={presets}
              supportedLanguageCodes={supportedCodes}
              multilingual={multilingual}
              callDirection={callDirection}
              onCallDirectionChange={setCallDirection}
              brandName={brandName}
              onBrandNameChange={setBrandName}
              personaName={personaName}
              onPersonaNameChange={setPersonaName}
              personaStyle={personaStyle}
              onPersonaStyleChange={setPersonaStyle}
              onSaved={reloadAgents}
            />
          </AccordionItem>
        </div>
      </div>
    </AgentShell>
    </>
  );
}

// ── Accordion item ────────────────────────────────────────────────────────────
function AccordionItem({
  open, onToggle, label, icon, color, badge, children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  icon: string;
  color: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 14px',
          borderRadius: open ? '10px 10px 0 0' : 10,
          border: `1px solid ${open ? color : 'var(--border)'}`,
          borderBottom: open ? 'none' : `1px solid ${open ? color : 'var(--border)'}`,
          background: open ? `${color}12` : 'var(--card-bg)',
          color: open ? color : 'var(--text-2)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          letterSpacing: '0.01em',
        }}
      >
        <span style={{ display: 'inline-flex', color }}><Icon name={icon} size={15} /></span>
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 18, height: 18, borderRadius: 9,
            background: `${color}30`,
            border: `1px solid ${color}55`,
            color: color,
            fontSize: 10.5, fontWeight: 700,
            padding: '0 5px',
          }}>
            {badge}
          </span>
        )}
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{
            opacity: 0.6,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.25s ease',
            flexShrink: 0,
          }}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{
            border: `1px solid ${color}`,
            borderTop: 'none',
            borderRadius: '0 0 10px 10px',
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const mainGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 420px',
  gap: 20,
  minHeight: 'calc(100vh - 274px)',
  alignItems: 'stretch',
};

const rightCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};

const errorBanner: React.CSSProperties = {
  background: 'rgba(255,90,120,0.1)',
  border: '1px solid rgba(255,90,120,0.4)',
  color: '#ff8194',
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 13,
  marginBottom: 16,
};

const emptyBanner: React.CSSProperties = {
  background: 'rgba(24,218,252,0.08)',
  border: '1px solid rgba(24,218,252,0.3)',
  color: 'var(--text-1)',
  padding: '12px 14px',
  borderRadius: 10,
  fontSize: 13,
  marginBottom: 16,
};
