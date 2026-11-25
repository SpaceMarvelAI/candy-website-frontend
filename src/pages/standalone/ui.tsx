/**
 * Small shared pieces for the standalone pages (login / sign-up / invitation / team). Inline styles
 * on the app's theme tokens (src/styles/globals.css), like the rest of Candy.
 */
import type { CSSProperties, ReactNode } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14,
  background: 'var(--input-bg)', color: 'var(--text-1)',
  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', outline: 'none',
};

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13, color: 'var(--text-2)' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{hint}</span>}
    </label>
  );
}

export function Button({
  children, onClick, type = 'button', disabled, variant = 'primary', small,
}: {
  children: ReactNode; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean;
  variant?: 'primary' | 'ghost' | 'danger'; small?: boolean;
}) {
  const base: CSSProperties = {
    padding: small ? '6px 12px' : '11px 18px', fontSize: small ? 12.5 : 14, fontWeight: 600,
    borderRadius: 'var(--radius-sm)', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1,
    border: '1px solid transparent', whiteSpace: 'nowrap',
  };
  const look: Record<string, CSSProperties> = {
    primary: { background: 'var(--grad-brand)', color: '#fff' },
    ghost:   { background: 'transparent', color: 'var(--text-1)', borderColor: 'var(--border)' },
    danger:  { background: 'transparent', color: 'var(--red)', borderColor: 'var(--border)' },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...look[variant] }}>
      {children}
    </button>
  );
}

export function Card({ title, children, action }: { title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={{
      background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
      padding: 20, display: 'grid', gap: 14,
    }}>
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {title && <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-1)' }}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div role="alert" style={{ fontSize: 13, color: 'var(--red)' }}>{children}</div>;
}

/** Centered single-card layout for the signed-out pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{
        width: '100%', maxWidth: 400, background: 'var(--surface-elev)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card)', padding: 28, display: 'grid', gap: 18,
      }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: 'var(--text-1)' }}>{title}</h1>
          {subtitle && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-2)' }}>{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** "All companies (including new ones)" or a checked selection — the same choice the Dashboard
 *  offers. `selected === null` means all. */
export function CompanyChoice({
  companies, selected, onChange, allowAll = true,
}: {
  companies: { id: string; name: string }[];
  selected: string[] | null;
  onChange: (next: string[] | null) => void;
  allowAll?: boolean;
}) {
  const all = selected === null;
  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 13, color: 'var(--text-1)' }}>
      {allowAll && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="radio" checked={all} onChange={() => onChange(null)} />
          All companies (including ones added later)
        </label>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="radio" checked={!all} onChange={() => onChange(selected ?? [])} />
        Only selected companies
      </label>
      {!all && (
        <div style={{ display: 'grid', gap: 6, paddingLeft: 24 }}>
          {companies.length === 0 && <span style={{ color: 'var(--text-3)' }}>No companies to choose from.</span>}
          {companies.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={selected!.includes(c.id)}
                onChange={e => onChange(e.target.checked ? [...selected!, c.id] : selected!.filter(x => x !== c.id))}
              />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
