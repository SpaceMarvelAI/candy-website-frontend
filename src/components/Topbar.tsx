import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import Icon from '../assets/icons';
import SignupPopup from './SignupPopup';


const crumbMap = {
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

export default function Topbar() {
  const { currentView, addToast } = useApp();
  const { theme, toggleTheme } = useTheme();
  const crumbs = crumbMap[currentView] ?? crumbMap.dashboard;
  const [showSignup, setShowSignup] = useState(false);

  // Shared style for every action button on the right side of the header.
  const iconBtnStyle = {
    width: 38, height: 38,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text-2)',
    display: 'grid', placeItems: 'center',
    cursor: 'pointer', position: 'relative',
    transition: 'all 0.15s',
  };


  // ⌘K shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.querySelector('.topbar-search-input')?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <header
      style={{
        height: 64,
        padding: '0 28px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text-3)' }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {i > 0 && <span style={{ color: 'var(--text-4)' }}>/</span>}
            <span style={c.current ? { color: 'var(--text-1)', fontWeight: 500 } : {}}>{c.t}</span>
          </span>
        ))}
      </div>

      {/* Search */}
      <div
        className="topbar-search"
        style={{
          flex: 1, maxWidth: 520,
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--input-bg)',
          border: '1px solid var(--border-strong)',
          borderRadius: 10,
          padding: '9px 14px',
          transition: 'border-color 0.15s',
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
          placeholder="Search or ask AI…"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: 'var(--text-1)', fontSize: 14,
          }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10, padding: '3px 6px',
            border: '1px solid var(--border-strong)', borderRadius: 5,
            color: 'var(--text-3)', background: 'var(--tint-1)',
          }}
        >
          ⌘ K
        </span>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
        {/* Stub buttons (zap + bell). Theme toggle is a real action; help comes after it. */}
        {[
          { icon: 'zap',  tip: "What's new" },
          { icon: 'bell', tip: 'Notifications', dot: true },
        ].map(({ icon, tip, dot }) => (
          <button
            key={icon}
            className="tooltip-wrap"
            data-tip={tip}
            onClick={() => addToast(`${tip} — coming soon`, 'info')}
            style={iconBtnStyle}
          >
            <Icon name={icon} size={16} />
            {dot && (
              <span
                style={{
                  position: 'absolute', top: 9, right: 10,
                  width: 7, height: 7, borderRadius: '50%',
                  background: 'var(--blue)',
                  boxShadow: '0 0 10px var(--blue)',
                }}
              />
            )}
          </button>
        ))}

        {/* Theme toggle — sits immediately to the right of the bell */}
        <button
          className="tooltip-wrap"
          data-tip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          style={iconBtnStyle}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        {/* Help */}
        <button
          className="tooltip-wrap"
          data-tip="Help"
          onClick={() => addToast('Help — coming soon', 'info')}
          style={iconBtnStyle}
        >
          <Icon name="help" size={16} />
        </button>

        {/* Sign In */}
        <button
          onClick={() => setShowSignup(true)}
          className="btn-primary-shimmer"
          style={{
            height: 38,
            padding: '0 16px',
            background: 'var(--grad-brand)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 20px -6px rgba(117,91,227,0.55)',
            position: 'relative',
            overflow: 'hidden',
            letterSpacing: '0.01em',
            whiteSpace: 'nowrap',
          }}
        >
          <Icon name="arrowRight" size={13} />
          Sign In
        </button>
      </div>

      {showSignup && <SignupPopup onClose={() => setShowSignup(false)} />}
    </header>
  );
}
