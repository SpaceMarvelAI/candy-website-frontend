import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Icon from '../assets/icons';

// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_W = 56;
const EXPANDED_W  = 256;
const MOBILE_W    = 288;

const NAV_SECTIONS = [
  {
    label: '',
    items: [
      { id: 'prompt-library',   label: 'Prompt Library',   icon: 'book', path: null },
      { id: 'workspace-agents', label: 'Workspace Agents', icon: 'team', path: null },
      { id: 'connectors',       label: 'Connectors',       icon: 'flow', path: '/connects' },
    ],
  },
  {
    label: 'Products',
    items: [
      { id: 'metaspace', label: 'Meta Space', icon: '', img: '/Metaspace.svg',   path: null,
        ssoTarget: 'https://meta.spacemarvel.ai', external: true },
      { id: 'finixy',    label: 'Finixy',     icon: '', img: '/FinixyLogo.svg', path: null,
        ssoTarget: 'https://app.finixy.ai',        external: true },
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
  ['/flows',     'flows'],
  ['/connects',  'connectors'],
];

const isLocal = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const SM_API = isLocal
  ? '/sm-api'
  : ((import.meta as any).env?.VITE_SM_API_URL || 'https://dashboard-api.spacemarvel.ai');

// ─── Profile popover ──────────────────────────────────────────────────────────
function ProfileMenu({
  anchorRect, panelWidth, onClose, onSignOut, navigate, addToast,
  theme, setTheme,
}: {
  anchorRect: DOMRect; panelWidth: number;
  onClose: () => void; onSignOut: () => void;
  navigate: (p: string) => void; addToast: (m: string, k?: string) => void;
  theme: string; setTheme: (t: 'light' | 'dark') => void;
}) {
  const [subMenu, setSubMenu] = useState<null | 'appearance' | 'help'>(null);
  const [subMenuY, setSubMenuY] = useState(0);

  const menuWidth   = 220;
  const flyoutWidth = 190;
  const left   = 8;
  const bottom = window.innerHeight - anchorRect.top + 6;
  const flyoutLeft = panelWidth + 6;

  function toggleSub(name: 'appearance' | 'help', e: React.MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSubMenuY(rect.top);
    setSubMenu(s => s === name ? null : name);
  }

  const subBtn = (label: string, icon: string, name: 'appearance' | 'help') => (
    <button
      onClick={e => toggleSub(name, e)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 12px',
        background: subMenu === name ? 'var(--tint-2)' : 'transparent',
        border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
        fontSize: 13, fontWeight: 500, color: 'var(--text-1)', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--tint-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = subMenu === name ? 'var(--tint-2)' : 'transparent'; }}
    >
      <Icon name={icon} size={14} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, opacity: 0.4 }}>›</span>
    </button>
  );

  const menuItem = (
    label: string,
    onClick: () => void,
    opts: { icon?: string; danger?: boolean; active?: boolean } = {}
  ) => (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '8px 12px',
        background: opts.active ? 'rgba(0,113,227,0.1)' : 'transparent',
        border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
        fontSize: 13, fontWeight: 500,
        color: opts.danger ? '#f87171' : opts.active ? 'var(--blue)' : 'var(--text-1)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = opts.danger ? 'rgba(248,113,113,0.1)' : 'var(--tint-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = opts.active ? 'rgba(0,113,227,0.1)' : 'transparent'; }}
    >
      {opts.icon && <Icon name={opts.icon} size={14} />}
      <span style={{ flex: 1 }}>{label}</span>
      {opts.active && <span style={{ display: 'inline-flex', color: 'var(--blue)' }}><Icon name="check" size={12} /></span>}
    </button>
  );

  // Clamp so the flyout never bleeds below the viewport (4 items ≈ 160px + padding)
  const safeFlyoutTop = Math.min(subMenuY, window.innerHeight - 172 - 12);

  const flyoutStyle: React.CSSProperties = {
    position: 'fixed',
    left: flyoutLeft,
    top: safeFlyoutTop,
    width: flyoutWidth,
    background: 'var(--surface-solid)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: '6px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 201,
    animation: 'menuFadeIn 0.12s ease',
  };

  return createPortal(
    <>
      <style>{`
        @keyframes menuFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes menuFadeIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
      `}</style>

      {/* Backdrop — captures outside clicks without DOM event hacks */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 198 }}
        onClick={onClose}
      />

      {/* ── Main menu ── */}
      <div style={{
        position: 'fixed', left, bottom, width: menuWidth,
        background: 'var(--surface-solid)',
        border: '1px solid var(--border)',
        borderRadius: 12, padding: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 200, animation: 'menuFadeUp 0.15s ease',
      }}>
        {/* Upgrade plan */}
        <button
          onClick={() => { addToast('Upgrade plan — coming soon', 'info'); onClose(); }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 9,
            padding: '8px 12px', background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8,
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: 'var(--purple-hi)', marginBottom: 4, transition: 'background 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.15)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.08)'; }}
        >
          <Icon name="zap" size={14} />
          <span style={{ flex: 1 }}>Upgrade plan</span>
        </button>

        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

        {menuItem('Connectors', () => { navigate('/connects'); onClose(); }, { icon: 'plug' })}
        {subBtn('Appearance', 'sun',  'appearance')}
        {menuItem('Settings',  () => { addToast('Settings — coming soon', 'info'); onClose(); }, { icon: 'settings' })}
        {subBtn('Help', 'help', 'help')}

        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

        {menuItem('Sign out', () => { onClose(); onSignOut(); }, { icon: 'logout', danger: true })}
      </div>

      {/* ── Appearance flyout ── */}
      {subMenu === 'appearance' && (
        <div style={flyoutStyle}>
          {menuItem('Light theme',  () => setTheme('light'), { active: theme === 'light' })}
          {menuItem('Dark theme',   () => setTheme('dark'),  { active: theme === 'dark'  })}
          {menuItem('System theme', () => {
            const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            setTheme(sys);
          })}
          {menuItem('Customize theme', () => addToast('Custom theme — coming soon', 'info'))}
        </div>
      )}

      {/* ── Help flyout ── */}
      {subMenu === 'help' && (
        <div style={flyoutStyle}>
          {menuItem('Report issue',       () => addToast('Report issue — coming soon', 'info'))}
          {menuItem('Terms & conditions', () => window.open('https://spacemarvel.ai/terms', '_blank'))}
          {menuItem('Privacy policy',     () => window.open('https://spacemarvel.ai/privacy', '_blank'))}
          {menuItem('Contact support',    () => addToast('Contact support — coming soon', 'info'))}
        </div>
      )}
    </>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { user, addToast, signOut } = useApp();
  const { theme, setTheme } = useTheme();
  const navigate     = useNavigate();
  const location     = useLocation();
  const [expanded, setExpanded] = useState(true);
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const isDark    = theme === 'dark';
  const imgFilter = isDark ? 'brightness(2)' : 'invert(1)';

  const activeId = PATH_TO_NAV.find(([prefix]) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/')
  )?.[1] ?? null;

  useEffect(() => {
    document.body.style.overflow = (isMobileOrTablet && mobileOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOrTablet, mobileOpen]);

  // Close profile menu on route change
  useEffect(() => { setProfileMenuOpen(false); }, [location.pathname]);

  // Reset hover state when sidebar collapses so Candy icon shows immediately
  useEffect(() => { setHeaderHovered(false); }, [expanded]);

  function openProfileMenu() {
    if (profileRef.current) {
      setProfileAnchor(profileRef.current.getBoundingClientRect());
      setProfileMenuOpen(true);
    }
  }

  async function handleNav(item: { path: string | null; label: string; ssoTarget?: string }) {
    if (!item.ssoTarget) {
      if (item.path) {
        navigate(item.path);
        if (isMobileOrTablet) onClose?.();
      } else {
        addToast(`"${item.label}" — coming soon`, 'info');
      }
      return;
    }

    const dashboardToken = localStorage.getItem('dashboard_token');

    if (dashboardToken) {
      try {
        const res = await fetch(`${SM_API}/api/rbac/auth/sso/generate/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${dashboardToken}`,
          },
          body: JSON.stringify({ app_url: item.ssoTarget }),
        });

        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('dashboard_token');
          throw new Error(`token_expired:${res.status}`);
        }

        if (!res.ok) throw new Error(`sso_generate_error:${res.status}`);

        const data = await res.json().catch(() => ({}));
        const ssoToken = data.sso_token || data.token;

        if (ssoToken) {
          const target = new URL(item.ssoTarget);
          target.searchParams.set('sso_token', ssoToken);
          target.searchParams.set('access_token', dashboardToken);
          window.location.href = target.toString();
          return;
        }

        throw new Error('no_sso_token_in_response');
      } catch {
        // Fall through silently — the redirect below will take the user to
        // SpaceMarvel login and back, which handles every failure case.
      }
    }

    // Save intent so SSO callback can redirect there immediately after login
    localStorage.setItem('candy:sso_intent', item.ssoTarget);
    const candyCallback = window.location.origin + '/sso/callback';
    window.location.href = `https://spacemarvel.ai/login?redirect_uri=${encodeURIComponent(candyCallback)}`;
  }

  const panelExpanded = isMobileOrTablet ? true : expanded;
  const panelWidth    = isMobileOrTablet ? MOBILE_W : (panelExpanded ? EXPANDED_W : COLLAPSED_W);

  const panelTransform = isMobileOrTablet
    ? (mobileOpen ? 'translateX(0)' : `translateX(-${MOBILE_W}px)`)
    : 'translateX(0)';
  const panelTransition = isMobileOrTablet
    ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
    : 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)';

  const hasShadow = expanded || (isMobileOrTablet && mobileOpen);

  const userName  = user?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail = user?.email || '';
  const initials  = userName.slice(0, 1).toUpperCase();

  return (
    <>
      {/* ── Backdrop (mobile/tablet only) ──────────────────────────────────── */}
      {isMobileOrTablet && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0,
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
      <div
        style={{
          position: 'fixed',
          top: 0, left: 0,
          height: '100vh',
          width: panelWidth,
          transform: panelTransform,
          transition: panelTransition,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          overflowX: 'hidden',
          boxShadow: hasShadow ? 'var(--shadow-rail)' : 'none',
          zIndex: 50,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: panelExpanded ? 'space-between' : 'center',
          height: 48,
          padding: panelExpanded ? '0 14px' : '0',
          flexShrink: 0,
          boxSizing: 'border-box',
          borderBottom: '1px solid var(--border)',
        }}>
          {/* Collapsed desktop: candy favicon by default, expand icon on hover */}
          {!panelExpanded && !isMobileOrTablet ? (
            <button
              onClick={() => setExpanded(true)}
              title="Expand sidebar"
              onMouseEnter={() => setHeaderHovered(true)}
              onMouseLeave={() => setHeaderHovered(false)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-1)', padding: 4, borderRadius: 6,
                display: 'grid', placeItems: 'center',
              }}
            >
              {headerHovered
                ? <Icon name="sidebar-collapse" size={20} />
                : <img src="/Candy.svg" alt="Candy" style={{ width: 22, height: 22, borderRadius: 6, display: 'block', filter: imgFilter }} />
              }
            </button>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <img
                  src="/Candy.svg"
                  alt="Candy"
                  style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'block', filter: imgFilter }}
                />
                {panelExpanded && (
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
                    Candy
                  </span>
                )}
              </div>
              {panelExpanded && !isMobileOrTablet && (
                <button
                  onClick={() => setExpanded(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-4)', padding: 4, borderRadius: 6,
                    display: 'grid', placeItems: 'center', transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-4)'; }}
                  title="Collapse sidebar"
                >
                  <Icon name="sidebar-expand" size={20} />
                </button>
              )}
              {isMobileOrTablet && (
                <button
                  onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', padding: 4, display: 'grid', placeItems: 'center' }}
                >
                  <Icon name="x" size={16} />
                </button>
              )}
            </>
          )}
        </div>

        {/* ── Scrollable nav area ─────────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 0' }}>
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} style={{ marginBottom: 4 }}>
              {section.label && panelExpanded && (
                <p style={styles.sectionLabel}>{section.label}</p>
              )}
              {section.label && !panelExpanded && (
                <div style={styles.sectionDivider} />
              )}
              {!section.label && si > 0 && (
                <div style={styles.sectionDivider} />
              )}

              <div style={{ padding: panelExpanded ? '0 8px' : '0 4px' }}>
                {section.items.map((item: any) => {
                  const isActive = activeId === item.id;
                  const isExternal = !!item.external;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item)}
                      className={!panelExpanded ? 'tooltip-wrap' : ''}
                      data-tip={!panelExpanded ? item.label : undefined}
                      style={{
                        ...styles.navBtn,
                        justifyContent: panelExpanded ? 'flex-start' : 'center',
                        padding:        panelExpanded ? '8px 12px' : 0,
                        width:          '100%',
                        height:         panelExpanded ? 'auto' : 36,
                        margin:         '0 0 2px 0',
                        borderRadius:   12,
                        background:     isActive ? 'rgba(0, 113, 227, 0.12)' : 'transparent',
                        border:         isActive ? '1px solid rgba(0, 113, 227, 0.22)' : '1px solid transparent',
                        color:          isActive ? 'var(--text-1)' : 'var(--text-2)',
                        transition:     'background 0.12s, color 0.12s',
                      }}
                      onMouseEnter={e => {
                        if (isActive) return;
                        e.currentTarget.style.background = 'var(--tint-2)';
                        e.currentTarget.style.color = 'var(--text-1)';
                      }}
                      onMouseLeave={e => {
                        if (isActive) return;
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = 'var(--text-2)';
                      }}
                    >
                      {isActive && panelExpanded && <span style={styles.accentBar} />}
                      {item.img ? (
                        <img src={item.img} alt={item.label}
                          style={{ width: 20, height: 20, objectFit: 'contain', filter: imgFilter, flexShrink: 0 }} />
                      ) : (
                        <Icon name={item.icon} size={16} />
                      )}
                      {panelExpanded && (
                        <>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left' }}>{item.label}</span>
                          {isExternal && <Icon name="externallink" size={14} style={{ opacity: 0.50, flexShrink: 0 }} />}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* ── User profile ────────────────────────────────────────────────────── */}
        <div
          ref={profileRef}
          onClick={openProfileMenu}
          title={!panelExpanded ? `${userName} · ${userEmail}` : undefined}
          style={{
            borderTop: '1px solid var(--border)',
            padding: panelExpanded ? '12px 12px' : '12px 0',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: panelExpanded ? 'flex-start' : 'center',
            gap: 10,
            cursor: 'pointer',
            transition: 'background 0.15s',
            background: profileMenuOpen ? 'var(--tint-2)' : 'transparent',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--tint-2)'; }}
          onMouseLeave={e => { if (!profileMenuOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'var(--grad-brand)',
            display: 'grid', placeItems: 'center',
            fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
          }}>
            {initials}
          </div>
          {panelExpanded && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-4)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {userEmail}
              </div>
            </div>
          )}
          {panelExpanded && (
            <Icon name="more" size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
          )}
        </div>
      </div>

      {/* ── Profile menu (portaled) ─────────────────────────────────────────── */}
      {profileMenuOpen && profileAnchor && (
        <ProfileMenu
          anchorRect={profileAnchor}
          panelWidth={panelWidth}
          onClose={() => setProfileMenuOpen(false)}
          onSignOut={signOut}
          navigate={(p) => { navigate(p); setProfileMenuOpen(false); }}
          addToast={addToast}
          theme={theme}
          setTheme={setTheme}
        />
      )}

      {/* ── Flex placeholder — mirrors the panel width so the content area shifts ── */}
      <aside
        className="sidebar-placeholder"
        style={{
          width: isMobileOrTablet ? 0 : panelWidth,
          transition: isMobileOrTablet ? 'none' : panelTransition,
        }}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  sectionLabel: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.16em',
    color: 'var(--text-4)', padding: '10px 18px 4px', margin: 0,
  },
  sectionDivider: {
    height: 1, background: 'var(--border)', margin: '8px 14px', opacity: 0.6,
  },
  navBtn: {
    display: 'flex', alignItems: 'center', gap: 12,
    borderRadius: 12, fontSize: 13.5, fontWeight: 500,
    cursor: 'pointer', textAlign: 'left',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    position: 'relative',
  },
  accentBar: {
    position: 'absolute', left: -12, top: '50%',
    transform: 'translateY(-50%)',
    width: 3, height: 16,
    background: 'var(--grad-brand)', borderRadius: '0 3px 3px 0',
  },
};
