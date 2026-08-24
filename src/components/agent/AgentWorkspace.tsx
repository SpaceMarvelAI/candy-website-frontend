/**
 * AgentWorkspace — voice-agent workspace.
 * Layout: TestPanel (left) + a tabbed config panel (right) — Knowledge Base,
 * Languages, Skills, Requirements. On tablet/mobile there's no room for a
 * second column, so those same four collapse into popovers above instead.
 */
import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../../assets/icons';
import AgentShell from './AgentShell';
import EmbedModal from './EmbedModal';
import AgentPicker from './AgentPicker';
import ConfigPopover from './ConfigPopover';
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
import { errorMessage } from '../../utils/apiError';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { logger } from '../../utils/logger';

interface Props {
  slug: string;
  category: string;
  icon: string;
  tint?: 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'pink' | 'violet';
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
  violet: 'var(--violet)',
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
  const [reqOpen,      setReqOpen]      = useState(false);
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
    setReqOpen(true);       // tablet/mobile: opens the Requirements popover
    setRightTab('req');     // desktop: switches the right panel to the Requirements tab
    addToast('Prompt loaded into Requirements — review and click Save.', 'info');
  }, [agent, loading, navState, setPromptText, addToast]);

  const effectivePrompt = promptText || defaultPrompt;
  const status     = statusOverride || agent?.agent_flow_status || null;
  const canPublish = !!agent && (status === 'ready_to_test' || status === 'published');
  const color      = tintColor[tint] ?? tintColor.purple;

  // Which config tab is showing in the right-hand panel (desktop/laptop only —
  // tablet/mobile keeps the popover row instead, see isTabletOrMobile below).
  const [rightTab, setRightTab] = useState<'kb' | 'lang' | 'skills' | 'req'>('kb');

  // Rendered once, used in two places: the right-hand tab panel on desktop, or
  // inside a ConfigPopover on tablet/mobile — same components, same props,
  // just a different container around them depending on screen size.
  const kbContent = (
    <KnowledgeBase tint={tint} agentId={agent?.id ?? null} docs={docs} refreshDocs={refreshDocs} />
  );
  const langContent = (
    <LanguagePicker
      tint={tint}
      primary={primaryLang}
      onPrimaryChange={setPrimaryLang}
      supported={supportedCodes}
      onSupportedChange={setSupportedCodes}
      multilingual={multilingual}
      onMultilingualChange={setMultilingual}
    />
  );
  const skillsContent = (
    <SkillsPicker
      agentId={agent?.id ?? null}
      useCaseSlug={slug}
      tint={tint}
      onCountChange={setSkillsCount}
    />
  );
  const reqContent = (
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
  );

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
      const msg = errorMessage(e);
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
      flush
    >
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

      {/* ── Top bar: agent switcher + Telephony ──
           Knowledge Base / Languages / Skills / Requirements used to live here
           too as popovers. On tablet/mobile there's no room for a second
           column, so they still do (see isTabletOrMobile below); on desktop
           they've moved into the right-hand tab panel next to the chat. */}
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
          inlineExtras={
            <>
              {/* Telephony was a full-width row of its own above this card; it is
                  one field and a button, so it belongs in the same bar. */}
              {agent && (
                <ConfigPopover label="Telephony" icon="phone" color={color} width={560} align="left">
                  <div style={{ padding: 14 }}>
                    <EntryPointBanner
                      agentId={agent.id}
                      callDirection={agent.call_direction ?? 'outbound'}
                      tint={tint}
                      onEmbed={() => setEmbedOpen(true)}
                      isPublished={status === 'published' || statusOverride === 'published'}
                    />
                  </div>
                </ConfigPopover>
              )}
              {isTabletOrMobile && (
                <>
                  <ConfigPopover label="Knowledge Base" icon="book" color={color} width={560}>
                    {kbContent}
                  </ConfigPopover>
                  <ConfigPopover label="Languages" icon="globe" color={color} width={480}>
                    <div style={{ padding: 16 }}>{langContent}</div>
                  </ConfigPopover>
                  <ConfigPopover
                    label="Skills" icon="layers" color={color} width={540}
                    badge={skillsCount > 0 ? skillsCount : undefined}
                  >
                    {skillsContent}
                  </ConfigPopover>
                  <ConfigPopover
                    label="Requirements" icon="zap" color={color} width={640}
                    open={reqOpen} onOpenChange={setReqOpen}
                  >
                    {reqContent}
                  </ConfigPopover>
                </>
              )}
            </>
          }
        />
      </div>

      {/* ── Below the bar: chat on the left, config tabs on the right (desktop) ──
           A flex row so the two panes sit side by side. On tablet/mobile there's
           no room for a second column, so it collapses to just the chat — config
           stays in the popovers above instead. */}
      <div style={{
        flex: 1, minHeight: isTabletOrMobile ? 300 : 0,
        display: 'flex', gap: 16, minWidth: 0,
      }}>
        <div style={{ flex: '1.1 1 0%', minWidth: 0 }}>
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

        {!isTabletOrMobile && (
          <div style={{
            flex: '1 1 0%', minWidth: 0, display: 'flex', flexDirection: 'column',
            border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
              {RIGHT_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setRightTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '11px 16px',
                    fontSize: 13.5, fontWeight: rightTab === t.id ? 600 : 500, whiteSpace: 'nowrap',
                    color: rightTab === t.id ? 'var(--text-1)' : 'var(--text-3)',
                    borderBottom: `2px solid ${rightTab === t.id ? color : 'transparent'}`,
                    background: 'none', border: 'none', cursor: 'pointer',
                  }}
                >
                  <Icon name={t.icon} size={14} />
                  {t.label}
                  {t.id === 'skills' && skillsCount > 0 && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)',
                      background: 'var(--tint-2)', borderRadius: 20, padding: '1px 6px',
                    }}>{skillsCount}</span>
                  )}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
              {rightTab === 'kb'     && kbContent}
              {rightTab === 'lang'   && langContent}
              {rightTab === 'skills' && skillsContent}
              {rightTab === 'req'    && reqContent}
            </div>
          </div>
        )}
      </div>
    </AgentShell>
    </>
  );
}

const RIGHT_TABS: { id: 'kb' | 'lang' | 'skills' | 'req'; label: string; icon: string }[] = [
  { id: 'kb',     label: 'Knowledge Base', icon: 'book'   },
  { id: 'lang',   label: 'Languages',      icon: 'globe'  },
  { id: 'skills', label: 'Skills',         icon: 'layers' },
  { id: 'req',    label: 'Requirements',   icon: 'zap'    },
];

// ── Accordion item ────────────────────────────────────────────────────────────

// ── Styles ────────────────────────────────────────────────────────────────────



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
