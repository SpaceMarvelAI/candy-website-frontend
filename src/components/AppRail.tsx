import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import posthog from 'posthog-js';
import { useNavigate, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useTheme } from '../hooks/useTheme';
import type { AddToast } from '../hooks/useToast';
import Icon from '../assets/icons';
import WorkspaceSwitcher from './WorkspaceSwitcher';
import { getProfile } from '../api/profile';
import { listMyWorkspaces } from '../api/workspaces';
import { redirectWithSso, setSsoIntent } from '../utils/sso';

// Lazy: pulls in @aws-sdk/client-s3 (large), only needed if the user actually opens this.
const ReportIssuesModal = lazy(() => import('./ReportIssuesModal'));
const ProfileModal = lazy(() => import('./ProfileModal'));
const OnboardingModal = lazy(() => import('./OnboardingModal'));
const ProductTour = lazy(() => import('./ProductTour'));

// Shared shell dimensions — Topbar, Sidebar and flows/index.tsx lay out against these.
export const HEADER_H = 57; // 14 + 28 + 14 padding/row, plus the 1px bottom border
export const RAIL_W   = 64;
// Rail and sidebar float as borderless rounded panels with this gap on every side.
export const SHELL_GAP = 4;

// Help → Onboarding is a testing shortcut: localhost + dev only, hidden on staging and prod.
const SHOW_ONBOARDING_ITEM = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1', 'dev.candy.cx'].includes(window.location.hostname);

// ─── Profile popover ──────────────────────────────────────────────────────────
function ProfileMenu({
  anchorRect, onClose, onSignOut, signingOut, navigate, addToast,
  theme, setTheme, onReportIssue, onProfile, onOnboarding, onProductTour,
  userName, userEmail, userAvatarUrl, initials, avatarLoadFailed,
}: {
  anchorRect: DOMRect;
  onClose: () => void; onSignOut: () => void; signingOut: boolean;
  navigate: (p: string) => void; addToast: AddToast;
  theme: string; setTheme: (t: 'light' | 'dark') => void;
  onReportIssue: () => void;
  onProfile: () => void;
  onOnboarding: () => void;
  onProductTour: () => void;
  userName: string; userEmail: string; userAvatarUrl: string | null; initials: string; avatarLoadFailed: boolean;
}) {
  const [subMenu, setSubMenu] = useState<null | 'workspace' | 'appearance' | 'help'>(null);
  // Whether to show the "Workspace" row at all — mirrors WorkspaceSwitcher's own "don't show a
  // list of one" rule, checked independently here so the row can be shown/hidden before the
  // flyout (which is what actually mounts WorkspaceSwitcher) is ever opened.
  const [hasWorkspaceChoice, setHasWorkspaceChoice] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listMyWorkspaces()
      .then((ws) => { if (!cancelled) setHasWorkspaceChoice(ws.length >= 2); })
      .catch(() => { /* leave the row hidden */ });
    return () => { cancelled = true; };
  }, []);

  const menuWidth   = 220;
  const flyoutWidth = 190;
  const left   = RAIL_W + SHELL_GAP * 2 + 4;
  const bottom = window.innerHeight - anchorRect.bottom;
  const flyoutLeft = left + menuWidth + 4;

  // Only the Workspace flyout needs this — Appearance/Help stay bottom-anchored to the main
  // menu (flyoutStyle, below) regardless of where their row sits.
  const [workspaceRowTop, setWorkspaceRowTop] = useState(0);

  function toggleSub(name: 'workspace' | 'appearance' | 'help') {
    setSubMenu(s => s === name ? null : name);
  }

  const subBtn = (label: string, icon: string, name: 'workspace' | 'appearance' | 'help') => (
    <button
      onClick={(e) => {
        if (name === 'workspace') setWorkspaceRowTop(e.currentTarget.getBoundingClientRect().top);
        toggleSub(name);
      }}
      className="shell-menu-item"
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        background: subMenu === name ? 'var(--shell-menu-hover)' : undefined,
        border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
        fontSize: 13.5, fontWeight: 500, transition: 'background 0.12s',
      }}
    >
      <Icon name={icon} size={15} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.4 }}>›</span>
    </button>
  );

  const menuItem = (
    label: string,
    onClick: () => void,
    opts: { icon?: string; iconColor?: string; danger?: boolean; active?: boolean } = {}
  ) => (
    <button
      onClick={onClick}
      className="shell-menu-item"
      aria-checked={opts.active ? true : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left',
        fontSize: 13.5, fontWeight: 500,
        color: opts.danger ? '#f87171' : undefined,
        transition: 'background 0.12s',
      }}
    >
      {opts.icon && <Icon name={opts.icon} size={15} style={opts.iconColor ? { color: opts.iconColor } : undefined} />}
      <span style={{ flex: 1 }}>{label}</span>
      {opts.active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />}
    </button>
  );

  // Bottom-anchored at the SAME coordinate as the main menu (not the clicked row's top) so
  // both panels' bottom edges always line up, regardless of which item was clicked. Used by
  // Appearance/Help only.
  const flyoutStyle: React.CSSProperties = {
    position: 'fixed',
    left: flyoutLeft,
    bottom,
    width: flyoutWidth,
    background: 'var(--shell-menu-bg)',
    border: '1px solid var(--shell-menu-border)',
    borderRadius: 12,
    padding: '6px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    zIndex: 201,
    animation: 'menuFadeIn 0.12s ease',
  };

  // Top-anchored at the Workspace row's own position, so this one pops out level with the row
  // that opened it instead of sharing the Appearance/Help flyouts' bottom-anchored placement.
  const workspaceFlyoutStyle: React.CSSProperties = {
    ...flyoutStyle,
    bottom: undefined,
    top: workspaceRowTop,
    maxHeight: 300,
    overflowY: 'auto',
    // Wide enough that a real workspace name isn't forced to ellipsize the way it would at
    // the Appearance/Help flyouts' fixed 190px — grows to fit, capped so a pathologically
    // long name still can't blow out past the viewport.
    width: 'max-content',
    minWidth: flyoutWidth,
    maxWidth: 320,
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
        background: 'var(--shell-menu-bg)',
        border: '1px solid var(--shell-profile-border)',
        borderRadius: 12, padding: '6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        zIndex: 200, animation: 'menuFadeUp 0.15s ease',
      }}>
        {/* Header: avatar + "Hello {name}" + email */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px 12px' }}>
          {userAvatarUrl && !avatarLoadFailed ? (
            <img src={userAvatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 40, height: 40, borderRadius: '50%', background: 'var(--shell-avatar)',
              display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {initials}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--shell-text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hello {userName}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--shell-text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userEmail}
            </div>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--shell-menu-border)', margin: '0 0 4px' }} />

        {/* Subscription workspaces — the slot Claude uses, and what HANDOFF_TO_TEAMS.md
            specifies. Hidden entirely for a single-workspace account (hasWorkspaceChoice),
            same rule WorkspaceSwitcher used to enforce on its own when it rendered inline. */}
        {hasWorkspaceChoice && subBtn('Workspace', 'team', 'workspace')}

        {menuItem('Upgrade plan', () => { addToast('Upgrade plan — coming soon', 'info'); onClose(); }, { icon: 'crown', iconColor: '#f59e0b' })}
        {menuItem('Connectors', () => { navigate('/connects'); onClose(); }, { icon: 'plug' })}
        {menuItem('Profile',    () => { onProfile(); onClose(); }, { icon: 'user' })}
        {subBtn('Appearance', 'sun',  'appearance')}
        {menuItem('Settings',  () => { addToast('Settings — coming soon', 'info'); onClose(); }, { icon: 'settings' })}
        {subBtn('Help', 'help', 'help')}

        <div style={{ borderTop: '1px solid var(--shell-menu-border)', margin: '4px 0' }} />

        {/* Keep the menu OPEN while signing out so the "Signing out…" label is
            actually visible — closing it first made a slow sign-out look like a
            dead click, which is what prompted people to click again. */}
        {menuItem(
          signingOut ? 'Signing out…' : 'Sign out',
          () => { if (!signingOut) onSignOut(); },
          { icon: 'logout', danger: true },
        )}
      </div>

      {/* ── Workspace flyout ── */}
      {subMenu === 'workspace' && (
        <div style={workspaceFlyoutStyle}>
          <WorkspaceSwitcher />
        </div>
      )}

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
          {menuItem('Report issue',       () => { onReportIssue(); onClose(); })}
          {menuItem('Terms & conditions', () => window.open('https://spacemarvel.com/terms', '_blank'))}
          {menuItem('Privacy policy',     () => window.open('https://spacemarvel.com/privacy', '_blank'))}
          {menuItem('Contact support',    () => addToast('Contact support — coming soon', 'info'))}
          {SHOW_ONBOARDING_ITEM && menuItem('Onboarding', () => { onOnboarding(); onClose(); })}
          {menuItem('Product Tour', () => { onProductTour(); onClose(); }, { icon: 'globe' })}
        </div>
      )}
    </>,
    document.body,
  );
}

// ─── More popover ─────────────────────────────────────────────────────────────
const MORE_ITEMS = [
  { id: 'prompt-library', label: 'Prompt Library', icon: 'book', path: null },
  { id: 'connectors',     label: 'Connectors',     icon: 'flow', path: '/connects' },
];

function MoreMenu({ anchorRect, onClose, onPick }: {
  anchorRect: DOMRect;
  onClose: () => void;
  onPick: (item: { label: string; path: string | null }) => void;
}) {
  return createPortal(
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 198 }} onClick={onClose} />
      <div role="menu" style={{
        position: 'fixed', left: RAIL_W + SHELL_GAP * 2 + 4, top: anchorRect.top, width: 200,
        background: 'var(--shell-menu-bg)', border: '1px solid var(--shell-menu-border)',
        borderRadius: 12, padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 200,
      }}>
        {MORE_ITEMS.map(item => (
          <button
            key={item.id}
            role="menuitem"
            className="shell-menu-item"
            onClick={() => { onPick(item); onClose(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              textAlign: 'left', fontSize: 13, fontWeight: 500,
            }}
          >
            <Icon name={item.icon} size={14} />
            <span style={{ flex: 1 }}>{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

// ─── Rail ─────────────────────────────────────────────────────────────────────
interface Product {
  id: string; label: string;
  img?: string; icon?: string;
  path?: string; ssoTarget?: string; current?: boolean;
}

const ORB_BLOBS = [
  { c: '#755BE3', x: '-30%', y: '-18%', delay: '0s'  },
  { c: '#18DAFC', x: '0%',   y: '32%',  delay: '-8s' },
  { c: '#4CAF50', x: '30%',  y: '-18%', delay: '-4s' },
];

const PRODUCTS: Product[] = [
  { id: 'metaspace', label: 'Home',   img: '/Metaspace.svg',
    ssoTarget: import.meta.env.VITE_META_APP_URL || 'https://spacemarvel.ai' },
  { id: 'finixy',    label: 'Finixy', img: '/FinixyLogo.svg',
    ssoTarget: import.meta.env.VITE_FINIXY_APP_URL || 'https://app.finixy.ai' },
  { id: 'candy',     label: 'Candy',  img: '/Candy.svg', path: '/healthcare', current: true },
];

export default function AppRail() {
  const { user, addToast, signOut, signingOut } = useApp();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [moreAnchor, setMoreAnchor] = useState<DOMRect | null>(null);
  const [profileAnchor, setProfileAnchor] = useState<DOMRect | null>(null);
  const [reportIssuesOpen, setReportIssuesOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [productTourOpen, setProductTourOpen] = useState(false);
  // Overrides AppContext's cached name/avatar right after a save in ProfileModal, so the
  // rail reflects the edit immediately instead of waiting for the next login.
  const [profileOverride, setProfileOverride] = useState<{ name: string | null; avatarUrl: string | null } | null>(null);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const profileRef = useRef<HTMLButtonElement>(null);

  // Seed the avatar once on mount from Candy's own /v1/profile — the login redirect's
  // params_dict (api/v1/sso_oidc.py) never carries avatar_url, so without this the circle would
  // stay initials-only until the user happened to open the Profile modal once. Best-effort: a
  // failed fetch just leaves the initials fallback in place.
  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((profile) => {
        if (cancelled) return;
        setProfileOverride((prev) => prev ?? { name: null, avatarUrl: profile.avatar_url });
      })
      .catch(() => { /* fall back to initials, nothing to surface here */ });
    return () => { cancelled = true; };
  }, []);

  // Close popovers on route change
  useEffect(() => { setMoreAnchor(null); setProfileAnchor(null); }, [location.pathname]);

  function handleNav(item: { label: string; path?: string | null }) {
    if (item.path) navigate(item.path);
    else addToast(`"${item.label}" — coming soon`, 'info');
  }

  async function openProduct(item: Product) {
    if (!item.ssoTarget) { handleNav(item); return; }

    // Client-only signal: this leaves Candy entirely via SSO redirect, so no
    // Candy pageview/backend event ever records that the click happened.
    posthog.capture('sidebar_product_link_clicked', { product: item.id });

    if (await redirectWithSso(item.ssoTarget)) return;

    // No usable dashboard token: SpaceMarvel login, then AppContext finishes the trip to this app.
    setSsoIntent(item.ssoTarget);
    const candyCallback = window.location.origin + '/sso/callback';
    window.location.href = `${import.meta.env.VITE_SM_LOGIN_URL || 'https://spacemarvel.com'}/login?redirect_uri=${encodeURIComponent(candyCallback)}`;
  }

  const userName      = profileOverride?.name || user?.full_name || user?.email?.split('@')[0] || 'User';
  const userEmail     = user?.email || '';
  const userAvatarUrl = profileOverride ? profileOverride.avatarUrl : (user?.avatar_url || null);
  const initials      = userName.slice(0, 1).toUpperCase();

  const railBtn = (key: string, label: string, glyph: React.ReactNode, onClick: (e: React.MouseEvent<HTMLButtonElement>) => void, opts: { current?: boolean; expanded?: boolean; tourId?: string } = {}) => (
    <button
      key={key}
      onClick={onClick}
      className="shell-rail-btn"
      aria-current={opts.current ? 'page' : undefined}
      aria-expanded={opts.expanded}
      data-tour={opts.tourId}
      style={{
        width: 56, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        border: 'none', borderRadius: 10, cursor: 'pointer',
        fontSize: 11, fontWeight: opts.current ? 600 : 500, transition: 'background 0.12s',
      }}
    >
      <span style={{ position: 'relative', width: 40, height: 40, display: 'grid', placeItems: 'center' }}>
        {opts.current && (
          <span className="ms-orb" aria-hidden>
            {ORB_BLOBS.map(b => (
              <span key={b.c} className="ms-orb-blob"
                style={{ '--c': b.c, '--x': b.x, '--y': b.y, animationDelay: b.delay } as React.CSSProperties} />
            ))}
          </span>
        )}
        <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>{glyph}</span>
      </span>
      {label}
    </button>
  );

  return (
    <>
      <nav
        aria-label="Products"
        style={{
          position: 'fixed', top: HEADER_H + SHELL_GAP, left: SHELL_GAP, bottom: SHELL_GAP, width: RAIL_W,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          padding: '12px 0', boxSizing: 'border-box',
          background: 'var(--shell-bg)', borderRadius: 4, zIndex: 51,
        }}
      >
        <div data-tour="rail" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {PRODUCTS.map(p => railBtn(
            p.id, p.label,
            p.img
              ? <img src={p.img} alt="" style={{ width: 24, height: 24, objectFit: 'contain', filter: 'var(--shell-app-logo-filter)' }} />
              : <Icon name={p.icon!} size={22} style={{ color: 'var(--shell-text-2)' }} />,
            () => { void openProduct(p); },
            { current: p.current },
          ))}
        </div>
        {railBtn('more', 'More', <Icon name="apps" size={20} style={{ color: 'var(--shell-text-2)' }} />,
          e => setMoreAnchor(e.currentTarget.getBoundingClientRect()), { expanded: !!moreAnchor, tourId: 'rail-more' })}

        <button
          ref={profileRef}
          onClick={() => profileRef.current && setProfileAnchor(profileRef.current.getBoundingClientRect())}
          aria-label="Open profile menu"
          title={`${userName} · ${userEmail}`}
          className="shell-profile-btn"
          style={{ marginTop: 'auto', background: 'none', border: 'none', padding: 4, cursor: 'pointer', borderRadius: 10 }}
        >
          {userAvatarUrl && !avatarLoadFailed ? (
            <img
              src={userAvatarUrl}
              alt=""
              onError={() => setAvatarLoadFailed(true)}
              style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%', background: 'var(--shell-avatar)',
              display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff',
            }}>
              {initials}
            </div>
          )}
        </button>
      </nav>

      {/* Placeholder — reserves the rail's width in the flex row */}
      <div style={{ width: RAIL_W + SHELL_GAP, flexShrink: 0 }} />

      {moreAnchor && (
        <MoreMenu anchorRect={moreAnchor} onClose={() => setMoreAnchor(null)} onPick={handleNav} />
      )}

      {profileAnchor && (
        <ProfileMenu
          anchorRect={profileAnchor}
          onClose={() => setProfileAnchor(null)}
          onSignOut={signOut}
          signingOut={signingOut}
          navigate={(p) => { navigate(p); setProfileAnchor(null); }}
          addToast={addToast}
          theme={theme}
          setTheme={setTheme}
          onReportIssue={() => setReportIssuesOpen(true)}
          onProfile={() => setProfileEditOpen(true)}
          onOnboarding={() => setOnboardingOpen(true)}
          onProductTour={() => setProductTourOpen(true)}
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          initials={initials}
          avatarLoadFailed={avatarLoadFailed}
        />
      )}

      {onboardingOpen && (
        <Suspense fallback={null}>
          <OnboardingModal preview onClose={() => setOnboardingOpen(false)} />
        </Suspense>
      )}

      {productTourOpen && (
        <Suspense fallback={null}>
          <ProductTour onClose={() => setProductTourOpen(false)} />
        </Suspense>
      )}

      {reportIssuesOpen && (
        <Suspense fallback={null}>
          <ReportIssuesModal onClose={() => setReportIssuesOpen(false)} />
        </Suspense>
      )}

      {profileEditOpen && (
        <Suspense fallback={null}>
          <ProfileModal
            onClose={() => setProfileEditOpen(false)}
            onSaved={(profile) => {
              setProfileOverride({ name: profile.name, avatarUrl: profile.avatar_url });
              setAvatarLoadFailed(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
