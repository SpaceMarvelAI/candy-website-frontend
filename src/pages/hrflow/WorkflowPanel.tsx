import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

const screeningSteps = [
  'Introduction + confirm interest',
  'Years of React experience',
  'TypeScript proficiency',
  'System design scenario',
  'Salary & notice period',
  'Q&A and next steps',
];

export default function WorkflowPanel() {
  const { showView, setActiveNav, currentView } = useApp();
  const [progress,   setProgress]   = useState(57);
  const [completed,  setCompleted]  = useState(94);
  const [inProgress, setInProgress] = useState(12);
  const [declined,   setDeclined]   = useState(14);
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      if (currentView !== 'hr') return;
      setProgress(p => {
        if (p >= 92) return p;
        const np = p + Math.random() * 2;
        const calls = Math.floor((np / 100) * 248);
        setCompleted(Math.floor(calls * 0.66));
        setInProgress(Math.floor(calls * 0.08));
        setDeclined(Math.floor(calls * 0.10));
        return np;
      });
    }, 2200);
    return () => clearInterval(timerRef.current);
  }, [currentView]);

  const callsVal = Math.floor((progress / 100) * 248);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Uploaded file */}
      <WfCard title="Uploaded file" titleIcon="file" badge="done" badgeLabel="Parsed">
        <div
          style={{
            background: 'var(--input-bg)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius)',
            padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(76,175,80,0.15)', color: 'var(--green)',
                display: 'grid', placeItems: 'center',
              }}
            >
              <Icon name="file" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>senior_frontend_candidates.xlsx</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>248 rows · 6 columns · 142 KB</div>
            </div>
          </div>
          <table style={{ fontSize: 11.5, width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Name', 'Role', 'Phone'].map(h => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left', padding: '7px 8px',
                      background: 'var(--tint-2)',
                      color: 'var(--text-3)', fontWeight: 500,
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Aarav Sharma', 'Senior Frontend', '+91 98210 …'],
                ['Priya Iyer',   'Full-stack Dev',  '+91 99845 …'],
                ['Rohan Menon',  'Senior Frontend', '+91 90452 …'],
              ].map(([name, role, phone], i) => (
                <tr key={i}>
                  {[name, role, phone].map((v, j) => (
                    <td key={j} style={{ padding: '7px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-2)' }}>{v}</td>
                  ))}
                </tr>
              ))}
              <tr>
                <td colSpan={3} style={{ padding: '7px 8px', color: 'var(--text-4)', fontSize: 11.5 }}>+ 245 more rows</td>
              </tr>
            </tbody>
          </table>
        </div>
      </WfCard>

      {/* Live campaign progress */}
      <WfCard title="Live campaign" titleIcon="broadcast" badge="running" badgeLabel="Running">
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 8 }}>
          <span style={{ color: 'var(--text-3)' }}>Calls initiated</span>
          <span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{callsVal} / 248</span>
        </div>
        {/* Progress bar */}
        <div
          style={{
            width: '100%', height: 6, borderRadius: 99,
            background: 'var(--tint-2)', overflow: 'hidden', position: 'relative',
          }}
        >
          <div
            className="progress-shimmer"
            style={{
              height: '100%', borderRadius: 99,
              background: 'var(--grad-brand)',
              width: `${progress}%`,
              position: 'relative',
              transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />
        </div>
        {/* Counters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 14 }}>
          {[
            { val: completed,  color: 'var(--green)',     label: 'Completed' },
            { val: inProgress, color: null,               label: 'In Progress' },
            { val: declined,   color: 'var(--red)',       label: 'Declined' },
          ].map(({ val, color, label }) => (
            <div
              key={label}
              style={{
                background: 'var(--surface-soft)',
                border: '1px solid var(--border)',
                borderRadius: 10, padding: 12, textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em',
                  background: color ?? 'var(--grad-brand)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {val}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {label}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => { setActiveNav('voice'); showView('live'); }}
          style={{
            width: '100%', marginTop: 16,
            padding: 12, borderRadius: 10,
            background: 'rgba(117,91,227,0.15)',
            border: '1px solid var(--border-accent)',
            color: 'var(--text-1)', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(117,91,227,0.25)'; e.currentTarget.style.borderColor = 'var(--purple)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(117,91,227,0.15)'; e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
        >
          Open live dashboard <Icon name="arrowRight" size={14} />
        </button>
      </WfCard>

      {/* Screening script */}
      <WfCard title="Screening script" titleIcon="brain" editBtn>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {screeningSteps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: 'var(--text-2)' }}>
              <div
                style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'rgba(117,91,227,0.15)', color: 'var(--purple-hi)',
                  display: 'grid', placeItems: 'center',
                  fontSize: 11, fontWeight: 600, flexShrink: 0,
                }}
              >
                {i + 1}
              </div>
              {step}
            </div>
          ))}
        </div>
      </WfCard>
    </div>
  );
}

// Reusable card wrapper
function WfCard({ title, titleIcon, badge, badgeLabel, editBtn, children }: {
  title: string; titleIcon: string; badge?: string; badgeLabel?: string; editBtn?: boolean; children?: any;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: 22,
        backdropFilter: 'blur(20px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h4
          style={{
            fontSize: 14.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--text-1)',
          }}
        >
          <Icon name={titleIcon} size={16} style={{ color: 'var(--purple-hi)' }} />
          {title}
        </h4>
        {badge && (
          <span
            className={badge === 'running' ? 'status-badge-running' : ''}
            style={{
              fontSize: 10.5, padding: '3px 9px', borderRadius: 99,
              fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase',
              background: badge === 'running' ? 'rgba(24,218,252,0.15)' : 'rgba(76,175,80,0.15)',
              color: badge === 'running' ? 'var(--blue)' : 'var(--green)',
            }}
          >
            {badgeLabel}
          </span>
        )}
        {editBtn && (
          <button
            style={{
              padding: '4px 8px', borderRadius: 7,
              background: 'var(--tint-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer',
              fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5,
            }}
          >
            Edit
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
