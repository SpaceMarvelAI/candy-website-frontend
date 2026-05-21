import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../assets/icons';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_W = 56;
const EXPANDED_W  = 220;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation config — single source of truth for all sidebar routes.
// `path` is the React Router path; null items show a "coming soon" toast.
// ─────────────────────────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Voice Bots',  icon: 'voicebot', path: '/dashboard' },
      { id: 'chatbots',  label: 'Chatbots',   icon: 'chat',     path: '/chatbots', badge: 'NEW' },
      { id: 'voice',     label: 'Live Calls', icon: 'mic',      path: '/live' },
      { id: 'analytics', label: 'Analytics',  icon: 'chart',    path: '/analytics' },
      { id: 'flows',     label: 'Flows',      icon: 'zap',      path: '/flows',     badge: 'NEW' },
    ],
  },
];

// Maps a URL pathname prefix → active nav item id.
// /chatbots/cs, /chatbots/tech, etc. all keep "chatbots" highlighted.
const PATH_TO_NAV: [string, string][] = [
  ['/dashboard', 'dashboard'],
  ['/chatbots',  'chatbots'],
  ['/live',      'voice'],
  ['/analytics', 'analytics'],
  ['/webhooks',  'webhooks'],
  ['/flows',     'flows'],
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Sidebar() {
  const { addToast } = useApp();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [expanded, setExpanded] = useState(false);

  // Derive the active nav item from the current URL pathname.
  const activeId = PATH_TO_NAV.find(([prefix]) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/')
  )?.[1] ?? null;

  function handleNav(item: { path: string | null; label: string }) {
    if (item.path) {
      navigate(item.path);
    } else {
      addToast(`"${item.label}" — coming soon`, 'info');
    }
  }

  return (
    // Outer <aside> reserves the COLLAPSED width in layout flow.
    // The inner panel is `position: fixed` so the expanded state overlays
    // content instead of pushing it.
    <aside
      style={{ width: COLLAPSED_W, flexShrink: 0 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          height: '100vh',
          width: expanded ? EXPANDED_W : COLLAPSED_W,
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          padding: expanded ? '14px 10px' : '14px 8px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxShadow: expanded ? 'var(--shadow-rail)' : 'none',
          zIndex: 50,
        }}
      >

        {/* ── Workspace branding ── */}
        <div style={{ ...styles.wsRow, marginBottom: 14, padding: '2px 2px' }}>
          <div style={styles.wsAvatar}>
            <Icon name="grid" size={13} />
          </div>
          {expanded && (
            <div style={styles.wsMeta as React.CSSProperties}>
              <span style={styles.wsName}>SpaceMarvel</span>
              <span style={styles.wsPlan}>Pro workspace</span>
            </div>
          )}
        </div>

        {/* ── Nav sections ── */}
        {NAV_SECTIONS.map(section => (
          <div key={section.label}>
            {expanded ? (
              <p style={styles.sectionLabel}>{section.label}</p>
            ) : (
              <div style={styles.sectionDivider} />
            )}

            {section.items.map(item => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item)}
                  className={!expanded ? 'tooltip-wrap' : ''}
                  data-tip={!expanded ? item.label : undefined}
                  style={{
                    ...styles.navBtn,
                    justifyContent: 'center',
                    padding: expanded ? '8px 10px' : 0,
                    width:  expanded ? '100%' : 36,
                    height: expanded ? 'auto' : 36,
                    margin: expanded ? '0 0 2px 0' : '0 auto 4px',
                    borderRadius: expanded ? 10 : 12,
                    background: isActive
                      ? 'rgba(0, 113, 227, 0.15)'
                      : 'transparent',
                    border: isActive
                      ? '1px solid rgba(0, 113, 227, 0.25)'
                      : '1px solid transparent',
                    color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  {isActive && expanded && <span style={styles.accentBar} />}

                  <Icon name={item.icon} size={16} />

                  {expanded && (
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

        {/* ── Upgrade CTA — only shown when expanded ── */}
        <div style={{ marginTop: 'auto' }}>
          {expanded && (
            <div style={styles.upgradeCard} className="sidebar-footer-glow">
              <p style={styles.upgradeTitle}>Upgrade to Enterprise</p>
              <p style={styles.upgradeSub}>Unlimited agents, HIPAA, dedicated support.</p>
              <button style={styles.upgradeCta}>
                Contact sales <Icon name="arrowRight" size={10} />
              </button>
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  wsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    borderRadius: 8,
    minWidth: 0,
  },
  wsAvatar: {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: 'var(--tint-2)',
    border: '1px solid var(--border)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    fontSize: 14,
    color: 'var(--text-2)',
    flexShrink: 0,
  },
  wsMeta: {
    display: 'flex',
    flexDirection: 'column',
    lineHeight: 1.15,
  },
  wsName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-1)',
  },
  wsPlan: {
    fontSize: 11,
    color: 'var(--text-3)',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text-2)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'all 0.15s',
  },
  sectionLabel: {
    fontSize: 10.5,
    textTransform: 'uppercase',
    letterSpacing: '0.16em',
    color: 'var(--text-4)',
    padding: '14px 12px 6px',
    margin: 0,
  },
  sectionDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '14px 14px 8px',
    opacity: 0.6,
  },
  navBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
    position: 'relative',
    marginBottom: 2,
  },
  accentBar: {
    position: 'absolute',
    left: -14,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 3,
    height: 18,
    background: 'var(--grad-brand)',
    borderRadius: '0 3px 3px 0',
  },
  badge: {
    marginLeft: 'auto',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 99,
    background: 'rgba(0, 113, 227, 0.12)',
    color: 'var(--blue)',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  upgradeCard: {
    padding: 12,
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)',
    background: 'rgba(0, 113, 227, 0.08)',
    position: 'relative',
    overflow: 'hidden',
  },
  upgradeTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text-1)',
    margin: 0,
    position: 'relative',
  },
  upgradeSub: {
    fontSize: 11.5,
    color: 'var(--text-3)',
    margin: '4px 0 10px',
    position: 'relative',
  },
  upgradeCta: {
    position: 'relative',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 12px',
    borderRadius: 8,
    background: 'var(--tint-4)',
    border: '1px solid var(--border-strong)',
    color: 'var(--text-1)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
};
