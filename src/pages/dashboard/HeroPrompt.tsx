import { useState } from 'react';
import Icon from '../../assets/icons';

const chips = [
  { icon: 'team',   label: 'Screen candidates',    prompt: 'Screen candidates for a Senior Frontend role' },
  { icon: 'money',  label: 'Collect payments',     prompt: 'Send payment reminders to overdue customers' },
  { icon: 'health', label: 'Book appointments',    prompt: 'Book follow-up appointments for clinic' },
  { icon: 'box',    label: 'Confirm deliveries',   prompt: 'Confirm deliveries for today\'s route' },
];

export default function HeroPrompt() {
  const [value, setValue] = useState('');

  return (
    <div
      style={{
        margin: '32px 0 40px',
        background: 'var(--hero-bg)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--radius-xl)',
        padding: 28,
      }}
    >
      <h3
        style={{
          fontSize: 20, fontWeight: 600, marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 10,
          color: 'var(--text-1)',
        }}
      >
        <span
          className="pulse-dot"
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--green)',
            flexShrink: 0,
          }}
        />
        Ask Metaspace AI
      </h3>
      <p style={{ color: 'var(--text-3)', fontSize: 13.5, marginBottom: 20 }}>
        Describe a workflow, upload a list, or launch a campaign — one prompt away.
      </p>

      {/* Prompt field */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--input-bg-strong)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          padding: '14px 16px',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--purple)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,113,227,0.12)'; }}
        onBlur={e  => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <div
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'var(--purple)',
            display: 'grid', placeItems: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="spark" size={14} />
        </div>
        <input
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="e.g. 'Call 200 candidates and screen for React experience'"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-1)', fontSize: 14.5,
          }}
        />
        <button
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--tint-3)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-1)', cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--purple)'; e.currentTarget.style.borderColor = 'transparent'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--tint-3)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
        >
          <Icon name="arrowRight" size={14} />
        </button>
      </div>

      {/* Suggestion chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {chips.map(chip => (
          <button
            key={chip.label}
            onClick={() => setValue(chip.prompt)}
            style={{
              padding: '7px 12px', borderRadius: 99,
              background: 'var(--tint-2)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-2)', fontSize: 12.5,
              cursor: 'pointer', transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,113,227,0.12)'; e.currentTarget.style.borderColor = 'var(--purple)'; e.currentTarget.style.color = 'var(--text-1)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--tint-2)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-2)'; }}
          >
            <Icon name={chip.icon} size={14} /> {chip.label}
          </button>
        ))}
      </div>
    </div>
  );
}
