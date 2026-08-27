/**
 * PlanGateNotice
 *
 * What a page shows when the backend said "not on your plan" (403), "out of
 * credits" (402) or "not with your role" (403) instead of failing. Those are
 * expected answers, not bugs — so this reads as information, never as an error.
 *
 * Usage:
 *   const gate = gateInfo(e);            // src/utils/apiError.ts
 *   if (gate) return <PlanGateNotice gate={gate} />;
 *   setError(errorMessage(e));           // real failure
 */
import { loadStoredUser } from '../api/auth';
import type { GateInfo } from '../utils/apiError';
import Icon from '../assets/icons';

const COPY: Record<GateInfo['kind'], { icon: string; title: string; hint: string }> = {
  plan: {
    icon:  'star',
    title: 'Not included in your plan',
    hint:  'Upgrade your plan to turn this on.',
  },
  credits: {
    icon:  'zap',
    title: 'Out of credits',
    hint:  'Add credits to keep using this workspace.',
  },
  role: {
    icon:  'lock',
    title: 'Your role can’t change this',
    hint:  'Ask a workspace admin to make the change for you.',
  },
};

export default function PlanGateNotice({ gate, compact }: { gate: GateInfo; compact?: boolean }) {
  const { icon, title, hint } = COPY[gate.kind];
  const user = loadStoredUser();
  // Prefer what the backend reported; fall back to the stored AuthUser.
  const context = gate.kind === 'role'
    ? (user?.role ? `Signed in as ${user.role}` : '')
    : (() => {
        const plan = gate.currentPlan || user?.plan_tier;
        return [plan && `Current plan: ${plan}`, gate.feature && `Feature: ${gate.feature}`]
          .filter(Boolean).join(' · ');
      })();

  return (
    // role="status" so screen readers announce it when it replaces the content.
    <div role="status" style={wrap(compact)}>
      <span style={{ color: 'var(--amber)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={compact ? 13 : 16} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: compact ? 12 : 13, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
        <div style={{ fontSize: compact ? 11 : 12, color: 'var(--text-3)', marginTop: 2 }}>
          {gate.message} {hint}
        </div>
        {context && (
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 3 }}>{context}</div>
        )}
      </div>
    </div>
  );
}

function wrap(compact?: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 9,
    padding: compact ? '7px 10px' : '11px 13px',
    borderRadius: 9,
    border: '1px solid rgba(255,193,7,0.32)',
    background: 'rgba(255,193,7,0.08)',
  };
}
