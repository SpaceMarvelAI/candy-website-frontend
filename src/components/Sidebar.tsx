import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import Icon from '../assets/icons';

// ─────────────────────────────────────────────────────────────────────────────
// Layout constants
// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_W = 76;
const EXPANDED_W  = 248;

// ─────────────────────────────────────────────────────────────────────────────
// Navigation config — single source of truth for all sidebar routes.
// `path` is the React Router path; null items show a "coming soon" toast.
// ─────────────────────────────────────────────────────────────────────────────
const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { id: 'dashboard', label: 'Dashboard',  icon: 'grid',     path: '/dashboard' },
      { id: 'chatbots',  label: 'Chatbots',   icon: 'chat',     path: '/chatbots', badge: 'NEW' },
      { id: 'voice',     label: 'Voice Bots', icon: 'mic',      path: '/live' },
      { id: 'analytics', label: 'Analytics',  icon: 'chart',    path: '/analytics' },
      { id: 'flows',     label: 'Flows',      icon: 'zap',      path: '/flows',     badge: 'NEW' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { id: 'team',         label: 'Team',         icon: 'team',     path: null },
      { id: 'webhooks',     label: 'Webhooks',     icon: 'zap',      path: '/webhooks' },
      { id: 'integrations', label: 'Integrations', icon: 'plug',     path: null },
      { id: 'settings',     label: 'Settings',     icon: 'settings', path: null },
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
          padding: expanded ? '20px 14px' : '20px 12px',
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--border)',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxShadow: expanded ? 'var(--shadow-rail)' : 'none',
          zIndex: 50,
        }}
      >

        {/* ── Workspace header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: expanded ? 'space-between' : 'center',
            padding: expanded ? '6px 6px 18px' : '6px 0 18px',
            borderBottom: '1px solid var(--border)',
            marginBottom: 10,
            gap: 8,
          }}
        >
          <div style={{ ...styles.wsRow, padding: expanded ? 4 : 0, flex: expanded ? 1 : 'none' }}>
            <div style={styles.wsAvatar}>SM</div>
            {expanded && (
              <div style={styles.wsMeta}>
                <span style={styles.wsName}>SpaceMarvel</span>
                <span style={styles.wsPlan}>Pro · Team</span>
              </div>
            )}
          </div>
          {expanded && (
            <button
              style={styles.iconBtn}
              className="tooltip-wrap"
              data-tip="New workspace"
              onClick={() => addToast('New workspace — coming soon', 'info')}
            >
              <Icon name="plus" size={14} />
            </button>
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
                    padding: expanded ? '10px 12px' : 0,
                    width:  expanded ? '100%' : 44,
                    height: expanded ? 'auto' : 44,
                    margin: expanded ? '0 0 2px 0' : '0 auto 6px',
                    borderRadius: expanded ? 10 : 12,
                    background: isActive
                      ? (expanded
                          ? 'linear-gradient(90deg, rgba(117,91,227,0.18), rgba(117,91,227,0.04))'
                          : 'rgba(117,91,227,0.18)')
                      : 'transparent',
                    border: isActive
                      ? '1px solid rgba(117,91,227,0.30)'
                      : '1px solid transparent',
                    color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                  }}
                >
                  {isActive && expanded && <span style={styles.accentBar} />}

                  <Icon name={item.icon} size={20} />

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
    width: 36,
    height: 36,
    borderRadius: 9,
    background: 'var(--grad-brand)',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 700,
    fontSize: 14,
    color: '#fff',
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
    background: 'rgba(24,218,252,0.15)',
    color: 'var(--blue)',
    fontWeight: 600,
    letterSpacing: '0.04em',
  },
  upgradeCard: {
    padding: 12,
    border: '1px solid var(--border-strong)',
    borderRadius: 'var(--radius)',
    background: 'linear-gradient(160deg, rgba(117,91,227,0.12), rgba(24,218,252,0.06))',
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
