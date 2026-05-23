import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Icon from '../assets/icons';

// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_W = 56;
const EXPANDED_W  = 220;

const NAV_SECTIONS = [
  {
    label: 'Products',
    items: [
      { id: 'metaspace', label: 'Metaspace', icon: '', img: '/Metaspace.png', path: null,
        ssoTarget: 'https://meta.spacemarvel.ai' },
      { id: 'finixy',    label: 'Finixy',    icon: '', img: '/Finixy.svg',   path: null,
        ssoTarget: 'https://app.finixy.ai' },
    ],
  },
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Voice Bots',  icon: 'voicebot', path: '/dashboard' },
      { id: 'chatbots',  label: 'Chatbots',   icon: 'chat',     path: '/chatbots' },
      { id: 'voice',     label: 'Live Calls', icon: 'livecall', path: '/live' },
      { id: 'analytics', label: 'Analytics',  icon: 'chart',    path: '/analytics' },
      { id: 'flows',     label: 'Flows',      icon: 'flowsnav', path: '/flows' },
    ],
  },
];

const PATH_TO_NAV: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/chatbots',  'chatbots'],
  ['/live',      'voice'],
  ['/analytics', 'analytics'],
  ['/webhooks',  'webhooks'],
  ['/flows',     'flows'],
];

const SM_API = (import.meta as any).env?.VITE_SM_API_URL || 'https://dashboard-api.spacemarvel.ai';

// ─────────────────────────────────────────────────────────────────────────────
interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { addToast } = useApp();
  const { theme }    = useTheme();
  const navigate     = useNavigate();
  const location     = useLocation();
  const [expanded, setExpanded] = useState(false);
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');

  const imgFilter = theme === 'dark'
    ? 'brightness(0) invert(1)'
    : 'brightness(0)';

  const activeId = PATH_TO_NAV.find(([prefix]) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/')
  )?.[1] ?? null;

  // Lock body scroll while mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = (isMobileOrTablet && mobileOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOrTablet, mobileOpen]);

  async function handleNav(item: { path: string | null; label: string; ssoTarget?: string }) {
    if (item.ssoTarget) {
      const dashboardToken = localStorage.getItem('dashboard_token');

      if (dashboardToken) {
        try {
          const res = await fetch(`${SM_API}/api/rbac/auth/sso/generate/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${dashboardToken}`,
            },
            body: JSON.stringify({ app_url: item.ssoTarget }),
          });
          const data = await res.json().catch(() => ({}));

          if (data.sso_token) {
            const cbUrl = new URL('/sso/callback', item.ssoTarget);
            cbUrl.searchParams.set('token', data.sso_token);
            cbUrl.searchParams.set('access_token', dashboardToken);
            window.location.href = cbUrl.toString();
            return;
          }
        } catch { /* fall through to login redirect */ }
      }

      // No token stored or generate failed — send through SpaceMarvel login
      window.location.href = `https://spacemarvel.ai/login?redirect_uri=${encodeURIComponent(item.ssoTarget + '/sso/callback')}`;
      return;
    }

    if (item.path) {
      navigate(item.path);
      if (isMobileOrTablet) onClose?.();
    } else {
      addToast(`"${item.label}" — coming soon`, 'info');
    }
  }

  // On mobile/tablet: always fully expanded; on desktop: hover-driven.
  const panelExpanded = isMobileOrTablet ? true : expanded;
  const panelWidth    = panelExpanded ? EXPANDED_W : COLLAPSED_W;

  // Mobile: slide in/out via translateX. Desktop: width transition only.
  const panelTransform = isMobileOrTablet
    ? (mobileOpen ? 'translateX(0)' : `translateX(-${EXPANDED_W}px)`)
    : 'translateX(0)';
  const panelTransition = isMobileOrTablet
    ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
    : 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)';

  const hasShadow = expanded || (isMobileOrTablet && mobileOpen);

  return (
    <>
      {/* ── Backdrop (mobile/tablet only) ──────────────────────────────────── */}
      {isMobileOrTablet && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(3px)',
            zIndex: 48,
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
            transition: 'opacity 0.25s ease',
          }}
        />
      )}

      {/* ── Fixed navigation panel ─────────────────────────────────────────── */}
      {/*  NOTE: This is intentionally a SIBLING of <aside>, NOT a child.       */}
      {/*  The <aside> gets display:none on mobile; if the panel were inside it, */}
      {/*  it would be hidden too — even with position:fixed.                   */}
      <div
        onMouseEnter={!isMobileOrTablet ? () => setExpanded(true)  : undefined}
        onMouseLeave={!isMobileOrTablet ? () => setExpanded(false) : undefined}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: panelWidth,
          transform: panelTransform,
          transition: panelTransition,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: panelExpanded ? '14px 10px' : '14px 8px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxShadow: hasShadow ? 'var(--shadow-rail)' : 'none',
          zIndex: 50,
        }}
      >
        {/* Close button — mobile/tablet only */}
        {isMobileOrTablet && (
          <button
            onClick={onClose}
            aria-label="Close menu"
            style={{
              alignSelf: 'flex-end',
              width: 30, height: 30,
              borderRadius: 8,
              background: 'var(--tint-2)',
              border: '1px solid var(--border)',
              color: 'var(--text-2)',
              display: 'grid', placeItems: 'center',
              cursor: 'pointer',
              marginBottom: 6,
              flexShrink: 0,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--tint-4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--tint-2)'; }}
          >
            <Icon name="x" size={14} />
          </button>
        )}

        {/* Workspace branding */}
        <div style={{ ...styles.wsRow, marginBottom: 14, padding: '2px 2px' }}>
          <div style={styles.wsAvatar}>
            <Icon name="grid" size={13} />
          </div>
          {panelExpanded && (
            <div style={styles.wsMeta as React.CSSProperties}>
              <span style={styles.wsName}>SpaceMarvel</span>
              <span style={styles.wsPlan}>Pro workspace</span>
            </div>
          )}
        </div>

        {/* Nav sections */}
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            {panelExpanded ? (
              <p style={styles.sectionLabel}>{section.label}</p>
            ) : (
              <div style={styles.sectionDivider} />
            )}

            {section.items.map((item: any) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item)}
                  className={!panelExpanded ? 'tooltip-wrap' : ''}
                  data-tip={!panelExpanded ? item.label : undefined}
                  style={{
                    ...styles.navBtn,
                    justifyContent: panelExpanded ? 'flex-start' : 'center',
                    padding:        panelExpanded ? '8px 10px' : 0,
                    width:          panelExpanded ? '100%' : 36,
                    height:         panelExpanded ? 'auto' : 36,
                    margin:         panelExpanded ? '0 0 2px 0' : '0 auto 4px',
                    borderRadius:   panelExpanded ? 10 : 12,
                    background:     isActive ? 'rgba(0, 113, 227, 0.15)' : 'transparent',
                    border:         isActive ? '1px solid rgba(0, 113, 227, 0.25)' : '1px solid transparent',
                    color:          isActive ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  {isActive && panelExpanded && <span style={styles.accentBar} />}

                  {item.img ? (
                    <img
                      src={item.img}
                      alt={item.label}
                      style={{ width: 22, height: 22, objectFit: 'contain', filter: imgFilter, flexShrink: 0 }}
                    />
                  ) : (
                    <Icon name={item.icon} size={16} />
                  )}

                  {panelExpanded && (
                    <>
                      <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
                      {item.badge && <span style={styles.badge}>{item.badge}</span>}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* ── Grid placeholder ────────────────────────────────────────────────── */}
      {/*  Reserves 56px in the desktop CSS grid.                               */}
      {/*  On mobile/tablet, display:none removes it from grid flow.            */}
      {/*  The fixed panel above is a sibling, so display:none here has NO      */}
      {/*  effect on the panel's visibility.                                    */}
      <aside className="sidebar-placeholder" />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  wsRow: {
    display: 'flex', alignItems: 'center',
    gap: 10, cursor: 'pointer', borderRadius: 8, minWidth: 0,
  },
  wsAvatar: {
    width: 28, height: 28, borderRadius: 7,
    background: 'var(--tint-2)', border: '1px solid var(--border)',
    display: 'grid', placeItems: 'center',
    fontWeight: 700, fontSize: 14, color: 'var(--text-2)', flexShrink: 0,
  },
  wsMeta: { display: 'flex', flexDirection: 'column', lineHeight: 1.15 },
  wsName: { fontSize: 13, fontWeight: 600, color: 'var(--text-1)' },
  wsPlan: { fontSize: 11, color: 'var(--text-3)' },
  sectionLabel: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em',
    color: 'var(--text-4)', padding: '14px 12px 6px', margin: 0,
  },
  sectionDivider: {
    height: 1, background: 'var(--border)', margin: '14px 14px 8px', opacity: 0.6,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 11,
    borderRadius: 10, fontSize: 14, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    position: 'relative', marginBottom: 2,
  },
  accentBar: {
    position: 'absolute', left: -14, top: '50%',
    transform: 'translateY(-50%)',
    width: 3, height: 18,
    background: 'var(--grad-brand)', borderRadius: '0 3px 3px 0',
  },
  badge: {
    marginLeft: 'auto', fontSize: 10, padding: '2px 7px', borderRadius: 99,
    background: 'rgba(0, 113, 227, 0.12)', color: 'var(--blue)',
    fontWeight: 600, letterSpacing: '0.04em',
  },
};
