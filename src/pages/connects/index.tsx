import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import posthog from 'posthog-js';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useTheme } from '../../hooks/useTheme';
import Icon from '../../assets/icons';

// Exact values from MetaSpace/Finixy's ConnectorPanel.tsx (components/chat/sidebar/
// ConnectorPanel.tsx) — hardcoded rather than Candy's --surface/--border tokens because
// those are translucent Apple-style tints and would render visibly different from
// MetaSpace's flat zinc palette.
function connectorTheme(dark: boolean) {
  return {
    cardBg:        dark ? '#18181b' : '#ffffff',
    cardBorder:    dark ? '#27272a' : '#e4e4e7',
    iconBg:        dark ? '#27272a' : '#f4f4f5',
    title:         dark ? '#fafafa' : '#18181b',
    muted:         dark ? '#a1a1aa' : '#71717a',
    inputBg:       dark ? '#18181b' : '#ffffff',
    inputBorder:   dark ? '#3f3f46' : '#d4d4d8',
    inputText:     dark ? '#f4f4f5' : '#18181b',
    placeholder:   dark ? '#71717a' : '#a1a1aa',
    pillBg:        dark ? '#27272a' : '#f4f4f5',
    pillBorder:    dark ? '#3f3f46' : '#e4e4e7',
    pillText:      dark ? '#a1a1aa' : '#52525b',
    greenBg:       dark ? 'rgba(34,197,94,0.1)' : '#f0fdf4',
    greenBorder:   dark ? 'rgba(34,197,94,0.3)' : '#bbf7d0',
    greenText:     dark ? '#4ade80' : '#16a34a',
    greenSelected: '#22c55e',
    connectBg:     dark ? '#27272a' : '#ffffff',
    connectBorder: dark ? '#3f3f46' : '#d4d4d8',
    connectText:   dark ? '#e4e4e7' : '#3f3f46',
    connectedBg:     'rgba(34,197,94,0.1)',
    connectedBorder: 'rgba(34,197,94,0.3)',
    connectedText:   '#22c55e',
  };
}
import {
  getComposioApps,
  getComposioConnections,
  getAppAuthInfo,
  connectComposioApp,
  connectComposioAppWithCredentials,
  appId,
  appLogo,
  appCategory,
  connectedAppId,
  redirectUrl,
  isActiveConnection,
  type ComposioApp,
  type AuthInfoField,
} from '../../api/composio';

const PAGE_SIZE = 48;

function colorFromName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `hsl(${Math.abs(h) % 360}, 50%, 60%)`;
}

// Container w-11 h-11 (44px), icon itself w-9 h-9 (36px) — MetaSpace's "enlarged" sizing.
function AppIcon({ app, iconBg }: { app: ComposioApp; iconBg: string }) {
  const [imgErr, setImgErr] = useState(false);
  const logo = appLogo(app);
  const name = app.name || '?';
  const hasLogo = !!logo && !imgErr;

  return (
    <div
      style={{
        width: 44, height: 44, borderRadius: 6, flexShrink: 0, overflow: 'hidden',
        display: 'grid', placeItems: 'center',
        background: hasLogo ? iconBg : colorFromName(name),
      }}
    >
      {hasLogo ? (
        <img
          src={logo}
          alt={name}
          style={{ width: 36, height: 36, objectFit: 'contain' }}
          onError={() => setImgErr(true)}
        />
      ) : (
        <span style={{ fontWeight: 700, fontSize: 16, color: '#fff', letterSpacing: '-0.02em' }}>
          {name[0].toUpperCase()}
        </span>
      )}
    </div>
  );
}

function CardSkeleton({ c }: { c: ReturnType<typeof connectorTheme> }) {
  return (
    <div style={{
      background: c.cardBg, border: `1px solid ${c.cardBorder}`,
      borderRadius: 8, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 6, background: 'var(--tint-4)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 14, borderRadius: 4, background: 'var(--tint-4)', marginBottom: 6, width: '60%' }} />
          <div style={{ height: 10, borderRadius: 4, background: 'var(--tint-2)', width: '40%' }} />
        </div>
      </div>
      <div style={{ height: 32, borderRadius: 8, background: 'var(--tint-2)' }} />
    </div>
  );
}

// ─── Category dropdown ─────────────────────────────────────────────────────────
// Custom listbox rather than a native <select>: the native popup is drawn by the
// OS and ignores CSS, which clashed with the dark shell menus.
function CategoryDropdown({ options, value, onChange }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const active  = options.includes(value);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (!open) setQuery(''); }, [open]);

  const shown = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));

  function pick(v: string) { onChange(v); setOpen(false); }

  const row = (label: string, v: string, selected: boolean) => (
    <button
      key={v || '__all'}
      role="option"
      aria-selected={selected}
      className="cat-dd-option"
      onClick={() => pick(v)}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      {selected && <Icon name="check" size={13} />}
    </button>
  );

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        className="cat-dd-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-active={active || undefined}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {active ? value : 'All categories'}
        </span>
        <Icon name="chevronDown" size={12} style={{
          flexShrink: 0, opacity: 0.7,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
        }} />
      </button>

      {open && (
        <div className="cat-dd-panel">
          <div style={{ position: 'relative', padding: 6 }}>
            <Icon name="search" size={13} style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              color: 'var(--shell-section)', pointerEvents: 'none',
            }} />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search categories…"
              className="cat-dd-search"
            />
          </div>
          <div role="listbox" aria-label="Categories" className="cat-dd-list">
            {!query && row('All categories', '', !active)}
            {shown.map(o => row(o, o, o === value))}
            {shown.length === 0 && <div className="cat-dd-empty">No categories match</div>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConnectsPage() {
  const { addToast } = useApp();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const c = connectorTheme(theme === 'dark');
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  const [hasToken, setHasToken] = useState(() => !!localStorage.getItem('dashboard_token'));

  const [apps,          setApps]         = useState<ComposioApp[]>([]);
  const [connIds,       setConnIds]      = useState<Set<string>>(new Set());
  const [loading,       setLoading]      = useState(hasToken);
  const [apiError,      setApiError]     = useState<string | null>(null);
  const [search,        setSearch]       = useState('');
  const [category,      setCategory]     = useState('All');
  const [visibleCount,  setVisibleCount] = useState(PAGE_SIZE);
  const [connectingId,  setConnectingId] = useState<string | null>(null);
  const [credModal,     setCredModal]    = useState<{ app: ComposioApp; fields: AuthInfoField[] } | null>(null);
  const [credValues,    setCredValues]   = useState<Record<string, string>>({});

  const initRef     = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setApiError(null);
    try {
      const [appsData, connsData] = await Promise.all([
        getComposioApps(),
        getComposioConnections(),
      ]);
      setApps(appsData);
      setConnIds(new Set(connsData.filter(isActiveConnection).map(connectedAppId)));
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === 'COMPOSIO_UNAUTHORIZED') {
        setHasToken(false);
      } else {
        setApiError(msg);
        if (!quiet) addToast('Failed to load integrations', 'error');
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    if (initRef.current || !hasToken) return;
    initRef.current = true;
    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => stopPoll(), []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE); },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  });

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, category]);

  // Client-only: filtering happens against the already-fetched app list, no
  // request is made — so there's no backend event marking that search was
  // used. Debounced so a capture fires once per pause-in-typing rather than
  // per keystroke. Query text itself isn't sent, only its match count.
  useEffect(() => {
    if (!search) return;
    const id = setTimeout(() => {
      const resultCount = apps.filter(app => app.name.toLowerCase().includes(search.toLowerCase())).length;
      posthog.capture('connector_search_used', { result_count: resultCount });
    }, 600);
    return () => clearTimeout(id);
  }, [search, apps]);

  async function handleConnect(app: ComposioApp) {
    const id = appId(app);
    if (connectingId === id) return;
    posthog.capture('connector_connect_clicked', { provider: id });
    setConnectingId(id);
    try {
      const info = await getAppAuthInfo(id);

      if (info.auth_type === 'no_auth') {
        await connectComposioApp(id);
        setConnIds(prev => new Set([...prev, id]));
        addToast(`${app.name} connected`, 'success');
        setConnectingId(null);
        return;
      }

      if (info.auth_type === 'api_key') {
        const fields = info.required_fields ?? [{ name: 'api_key', label: 'API Key', type: 'password' }];
        setCredValues(Object.fromEntries(fields.map(f => [f.name, ''])));
        setCredModal({ app, fields });
        setConnectingId(null);
        return;
      }

      // OAuth — open popup and poll with grace period
      const res = await connectComposioApp(id);
      const url = redirectUrl(res);
      if (!url) throw new Error('No redirect URL');
      const popup = window.open(url, '_blank', 'width=640,height=720,noopener');
      let popupClosedAt: number | null = null;
      const GRACE_MS = 10_000;

      pollRef.current = setInterval(async () => {
        const closed = !popup || popup.closed;
        if (closed && popupClosedAt === null) popupClosedAt = Date.now();

        try {
          const conns = await getComposioConnections();
          const ids   = new Set(conns.filter(isActiveConnection).map(connectedAppId));
          if (ids.has(id)) {
            setConnIds(ids);
            stopPoll();
            setConnectingId(null);
            addToast(`${app.name} connected`, 'success');
          } else if (closed && popupClosedAt !== null && Date.now() - popupClosedAt > GRACE_MS) {
            posthog.capture('connector_oauth_abandoned', { provider: id });
            stopPoll();
            setConnectingId(null);
          }
        } catch {
          if (closed && popupClosedAt !== null && Date.now() - popupClosedAt > GRACE_MS) {
            posthog.capture('connector_oauth_abandoned', { provider: id });
            stopPoll();
            setConnectingId(null);
          }
        }
      }, 1500);
    } catch {
      addToast(`Failed to connect ${app.name}`, 'error');
      setConnectingId(null);
    }
  }

  async function handleCredSubmit() {
    if (!credModal) return;
    const id = appId(credModal.app);
    setConnectingId(id);
    try {
      await connectComposioAppWithCredentials(id, credValues);
      setConnIds(prev => new Set([...prev, id]));
      addToast(`${credModal.app.name} connected`, 'success');
      setCredModal(null);
      setCredValues({});
    } catch {
      addToast(`Could not connect ${credModal.app.name}`, 'error');
    } finally {
      setConnectingId(null);
    }
  }

  const categoryOptions = Array.from(
    new Set(apps.map(appCategory).filter(Boolean))
  ).sort();

  const filtered = apps.filter(app => {
    if (search && !app.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category === 'Connected') return connIds.has(appId(app));
    if (category !== 'All')       return appCategory(app) === category;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  // Capped at 2 columns at any width — grid-cols-1 sm:grid-cols-2, matches
  // MetaSpace/Finixy's ConnectorPanel.tsx exactly (not a bug, their own explicit ask).
  const cols    = isMobile ? 1 : 2;

  return (
    <div
      className="fade-up"
      style={{ padding: isMobile ? '20px 16px 48px' : isTablet ? '24px 24px 52px' : '32px 40px 60px' }}
    >
      {/* ── Page header — no breadcrumb: Back button + title block, matches MetaSpace ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontSize: 13.5, fontWeight: 500, color: c.muted, transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = c.title; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = c.muted; }}
          >
            <Icon name="chevronDown" size={16} style={{ transform: 'rotate(90deg)' }} />
            Back
          </button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: c.title, margin: 0 }}>
              Connect your apps
            </h1>
            <p style={{ color: c.muted, fontSize: 12, marginTop: 2, marginBottom: 0 }}>
              {loading
                ? 'Loading connections…'
                : `${connIds.size} app${connIds.size === 1 ? '' : 's'} connected`}
            </p>
          </div>
        </div>
        <button
          onClick={() => loadData().then(() => addToast('Refreshed', 'success'))}
          aria-label="Refresh"
          style={{
            width: 32, height: 32, display: 'grid', placeItems: 'center',
            borderRadius: 8, background: c.pillBg, border: `1px solid ${c.pillBorder}`,
            color: c.pillText, cursor: 'pointer', flexShrink: 0,
          }}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      {/* ── Auth guard ── */}
      {!hasToken && (
        <p style={{
          background: 'rgba(255,181,71,0.08)',
          border: '1px solid rgba(255,181,71,0.3)',
          borderRadius: 10, padding: '14px 18px',
          color: 'var(--amber)', fontSize: 13, lineHeight: 1.6, margin: 0,
        }}>
          Sign in via SSO first to connect apps.
        </p>
      )}

      {/* ── API error banner ── */}
      {hasToken && apiError && (
        <div style={{
          background: 'rgba(255,92,122,0.08)',
          border: '1px solid rgba(255,92,122,0.3)',
          borderRadius: 10, padding: '14px 18px',
          color: '#ff8194', fontSize: 13, lineHeight: 1.6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
        }}>
          <span className="ph-mask">Failed to load integrations — {apiError}</span>
          <button
            onClick={() => loadData()}
            style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12.5,
              background: 'rgba(255,92,122,0.12)', border: '1px solid rgba(255,92,122,0.3)',
              color: '#ff8194', cursor: 'pointer', flexShrink: 0,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {hasToken && (
        <>
          {/* ── Search + filters ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
            <div style={{ position: 'relative', width: isMobile ? '100%' : 256, flexShrink: 0 }}>
              <div style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                pointerEvents: 'none', color: c.placeholder,
              }}>
                <Icon name="search" size={14} />
              </div>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search apps…"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  paddingLeft: 36, paddingRight: 12,
                  paddingTop: 8, paddingBottom: 8,
                  borderRadius: 8, fontSize: 14,
                  background: c.inputBg, border: `1px solid ${c.inputBorder}`,
                  color: c.inputText, outline: 'none',
                  transition: 'border-color 0.15s',
                }}
              />
            </div>

            {/* "All" — neutral pill; filled blue only while selected. */}
            <button
              onClick={() => setCategory('All')}
              style={{
                padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                background: category === 'All' ? '#3b82f6' : c.pillBg,
                border: `1px solid ${category === 'All' ? '#3b82f6' : c.pillBorder}`,
                color: category === 'All' ? '#fff' : c.pillText,
                cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
              }}
            >
              All
            </button>

            {/* "Connected" — green pill, filled solid green only while selected. */}
            <button
              onClick={() => setCategory('Connected')}
              style={{
                padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 500,
                background: category === 'Connected' ? c.greenSelected : c.greenBg,
                border: `1px solid ${category === 'Connected' ? c.greenSelected : c.greenBorder}`,
                color: category === 'Connected' ? '#fff' : c.greenText,
                cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              Connected
              {connIds.size > 0 && <span>({connIds.size})</span>}
            </button>

            <CategoryDropdown options={categoryOptions} value={category} onChange={setCategory} />
          </div>

          {/* ── App grid ── */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
              {Array.from({ length: 12 }, (_, i) => <CardSkeleton key={i} c={c} />)}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              padding: '48px 24px', textAlign: 'center',
              color: 'var(--text-3)', fontSize: 14,
            }}>
              No apps found{search ? ` for "${search}"` : ''}.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10 }}>
                {visible.map(app => {
                  const id           = appId(app);
                  const isConnected  = connIds.has(id);
                  const isConnecting = connectingId === id;

                  return (
                    <div
                      key={id}
                      style={{
                        background: c.cardBg, border: `1px solid ${c.cardBorder}`,
                        borderRadius: 8, padding: 20,
                        display: 'flex', flexDirection: 'column', gap: 10,
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AppIcon app={app} iconBg={c.iconBg} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: 16, fontWeight: 600, color: c.title, lineHeight: 1.25,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {app.name}
                          </div>
                          <div style={{ fontSize: 11, color: c.muted, marginTop: 2 }}>
                            {appCategory(app)}
                          </div>
                        </div>
                      </div>

                      {/* Not connected — neutral pill, just "Connect". */}
                      {!isConnected && (
                        <button
                          onClick={() => !isConnecting && handleConnect(app)}
                          disabled={isConnecting}
                          style={{
                            width: '100%', padding: '7px 12px',
                            borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                            cursor: isConnecting ? 'wait' : 'pointer',
                            border: `1px solid ${c.connectBorder}`,
                            background: isConnecting ? c.pillBg : c.connectBg,
                            color: isConnecting ? c.muted : c.connectText,
                            transition: 'all 0.15s',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 6,
                          }}
                        >
                          {isConnecting ? (
                            'Connecting…'
                          ) : (
                            <><Icon name="plug" size={12} /> Connect</>
                          )}
                        </button>
                      )}

                      {/* Connected — green pill, check + "Connected". No disconnect:
                          Candy's composio.ts has no disconnect endpoint yet. */}
                      {isConnected && (
                        <div style={{
                          width: '100%', padding: '7px 12px', boxSizing: 'border-box',
                          borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                          border: `1px solid ${c.connectedBorder}`,
                          background: c.connectedBg, color: c.connectedText,
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6,
                        }}>
                          <Icon name="check" size={12} /> Connected
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {visible.length < filtered.length && (
                <div ref={sentinelRef} style={{ height: 1, marginTop: 14 }} />
              )}
            </>
          )}
        </>
      )}

      {/* ── API-key credentials modal ── */}
      {credModal && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => { setCredModal(null); setConnectingId(null); }}
        >
          <div
            style={{
              background: 'var(--surface-solid)', border: '1px solid var(--border)',
              borderRadius: 14, padding: '24px 28px', width: 'min(380px, 90vw)',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
              Connect {credModal.app.name}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-4)', marginBottom: 18 }}>
              Enter your credentials to connect this app.
            </div>
            {credModal.fields.map(field => (
              <div key={field.name} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 600,
                  color: 'var(--text-3)', marginBottom: 5 }}>
                  {field.label}
                </label>
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={credValues[field.name] ?? ''}
                  onChange={e => setCredValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                  placeholder={field.label}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--tint-2)', border: '1px solid var(--border)',
                    color: 'var(--text-1)', fontSize: 13, outline: 'none',
                  }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
              <button
                onClick={() => { setCredModal(null); setConnectingId(null); }}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCredSubmit}
                disabled={!!connectingId}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--grad-brand)', color: '#fff', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer', opacity: connectingId ? 0.7 : 1 }}
              >
                {connectingId ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
