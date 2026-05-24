import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../assets/icons';
import {
  getComposioApps,
  getComposioConnections,
  connectComposioApp,
  appId,
  appLogo,
  appCategory,
  connectedAppId,
  redirectUrl,
  type ComposioApp,
} from '../../api/composio';

const PAGE_SIZE = 48;

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ConnectsPage() {
  const { addToast } = useApp();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  const [hasToken, setHasToken] = useState(() => !!localStorage.getItem('dashboard_token'));

  const [apps,        setApps]       = useState<ComposioApp[]>([]);
  const [connIds,     setConnIds]    = useState<Set<string>>(new Set());
  const [loading,     setLoading]    = useState(hasToken);
  const [apiError,    setApiError]   = useState<string | null>(null);
  const [search,      setSearch]     = useState('');
  const [category,    setCategory]   = useState('All');
  const [visibleCount,setVisibleCount]= useState(PAGE_SIZE);
  const [connecting,  setConnecting] = useState<string | null>(null);

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
      setConnIds(new Set(connsData.map(connectedAppId)));
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

  // Intersection observer — reconnects on every render so sentinel is always watched
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
    setConnecting(id);
    try {
      const res = await connectComposioApp(id);
      const url = redirectUrl(res);
      if (!url) throw new Error('No redirect URL returned');

      const popup = window.open(url, '_blank', 'width=640,height=720,noopener');

      pollRef.current = setInterval(async () => {
        const closed = !popup || popup.closed;
        try {
          const conns = await getComposioConnections();
          const ids   = new Set(conns.map(connectedAppId));
          const nowConnected = ids.has(id);
          setConnIds(ids);
          if (nowConnected || closed) {
            stopPoll();
            setConnecting(null);
            if (nowConnected) addToast(`${app.name} connected`, 'success');
            else              addToast('Connection window closed', 'info');
          }
        } catch {
          if (closed) { stopPoll(); setConnecting(null); }
        }
      }, 2000);
    } catch {
      addToast(`Failed to connect ${app.name}`, 'error');
      setConnecting(null);
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
          <span>Failed to load integrations — {apiError}</span>
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
                  const isConnecting = connecting === id;

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
                        <div style={{ minWidth: 0 }}>
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
                      </div>

                      <button
                        onClick={() => !isConnected && !isConnecting && handleConnect(app)}
                        disabled={isConnected || isConnecting}
                        style={{
                          width: '100%', padding: '7px 12px',
                          borderRadius: 8, fontSize: 12.5, fontWeight: 500,
                          cursor: isConnected || isConnecting ? 'default' : 'pointer',
                          border: isConnected
                            ? '1px solid rgba(76,175,80,0.4)'
                            : '1px solid var(--border)',
                          background: isConnected ? 'rgba(76,175,80,0.1)' : 'var(--tint-2)',
                          color: isConnected
                            ? 'var(--green)'
                            : isConnecting
                            ? 'var(--text-4)'
                            : 'var(--text-2)',
                          transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6,
                        }}
                      >
                        {isConnected ? (
                          <><Icon name="check" size={12} /> Connected</>
                        ) : isConnecting ? (
                          'Connecting…'
                        ) : (
                          <><Icon name="plug" size={12} /> Connect</>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Scroll sentinel for infinite load */}
              {visible.length < filtered.length && (
                <div ref={sentinelRef} style={{ height: 1, marginTop: 14 }} />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
