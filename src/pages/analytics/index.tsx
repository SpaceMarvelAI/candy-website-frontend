import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import { ApiError } from '../../api/client';
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
  return <div style={{ padding: '28px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>;
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
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12.5,
};

// ── Tab: Summary ──────────────────────────────────────────────────────────────
function SummaryView({ data, loading }: { data: AnalyticsSummary | null; loading: boolean }) {
  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>;
  if (!data)   return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No summary data available.</div>;

  const cards = [
    { label: 'Total Sessions',    value: fmt(data.total_sessions),             accent: 'var(--purple-hi)' },
    { label: 'Total Messages',    value: fmt(data.total_messages)                                          },
    { label: 'Active Agents',     value: fmt(data.total_agents)                                            },
    { label: 'Avg Latency',       value: fmtMs(data.avg_latency_ms),           accent: 'var(--blue)'      },
    { label: 'Knowledge Gap Rate',value: fmtPct(data.knowledge_gap_rate),      accent: 'var(--amber)'     },
    { label: 'Top Language',      value: (data.top_language || '—').toUpperCase()                          },
  ];

  const period = data.period_start
    ? `${fmtTime(data.period_start)} → ${fmtTime(data.period_end)}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {period && (
        <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
          Period: {period}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 14,
        }}
      >
        {cards.map(c => (
          <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
        ))}
      </div>

      {/* Any extra fields from the API rendered as a secondary info block */}
      {Object.entries(data)
        .filter(([k]) => !['total_sessions','total_messages','total_agents','avg_latency_ms','knowledge_gap_rate','top_language','period_start','period_end'].includes(k))
        .length > 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '16px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 28px',
          }}
        >
          {Object.entries(data)
            .filter(([k]) => !['total_sessions','total_messages','total_agents','avg_latency_ms','knowledge_gap_rate','top_language','period_start','period_end'].includes(k))
            .map(([k, v]) => (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)' }}>{k.replace(/_/g, ' ')}</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace" }}>{String(v)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: Sessions ─────────────────────────────────────────────────────────────
function SessionsView({ data, loading }: { data: AnalyticsSession[]; loading: boolean }) {
  return (
    <TableCard title={`${data.length} session${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No sessions recorded yet." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Agent', 'Use case', 'Language', 'Messages', 'Duration', 'Started', 'Ended'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(s => (
              <tr key={s.session_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={TD_STYLE}>
                  <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{s.agent_name || '—'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2, ...MONO }}>{s.session_id.slice(0, 8)}…</div>
                </td>
                <td style={TD_STYLE}>
                  {s.use_case_slug ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(117,91,227,0.12)', color: 'var(--purple-hi)', fontWeight: 600 }}>
                      {s.use_case_slug}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...TD_STYLE, ...MONO }}>{(s.language || '—').toUpperCase()}</td>
                <td style={{ ...TD_STYLE, ...MONO }}>{s.message_count}</td>
                <td style={{ ...TD_STYLE, ...MONO }}>{fmtMs(s.duration_ms)}</td>
                <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(s.started_at)}</td>
                <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(s.ended_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}

// ── Tab: Latency ──────────────────────────────────────────────────────────────
function LatencyView({ data, loading }: { data: AnalyticsLatency | null; loading: boolean }) {
  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>;
  if (!data)   return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>No latency data available.</div>;

  const metrics = [
    { label: 'Average',    value: fmtMs(data.avg_ms), accent: 'var(--blue)'     },
    { label: 'Median p50', value: fmtMs(data.p50_ms)                             },
    { label: 'p95',        value: fmtMs(data.p95_ms), accent: 'var(--amber)'    },
    { label: 'p99',        value: fmtMs(data.p99_ms), accent: 'var(--red)'      },
    { label: 'Min',        value: fmtMs(data.min_ms), accent: 'var(--green)'    },
    { label: 'Max',        value: fmtMs(data.max_ms)                             },
  ];

  const maxBucket = Math.max(1, ...(data.buckets || []).map(b => b.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {metrics.map(m => <StatCard key={m.label} label={m.label} value={m.value} accent={m.accent} />)}
        <StatCard label="Sample count" value={fmt(data.sample_count)} />
      </div>

      {data.buckets && data.buckets.length > 0 && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '18px 22px',
          }}
        >
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)', marginBottom: 16 }}>
            Distribution
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.buckets.map(b => (
              <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 80, fontSize: 12, color: 'var(--text-3)', textAlign: 'right', flexShrink: 0 }}>{b.label}</div>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 99,
                    background: 'var(--tint-2)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(b.count / maxBucket) * 100}%`,
                      height: '100%',
                      background: 'var(--grad-brand)',
                      borderRadius: 99,
                    }}
                  />
                </div>
                <div style={{ width: 36, fontSize: 12, color: 'var(--text-3)', textAlign: 'right', flexShrink: 0, fontFamily: "'JetBrains Mono', monospace" }}>
                  {b.count}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Knowledge Gaps ───────────────────────────────────────────────────────
function KnowledgeGapsView({ data, loading }: { data: KnowledgeGap[]; loading: boolean }) {
  return (
    <TableCard title={`${data.length} knowledge gap${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No knowledge gaps detected." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Question', 'Agent', 'Frequency', 'Last seen'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(g => (
              <tr key={g.gap_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...TD_STYLE, maxWidth: 400 }}>
                  <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{g.question}</div>
                </td>
                <td style={TD_STYLE}>{g.agent_name || '—'}</td>
                <td style={{ ...TD_STYLE, ...MONO }}>
                  <span
                    style={{
                      padding: '2px 9px', borderRadius: 99,
                      background: g.frequency > 5 ? 'rgba(255,92,122,0.12)' : 'rgba(255,181,71,0.12)',
                      color: g.frequency > 5 ? 'var(--red)' : 'var(--amber)',
                      fontWeight: 600, fontSize: 12,
                    }}
                  >
                    {g.frequency}×
                  </span>
                </td>
                <td style={{ ...TD_STYLE, fontSize: 12 }}>{fmtTime(g.last_seen_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}

// ── Tab: Languages ────────────────────────────────────────────────────────────
function LanguagesView({ data, loading }: { data: LanguageStat[]; loading: boolean }) {
  const total = data.reduce((sum, l) => sum + l.session_count, 0) || 1;

  return (
    <TableCard title={`${data.length} language${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No language data available." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Language', 'Sessions', 'Share'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(l => {
              const pct = l.percentage != null ? l.percentage * 100 : (l.session_count / total) * 100;
              return (
                <tr key={l.language_code} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={TD_STYLE}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        style={{
                          padding: '2px 9px', borderRadius: 99,
                          background: 'var(--tint-4)', color: 'var(--text-1)',
                          fontWeight: 700, fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
                        }}
                      >
                        {l.language_code.toUpperCase()}
                      </span>
                      <span style={{ color: 'var(--text-3)', fontSize: 12.5 }}>
                        {l.language_name || ''}
                      </span>
                    </div>
                  </td>
                  <td style={{ ...TD_STYLE, ...MONO }}>{l.session_count}</td>
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
                      <span style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 42, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}

// ── Tab: Agents ───────────────────────────────────────────────────────────────
function AgentsView({ data, loading }: { data: AgentStat[]; loading: boolean }) {
  return (
    <TableCard title={`${data.length} agent${data.length === 1 ? '' : 's'}`}>
      {loading && data.length === 0 ? <LoadingRow /> : data.length === 0 ? (
        <EmptyRow msg="No agent performance data available." />
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Agent', 'Use case', 'Sessions', 'Avg latency', 'Avg messages', 'Gap rate'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(a => (
              <tr key={a.agent_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={TD_STYLE}>
                  <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{a.agent_name || '—'}</div>
                </td>
                <td style={TD_STYLE}>
                  {a.use_case_slug ? (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'rgba(117,91,227,0.12)', color: 'var(--purple-hi)', fontWeight: 600 }}>
                      {a.use_case_slug}
                    </span>
                  ) : '—'}
                </td>
                <td style={{ ...TD_STYLE, ...MONO }}>{a.total_sessions}</td>
                <td style={{ ...TD_STYLE, ...MONO, color: a.avg_latency_ms && a.avg_latency_ms > 3000 ? 'var(--amber)' : 'var(--text-2)' }}>
                  {fmtMs(a.avg_latency_ms)}
                </td>
                <td style={{ ...TD_STYLE, ...MONO }}>{fmt(a.avg_messages, 1)}</td>
                <td style={{ ...TD_STYLE, ...MONO }}>
                  {a.knowledge_gap_rate != null ? (
                    <span
                      style={{
                        padding: '2px 8px', borderRadius: 99, fontWeight: 600, fontSize: 12,
                        background: a.knowledge_gap_rate > 0.2 ? 'rgba(255,92,122,0.12)' : 'rgba(76,175,80,0.1)',
                        color: a.knowledge_gap_rate > 0.2 ? 'var(--red)' : 'var(--green)',
                      }}
                    >
                      {fmtPct(a.knowledge_gap_rate)}
                    </span>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
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
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {['Time', 'Type', 'Agent', 'Session', 'Detail'].map(h => (
                <th key={h} style={TH_STYLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(e => (
              <tr key={e.event_id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ ...TD_STYLE, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtTime(e.occurred_at)}</td>
                <td style={TD_STYLE}><EventTypePill type={e.event_type} /></td>
                <td style={TD_STYLE}>{e.agent_name || '—'}</td>
                <td style={{ ...TD_STYLE, ...MONO, fontSize: 11.5 }}>
                  {e.session_id ? `${e.session_id.slice(0, 8)}…` : '—'}
                </td>
                <td style={{ ...TD_STYLE, color: 'var(--text-3)', maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {e.detail || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </TableCard>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const { addToast } = useApp();
  const [tab, setTab] = useState<Tab>('summary');

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
        getAnalyticsSessions().catch(() => []),
        getAnalyticsLatency().catch(() => null),
        getAnalyticsKnowledgeGaps().catch(() => []),
        getAnalyticsLanguages().catch(() => []),
        getAnalyticsAgents().catch(() => []),
        getAnalyticsEvents().catch(() => []),
      ]);
      setSummary(sum);
      setSessions(sess as AnalyticsSession[]);
      setLatency(lat);
      setGaps(kgaps as KnowledgeGap[]);
      setLanguages(langs as LanguageStat[]);
      setAgents(ags as AgentStat[]);
      setEvents(evts as AnalyticsEvent[]);
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
    <div className="fade-up">
      {/* ── Page header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--blue)', marginBottom: 10 }}>
          Analytics · Insights
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-1)' }}>
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '7px 14px', borderRadius: 99,
              background: tab === t.key ? 'var(--tint-4)' : 'var(--tint-2)',
              border: tab === t.key ? '1px solid var(--border-strong)' : '1px solid var(--border)',
              color: tab === t.key ? 'var(--text-1)' : 'var(--text-2)',
              cursor: 'pointer', fontSize: 12.5,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              transition: 'all 0.15s',
            }}
          >
            <Icon name={t.icon} size={13} />
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => { refresh().then(() => addToast('Analytics refreshed', 'success')); }}
          style={{
            padding: '7px 12px', borderRadius: 99,
            background: 'var(--tint-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 12.5,
            display: 'inline-flex', alignItems: 'center', gap: 6,
            transition: 'all 0.15s',
          }}
        >
          <Icon name="refresh" size={12} /> Refresh
        </button>
      </div>

      {/* ── Active tab view ── */}
      {tab === 'summary'        && <SummaryView       data={summary}   loading={loading} />}
      {tab === 'sessions'       && <SessionsView      data={sessions}  loading={loading} />}
      {tab === 'latency'        && <LatencyView       data={latency}   loading={loading} />}
      {tab === 'knowledge-gaps' && <KnowledgeGapsView data={gaps}      loading={loading} />}
      {tab === 'languages'      && <LanguagesView     data={languages} loading={loading} />}
      {tab === 'agents'         && <AgentsView        data={agents}    loading={loading} />}
      {tab === 'events'         && <EventsView        data={events}    loading={loading} />}
    </div>
  );
}
