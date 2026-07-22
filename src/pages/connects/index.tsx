import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import posthog from 'posthog-js';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../assets/icons';
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

function AppIcon({ app, size = 36 }: { app: ComposioApp; size?: number }) {
  const [imgErr, setImgErr] = useState(false);
  const logo = appLogo(app);
  const name = app.name || '?';

  if (logo && !imgErr) {
    return (
      <img
        src={logo}
        alt={name}
        style={{ width: size, height: size, objectFit: 'contain', borderRadius: 8, flexShrink: 0 }}
        onError={() => setImgErr(true)}
      />
    );
  }

  return (
    <div
      style={{
        width: size, height: size, borderRadius: 8,
        background: colorFromName(name),
        display: 'grid', placeItems: 'center',
        fontWeight: 700, fontSize: Math.round(size * 0.42),
        color: '#fff', flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {name[0].toUpperCase()}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '18px 16px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--tint-4)', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 13, borderRadius: 4, background: 'var(--tint-4)', marginBottom: 6, width: '60%' }} />
          <div style={{ height: 10, borderRadius: 4, background: 'var(--tint-2)', width: '40%' }} />
        </div>
      </div>
      <div style={{ height: 32, borderRadius: 8, background: 'var(--tint-2)' }} />
    </div>
  );
}

export default function ConnectsPage() {
  const { addToast } = useApp();
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

  const categories = ['All', 'Connected', ...Array.from(
    new Set(apps.map(appCategory).filter(Boolean))
  ).sort()];

  const filtered = apps.filter(app => {
    if (search && !app.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category === 'Connected') return connIds.has(appId(app));
    if (category !== 'All')       return appCategory(app) === category;
    return true;
  });

  const visible = filtered.slice(0, visibleCount);
  const cols    = isMobile ? 2 : isTablet ? 3 : 4;

  return (
    <div
      className="fade-up"
      style={{ padding: isMobile ? '20px 16px 48px' : isTablet ? '24px 24px 52px' : '32px 40px 60px' }}
    >
      {/* ── Page header ── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{
            fontSize: 11, textTransform: 'uppercase',
            letterSpacing: '0.2em', color: 'var(--blue)', marginBottom: 10,
          }}>
            Integrations · Connects
          </div>
          <h1 style={{
            fontSize: isMobile ? 22 : 28, fontWeight: 700,
            letterSpacing: '-0.025em', color: 'var(--text-1)', margin: 0,
          }}>
            Connect Apps
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 8, marginBottom: 0 }}>
            {loading
              ? 'Loading…'
              : `${connIds.size} app${connIds.size === 1 ? '' : 's'} connected`}
          </p>
        </div>
        <button
          onClick={() => loadData().then(() => addToast('Refreshed', 'success'))}
          style={{
            padding: '8px 16px', borderRadius: 99,
            background: 'var(--tint-2)', border: '1px solid var(--border)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            transition: 'all 0.15s', flexShrink: 0,
          }}
        >
          <Icon name="refresh" size={13} /> Refresh
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
          {/* ── Search ── */}
          <div style={{ position: 'relative', marginBottom: 16, maxWidth: 340 }}>
            <div style={{
              position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none', color: 'var(--text-4)',
            }}>
              <Icon name="search" size={14} />
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 36, paddingRight: 14,
                paddingTop: 9, paddingBottom: 9,
                borderRadius: 10, fontSize: 14,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-1)', outline: 'none',
                transition: 'border-color 0.15s',
              }}
            />
          </div>

          {/* ── Category chips ── */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 24 }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={{
                  padding: '6px 14px', borderRadius: 99, fontSize: 12.5,
                  background: category === cat ? 'var(--tint-4)' : 'var(--tint-2)',
                  border: category === cat ? '1px solid var(--border-strong)' : '1px solid var(--border)',
                  color: category === cat ? 'var(--text-1)' : 'var(--text-2)',
                  cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {cat}
                {cat === 'Connected' && connIds.size > 0 && (
                  <span style={{
                    fontSize: 10, padding: '1px 6px', borderRadius: 99,
                    background: 'rgba(0,113,227,0.15)', color: 'var(--blue)', fontWeight: 600,
                  }}>
                    {connIds.size}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── App grid ── */}
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
              {Array.from({ length: 12 }, (_, i) => <CardSkeleton key={i} />)}
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
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 14 }}>
                {visible.map(app => {
                  const id           = appId(app);
                  const isConnected  = connIds.has(id);
                  const isConnecting = connectingId === id;

                  return (
                    <div
                      key={id}
                      style={{
                        background: 'var(--surface)',
                        border: `1px solid ${isConnected ? 'rgba(76,175,80,0.3)' : 'var(--border)'}`,
                        borderRadius: 'var(--radius)',
                        padding: '18px 16px',
                        display: 'flex', flexDirection: 'column', gap: 12,
                        transition: 'border-color 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AppIcon app={app} size={36} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{
                            fontSize: 13.5, fontWeight: 600, color: 'var(--text-1)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {app.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                            {appCategory(app)}
                          </div>
                        </div>
                        {/* Connected dot — top-right of card header */}
                        {isConnected && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, flexShrink: 0,
                            color: 'var(--green)', background: 'rgba(76,175,80,0.14)',
                            borderRadius: 4, padding: '2px 6px',
                          }}>●</span>
                        )}
                      </div>

                      {/* Action button — only shown when not connected */}
                      {!isConnected && (
                        <button
                          onClick={() => !isConnecting && handleConnect(app)}
                          disabled={isConnecting}
                          style={{
                            width: '100%', padding: '7px 12px',
                            borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                            cursor: isConnecting ? 'wait' : 'pointer',
                            border: '1px solid var(--border)',
                            background: isConnecting ? 'var(--tint-2)' : 'rgba(0,113,227,0.08)',
                            color: isConnecting ? 'var(--text-4)' : 'var(--blue)',
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

                      {/* Connected state — just a status row, no button */}
                      {isConnected && (
                        <div style={{
                          fontSize: 12, color: 'var(--green)',
                          display: 'flex', alignItems: 'center', gap: 5,
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
