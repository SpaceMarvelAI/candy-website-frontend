import Icon from '../../assets/icons';

const statusStyles = {
  completed:   { bg: 'rgba(76,175,80,0.12)',    color: 'var(--green)',      dot: 'var(--green)' },
  declined:    { bg: 'rgba(255,92,122,0.12)',    color: 'var(--red)',        dot: 'var(--red)' },
  noanswer:    { bg: 'rgba(180,180,200,0.1)',    color: 'var(--text-2)',     dot: 'var(--text-2)' },
  rescheduled: { bg: 'rgba(255,181,71,0.12)',    color: 'var(--amber)',      dot: 'var(--amber)' },
  inprogress:  { bg: 'rgba(24,218,252,0.12)',    color: 'var(--blue)',       dot: 'var(--blue)',  pulse: true },
  followup:    { bg: 'rgba(117,91,227,0.15)',    color: 'var(--purple-hi)',  dot: 'var(--purple-hi)' },
};

export default function CallTable({ calls, flashIds }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
      }}
    >
      {/* Table head */}
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3
          style={{
            fontSize: 15, fontWeight: 600, color: 'var(--text-1)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}
        >
          Live call log
          <span
            className="live-badge"
            style={{
              display: 'inline-flex', alignItems: 'center',
              padding: '4px 10px', borderRadius: 99,
              background: 'rgba(76,175,80,0.12)', color: 'var(--green)',
              fontSize: 11, fontWeight: 600,
            }}
          >
            LIVE
          </span>
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { icon: 'pause', label: 'Pause campaign' },
            { icon: 'more', label: '' },
          ].map(({ icon, label }) => (
            <button
              key={icon}
              style={{
                padding: '7px 12px', borderRadius: 8,
                background: 'var(--tint-2)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-2)', cursor: 'pointer',
                fontSize: 12.5, transition: 'all 0.15s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <Icon name={icon} size={12} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Candidate', 'Phone', 'Status', 'Outcome', 'Duration', 'Actions'].map((h, i) => (
              <th
                key={h}
                style={{
                  textAlign: i === 5 ? 'right' : 'left',
                  padding: '12px 22px',
                  color: 'var(--text-3)',
                  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.12em',
                  fontWeight: 500,
                  background: 'var(--surface-soft)',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {calls.map(c => {
            const ss = statusStyles[c.status] ?? statusStyles.noanswer;
            const isFlash = flashIds?.has(c.id);
            return (
              <tr
                key={c.id}
                className={isFlash ? 'row-flash' : ''}
                style={{
                  borderBottom: '1px solid var(--border)',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--tint-1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* Candidate */}
                <td style={{ padding: '14px 22px', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: c.avatarColor,
                        display: 'grid', placeItems: 'center',
                        fontSize: 12, fontWeight: 600, color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {c.initials}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.role}</div>
                    </div>
                  </div>
                </td>

                {/* Phone */}
                <td
                  style={{
                    padding: '14px 22px', verticalAlign: 'middle',
                    color: 'var(--text-2)',
                    fontFamily: "'Zalando Sans'", fontSize: 12.5,
                  }}
                >
                  {c.phone}
                </td>

                {/* Status */}
                <td style={{ padding: '14px 22px', verticalAlign: 'middle' }}>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '4px 10px', borderRadius: 99,
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
                      background: ss.bg, color: ss.color,
                    }}
                  >
                    <span
                      className={ss.pulse ? 'pulse-dot-xs' : ''}
                      style={{
                        display: 'inline-block',
                        width: 6, height: 6, borderRadius: '50%',
                        background: ss.dot, marginRight: 6,
                      }}
                    />
                    {c.statusTxt}
                  </span>
                </td>

                {/* Outcome */}
                <td style={{ padding: '14px 22px', verticalAlign: 'middle', color: 'var(--text-2)', fontSize: 12.5 }}>
                  {c.outcome}
                </td>

                {/* Duration */}
                <td
                  style={{
                    padding: '14px 22px', verticalAlign: 'middle',
                    color: 'var(--text-3)', fontSize: 12,
                    fontFamily: "'Zalando Sans'",
                  }}
                >
                  {c.duration === 'live'
                    ? <span style={{ color: 'var(--blue)' }}>● live</span>
                    : c.duration}
                </td>

                {/* Actions */}
                <td style={{ padding: '14px 22px', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    {[
                      { icon: 'play', tip: 'Play recording' },
                      { icon: 'file', tip: 'Call details' },
                      { icon: 'more', tip: '' },
                    ].map(({ icon, tip }) => (
                      <button
                        key={icon}
                        className={tip ? 'tooltip-wrap' : ''}
                        data-tip={tip}
                        style={{
                          width: 28, height: 28, borderRadius: 7,
                          background: 'transparent',
                          border: '1px solid transparent',
                          color: 'var(--text-3)', cursor: 'pointer',
                          display: 'grid', placeItems: 'center',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; e.currentTarget.style.background = 'var(--tint-3)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                      >
                        <Icon name={icon} size={12} />
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
