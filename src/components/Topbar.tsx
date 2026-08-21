import { useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Icon } from '../assets/icons';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface Crumb { t: string; current?: boolean }

const crumbMap: Record<string, Crumb[]> = {
  dashboard:  [{ t: 'Home' }, { t: 'Dashboard',     current: true }],
  chatbots:   [{ t: 'Home' }, { t: 'AI Platform' }, { t: 'Chatbot Use Cases', current: true }],
  hr:         [{ t: 'Home' }, { t: 'HR & Hiring' }, { t: 'Candidate Screening', current: true }],
  live:       [{ t: 'Home' }, { t: 'Voice Bots' },  { t: 'Live Campaign', current: true }],
  ecommerce:  [{ t: 'Home' }, { t: 'Voice Agents' }, { t: 'E-commerce',  current: true }],
  financial:  [{ t: 'Home' }, { t: 'Voice Agents' }, { t: 'Financial',   current: true }],
  logistics:  [{ t: 'Home' }, { t: 'Voice Agents' }, { t: 'Logistics',   current: true }],
  healthcare: [{ t: 'Home' }, { t: 'Voice Agents' }, { t: 'Healthcare',  current: true }],
  marketing:  [{ t: 'Home' }, { t: 'Voice Agents' }, { t: 'Marketing',   current: true }],
};

interface TopbarProps {
  onMenuOpen?: () => void;
}

export default function Topbar({ onMenuOpen }: TopbarProps) {
  const { currentView } = useApp();

  // Responsive breakpoints — drive visibility directly, no CSS class gymnastics
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');
  const isSmallMobile    = useMediaQuery('(max-width: 640px)');

  const crumbs = crumbMap[currentView] ?? crumbMap.dashboard;

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        (document.querySelector('.topbar-search-input') as HTMLElement)?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <header
      style={{
        height: 48,
        width: '100%',
        boxSizing: 'border-box',
        padding: isSmallMobile ? '0 12px' : '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: isSmallMobile ? 10 : 16,
        borderBottom: 'none',
        background: 'var(--bg-0)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Hamburger — only rendered on tablet/mobile */}
      {isMobileOrTablet && (
        <button
          onClick={onMenuOpen}
          aria-label="Open navigation menu"
          style={{
            width: 36, height: 36,
            display: 'grid', placeItems: 'center',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-2)',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.15s, border-color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--tint-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          <Icon name="menu" size={18} />
        </button>
      )}

      {/* Breadcrumb — hidden on small mobile to save space */}
      {!isSmallMobile && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--text-3)',
            flexShrink: 0,
          }}
        >
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {i > 0 && <span style={{ color: 'var(--text-4)' }}>/</span>}
              <span style={c.current ? { color: 'var(--text-1)', fontWeight: 500 } : {}}>
                {c.t}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Search */}
      <div
        className="topbar-search"
        style={{
          flex: 1,
          maxWidth: 520,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--input-bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: '5px 12px',
          transition: 'border-color 0.15s',
          minWidth: 0,
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = 'var(--border-accent)';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(117,91,227,0.1)';
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        <Icon name="search" size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        <input
          className="topbar-search-input"
          placeholder={isSmallMobile ? 'Search…' : 'Search or ask AI…'}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-1)',
            fontSize: 14,
            minWidth: 0,
          }}
        />
      </div>

    </header>
  );
}
