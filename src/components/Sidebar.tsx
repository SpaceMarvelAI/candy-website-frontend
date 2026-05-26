import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
      { id: 'metaspace', label: 'Meta Space', icon: '', img: '/Metaspace.png', path: null,
        ssoTarget: 'https://meta.spacemarvel.ai', external: true },
      { id: 'finixy',    label: 'Finixy',     icon: '', img: '/Finixy.svg',   path: null,
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
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    setTimeout(() => document.addEventListener('mousedown', handle), 0);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  // Position: sit just above the anchor, left-aligned with the panel
  const menuWidth = 220;
  const left = Math.min(panelWidth + 8, window.innerWidth - menuWidth - 8);
  const bottom = window.innerHeight - anchorRect.top + 6;

  const menuItem = (
    label: string,
    onClick: () => void,
    opts: { icon?: string; chevron?: boolean; danger?: boolean; indent?: boolean; active?: boolean } = {}
  ) => (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: opts.indent ? '7px 12px 7px 30px' : '8px 12px',
        background: opts.active ? 'rgba(0,113,227,0.1)' : 'transparent',
        border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
        fontSize: opts.indent ? 12 : 13, fontWeight: opts.indent ? 400 : 500,
        color: opts.danger ? '#f87171' : opts.active ? 'var(--blue)' : 'var(--text-1)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = opts.danger ? 'rgba(248,113,113,0.1)' : 'var(--tint-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = opts.active ? 'rgba(0,113,227,0.1)' : 'transparent'; }}
    >
      {opts.icon && <Icon name={opts.icon} size={14} />}
      <span style={{ flex: 1 }}>{label}</span>
      {opts.chevron && (
        <span style={{ fontSize: 10, opacity: 0.5, transform: appearanceOpen && label.startsWith('A') ? 'rotate(180deg)' : helpOpen && label === 'Help' ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      )}
      {opts.active && <span style={{ fontSize: 10, color: 'var(--blue)' }}>✓</span>}
    </button>
  );

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left,
        bottom,
        width: menuWidth,
        background: 'var(--surface-solid)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 200,
        animation: 'menuFadeUp 0.15s ease',
      }}
    >
      <style>{`@keyframes menuFadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

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

      {/* Connectors */}
      {menuItem('Connectors', () => { navigate('/connects'); onClose(); }, { icon: 'plug' })}

      {/* Appearance */}
      <button
        onClick={() => setAppearanceOpen(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 12px', background: 'transparent',
          border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
          fontSize: 13, fontWeight: 500, color: 'var(--text-1)', transition: 'background 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--tint-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <Icon name="sun" size={14} />
        <span style={{ flex: 1 }}>Appearance</span>
        <span style={{ fontSize: 10, opacity: 0.5, transition: 'transform 0.15s', display: 'inline-block', transform: appearanceOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {appearanceOpen && (
        <div style={{ marginBottom: 2 }}>
          {menuItem('Light theme',  () => { setTheme('light'); }, { indent: true, active: theme === 'light' })}
          {menuItem('Dark theme',   () => { setTheme('dark');  }, { indent: true, active: theme === 'dark' })}
          {menuItem('System theme', () => {
            const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            setTheme(sys);
          }, { indent: true })}
          {menuItem('Customize theme', () => { addToast('Custom theme — coming soon', 'info'); }, { indent: true })}
        </div>
      )}

      {/* Settings */}
      {menuItem('Settings', () => { addToast('Settings — coming soon', 'info'); onClose(); }, { icon: 'settings' })}

      {/* Help */}
      <button
        onClick={() => setHelpOpen(p => !p)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 9,
          padding: '8px 12px', background: 'transparent',
          border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
          fontSize: 13, fontWeight: 500, color: 'var(--text-1)', transition: 'background 0.12s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--tint-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <Icon name="help" size={14} />
        <span style={{ flex: 1 }}>Help</span>
        <span style={{ fontSize: 10, opacity: 0.5, transition: 'transform 0.15s', display: 'inline-block', transform: helpOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {helpOpen && (
        <div style={{ marginBottom: 2 }}>
          {menuItem('Report issue',       () => { addToast('Report issue — coming soon', 'info'); }, { indent: true })}
          {menuItem('Terms & conditions', () => { window.open('https://spacemarvel.ai/terms', '_blank'); }, { indent: true })}
          {menuItem('Privacy policy',     () => { window.open('https://spacemarvel.ai/privacy', '_blank'); }, { indent: true })}
          {menuItem('Contact support',    () => { addToast('Contact support — coming soon', 'info'); }, { indent: true })}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />

      {/* Sign out */}
      {menuItem('Sign out', () => { onClose(); onSignOut(); }, { icon: 'logout', danger: true })}
    </div>,
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
  const [expanded, setExpanded] = useState(false);
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');

  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const imgFilter = theme === 'dark'
    ? 'brightness(0) invert(1)'
    : 'brightness(0)';

  const activeId = PATH_TO_NAV.find(([prefix]) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/')
  )?.[1] ?? null;

  useEffect(() => {
    document.body.style.overflow = (isMobileOrTablet && mobileOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOrTablet, mobileOpen]);

  // Close profile menu on route change
  useEffect(() => { setProfileMenuOpen(false); }, [location.pathname]);

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
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (!msg.startsWith('token_expired')) {
          addToast(`Could not open ${item.label} — signing in via SpaceMarvel`, 'info');
        }
      }
    }

    // Save intent so SSO callback can redirect there immediately after login
    localStorage.setItem('candy:sso_intent', item.ssoTarget);
    const candyCallback = window.location.origin + '/#/sso/callback';
    window.location.href = `https://spacemarvel.ai/login?redirect_uri=${encodeURIComponent(candyCallback)}`;
  }

  const panelExpanded = isMobileOrTablet ? true : expanded;
  const panelWidth    = panelExpanded ? EXPANDED_W : COLLAPSED_W;

  const panelTransform = isMobileOrTablet
    ? (mobileOpen ? 'translateX(0)' : `translateX(-${EXPANDED_W}px)`)
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
        onMouseEnter={!isMobileOrTablet ? () => setExpanded(true)  : undefined}
        onMouseLeave={!isMobileOrTablet ? () => { setExpanded(false); } : undefined}
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
          padding: panelExpanded ? '16px 14px 14px' : '16px 0 14px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <img
              src="/favicon.svg"
              alt="Candy"
              style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: 'block' }}
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
              <Icon name="columns" size={15} />
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
                        padding:        panelExpanded ? '8px 10px' : 0,
                        width:          panelExpanded ? '100%' : 36,
                        height:         panelExpanded ? 'auto' : 36,
                        margin:         panelExpanded ? '0 0 1px 0' : '0 auto 4px',
                        borderRadius:   panelExpanded ? 9 : 10,
                        background:     isActive ? 'rgba(0, 113, 227, 0.12)' : 'transparent',
                        border:         isActive ? '1px solid rgba(0, 113, 227, 0.22)' : '1px solid transparent',
                        color:          isActive ? 'var(--text-1)' : 'var(--text-2)',
                      }}
                    >
                      {isActive && panelExpanded && <span style={styles.accentBar} />}
                      {item.img ? (
                        <img src={item.img} alt={item.label}
                          style={{ width: 18, height: 18, objectFit: 'contain', filter: imgFilter, flexShrink: 0 }} />
                      ) : (
                        <Icon name={item.icon} size={16} />
                      )}
                      {panelExpanded && (
                        <>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left' }}>{item.label}</span>
                          {isExternal && <Icon name="externallink" size={12} style={{ opacity: 0.45, flexShrink: 0 }} />}
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

      {/* ── Grid placeholder ────────────────────────────────────────────────── */}
      <aside className="sidebar-placeholder" />
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
    display: 'flex', alignItems: 'center', gap: 10,
    borderRadius: 9, fontSize: 13.5, fontWeight: 500,
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
