import Icon from '../../assets/icons';
import { statsStrip } from '../../utils/mockData';

export default function StatsStrip() {
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16, marginBottom: 36,
      }}
    >
      {statsStrip.map((s, i) => (
        <div
          key={i}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 20px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div
            style={{
              fontSize: 12, color: 'var(--text-3)', marginBottom: 8,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Icon name={s.icon} size={14} />
            {s.label}
          </div>
          <div
            style={{
              fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em',
              display: 'flex', alignItems: 'baseline', gap: 8,
              color: 'var(--text-1)',
            }}
          >
            {s.value}
            <span
              style={{
                fontSize: 12, fontWeight: 600,
                color: s.up ? 'var(--green)' : 'var(--red)',
              }}
            >
              {s.delta}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
