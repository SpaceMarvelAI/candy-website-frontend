import { Component, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../assets/icons';
import { ApiError } from '../../api/client';
import { SkeletonTable, SkeletonCard } from '../../components/Skeleton';
import {
  getAnalyticsSummary,
  getAnalyticsSessions,
  getAnalyticsLatency,
  getAnalyticsKnowledgeGaps,
  getAnalyticsLanguages,
  getAnalyticsAgents,
  getAnalyticsEvents,
  type AnalyticsSummary,
  type AnalyticsSession,
  type AnalyticsLatency,
  type KnowledgeGap,
  type LanguageStat,
  type AgentStat,
  type AnalyticsEvent,
} from '../../api/analytics';

// ── Error boundary — prevents a single tab crash from blanking the whole page ─
class TabErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { error: err.message };
  }
  componentDidCatch(err: Error) {
    console.error('[analytics tab]', err);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            background: 'rgba(255,90,120,0.08)',
            border: '1px solid rgba(255,90,120,0.3)',
            borderRadius: 12, padding: '18px 20px',
            color: 'var(--text-2)', fontSize: 13,
          }}
        >
          <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>Failed to render this view</div>
          <code style={{ fontSize: 12, fontFamily: "'Zalando Sans'", color: 'var(--text-3)' }}>
            {this.state.error}
          </code>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                fontSize: 12, padding: '5px 12px', borderRadius: 7,
                background: 'var(--tint-2)', border: '1px solid var(--border)',
                color: 'var(--text-2)', cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Tab = 'summary' | 'sessions' | 'latency' | 'knowledge-gaps' | 'languages' | 'agents' | 'events';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'summary',        label: 'Summary',        icon: 'chart'  },
  { key: 'sessions',       label: 'Sessions',       icon: 'chat'   },
  { key: 'latency',        label: 'Latency',        icon: 'health' },
  { key: 'knowledge-gaps', label: 'Knowledge Gaps', icon: 'brain'  },
  { key: 'languages',      label: 'Languages',      icon: 'layers' },
  { key: 'agents',         label: 'Agents',         icon: 'team'   },
  { key: 'events',         label: 'Events',         icon: 'bell'   },
];

function fmt(v: number | null | undefined, decimals = 0, suffix = ''): string {
  if (v == null) return '—';
  return v.toFixed(decimals) + suffix;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${(v * 100).toFixed(1)}%`;
}

// ── Stat card used on the Summary tab ────────────────────────────────────────
function StatCard({ label, value, sub, accent }: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        backdropFilter: 'blur(20px)',
      }}
    >
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: accent || 'var(--text-1)' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{sub}</div>
      )}
    </div>
  );
}

// ── Empty / loading shared states ─────────────────────────────────────────────
function LoadingRow() {
  return <SkeletonTable rows={6} cols={['20%', '14%', '10%', '12%', '12%', '14%', '14%']} />;
}
function EmptyRow({ msg }: { msg: string }) {
  return <div style={{ padding: '28px 22px', color: 'var(--text-3)', fontSize: 13 }}>{msg}</div>;
}

// ── Shared table container ────────────────────────────────────────────────────
function TableCard({ title, children }: { title: string; children: React.ReactNode }) {
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
      <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  padding: '12px 22px',
  color: 'var(--text-3)',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  fontWeight: 500,
  background: 'var(--surface-soft)',
  borderBottom: '1px solid var(--border)',
};
const TD_STYLE: React.CSSProperties = {
  padding: '14px 22px',
  color: 'var(--text-2)',
  fontSize: 13,
  borderBottom: '1px solid var(--border)',
};
const MONO: React.CSSProperties = {
  fontFamily: "'Zalando Sans'",
  fontSize: 12.5,
};

// All known scalar fields → stat cards (order determines display priority)
const SUMMARY_SCALAR_FIELDS: {
  key: keyof AnalyticsSummary;
  label: string;
  format?: (v: unknown) => string;
  accent?: string;
}[] = [
  { key: 'total_sessions',    label: 'Total Sessions',     accent: 'var(--purple-hi)'                          },
  { key: 'total_messages',    label: 'Total Messages'                                                           },
  { key: 'total_agents',      label: 'Active Agents'                                                            },
  { key: 'completed',         label: 'Completed',          accent: 'var(--green)'                              },
  { key: 'abandoned',         label: 'Abandoned'                                                                },
  { key: 'escalated_proxy',   label: 'Escalated (Proxy)'                                                        },
  { key: 'success_rate',      label: 'Success Rate',       format: v => fmtPct(v as number), accent: 'var(--green)'  },
  { key: 'escalation_rate',   label: 'Escalation Rate',    format: v => fmtPct(v as number), accent: 'var(--amber)'  },
  { key: 'avg_turns',         label: 'Avg Turns',          format: v => fmt(v as number, 1)                    },
  { key: 'avg_rating',        label: 'Avg Rating',         format: v => fmt(v as number, 2), accent: 'var(--blue)'   },
  { key: 'avg_latency_ms',    label: 'Avg Latency',        format: v => fmtMs(v as number),  accent: 'var(--blue)'   },
  { key: 'latency_p50_ms',    label: 'Latency p50',        format: v => fmtMs(v as number)                     },
  { key: 'latency_p95_ms',    label: 'Latency p95',        format: v => fmtMs(v as number),  accent: 'var(--amber)'  },
  { key: 'latency_p99_ms',    label: 'Latency p99',        format: v => fmtMs(v as number),  accent: 'var(--red)'    },
  { key: 'knowledge_gap_rate',label: 'Knowledge Gap Rate', format: v => fmtPct(v as number), accent: 'var(--amber)'  },
  { key: 'window_days',       label: 'Window (days)'                                                            },
  { key: 'top_language',      label: 'Top Language',       format: v => String(v || '—').toUpperCase()         },
];

// Fields that are arrays/objects — rendered as collapsible code blocks
const COMPLEX_FIELDS = new Set(['sessions_by_day', 'top_failing_agents']);

// Fields handled by stat cards or shown separately — excluded from the "extra" strip
const STAT_FIELD_KEYS = new Set(SUMMARY_SCALAR_FIELDS.map(f => f.key as string));
const META_FIELDS     = new Set(['period_start', 'period_end']);

function renderScalar(v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

// ── Sessions by day bar chart ─────────────────────────────────────────────────
function SessionsByDayChart({ rows }: { rows: { date: string; sessions: number }[] }) {
  const max = Math.max(1, ...rows.map(r => r.sessions));
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Sessions by Day</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{rows.length} days</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.date} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 88, fontSize: 11.5, color: 'var(--text-3)',
                fontFamily: "'Zalando Sans'", flexShrink: 0,
              }}
            >
              {r.date}
            </div>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--tint-2)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${(r.sessions / max) * 100}%`,
                  height: '100%',
                  background: 'var(--grad-brand)',
                  borderRadius: 99,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <div
              style={{
                width: 36, fontSize: 12.5, fontWeight: 600,
                color: 'var(--text-1)', textAlign: 'right', flexShrink: 0,
                fontFamily: "'Zalando Sans'",
              }}
            >
              {r.sessions}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Generic object array table (used for top_failing_agents & unknown arrays) ─
function ObjectArrayTable({ label, rows }: { label: string; rows: Record<string, unknown>[] }) {
  if (rows.length === 0) return null;
  const cols = Object.keys(rows[0]);

  function cellValue(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(3);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }

  // Heuristic: is this column a "rate" / "score" that should be colored?
  function accentColor(col: string, v: unknown): string | undefined {
    if (typeof v !== 'number') return undefined;
    const c = col.toLowerCase();
    if (c.includes('fail') || c.includes('error') || c.includes('abandon')) return v > 0 ? 'var(--red)' : undefined;
    if (c.includes('success') || c.includes('complet')) return 'var(--green)';
    if (c.includes('rate') || c.includes('pct') || c.includes('percent')) return 'var(--amber)';
    return undefined;
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
          {label.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--text-4)' }}>{rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {cols.map(col => (
                <th
                  key={col}
                  style={{
                    textAlign: 'left', padding: '10px 18px',
                    color: 'var(--text-3)', fontSize: 10.5,
                    textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 500,
                    background: 'var(--surface-soft)', borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {col.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                {cols.map(col => {
                  const v = row[col];
                  const accent = accentColor(col, v);
                  const isNameCol = col === 'agent_name' || col === 'name';
                  return (
                    <td
                      key={col}
                      style={{
                        padding: '12px 18px',
                        color: accent || (isNameCol ? 'var(--text-1)' : 'var(--text-2)'),
                        fontWeight: isNameCol ? 600 : 400,
                        fontFamily: typeof v === 'number' ? "'Zalando Sans'" : undefined,
                        fontSize: 12.5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {cellValue(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab: Summary ──────────────────────────────────────────────────────────────
function SummaryView({ data, loading }: { data: AnalyticsSummary | null; loading: boolean }) {
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
        {[0, 1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
        <SkeletonTable rows={7} cols={['18%', '10%', '8%', '10%', '10%', '12%', '12%']} />
      </div>
    </div>
  );
  if (!data)   return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No summary data available.</div>;

  // Build stat cards only for fields that are present and non-null in the response
  const statCards = SUMMARY_SCALAR_FIELDS
    .filter(f => data[f.key] != null)
    .map(f => ({
      label:  f.label,
      value:  f.format ? f.format(data[f.key]) : fmt(data[f.key] as number),
      accent: f.accent,
    }));

  const period = data.period_start
    ? `${fmtTime(data.period_start)} → ${fmtTime(data.period_end)}`
    : null;

  // Extra primitive fields (not in stat cards, not complex, not meta)
  const extraPrimitives = Object.entries(data).filter(([k, v]) =>
    !STAT_FIELD_KEYS.has(k) && !COMPLEX_FIELDS.has(k) && !META_FIELDS.has(k) &&
    (v == null || typeof v !== 'object')
  );

  // Complex array/object fields
  const complexEntries = Object.entries(data).filter(([k, v]) =>
    COMPLEX_FIELDS.has(k) || (typeof v === 'object' && v !== null && !META_FIELDS.has(k) && !STAT_FIELD_KEYS.has(k))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {period && (
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Period: {period}</div>
      )}

      {/* Primary stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 }}>
        {statCards.map(c => <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />)}
      </div>

      {/* Extra scalar fields */}
      {extraPrimitives.length > 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '14px 18px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px 24px',
          }}
        >
          {extraPrimitives.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)' }}>
                {k.replace(/_/g, ' ')}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: "'Zalando Sans'" }}>
                {renderScalar(v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Complex / array fields — rendered as proper UI */}
      {complexEntries.map(([k, v]) => {
        const rows = Array.isArray(v) ? v : [v];
        if (k === 'sessions_by_day' && rows.length > 0 && (rows[0] as any)?.date != null) {
          return (
            <SessionsByDayChart
              key={k}
              rows={rows as { date: string; sessions: number }[]}
            />
          );
        }
        // Generic table for any array of objects (top_failing_agents, etc.)
        if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] !== null) {
          return (
            <ObjectArrayTable
              key={k}
              label={k}
              rows={rows as Record<string, unknown>[]}
            />
          );
        }
        return null;
      })}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--green)',
  abandoned: 'var(--red)',
  active:    'var(--blue)',
  escalated: 'var(--amber)',
};

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span style={{ color: 'var(--text-4)' }}>—</span>;
  const color = STATUS_COLOR[status.toLowerCase()] ?? 'var(--text-3)';
  return (
    <span style={{
      fontSize: 10.5, padding: '2px 9px', borderRadius: 99, fontWeight: 600,
      background: `${color.replace('var(', 'rgba(').replace('--green)', '76,175,80, 0.14)').replace('--red)', '255,92,122, 0.12)').replace('--blue)', '24,218,252, 0.12)').replace('--amber)', '255,181,71, 0.12)').replace('--text-3)', '255,255,255, 0.06)')}`,
      color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {status}
    </span>
  );
}

// ── Tab: Sessions ─────────────────────────────────────────────────────────────
const SESSIONS_PER_PAGE = 20;

function SessionsView({ data, loading }: { data: AnalyticsSession[]; loading: boolean }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / SESSIONS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const slice      = data.slice((safePage - 1) * SESSIONS_PER_PAGE, safePage * SESSIONS_PER_PAGE);

  return (
    <TableCard title={`${data.length} session${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No sessions recorded yet." />
      ) : (
        <>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr>
                {['Agent', 'Type', 'Turns', 'Status', 'Rating', 'Started', 'Ended'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((s, idx) => (
                <tr key={s.id ?? idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={TD_STYLE}>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{s.agent_name || '—'}</div>
                  </td>
                  <td style={TD_STYLE}>
                    {s.session_type ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(117,91,227,0.12)', color: 'var(--purple-hi)', fontWeight: 600 }}>
                        {s.session_type}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{s.turn_count ?? '—'}</td>
                  <td style={TD_STYLE}><StatusPill status={s.status} /></td>
                  <td style={{ ...TD_STYLE, ...MONO }}>
                    {s.feedback_rating != null ? (
                      <span style={{ color: s.feedback_rating >= 4 ? 'var(--green)' : s.feedback_rating <= 2 ? 'var(--red)' : 'var(--amber)', display: 'inline-flex', gap: 1 }}>
                        {Array.from({ length: 5 }, (_, i) => (
                          <Icon key={i} name={i < (s.feedback_rating ?? 0) ? 'star' : 'starOutline'} size={12} />
                        ))}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(s.started_at)}</td>
                  <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(s.ended_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Pagination bar */}
          {totalPages > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: 8,
              padding: '12px 22px', borderTop: '1px solid var(--border)',
              fontSize: 13, color: 'var(--text-3)',
            }}>
              <span>
                {(safePage - 1) * SESSIONS_PER_PAGE + 1}–{Math.min(safePage * SESSIONS_PER_PAGE, data.length)} of {data.length}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  style={pgBtn(safePage === 1)}
                >← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                  .reduce<(number | '…')[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('…');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) => p === '…'
                    ? <span key={`ellipsis-${i}`} style={{ padding: '0 6px', color: 'var(--text-4)' }}>…</span>
                    : <button key={p} onClick={() => setPage(p as number)} style={pgBtn(false, p === safePage)}>{p}</button>
                  )}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  style={pgBtn(safePage === totalPages)}
                >Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </TableCard>
  );
}

function pgBtn(disabled: boolean, active = false): React.CSSProperties {
  return {
    padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: disabled ? 'default' : 'pointer',
    border: '1px solid var(--border)',
    background: active ? 'var(--blue)' : 'var(--tint-2)',
    color: active ? '#fff' : disabled ? 'var(--text-4)' : 'var(--text-2)',
    opacity: disabled ? 0.4 : 1,
    transition: 'all 0.15s',
  };
}

// ── Tab: Latency ──────────────────────────────────────────────────────────────
function LatencyView({ data, loading }: { data: AnalyticsLatency | null; loading: boolean }) {
  if (loading) return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--surface)' }}>
      <SkeletonTable rows={5} cols={['30%', '15%', '15%', '15%', '15%']} />
    </div>
  );
  if (!data)   return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No latency data available.</div>;

  // The API returns a note when there's no voice call data
  if (data.note && !data.sample_size) {
    return (
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '24px 22px',
        color: 'var(--text-3)', fontSize: 13,
      }}>
        {data.note as string}
      </div>
    );
  }

  // Rows: component → p50, p95, vs target
  const COMPONENTS: { key: 'stt' | 'llm' | 'tts' | 'total'; label: string; target?: number }[] = [
    { key: 'stt',   label: 'STT (Speech → Text)',  target: 300  },
    { key: 'llm',   label: 'LLM (Inference)',       target: 800  },
    { key: 'tts',   label: 'TTS (Text → Speech)',   target: 400  },
    { key: 'total', label: 'Total (End-to-end)',     target: 1200 },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <StatCard label="Voice turn samples" value={fmt(data.sample_size)} />

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', overflow: 'hidden',
      }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Component breakdown</span>
        </div>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 480 }}>
          <thead>
            <tr>
              {['Component', 'p50', 'p95', 'Target p95', 'Status'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPONENTS.map(c => {
              const comp = data[c.key] as { p50: number | null; p95: number | null } | null;
              const p95  = comp?.p95 ?? null;
              const ok   = p95 != null && c.target != null ? p95 <= c.target : null;
              return (
                <tr key={c.key} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...TD_STYLE, fontWeight: 500, color: 'var(--text-1)' }}>{c.label}</td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{fmtMs(comp?.p50)}</td>
                  <td style={{ ...TD_STYLE, ...MONO, color: ok === false ? 'var(--red)' : ok === true ? 'var(--green)' : 'var(--text-2)' }}>
                    {fmtMs(p95)}
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO, color: 'var(--text-4)' }}>
                    {c.target != null ? `${c.target} ms` : '—'}
                  </td>
                  <td style={TD_STYLE}>
                    {ok === null ? <span style={{ color: 'var(--text-4)' }}>—</span> : (
                      <span style={{
                        fontSize: 10.5, padding: '2px 9px', borderRadius: 99, fontWeight: 600,
                        background: ok ? 'rgba(76,175,80,0.14)' : 'rgba(255,92,122,0.12)',
                        color: ok ? 'var(--green)' : 'var(--red)',
                        textTransform: 'uppercase',
                      }}>
                        {ok ? 'OK' : 'SLOW'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Knowledge Gaps ───────────────────────────────────────────────────────
const GAPS_PER_PAGE = 10;

function KnowledgeGapsView({ data, loading }: { data: KnowledgeGap[]; loading: boolean }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / GAPS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const slice      = data.slice((safePage - 1) * GAPS_PER_PAGE, safePage * GAPS_PER_PAGE);

  return (
    <TableCard title={`${data.length} knowledge gap${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No knowledge gaps detected." />
      ) : (
        <>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 }}>
            <thead>
              <tr>
                {['Utterance', 'Agent', 'Occurrences', 'Last seen'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((g, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ ...TD_STYLE, maxWidth: 400 }}>
                    <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{g.utterance}</div>
                  </td>
                  <td style={TD_STYLE}>{g.agent_name || '—'}</td>
                  <td style={{ ...TD_STYLE, ...MONO }}>
                    <span
                      style={{
                        padding: '2px 9px', borderRadius: 99,
                        background: g.occurrences > 5 ? 'rgba(255,92,122,0.12)' : 'rgba(255,181,71,0.12)',
                        color: g.occurrences > 5 ? 'var(--red)' : 'var(--amber)',
                        fontWeight: 600, fontSize: 12,
                      }}
                    >
                      {g.occurrences}×
                    </span>
                  </td>
                  <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(g.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 8 }}>
                {(safePage - 1) * GAPS_PER_PAGE + 1}–{Math.min(safePage * GAPS_PER_PAGE, data.length)} of {data.length}
              </span>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={pgBtn(safePage === 1)}
              >Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`e${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                    : <button key={p} onClick={() => setPage(p as number)} style={pgBtn(false, p === safePage)}>{p}</button>
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={pgBtn(safePage === totalPages)}
              >Next</button>
            </div>
          )}
        </>
      )}
    </TableCard>
  );
}

// ── Tab: Languages ────────────────────────────────────────────────────────────
function LanguagesView({ data, loading }: { data: LanguageStat[]; loading: boolean }) {
  const total = data.reduce((sum, l) => sum + l.sessions, 0) || 1;

  return (
    <TableCard title={`${data.length} language${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No language data available." />
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 380 }}>
          <thead>
            <tr>
              {['Language', 'Sessions', 'Share'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((l, idx) => {
              const pct = (l.sessions / total) * 100;
              return (
                <tr key={l.code ?? idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={TD_STYLE}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          padding: '2px 9px', borderRadius: 99,
                          background: 'var(--tint-4)', color: 'var(--text-1)',
                          fontWeight: 700, fontSize: 11, fontFamily: "'Zalando Sans'",
                        }}
                      >
                        {l.code.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}>
                        {l.name || ''}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{l.sessions}</td>
                  <td style={{ ...TD_STYLE, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--tint-2)', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct.toFixed(1)}%`,
                            height: '100%',
                            background: 'var(--grad-brand)',
                            borderRadius: 99,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 42, textAlign: 'right', fontFamily: "'Zalando Sans'" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </TableCard>
  );
}

// ── Tab: Agents ───────────────────────────────────────────────────────────────
const AGENTS_PER_PAGE = 10;

function AgentsView({ data, loading }: { data: AgentStat[]; loading: boolean }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(data.length / AGENTS_PER_PAGE));
  const safePage   = Math.min(page, totalPages);
  const slice      = data.slice((safePage - 1) * AGENTS_PER_PAGE, safePage * AGENTS_PER_PAGE);

  return (
    <TableCard title={`${data.length} agent${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No agent performance data available." />
      ) : (
        <>
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 740 }}>
            <thead>
              <tr>
                {['Agent', 'Use case', 'Direction', 'Sessions', 'Completed', 'Abandoned', 'Rating', 'Avg turns'].map(h => (
                  <th key={h} style={TH_STYLE}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slice.map((a, idx) => (
                <tr key={a.agent_id ?? idx} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={TD_STYLE}>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{a.name || '—'}</div>
                  </td>
                  <td style={TD_STYLE}>
                    {a.use_case ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(117,91,227,0.12)', color: 'var(--purple-hi)', fontWeight: 600 }}>
                        {a.use_case}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={TD_STYLE}>
                    {a.call_direction ? (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--tint-2)', color: 'var(--text-3)', fontWeight: 500 }}>
                        {a.call_direction}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{a.sessions}</td>
                  <td style={{ ...TD_STYLE, ...MONO, color: 'var(--green)' }}>{a.completed ?? '—'}</td>
                  <td style={{ ...TD_STYLE, ...MONO, color: a.abandoned ? 'var(--amber)' : 'var(--text-2)' }}>{a.abandoned ?? '—'}</td>
                  <td style={{ ...TD_STYLE, ...MONO }}>
                    {a.avg_rating != null ? (
                      <span style={{ color: a.avg_rating >= 4 ? 'var(--green)' : a.avg_rating <= 2 ? 'var(--red)' : 'var(--amber)' }}>
                        {fmt(a.avg_rating, 2)}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{fmt(a.avg_turns, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 22px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)', marginRight: 8 }}>
                {(safePage - 1) * AGENTS_PER_PAGE + 1}–{Math.min(safePage * AGENTS_PER_PAGE, data.length)} of {data.length}
              </span>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                style={pgBtn(safePage === 1)}
              >Prev</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '…')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…'
                    ? <span key={`e${i}`} style={{ fontSize: 12, color: 'var(--text-4)', padding: '0 4px' }}>…</span>
                    : <button key={p} onClick={() => setPage(p as number)} style={pgBtn(false, p === safePage)}>{p}</button>
                )}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                style={pgBtn(safePage === totalPages)}
              >Next</button>
            </div>
          )}
        </>
      )}
    </TableCard>
  );
}

// ── Tab: Events ───────────────────────────────────────────────────────────────
const EVENT_COLOR: Record<string, string> = {
  error:   'var(--red)',
  warning: 'var(--amber)',
  info:    'var(--blue)',
  success: 'var(--green)',
};

function EventTypePill({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const color = Object.entries(EVENT_COLOR).find(([k]) => lower.includes(k))?.[1] ?? 'var(--text-3)';
  const bg    = color === 'var(--text-3)' ? 'var(--tint-2)' : `${color.replace(')', ', 0.12)').replace('var(', 'rgba(').replace('--red', '255,92,122').replace('--amber', '255,181,71').replace('--blue', '24,218,252').replace('--green', '76,175,80')}`;
  return (
    <span
      style={{
        fontSize: 10.5, padding: '2px 9px', borderRadius: 99,
        background: 'var(--tint-2)', color,
        fontWeight: 600, fontFamily: "'Zalando Sans'",
        letterSpacing: '0.03em',
      }}
    >
      {type}
    </span>
  );
}

function EventsView({ data, loading }: { data: AnalyticsEvent[]; loading: boolean }) {
  return (
    <TableCard title={`${data.length} event${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No events recorded." />
      ) : (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 500 }}>
          <thead>
            <tr>
              {['Time', 'Type', 'Agent', 'Payload'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((e, idx) => (
              <tr key={e.id ?? idx} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...TD_STYLE, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(e.occurred_at)}</td>
                <td style={TD_STYLE}><EventTypePill type={e.event_type} /></td>
                <td style={{ ...TD_STYLE, ...MONO, fontSize: 11.5, color: 'var(--text-3)' }}>
                  {e.agent_id ? `${e.agent_id.slice(0, 8)}…` : '—'}
                </td>
                <td style={{ ...TD_STYLE, color: 'var(--text-3)', maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Zalando Sans'", fontSize: 11.5 }}>
                  {e.payload != null ? JSON.stringify(e.payload).slice(0, 80) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </TableCard>
  );
}

// Normalises whatever the API returns into a plain array.
// Handles: plain array, { items }, { data }, { results }, and any
// single-key object whose value is an array (e.g. { gaps: [...] }).
function toArray(v: unknown): unknown[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    // Try common envelope keys first
    for (const key of ['items', 'data', 'results', 'sessions', 'gaps', 'languages', 'agents', 'events']) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
    // Fallback: first value that is an array
    for (const key of Object.keys(obj)) {
      if (Array.isArray(obj[key])) return obj[key] as unknown[];
    }
  }
  return [];
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { addToast } = useApp();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const { tab: rawTab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const tab: Tab = (TABS.some(t => t.key === rawTab) ? rawTab : 'summary') as Tab;
  function setTab(t: Tab) { navigate(`/analytics/${t}`, { replace: true }); }

  const [summary,    setSummary]    = useState<AnalyticsSummary | null>(null);
  const [sessions,   setSessions]   = useState<AnalyticsSession[]>([]);
  const [latency,    setLatency]    = useState<AnalyticsLatency | null>(null);
  const [gaps,       setGaps]       = useState<KnowledgeGap[]>([]);
  const [languages,  setLanguages]  = useState<LanguageStat[]>([]);
  const [agents,     setAgents]     = useState<AgentStat[]>([]);
  const [events,     setEvents]     = useState<AnalyticsEvent[]>([]);

  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);

  const initRef = useRef(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [sum, sess, lat, kgaps, langs, ags, evts] = await Promise.all([
        getAnalyticsSummary().catch(() => null),
        getAnalyticsSessions().catch(() => null),
        getAnalyticsLatency().catch(() => null),
        getAnalyticsKnowledgeGaps().catch(() => null),
        getAnalyticsLanguages().catch(() => null),
        getAnalyticsAgents().catch(() => null),
        getAnalyticsEvents().catch(() => null),
      ]);
      setSummary(sum);
      setSessions(toArray(sess) as AnalyticsSession[]);
      setLatency(lat);
      setGaps(toArray(kgaps) as KnowledgeGap[]);
      setLanguages(toArray(langs) as LanguageStat[]);
      setAgents(toArray(ags) as AgentStat[]);
      setEvents(toArray(evts) as AnalyticsEvent[]);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    refresh();
  }, []);

  return (
    <div className="fade-up" style={{ padding: isMobile ? '20px 16px 48px' : isTablet ? '24px 24px 52px' : '32px 40px 60px' }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--blue)', marginBottom: 10 }}>
          Analytics · Insights
        </div>
        <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-1)' }}>
          Analytics
        </h1>
        <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 8 }}>
          {loading ? 'Loading…' : `${sessions.length} sessions · ${agents.length} agents · ${events.length} events`}
        </p>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(255,90,120,0.1)',
            border: '1px solid rgba(255,90,120,0.4)',
            color: '#ff8194',
            padding: '12px 14px', borderRadius: 10,
            fontSize: 13, marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Tab strip ── */}
      <div style={{ overflowX: isMobile ? 'auto' : 'visible', WebkitOverflowScrolling: 'touch' as any, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: isMobile ? 'nowrap' : 'wrap', minWidth: isMobile ? 'max-content' : undefined }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '7px 14px', borderRadius: 99,
                background: 'var(--card-bg)',
                border: tab === t.key ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                color: tab === t.key ? 'var(--text-1)' : 'var(--text-2)',
                cursor: 'pointer', fontSize: 12.5,
                display: 'inline-flex', alignItems: 'center', gap: 7,
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              <Icon name={t.icon} size={13} />
              {t.label}
            </button>
          ))}
          {!isMobile && <div style={{ flex: 1 }} />}
          <button
            onClick={() => { refresh().then(() => addToast('Analytics refreshed', 'success')); }}
            style={{
              padding: '7px 12px', borderRadius: 99,
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
              flexShrink: 0,
            }}
          >
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Active tab view — wrapped in error boundary so one bad row can't blank the page ── */}
      <TabErrorBoundary key={tab}>
        {tab === 'summary'        && <SummaryView       data={summary}   loading={loading} />}
        {tab === 'sessions'       && <SessionsView      data={sessions}  loading={loading} />}
        {tab === 'latency'        && <LatencyView       data={latency}   loading={loading} />}
        {tab === 'knowledge-gaps' && <KnowledgeGapsView data={gaps}      loading={loading} />}
        {tab === 'languages'      && <LanguagesView     data={languages} loading={loading} />}
        {tab === 'agents'         && <AgentsView        data={agents}    loading={loading} />}
        {tab === 'events'         && <EventsView        data={events}    loading={loading} />}
      </TabErrorBoundary>
    </div>
  );
}
