/**
 * Small presentational primitives for the CRM screens, following the inline-style + CSS-variable idiom
 * the Webhooks / Analytics pages use (the repo has no shared table/badge/pagination components).
 *
 * Privacy: anything patient-derived is rendered through <Phi> (PostHog replay mask) and every CRM page
 * sits inside <CrmPage> (`ph-no-capture` — autocapture skips the whole subtree).
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { SkeletonTable } from '../../components/Skeleton';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { CrmErrorInfo } from '../../utils/crmErrors';
import { CRM_MAX_OFFSET, nextOffset, prevOffset } from '../../api/crm';
import Icon from '../../assets/icons';

export const PHI_CLASS = 'ph-mask ph-no-capture';

/** Patient-derived text: masked in session replay, excluded from autocapture. */
export function Phi({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className={PHI_CLASS} style={style}>{children}</span>;
}

export function CrmPage({ children }: { children: React.ReactNode }) {
  // Same breakpoints and padding steps as the Analytics page.
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');
  const padding = isMobile ? '20px 16px 48px' : isTablet ? '24px 24px 52px' : '28px 32px';
  return (
    <div className="fade-up ph-no-capture" data-testid="crm-page" style={{ padding, maxWidth: 1200, margin: '0 auto' }}>
      {children}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions, crumbs }: {
  eyebrow: string; title: string; subtitle?: string; actions?: React.ReactNode;
  crumbs?: { label: string; to?: string }[];
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Breadcrumb" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {crumbs.map((c, i) => (
            <span key={i}>
              {c.to ? <Link to={c.to} style={{ color: 'var(--text-3)', textDecoration: 'none' }}>{c.label}</Link> : c.label}
              {i < crumbs.length - 1 ? ' / ' : ''}
            </span>
          ))}
        </nav>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--blue)', marginBottom: 6 }}>{eyebrow}</div>
          <h1 className="page-title" style={{ fontSize: 28, fontWeight: 700, margin: 0, color: 'var(--text-1)' }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13.5, color: 'var(--text-3)', margin: '6px 0 0' }}>{subtitle}</p>}
        </div>
        {actions}
      </div>
    </div>
  );
}

export const buttonStyle: React.CSSProperties = {
  padding: '9px 14px', background: 'var(--tint-2)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
export const selectStyle: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', color: 'var(--text-1)', fontSize: 13,
};

/**
 * Themed dropdown — a native <select>'s open popup can't be restyled cross-browser (it renders
 * with OS chrome, not CSS), so this is a button + absolute-positioned listbox instead, following
 * the same visual pattern as CompanySwitcher.tsx (the one other custom dropdown in the app).
 */
export function Select<T extends string>({ value, onChange, options, ariaLabel, disabled, style }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string;
  disabled?: boolean; style?: React.CSSProperties;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={rootRef} style={{ position: 'relative', ...style }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-value={value}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          ...selectStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          width: '100%', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.label ?? ''}</span>
        <Icon name="chevronDown" size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: '100%', width: 'max-content',
            maxWidth: 320, maxHeight: 280, overflowY: 'auto', background: 'var(--bg-0)',
            border: '1px solid var(--border-strong)', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: 6, zIndex: 50,
          }}
        >
          {options.map((o) => {
            const isActive = o.value === value;
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={isActive}
                data-value={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none',
                  background: isActive ? 'var(--tint-2)' : 'transparent', color: 'var(--text-1)',
                  fontSize: 13, textAlign: 'left', cursor: 'pointer', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--tint-1)'; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span>{o.label}</span>
                {isActive && <Icon name="check" size={13} style={{ color: 'var(--blue)', flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RefreshButton({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} style={buttonStyle}>Refresh</button>;
}

export function Card({ title, children, style }: { title?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 20, ...style }}>
      {title && <h2 style={{ margin: 0, padding: '14px 22px', fontSize: 14, fontWeight: 700, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>{title}</h2>}
      {children}
    </section>
  );
}

export function FieldList({ fields }: { fields: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl style={{ margin: 0, padding: '6px 22px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0 24px' }}>
      {fields.map((f) => (
        <div key={f.label}>
          <dt style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)', marginTop: 14 }}>{f.label}</dt>
          <dd style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-1)', wordBreak: 'break-word' }}>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const TONES = {
  good: { fg: 'var(--green)', bg: 'rgba(34,197,94,.12)' },
  warn: { fg: 'var(--amber)', bg: 'rgba(245,158,11,.14)' },
  bad:  { fg: 'var(--red)',   bg: 'rgba(239,68,68,.12)' },
  info: { fg: 'var(--blue)',  bg: 'rgba(59,130,246,.12)' },
  mute: { fg: 'var(--text-3)', bg: 'var(--tint-2)' },
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'mute', children }: { tone?: Tone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, color: t.fg, background: t.bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export const label = (v: string | null | undefined): string =>
  v ? v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '—';

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );
}
export const Th = ({ children }: { children?: React.ReactNode }) => (
  <th style={{ textAlign: 'left', padding: '12px 22px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)', background: 'var(--surface-soft)', whiteSpace: 'nowrap' }}>{children}</th>
);
export const Td = ({ children }: { children?: React.ReactNode }) => (
  <td style={{ padding: '13px 22px', fontSize: 13.5, color: 'var(--text-1)', borderTop: '1px solid var(--border)', verticalAlign: 'middle' }}>{children}</td>
);

export function TableSkeleton({ cols }: { cols: (string | number)[] }) {
  return <div role="status" aria-label="Loading"><SkeletonTable rows={6} cols={cols} /></div>;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ padding: '40px 22px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
      <div style={{ fontWeight: 600, color: 'var(--text-2)' }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

/** Fixed-copy error/forbidden panel — never shows backend text. */
export function ErrorState({ error, onRetry }: { error: CrmErrorInfo; onRetry?: () => void }) {
  const retryable = error.kind !== 'forbidden' && error.kind !== 'not_found';
  return (
    <div role="alert" className="ph-mask" style={{ margin: 0, padding: '18px 22px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 'var(--radius-lg)', color: 'var(--text-1)' }}>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{error.title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{error.message}</div>
      {retryable && onRetry && <button type="button" onClick={onRetry} style={{ ...buttonStyle, marginTop: 12 }}>Try again</button>}
    </div>
  );
}

export function Pagination({ offset, limit, count, hasMore, onChange }: {
  offset: number; limit: number; count: number; hasMore: boolean; onChange: (offset: number) => void;
}) {
  const next = nextOffset(offset, limit, hasMore);
  const prev = prevOffset(offset, limit);
  const capped = hasMore && next === null;
  if (count === 0 && offset === 0) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
        Showing {offset + 1}–{offset + count}
        {capped && ` · results beyond ${CRM_MAX_OFFSET.toLocaleString()} are not browsable — narrow your filters`}
      </span>
      <span style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...buttonStyle, opacity: prev === null ? 0.5 : 1 }} disabled={prev === null} onClick={() => prev !== null && onChange(prev)}>Previous</button>
        <button type="button" style={{ ...buttonStyle, opacity: next === null ? 0.5 : 1 }} disabled={next === null} onClick={() => next !== null && onChange(next)}>Next</button>
      </span>
    </div>
  );
}

export function RowLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>{children}</Link>;
}
