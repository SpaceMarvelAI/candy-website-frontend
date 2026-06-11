/**
 * LanguagePicker — multi-select chip list of languages, plus a "primary"
 * dropdown that becomes the agent's default `language_code`.
 *
 * Loads /v1/languages on mount, shows a friendly fallback if it fails (e.g.
 * empty languages table).
 */
import { useEffect, useRef, useState } from 'react';
import Icon from '../../assets/icons';
import { listLanguages, type Language } from '../../api/languages';
import { ApiError } from '../../api/client';

const tintColor = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)',
};

interface Props {
  tint?: keyof typeof tintColor;
  primary: string;
  onPrimaryChange: (code: string) => void;
  supported: string[];                        // language codes the agent supports
  onSupportedChange: (codes: string[]) => void;
  multilingual: boolean;
  onMultilingualChange: (v: boolean) => void;
}

function PrimaryDropdown({
  langs, value, onChange, disabled,
}: {
  langs: Language[];
  value: string;
  onChange: (code: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = langs.find(l => l.code === value);
  const label = selected ? `${selected.name} (${selected.code})` : value;

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 200 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          width: '100%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '8px 12px', borderRadius: 8,
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          color: disabled ? 'var(--text-3)' : 'var(--text-1)',
          fontSize: 13, cursor: disabled ? 'default' : 'pointer',
          outline: 'none',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <Icon name="arrowRight" size={12} style={{ flexShrink: 0, color: 'var(--text-3)', transform: open ? 'rotate(270deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 999,
            minWidth: '100%',
            background: 'var(--card-bg)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            overflowY: 'auto',
            maxHeight: 360, // ~10 items
          }}
        >
          {langs.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => { onChange(l.code); setOpen(false); }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 12px', border: 'none', borderRadius: 0,
                background: l.code === value ? 'var(--tint-1)' : 'transparent',
                color: l.code === value ? 'var(--text-1)' : 'var(--text-2)',
                fontSize: 13, cursor: 'pointer',
              }}
            >
              {l.name} <span style={{ opacity: 0.55 }}>({l.code})</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LanguagePicker({
  tint = 'purple',
  primary, onPrimaryChange,
  supported, onSupportedChange,
  multilingual, onMultilingualChange,
}: Props) {
  const [langs, setLangs] = useState<Language[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]     = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listLanguages();
        if (!cancelled) setLangs(list);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function toggleSupported(code: string) {
    const set = new Set(supported);
    if (set.has(code)) set.delete(code);
    else set.add(code);
    onSupportedChange(Array.from(set));
  }

  return (
    <section style={section}>
      <header style={sectionHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="layers" size={16} style={{ color: tintColor[tint] }} />
          <h3 style={sectionTitle}>Languages</h3>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
          {loading ? 'Loading…' : `${supported.length} selected`}
        </span>
      </header>

      {err && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
          Couldn't load languages: {err}
        </div>
      )}

      {/* Primary language */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ fontSize: 12, color: 'var(--text-2)' }}>Primary</label>
        <PrimaryDropdown
          langs={langs.length === 0 ? [{ code: primary, name: primary }] : langs}
          value={primary}
          onChange={onPrimaryChange}
          disabled={loading}
        />

        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--text-2)', marginLeft: 'auto',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={multilingual}
            onChange={e => onMultilingualChange(e.target.checked)}
            style={{ accentColor: 'var(--purple)' }}
          />
          Allow mid-call language switching
        </label>
      </div>

      {/* Supported languages */}
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>
        Supported (select all the languages this agent should handle):
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {loading && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Loading…</span>}
        {!loading && langs.length === 0 && !err && (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>No languages configured.</span>
        )}
        {langs.map(l => {
          const on = supported.includes(l.code);
          return (
            <button
              key={l.code}
              onClick={() => toggleSupported(l.code)}
              style={{
                fontSize: 11.5, padding: '6px 10px', borderRadius: 7,
                background: on ? `${tintColor[tint]}1f` : 'var(--card-bg)',
                border: `1px solid ${on ? tintColor[tint] : 'var(--border)'}`,
                color: on ? 'var(--text-1)' : 'var(--text-2)',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {on && <Icon name="check" size={10} />}
              {l.name} <span style={{ opacity: 0.6 }}>({l.code})</span>
            </button>
          );
        })}
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
