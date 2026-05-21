import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import { Icon } from '../assets/icons';
import SignupPopup from './SignupPopup';
import { redirectToSSO } from '../utils/sso';

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
  const { currentView, addToast, user, signOut } = useApp();
  const { theme, toggleTheme } = useTheme();
  const crumbs = crumbMap[currentView] ?? crumbMap.dashboard;
  const [showSignup,  setShowSignup]  = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const initials = user
    ? (user.company_name || user.email?.split('@')[0] || 'U').slice(0, 2).toUpperCase()
    : null;

  const iconBtnStyle: React.CSSProperties = {
    width: 32, height: 32,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 10,
    color: 'var(--text-2)',
    display: 'grid', placeItems: 'center',
    cursor: 'pointer', position: 'relative',
    transition: 'all 0.15s',
  };

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!showProfile) return;
    const handler = (e: MouseEvent) => {
      const el = document.getElementById('profile-dropdown-anchor');
      if (el && !el.contains(e.target as Node)) setShowProfile(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showProfile]);

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e) => {
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
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface-solid)',
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
          borderRadius: 8,
          padding: '5px 12px',
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
        {[
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

        <button
          className="tooltip-wrap"
          data-tip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          onClick={toggleTheme}
          aria-label="Toggle color theme"
          style={iconBtnStyle}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>

        <button
          className="tooltip-wrap"
          data-tip="Help"
          onClick={() => addToast('Help — coming soon', 'info')}
          style={iconBtnStyle}
        >
          <Icon name="help" size={16} />
        </button>

        {/* Profile avatar (signed in) or Sign In button */}
        {user ? (
          <div id="profile-dropdown-anchor" style={{ position: 'relative' }}>
            {/* Avatar button */}
            <button
              onClick={() => setShowProfile(p => !p)}
              style={{
                width: 32, height: 32,
                borderRadius: 8,
                background: 'var(--grad-brand)',
                display: 'grid', placeItems: 'center',
                fontWeight: 700, fontSize: 13, color: '#fff',
                border: showProfile
                  ? '2px solid rgba(117,91,227,0.7)'
                  : '1px solid var(--border-strong)',
                flexShrink: 0,
                boxShadow: '0 4px 16px -4px rgba(117,91,227,0.5)',
                cursor: 'pointer',
                transition: 'border 0.15s',
              }}
            >
              {initials}
            </button>

            {/* Dropdown panel */}
            {showProfile && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 10px)',
                  right: 0,
                  width: 260,
                  background: 'var(--card-bg-strong)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-card), 0 8px 40px rgba(0,0,0,0.35)',
                  backdropFilter: 'blur(24px)',
                  overflow: 'hidden',
                  zIndex: 100,
                  animation: 'fadeUp 0.18s ease-out',
                }}
              >
                {/* Profile header */}
                <div
                  style={{
                    padding: '18px 18px 14px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 44, height: 44,
                      borderRadius: 12,
                      background: 'var(--grad-brand)',
                      display: 'grid', placeItems: 'center',
                      fontWeight: 700, fontSize: 16, color: '#fff',
                      flexShrink: 0,
                      boxShadow: '0 4px 14px -4px rgba(117,91,227,0.55)',
                    }}
                  >
                    {initials}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14, fontWeight: 600,
                        color: 'var(--text-1)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}
                    >
                      {user.company_name || user.email?.split('@')[0]}
                    </div>
                    <div
                      style={{
                        fontSize: 12, color: 'var(--text-3)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        marginTop: 2,
                      }}
                    >
                      {user.email}
                    </div>
                  </div>
                </div>

                {/* Role + company row */}
                <div
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Role</span>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 99,
                        background: 'rgba(117,91,227,0.15)',
                        color: 'var(--purple)',
                        textTransform: 'capitalize',
                      }}
                    >
                      {user.role}
                    </span>
                  </div>
                  {user.company_name && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Workspace</span>
                      <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>
                        {user.company_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Sign out */}
                <div style={{ padding: '8px' }}>
                  <button
                    onClick={() => {
                      setShowProfile(false);
                      signOut();
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'transparent',
                      border: 'none',
                      color: '#ff8194',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,90,120,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <Icon name="arrowRight" size={14} style={{ transform: 'rotate(180deg)' }} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={redirectToSSO}
            className="btn-primary-shimmer"
            style={{
              height: 32,
              padding: '0 14px',
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
        )}
      </div>

      {showSignup && <SignupPopup onClose={() => setShowSignup(false)} />}
    </header>
  );
}
