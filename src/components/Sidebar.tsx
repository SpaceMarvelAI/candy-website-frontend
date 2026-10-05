import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Icon from '../assets/icons';
import { HEADER_H, RAIL_W, SHELL_GAP } from './AppRail';

// ─────────────────────────────────────────────────────────────────────────────
const COLLAPSED_W = 56;
const EXPANDED_W  = 256;
const MOBILE_W    = 288;

const NAV_SECTIONS = [
  {
    label: '',
    items: [
      { id: 'usecase', label: 'Use Case', icon: 'health', path: null,
        subItems: [
          { id: 'healthcare',       label: 'Healthcare',       path: '/healthcare' },
          { id: 'finance',          label: 'Finance',          path: null, soon: true },
          { id: 'legal',            label: 'Legal',            path: null, soon: true },
          { id: 'customer-support', label: 'Customer Support', path: null, soon: true },
        ] },
      { id: 'voice',      label: 'Live Calls', icon: 'livecall', path: '/live' },
      { id: 'analytics',  label: 'Analytics',  icon: 'chart',    path: '/analytics' },
      { id: 'flows',      label: 'Flows',      icon: 'flowsnav', path: '/flows' },
    ],
  },
];

/** data-tour anchors for ProductTour.tsx — keyed by nav item id. */
const TOUR_ID: Record<string, string> = {
  healthcare: 'nav-healthcare',
  voice:      'nav-live',
  analytics:  'nav-analytics',
  flows:      'nav-flows',
};

const PATH_TO_NAV: [string, string][] = [
  ['/healthcare', 'healthcare'],
  ['/dashboard',  'healthcare'],
  ['/live',       'voice'],
  ['/analytics',  'analytics'],
  ['/flows',      'flows'],
];

// ─────────────────────────────────────────────────────────────────────────────
interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { addToast } = useApp();
  const navigate     = useNavigate();
  const location     = useLocation();
  const [expanded, setExpanded] = useState(true);
  const [useCaseOpen, setUseCaseOpen] = useState(true);
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');
  const [headerHovered, setHeaderHovered] = useState(false);

  const activeId = PATH_TO_NAV.find(([prefix]) =>
    location.pathname === prefix || location.pathname.startsWith(prefix + '/')
  )?.[1] ?? null;

  useEffect(() => {
    document.body.style.overflow = (isMobileOrTablet && mobileOpen) ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOrTablet, mobileOpen]);

  // Reset hover state when sidebar collapses so Candy icon shows immediately
  useEffect(() => { setHeaderHovered(false); }, [expanded]);

  function handleNav(item: { path: string | null; label: string }) {
    if (item.path) {
      navigate(item.path);
      if (isMobileOrTablet) onClose?.();
    } else {
      addToast(`"${item.label}" — coming soon`, 'info');
    }
  }

  const panelExpanded = isMobileOrTablet ? true : expanded;
  const panelWidth    = isMobileOrTablet ? MOBILE_W : (panelExpanded ? EXPANDED_W : COLLAPSED_W);

  const panelTransform = isMobileOrTablet
    ? (mobileOpen ? 'translateX(0)' : `translateX(-${MOBILE_W + RAIL_W + SHELL_GAP * 2}px)`)
    : 'translateX(0)';
  const panelTransition = isMobileOrTablet
    ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)'
    : 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)';

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
          top: HEADER_H + SHELL_GAP, left: RAIL_W + SHELL_GAP * 2,
          height: `calc(100vh - ${HEADER_H + SHELL_GAP * 2}px)`,
          borderRadius: 4,
          width: panelWidth,
          transform: panelTransform,
          transition: panelTransition,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--shell-bg)',
          overflowX: 'hidden',
          boxShadow: 'none',
          zIndex: 50,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: panelExpanded ? 'space-between' : 'center',
          height: 56,
          padding: panelExpanded ? '0 14px 0 20px' : '0',
          flexShrink: 0,
          boxSizing: 'border-box',
          borderBottom: 'none',
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
                color: 'var(--shell-text-1)', padding: 4, borderRadius: 6,
                display: 'grid', placeItems: 'center',
              }}
            >
              {headerHovered
                ? <Icon name="sidebar-collapse" size={20} />
                : <img src="/Candy.svg" alt="Candy" style={{ width: 22, height: 22, borderRadius: 6, display: 'block', filter: 'var(--shell-logo-filter)' }} />
              }
            </button>
          ) : (
            <>
              <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--shell-text-1)', letterSpacing: '-0.01em' }}>
                Candy
              </span>
              {panelExpanded && !isMobileOrTablet && (
                <button
                  onClick={() => setExpanded(false)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--shell-text-2)', padding: 4, borderRadius: 6,
                    display: 'grid', placeItems: 'center', transition: 'color 0.15s',
                  }}
                  title="Collapse sidebar"
                >
                  <Icon name="sidebar-expand" size={20} />
                </button>
              )}
              {isMobileOrTablet && (
                <button
                  onClick={onClose}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--shell-text-2)', padding: 4, display: 'grid', placeItems: 'center' }}
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
                  if (item.subItems) {
                    const groupActive = item.subItems.some((s: any) => s.id === activeId);
                    return (
                      <div key={item.id}>
                        <button
                          onClick={() => panelExpanded ? setUseCaseOpen(o => !o) : handleNav(item.subItems[0])}
                          className={`shell-row${!panelExpanded ? ' tooltip-wrap' : ''}`}
                          data-tip={!panelExpanded ? item.label : undefined}
                          aria-current={groupActive ? 'page' : undefined}
                          style={{
                            ...styles.navBtn,
                            justifyContent: panelExpanded ? 'flex-start' : 'center',
                            padding:        panelExpanded ? '8px 12px' : 0,
                            width:          '100%',
                            height:         panelExpanded ? 'auto' : 36,
                            margin:         '0 0 2px 0',
                            borderRadius:   12,
                            border:         '1px solid transparent',
                            fontWeight:     groupActive ? 600 : 500,
                            transition:     'background 0.12s, color 0.12s',
                          }}
                        >
                          <Icon name={item.icon} size={16} />
                          {panelExpanded && (
                            <>
                              <span style={{ flex: 1, whiteSpace: 'nowrap', textAlign: 'left' }}>{item.label}</span>
                              <Icon name="chevronDown" size={13} style={{
                                opacity: 0.5, flexShrink: 0,
                                transform: useCaseOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.2s ease',
                              }} />
                            </>
                          )}
                        </button>
                        {panelExpanded && useCaseOpen && (
                          <div style={{ marginBottom: 2 }}>
                            {item.subItems.map((sub: any) => {
                              const subActive = activeId === sub.id;
                              return (
                                <button
                                  key={sub.id}
                                  onClick={() => handleNav(sub)}
                                  className="shell-row"
                                  data-tour={TOUR_ID[sub.id]}
                                  aria-current={subActive ? 'page' : undefined}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                    padding: '7px 12px 7px 40px', borderRadius: 10, border: 'none',
                                    color: sub.soon ? 'var(--shell-section)' : undefined,
                                    fontSize: 13, fontWeight: subActive ? 600 : 500,
                                    cursor: 'pointer', textAlign: 'left', margin: '0 0 1px 0',
                                    transition: 'background 0.12s, color 0.12s',
                                  }}
                                >
                                  <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{sub.label}</span>
                                  {sub.soon && (
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                                      background: 'var(--shell-row-hover)', color: 'var(--shell-section)', padding: '2px 7px',
                                      borderRadius: 20, flexShrink: 0,
                                    }}>Soon</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const isActive = activeId === item.id;
                  const isExternal = !!item.external;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNav(item)}
                      className={`shell-row${!panelExpanded ? ' tooltip-wrap' : ''}`}
                      data-tip={!panelExpanded ? item.label : undefined}
                      data-tour={TOUR_ID[item.id]}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        ...styles.navBtn,
                        justifyContent: panelExpanded ? 'flex-start' : 'center',
                        padding:        panelExpanded ? '8px 12px' : 0,
                        width:          '100%',
                        height:         panelExpanded ? 'auto' : 36,
                        margin:         '0 0 2px 0',
                        borderRadius:   12,
                        border:         '1px solid transparent',
                        fontWeight:     isActive ? 600 : 500,
                        transition:     'background 0.12s, color 0.12s',
                      }}
                    >
                      {item.img ? (
                        <img src={item.img} alt={item.label}
                          style={{ width: 20, height: 20, objectFit: 'contain', filter: 'var(--shell-app-logo-filter)', flexShrink: 0 }} />
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
      </div>

      {/* ── Flex placeholder — mirrors the panel width so the content area shifts ── */}
      <aside
        className="sidebar-placeholder"
        style={{
          width: isMobileOrTablet ? 0 : panelWidth + SHELL_GAP * 2,
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
    color: 'var(--shell-section)', padding: '10px 18px 4px', margin: 0,
  },
  sectionDivider: {
    height: 1, background: 'var(--shell-border)', margin: '8px 14px', opacity: 0.6,
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
