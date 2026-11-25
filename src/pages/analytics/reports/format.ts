import type { ComparisonEntry } from '../../../api/analyticsReports';

/** What a figure measures — decides how it and its change are written. */
export type Kind = 'count' | 'rate' | 'ms' | 'seconds';

export const DASH = '—';

const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function fmtCount(v: number | null | undefined): string {
  return v == null ? DASH : INT.format(v);
}

/** A fraction (0..1) as a percentage. null → "—" (undefined rate), a real 0 → "0.0%". */
export function fmtRate(v: number | null | undefined): string {
  return v == null ? DASH : `${(v * 100).toFixed(1)}%`;
}

export function fmtMs(v: number | null | undefined): string {
  if (v == null) return DASH;
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

export function fmtSeconds(v: number | null | undefined): string {
  if (v == null) return DASH;
  if (v < 60) return `${NUM.format(v)} s`;
  const m = Math.floor(v / 60);
  const s = Math.round(v % 60);
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

export function fmtValue(kind: Kind, v: number | null | undefined): string {
  switch (kind) {
    case 'rate': return fmtRate(v);
    case 'ms': return fmtMs(v);
    case 'seconds': return fmtSeconds(v);
    default: return fmtCount(v);
  }
}

function signed(n: number, text: string): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${text}`;
}

/** The absolute change in the unit of the metric (rates change in percentage points). */
export function fmtChange(kind: Kind, change: number): string {
  const abs = Math.abs(change);
  switch (kind) {
    case 'rate': return signed(change, `${(abs * 100).toFixed(1)} pp`);
    case 'ms': return signed(change, abs < 1000 ? `${Math.round(abs)} ms` : `${(abs / 1000).toFixed(2)} s`);
    case 'seconds': return signed(change, fmtSeconds(abs));
    default: return signed(change, INT.format(abs));
  }
}

export interface DeltaText {
  /** "up" | "down" | "flat" | null (null = the change is unavailable). */
  direction: 'up' | 'down' | 'flat' | null;
  /** Full sentence, readable without colour or arrows. */
  text: string;
}

/**
 * The comparison line for one metric. `entry` undefined / a null change is "unavailable" — it is never
 * rendered as 0. The percentage is shown only when the API supplied it (it is null when the previous
 * period was 0), with the reason stated instead of a misleading figure.
 */
export function describeDelta(kind: Kind, entry: ComparisonEntry | null | undefined): DeltaText {
  if (!entry || entry.change == null) {
    return { direction: null, text: 'Comparison unavailable (no value in one of the two periods)' };
  }
  const direction = entry.change > 0 ? 'up' : entry.change < 0 ? 'down' : 'flat';
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '■';
  const pct = entry.change_pct == null
    ? (entry.previous === 0 ? '% change n/a: previous period was 0' : '% change unavailable')
    : `${entry.change_pct > 0 ? '+' : entry.change_pct < 0 ? '−' : ''}${Math.abs(entry.change_pct).toFixed(1)}%`;
  const prev = fmtValue(kind, entry.previous);
  return {
    direction,
    text: direction === 'flat'
      ? `${arrow} No change vs previous period (${prev})`
      : `${arrow} ${fmtChange(kind, entry.change)} (${pct}) vs previous period (${prev})`,
  };
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** "tool_name" → "Tool name" for labels that come from fixed snake_case categories. */
export function humanize(s: string): string {
  const t = s.replace(/[._]/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
