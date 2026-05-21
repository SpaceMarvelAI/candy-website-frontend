import Icon from '../../assets/icons';
import { quickActions } from '../../utils/mockData';

export default function QuickActions() {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 24,
        backdropFilter: 'blur(20px)',
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-1)' }}>Quick actions</h3>
      </div>

      {quickActions.map((q, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 12, borderRadius: 10,
            background: 'var(--tint-1)',
            border: '1px solid var(--border)',
            marginBottom: 10,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--tint-2)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--tint-1)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
        >
          <div
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: 'var(--grad-brand-soft)',
              display: 'grid', placeItems: 'center',
              flexShrink: 0,
              color: 'var(--text-1)',
            }}
          >
            <Icon name={q.icon} size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{q.title}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{q.sub}</div>
          </div>
          <span
            style={{
              fontFamily: "'Zalando Sans'",
              fontSize: 10, padding: '2px 6px',
              border: '1px solid var(--border-strong)', borderRadius: 4,
              color: 'var(--text-3)',
            }}
          >
            ⌘ {q.key}
          </span>
        </div>
      ))}
    </div>
  );
}
