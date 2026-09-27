import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { api, setToken } from '../api/client';
import { storeUser } from '../api/auth';
import { useApp } from '../context/AppContext';
import { Icon } from '../assets/icons';
import { logger } from '../utils/logger';

/**
 * Company switcher — top-right, same place/job as Finixy's. Candy already had the backend
 * for this (`GET /v1/companies`, `POST /v1/auth/switch-company`, both properly org/workspace-
 * scoped — see api/v1/companies.py's list_companies and api/v1/auth.py's switch_company) but no
 * frontend ever called either. Without this there was no way to test or use company isolation
 * within a workspace at all — you were stuck on whichever company your token happened to carry.
 */

interface CompanyOut {
  id: string;
  name: string;
  slug: string;
  plan_tier: string;
}

export default function CompanySwitcher({ style }: { style?: CSSProperties } = {}) {
  const { user, signedIn } = useApp();
  const [open, setOpen] = useState(false);
  const [companies, setCompanies] = useState<CompanyOut[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function loadCompanies() {
    setLoading(true);
    setError(null);
    try {
      const list = await api<CompanyOut[]>('/v1/companies');
      setCompanies(list);
    } catch (e) {
      logger.error('[CompanySwitcher] failed to load companies', { error: e });
      setError("Couldn't load companies.");
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Lazy-load on first open, not on every mount — this sits in the topbar of every page.
    if (next && companies === null) void loadCompanies();
  }

  async function pick(companyId: string) {
    if (!user || companyId === user.company_id || switching) return;
    setSwitching(companyId);
    setError(null);
    try {
      const res = await api<{
        access_token: string;
        user_id: string;
        company_id: string;
        company_name: string;
        role: string;
        email: string;
      }>('/v1/auth/switch-company', {
        method: 'POST',
        body: { company_id: companyId },
      });
      setToken(res.access_token);
      const updatedUser = {
        ...user,
        company_id: res.company_id,
        company_name: res.company_name,
        role: res.role,
      };
      storeUser(updatedUser);
      signedIn(updatedUser);
      setOpen(false);
      // Company-scoped data (agents, calls, connectors, etc.) is fetched fresh per-page from
      // hooks keyed on nothing but the auth token — a full reload is the simplest way to
      // guarantee every one of them re-fetches under the new company instead of continuing to
      // show whatever the previous company's screen already had in memory.
      window.location.reload();
    } catch (e) {
      logger.error('[CompanySwitcher] switch failed', { error: e, companyId });
      setError('Could not switch. Please try again.');
      setSwitching(null);
    }
  }

  if (!user) return null;

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0, ...style }}>
      <button
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid var(--border-strong)',
          background: 'var(--input-bg)',
          color: 'var(--text-1)',
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          maxWidth: 220,
        }}
      >
        <Icon name="box" size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.company_name || 'Select company'}
        </span>
        <Icon name="chevronDown" size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: 260,
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--bg-0)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            padding: 6,
            zIndex: 50,
          }}
        >
          {loading && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-3)' }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: '#e5484d' }}>{error}</div>
          )}
          {!loading && companies && companies.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: 13, color: 'var(--text-3)' }}>
              No companies found.
            </div>
          )}
          {!loading &&
            companies?.map((c) => {
              const isActive = c.id === user.company_id;
              const isSwitching = switching === c.id;
              return (
                <button
                  key={c.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => void pick(c.id)}
                  disabled={!!switching}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: 'none',
                    background: isActive ? 'var(--tint-2)' : 'transparent',
                    color: 'var(--text-1)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: switching ? 'default' : 'pointer',
                    opacity: switching && !isSwitching ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'var(--tint-1)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                  {isSwitching ? (
                    <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>…</span>
                  ) : isActive ? (
                    <Icon name="check" size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  ) : null}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
