import type { CSSProperties, ReactNode } from 'react';
import { SkeletonCard, SkeletonTable } from '../../../components/Skeleton';
import type { ReportEnvelope } from '../../../api/analyticsReports';
import type { ReportState } from './useReport';
import { DASH, describeDelta, fmtDate, fmtValue, type Kind } from './format';

// Same visual language as the rest of the Analytics page (CSS variables, card + table styles).
export const CARD: CSSProperties = {
  background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
};
const TH: CSSProperties = {
  textAlign: 'left', padding: '10px 14px', color: 'var(--text-3)', fontSize: 10.5, textTransform: 'uppercase',
  letterSpacing: '0.07em', fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--card-bg-strong)',
  borderBottom: '1px solid var(--border)',
};
const TD: CSSProperties = { padding: '11px 14px', color: 'var(--text-2)', fontSize: 13, borderBottom: '1px solid var(--border)' };

export const COLORS = {
  good: 'var(--green)', bad: 'var(--red)', warn: 'var(--amber)', info: 'var(--blue)', brand: 'var(--purple-hi)',
  muted: 'var(--text-4)',
};

// ── Section shell: loading / error / unavailable / content ────────────────────
interface SectionProps<T extends ReportEnvelope<unknown>> {
  id: string;
  title: string;
  subtitle?: string;
  state: ReportState<T>;
  /** Keys of `data.definitions` to list under "Definitions". */
  definitions?: string[];
  children: (data: T) => ReactNode;
}

export function ReportSection<T extends ReportEnvelope<unknown>>(
  { id, title, subtitle, state, definitions, children }: SectionProps<T>,
) {
  const { data, loading, error, reload } = state;
  const heading = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={heading} aria-busy={loading} style={{ ...CARD, marginTop: 20 }}>
      <header style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 id={heading} style={{ margin: 0, fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{title}</h3>
        {subtitle && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{subtitle}</p>}
        {data?.window && (
          <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--text-4)' }}>
            {fmtDate(data.window.start)} → {fmtDate(data.window.end)} · {data.traffic} traffic
          </p>
        )}
      </header>
      <div style={{ padding: 20 }}>
        {loading ? (
          <div role="status" aria-label={`Loading ${title}`}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
              {[0, 1, 2].map(i => <SkeletonCard key={i} />)}
            </div>
            <SkeletonTable rows={3} cols={['30%', '20%', '20%', '20%']} />
          </div>
        ) : error ? (
          <div role="alert" style={{
            background: 'rgba(255,90,120,0.08)', border: '1px solid rgba(255,90,120,0.3)', borderRadius: 10,
            padding: '12px 14px', fontSize: 13, color: 'var(--text-2)',
          }}>
            <strong style={{ color: 'var(--red)' }}>Could not load {title.toLowerCase()}.</strong>{' '}
            <span>{error}</span>
            <div style={{ marginTop: 8 }}>
              <button onClick={reload} style={BTN}>Retry</button>
            </div>
          </div>
        ) : !data ? (
          <Note>No data available.</Note>
        ) : data.available === false ? (
          <Note tone="warn">
            This report is not available yet{data.reason ? `: ${data.reason}` : '.'}
          </Note>
        ) : data.metrics == null ? (
          <Note>No data available.</Note>
        ) : (
          <>
            {children(data)}
            {definitions && data.definitions && definitions.some(k => data.definitions?.[k]) && (
              <details style={{ marginTop: 16, fontSize: 12, color: 'var(--text-3)' }}>
                <summary style={{ cursor: 'pointer', color: 'var(--text-2)' }}>Definitions</summary>
                <dl style={{ margin: '8px 0 0', display: 'grid', gap: 6 }}>
                  {definitions.filter(k => data.definitions?.[k]).map(k => (
                    <div key={k}>
                      <dt style={{ fontWeight: 600, color: 'var(--text-2)' }}>{k.replace(/_/g, ' ')}</dt>
                      <dd style={{ margin: 0, lineHeight: 1.5 }}>{data.definitions![k]}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </>
        )}
      </div>
    </section>
  );
}

const BTN: CSSProperties = {
  fontSize: 12, padding: '5px 12px', borderRadius: 7, background: 'var(--tint-2)',
  border: '1px solid var(--border)', color: 'var(--text-2)', cursor: 'pointer',
};

export function Note({ children, tone }: { children: ReactNode; tone?: 'warn' | 'info' }) {
  return (
    <div role="note" style={{
      padding: '12px 14px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-3)',
      background: tone === 'warn' ? 'rgba(255,181,71,0.08)' : 'var(--tint-2)',
      border: `1px solid ${tone === 'warn' ? 'rgba(255,181,71,0.3)' : 'var(--border)'}`,
    }}>{children}</div>
  );
}

// ── Metric tiles with an optional comparison line ─────────────────────────────
export interface Compare { on: boolean; entry?: Parameters<typeof describeDelta>[1] }

export function Tile({ label, value, kind, sub, cmp, good, accent }: {
  label: string;
  /** Pre-formatted value (use fmtValue). */
  value: string;
  kind: Kind;
  sub?: string;
  cmp?: Compare;
  /** Which direction of change is an improvement; used for colour only (an arrow and text always accompany it). */
  good?: 'up' | 'down';
  accent?: string;
}) {
  const delta = cmp?.on ? describeDelta(kind, cmp.entry) : null;
  const tone = !delta || !delta.direction || delta.direction === 'flat' || !good
    ? 'var(--text-3)'
    : (delta.direction === good ? COLORS.good : COLORS.bad);
  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-4)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 19, fontWeight: 700, color: accent || 'var(--text-1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{sub}</div>}
      {delta && <div data-testid="delta" style={{ fontSize: 11.5, color: tone, lineHeight: 1.4 }}>{delta.text}</div>}
    </div>
  );
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>{children}</div>;
}

export { fmtValue };

// ── Charts ────────────────────────────────────────────────────────────────────
export function SubHeading({ children }: { children: ReactNode }) {
  return <h4 style={{ margin: '22px 0 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-3)' }}>{children}</h4>;
}

export interface Segment { name: string; value: number; color: string }

/** A single stacked bar plus a legend that states every segment's count and share (never colour alone). */
export function StackBar({ label, segments, unit = 'sessions' }: { label: string; segments: Segment[]; unit?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const summary = segments.map(s => `${s.name} ${s.value}${total ? ` (${((s.value / total) * 100).toFixed(1)}%)` : ''}`).join(', ');
  return (
    <div>
      <div role="img" aria-label={`${label}: ${summary || 'no data'} of ${total} ${unit}`}
        style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--tint-2)' }}>
        {total > 0 && segments.filter(s => s.value > 0).map(s => (
          <div key={s.name} title={`${s.name}: ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        {segments.map(s => (
          <li key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: 'inline-block' }} />
            {s.name}: <strong style={{ color: 'var(--text-1)' }}>{s.value}</strong>
            {total > 0 && <span style={{ color: 'var(--text-4)' }}>({((s.value / total) * 100).toFixed(1)}%)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarRow { label: string; segments: Segment[]; value?: string }

/** Horizontal bars, one row per label; each row is a list item whose text carries the exact numbers. */
export function BarRows({ label, rows, legend }: { label: string; rows: BarRow[]; legend?: Segment[] }) {
  const max = Math.max(1, ...rows.map(r => r.segments.reduce((s, x) => s + x.value, 0)));
  return (
    <div>
      {legend && (
        <ul aria-hidden style={{ listStyle: 'none', margin: '0 0 8px', padding: 0, display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-3)' }}>
          {legend.map(l => (
            <li key={l.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: l.color, display: 'inline-block' }} />{l.name}
            </li>
          ))}
        </ul>
      )}
      <ul aria-label={label} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map(r => {
          const total = r.segments.reduce((s, x) => s + x.value, 0);
          const text = r.value ?? r.segments.map(s => `${s.name} ${s.value}`).join(' · ');
          return (
            <li key={r.label} aria-label={`${r.label}: ${text}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 96, fontSize: 12, color: 'var(--text-3)', flexShrink: 0, fontFamily: "'Zalando Sans'" }}>{r.label}</span>
              <span aria-hidden style={{ flex: 1, minWidth: 40, height: 8, borderRadius: 99, background: 'var(--tint-2)', overflow: 'hidden', display: 'flex' }}>
                {r.segments.map(s => (
                  <span key={s.name} style={{ width: `${(s.value / max) * 100}%`, background: s.color }} />
                ))}
              </span>
              <span style={{ minWidth: 28, textAlign: 'right', fontSize: 12.5, fontWeight: 650, color: 'var(--text-1)', fontFamily: "'Zalando Sans'" }}>
                {r.value ?? total}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── Table ─────────────────────────────────────────────────────────────────────
export interface Column { label: string; align?: 'left' | 'right' }

export function DataTable({ caption, columns, rows, minWidth = 520, empty }: {
  caption: string; columns: Column[]; rows: ReactNode[][]; minWidth?: number; empty?: string;
}) {
  if (rows.length === 0) return <Note>{empty ?? 'No rows in this period.'}</Note>;
  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as never, border: '1px solid var(--border)', borderRadius: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth }}>
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{caption}</caption>
        <thead>
          <tr>{columns.map(c => <th key={c.label} scope="col" style={{ ...TH, textAlign: c.align ?? 'left' }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} style={{ ...TD, textAlign: columns[j]?.align ?? 'left', fontFamily: columns[j]?.align === 'right' ? "'Zalando Sans'" : undefined }}>
                  {cell ?? DASH}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
