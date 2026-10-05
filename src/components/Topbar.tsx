import { Icon } from '../assets/icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import CompanySwitcher from './CompanySwitcher';
import { HEADER_H } from './AppRail';

interface TopbarProps {
  onMenuOpen?: () => void;
}

export default function Topbar({ onMenuOpen }: TopbarProps) {
  const isMobileOrTablet = useMediaQuery('(max-width: 1024px)');
  const isSmallMobile    = useMediaQuery('(max-width: 640px)');

  return (
    <header
      style={{
        height: HEADER_H,
        boxSizing: 'border-box',
        padding: '14px 16px',
        background: 'var(--shell-header-bg)',
        borderBottom: '1px solid var(--shell-border)',
        position: 'sticky',
        top: 0,
        zIndex: 60,
      }}
    >
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: 28 }}>
        {/* Hamburger — only rendered on tablet/mobile */}
        {isMobileOrTablet && (
          <button
            onClick={onMenuOpen}
            aria-label="Open navigation menu"
            style={{
              width: 28, height: 28, marginRight: 8,
              display: 'grid', placeItems: 'center',
              borderRadius: 8, border: '1px solid var(--shell-border)',
              background: 'transparent', color: 'var(--shell-text-2)', cursor: 'pointer',
            }}
          >
            <Icon name="menu" size={16} />
          </button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/MetaSpaceLogo.svg" alt="" width={20} height={20} style={{ filter: 'var(--shell-logo-filter)' }} />
          <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--shell-text-1)' }}>
            Space Marvel
          </span>
        </div>

        <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {!isSmallMobile && <CompanySwitcher />}
          <button
            className="shell-upgrade-btn"
            onClick={() => { window.location.href = 'https://spacemarvel.ai/dashboard/billing'; }}
          >
            <Icon name="crown" size={14} />
            Upgrade
          </button>
        </div>
      </div>
    </header>
  );
}
