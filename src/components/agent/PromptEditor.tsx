/**
 * PromptEditor — requirements textarea.
 * Wired to POST /v1/agents/{agent_id}/requirements (the backend uses the
 * `requirements_text` to compile the agent's system prompt).
 *
 * The text + language settings come from the parent page's useAgent() hook so
 * other components (Publish button, LanguagePicker) stay in sync.
 */
import { useState } from 'react';
import Icon from '../../assets/icons';
import { saveRequirements } from '../../api/requirements';
import { ApiError } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { logger } from '../../utils/logger';

const tintColor = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)',
};

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'warm',         label: 'Warm & Friendly' },
  { value: 'empathetic',   label: 'Empathetic' },
  { value: 'concise',      label: 'Concise' },
  { value: 'formal',       label: 'Formal' },
];

interface Props {
  presets?: { label: string; body: string }[];
  tint?: keyof typeof tintColor;
  agentId: string | null;
  value: string;
  onChange: (s: string) => void;
  supportedLanguageCodes?: string[];
  multilingual?: boolean;
  callDirection?: 'inbound' | 'outbound' | 'both';
  onCallDirectionChange?: (d: 'inbound' | 'outbound' | 'both') => void;
  onSaved?: () => void;
  hideCallDirection?: boolean;
  /** Agent persona name shown to callers, e.g. "Priya" */
  personaName?: string;
  onPersonaNameChange?: (n: string) => void;
  /** Conversational style, e.g. "warm" */
  personaStyle?: string;
  onPersonaStyleChange?: (s: string) => void;
  /** Brand / client name override. Replaces the account company name in compiled prompts. */
  brandName?: string;
  onBrandNameChange?: (s: string) => void;
}

export default function PromptEditor({
  presets = [],
  tint = 'purple',
  agentId,
  value,
  onChange,
  supportedLanguageCodes = [],
  multilingual = false,
  callDirection = 'inbound',
  onCallDirectionChange,
  onSaved,
  hideCallDirection = false,
  personaName = '',
  onPersonaNameChange,
  personaStyle = 'professional',
  onPersonaStyleChange,
  brandName = '',
  onBrandNameChange,
}: Props) {
  const { addToast } = useApp();
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!agentId || busy) return;
    if (value.trim().length < 10) {
      addToast('Requirements are too short — at least 10 characters.', 'info');
      return;
    }
    logger.info('[PromptEditor] save start', {
      agentId, textLength: value.trim().length,
      multilingual, callDirection,
      personaName: personaName.trim() || '(unset)',
      brandName:   brandName.trim()   || '(unset)',
    });
    setBusy(true);
    const t0 = performance.now();
    try {
      const res = await saveRequirements(agentId, {
        requirements_text: value,
        multilingual,
        supported_language_codes: supportedLanguageCodes,
        call_direction: callDirection,
        ...(personaName.trim()  ? { persona_name:  personaName.trim()  } : {}),
        ...(personaStyle.trim() ? { persona_style: personaStyle.trim() } : {}),
        ...(brandName.trim()    ? { brand_name:    brandName.trim()    } : {}),
      });
      logger.info('[PromptEditor] save OK', {
        agentId,
        prompt_compile:    res.prompt_compile,
        agent_flow_status: res.agent_flow_status,
        elapsed:           `${(performance.now() - t0).toFixed(1)} ms`,
      });
      switch (res.prompt_compile) {
        case 'compiled':
          addToast('Requirements saved · agent ready to test', 'success');
          break;
        case 'compiling':
          addToast('Requirements saved · still compiling, give it a few seconds', 'info');
          break;
        case 'failed':
          addToast('Requirements saved but compile failed — check the backend log.', 'error');
          break;
        default:
          addToast('Requirements saved · compiling in background', 'success');
      }
      onSaved?.();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      logger.error('[PromptEditor] save failed', { agentId, error: e, message: msg });
      addToast(`Save failed: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={section}>
      <header style={sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="brain" size={16} style={{ color: tintColor[tint] }} />
          <h3 style={sectionTitle}>Requirements</h3>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {value.length.toLocaleString()} chars
        </span>
      </header>

      {/* Row 1: Agent name + Speaking style */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={fieldLabel}>Agent name</label>
          <input
            type="text"
            value={personaName}
            onChange={e => onPersonaNameChange?.(e.target.value)}
            placeholder="e.g. Aria, Priya, Alex…"
            style={fieldInput}
          />
        </div>
        <div>
          <label style={fieldLabel}>Speaking style</label>
          <select
            value={personaStyle}
            onChange={e => onPersonaStyleChange?.(e.target.value)}
            style={{ ...fieldInput, cursor: 'pointer' }}
          >
            {STYLE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Brand name — full width */}
      <div style={{ marginBottom: 12 }}>
        <label style={fieldLabel}>Company / Brand name</label>
        <input
          type="text"
          value={brandName}
          onChange={e => onBrandNameChange?.(e.target.value)}
          placeholder="e.g. SpaceMarvel, Trilife Hospital… (overrides account name in prompt)"
          style={fieldInput}
        />
      </div>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={9}
        placeholder="Describe what this agent should do, tone, what it must never do…"
        style={textarea}
      />

      {/* Call direction picker — hidden for chatbot agents */}
      {!hideCallDirection && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>Call direction</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['inbound', 'outbound', 'both'] as const).map(d => (
              <button
                key={d}
                onClick={() => onCallDirectionChange?.(d)}
                style={{
                  fontSize: 11.5,
                  padding: '5px 10px',
                  borderRadius: 7,
                  border: `1px solid ${callDirection === d ? tintColor[tint] : 'var(--border)'}`,
                  background: callDirection === d ? `${tintColor[tint]}22` : 'var(--card-bg)',
                  color: callDirection === d ? tintColor[tint] : 'var(--text-2)',
                  cursor: 'pointer',
                  fontWeight: callDirection === d ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
        {presets.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => onChange(p.body)}
                style={presetBtn}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : <span />}

        <button
          onClick={save}
          disabled={!agentId || busy}
          style={{
            ...saveBtn,
            opacity: !agentId || busy ? 0.6 : 1,
            cursor: !agentId || busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Saving…' : 'Save requirements'}
        </button>
      </div>
    </section>
  );
}

const section = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 22,
};
const sectionHeader = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  marginBottom: 14,
};
const sectionTitle = { fontSize: 14, fontWeight: 600, color: 'var(--text-1)', margin: 0 };
const textarea = {
  width: '100%',
  background: 'var(--input-bg-strong)',
  border: '1px solid var(--border-strong)',
  borderRadius: 10,
  padding: '14px 16px',
  fontSize: 13.5,
  fontFamily: "'Zalando Sans'",
  lineHeight: 1.55,
  color: 'var(--text-1)',
  outline: 'none',
  resize: 'vertical' as const,
  minHeight: 180,
};
const fieldLabel = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-3)',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.04em',
  marginBottom: 5,
};
const fieldInput = {
  width: '100%',
  background: 'var(--input-bg-strong)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text-1)',
  outline: 'none',
  boxSizing: 'border-box' as const,
};
const presetBtn = {
  fontSize: 11.5, padding: '6px 10px',
  borderRadius: 7,
  background: 'var(--card-bg)',
  border: '1px solid var(--border)',
  color: 'var(--text-2)', cursor: 'pointer',
  transition: 'all 0.15s',
};
const saveBtn = {
  fontSize: 12.5, fontWeight: 600,
  padding: '8px 14px', borderRadius: 9,
  background: 'var(--grad-brand)',
  color: '#fff', border: 'none',
  boxShadow: '0 4px 12px -4px rgba(117,91,227,0.5)',
  transition: 'all 0.15s',
};
