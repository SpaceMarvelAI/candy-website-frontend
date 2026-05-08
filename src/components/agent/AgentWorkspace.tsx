/**
 * AgentWorkspace — the body that every industry page (Ecommerce, Financial,
 * Logistics, Healthcare, Marketing) renders inside an AgentShell. Encapsulates
 * the find-or-create-agent flow plus the wiring of KnowledgeBase / PromptEditor
 * / LanguagePicker / TestPanel to the real backend.
 */
import { useState } from 'react';
import AgentShell from './AgentShell';
import AgentPicker from './AgentPicker';
import KnowledgeBase from './KnowledgeBase';
import PromptEditor from './PromptEditor';
import LanguagePicker from './LanguagePicker';
import TestPanel from './TestPanel';
import { useAgent } from '../../hooks/useAgent';
import { publishAgent } from '../../api/agents';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';

interface Props {
  slug: string;            // 'ecom' / 'fin' / 'log' / 'health' / 'mkt' / 'hr'
  category: string;        // Display name e.g. 'E-commerce'
  icon: string;
  tint?: 'purple' | 'blue' | 'teal' | 'green' | 'amber' | 'pink';
  defaultPrompt: string;
  presets: { label: string; body: string }[];
}

export default function AgentWorkspace({ slug, category, icon, tint, defaultPrompt, presets }: Props) {
  const { addToast } = useApp();
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
  } = useAgent(slug, `${category} agent`);

  const [publishing, setPublishing] = useState(false);
  const [statusOverride, setStatusOverride] = useState<string | null>(null);

  const effectivePrompt = promptText || defaultPrompt;

  const status = statusOverride || agent?.agent_flow_status || null;
  const canPublish = !!agent && (status === 'ready_to_test' || status === 'published');

  async function onPublish() {
    if (!agent || publishing) return;
    setPublishing(true);
    try {
      const res = await publishAgent(agent.id);
      setStatusOverride(res.status);
      addToast('Agent published', 'success');
    } catch (e) {
      const msg = e instanceof ApiError
        ? (typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message))
        : (e as Error).message;
      addToast(`Publish failed: ${msg}`, 'error');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <AgentShell
      category={category}
      icon={icon}
      tint={tint}
      status={status}
      onPublish={onPublish}
      publishing={publishing}
      publishDisabled={!canPublish}
      publishHint={canPublish ? undefined : 'Save the requirements — wait for them to compile, then publish.'}
    >
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(255,90,120,0.1)',
            border: '1px solid rgba(255,90,120,0.4)',
            color: '#ff8194',
            padding: '12px 14px', borderRadius: 10,
            fontSize: 13, marginBottom: 16,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}
        >
          <div><strong>Couldn't load agents:</strong> {error}</div>
          <div style={{ fontSize: 11.5, opacity: 0.85 }}>
            Check that the Candy-Agents backend is running on port 8001 and that you're signed in. Open the browser devtools → Network tab to see the failing request.
          </div>
        </div>
      )}

      {!error && !loading && agents.length === 0 && (
        <div
          style={{
            background: 'rgba(24,218,252,0.08)',
            border: '1px solid rgba(24,218,252,0.3)',
            color: 'var(--text-1)',
            padding: '12px 14px', borderRadius: 10,
            fontSize: 13, marginBottom: 16,
          }}
        >
          No {category} agents yet. Click <strong>+ New agent</strong> below to create your first one.
        </div>
      )}

      <AgentPicker
        tint={tint}
        category={category}
        slug={slug}
        agents={agents}
        selectedId={agent?.id ?? null}
        onSelect={selectAgent}
        onCreate={createNewAgent}
        onDelete={removeAgent}
        onReload={reloadAgents}
      />

      <div style={layout}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <KnowledgeBase
            tint={tint}
            agentId={agent?.id ?? null}
            docs={docs}
            refreshDocs={refreshDocs}
          />
          <LanguagePicker
            tint={tint}
            primary={primaryLang}
            onPrimaryChange={setPrimaryLang}
            supported={supportedCodes}
            onSupportedChange={setSupportedCodes}
            multilingual={multilingual}
            onMultilingualChange={setMultilingual}
          />
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
        </div>
        <TestPanel
          tint={tint}
          category={category}
          agentId={agent?.id ?? null}
          disabled={!agent}
          disabledHint={!agent ? 'Pick or create an agent above to start testing' : undefined}
          primaryLang={primaryLang}
          supportedLangs={supportedCodes}
        />
      </div>
    </AgentShell>
  );
}

const layout = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20 };
