import { useFeatureFlagEnabled } from 'posthog-js/react';
import { Icon } from '../assets/icons';
import { useMediaQuery } from '../hooks/useMediaQuery';
import CompanySwitcher from './CompanySwitcher';
import { HEADER_H } from './AppRail';

export default function Topbar() {
  const isSmallMobile      = useMediaQuery('(max-width: 640px)');
  const flagCompanySwitching = useFeatureFlagEnabled('company_switching');

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/MetaSpaceLogo.svg" alt="" width={20} height={20} style={{ filter: 'var(--shell-logo-filter)' }} />
          <span style={{ fontSize: 14, lineHeight: '20px', fontWeight: 500, color: 'var(--shell-text-1)' }}>
            Space Marvel
          </span>
        </div>

        <div style={{ position: 'absolute', right: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          {flagCompanySwitching !== false && <CompanySwitcher iconOnly={isSmallMobile} />}
          {!isSmallMobile && (
            <button
              className="shell-upgrade-btn"
              onClick={() => { window.location.href = 'https://spacemarvel.ai/dashboard/billing'; }}
            >
              <Icon name="crown" size={14} />
              Upgrade
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
