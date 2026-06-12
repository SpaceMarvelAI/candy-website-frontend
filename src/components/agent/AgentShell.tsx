/**
 * AgentShell — the full-screen frame every voice-agent page renders inside.
 *
 *   ┌─ header ─────────────────────────────────────────┐
 *   │ ← Back            [icon] Category Agent · status │
 *   │                          [Publish] [theme] [×]   │
 *   ├──────────────────────────────────────────────────┤
 *   │  {children}                                       │
 *   └──────────────────────────────────────────────────┘
 *
 * Optional props let the parent show a Publish button that knows about the
 * current agent's status (so we can grey it out when the prompt isn't compiled
 * yet, etc.).
 */
import { useApp } from '../../context/AppContext';
import { useTheme } from '../../hooks/useTheme';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import Icon from '../../assets/icons';

const tintColor = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};

const tintGlow = {
  purple: 'rgba(117,91,227,0.30)',
  blue:   'rgba(24,218,252,0.30)',
  teal:   'rgba(79,209,197,0.30)',
  green:  'rgba(76,175,80,0.30)',
  amber:  'rgba(255,181,71,0.30)',
  pink:   'rgba(230,90,255,0.30)',
};

interface Props {
  category: string;
  icon: string;
  tint?: keyof typeof tintColor;
  typeLabel?: string;
  status?: string | null;
  agentId?: string | null;
  onPublish?: () => void;
  onEmbed?: () => void;
  publishing?: boolean;
  publishDisabled?: boolean;
  publishHint?: string;
  children: any;
}

export default function AgentShell({
  category, icon, tint = 'purple', typeLabel = 'Voice Agent',
  status, agentId, onPublish, onEmbed, publishing, publishDisabled, publishHint,
  children,
}: Props) {
  const { showView, setActiveNav } = useApp();
  const { theme, toggleTheme } = useTheme();
  const isMobile = useMediaQuery('(max-width: 640px)');
  const isTablet = useMediaQuery('(max-width: 1024px)');

  function exitToDashboard() {
    setActiveNav('dashboard');
    showView('dashboard');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-0)',
        position: 'relative',
        zIndex: 1,
      }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          gap: isMobile ? 0 : 16,
          padding: isMobile ? '10px 14px 0' : '14px 28px',
          background: 'var(--bg-0)',
          borderBottom: 'none',
        }}
      >
        {/* ── Row 1 left: back button ── */}
        <button
          onClick={exitToDashboard}
          style={{
            ...backBtn,
            order: 1,
            flexShrink: 0,
            padding: isMobile ? '7px 10px' : '8px 12px',
          }}
        >
          <Icon name="arrowRight" size={13} style={{ transform: 'rotate(180deg)' }} />
          {!isMobile && 'Back to dashboard'}
        </button>

        {/* ── Desktop center / Mobile row 2: agent identity ── */}
        <div
          style={{
            order: isMobile ? 3 : 2,
            flex: isMobile ? '0 0 100%' : 1,
            display: 'flex',
            justifyContent: isMobile ? 'flex-start' : 'center',
            minWidth: 0,
            padding: isMobile ? '12px 0 12px' : 0,
            marginTop: isMobile ? 10 : 0,
            borderTop: isMobile ? '1px solid var(--border)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 12, minWidth: 0 }}>
            {/* Icon — visible on both breakpoints, slightly smaller on mobile */}
            <div
              style={{
                width: isMobile ? 34 : 38,
                height: isMobile ? 34 : 38,
                borderRadius: isMobile ? 10 : 11,
                background: 'var(--card-bg)',
                border: '1px solid var(--border)',
                display: 'grid', placeItems: 'center',
                color: tintColor[tint],
                boxShadow: 'none',
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={isMobile ? 16 : 18} />
            </div>

            <div style={{ minWidth: 0 }}>
              {/* Type label */}
              <div
                style={{
                  fontSize: isMobile ? 9.5 : 10.5,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: tintColor[tint],
                  marginBottom: 3,
                }}
              >
                {typeLabel}
              </div>
              {/* Name + status badge */}
              <div
                style={{
                  fontSize: isMobile ? 15 : 15,
                  fontWeight: 700,
                  color: 'var(--text-1)',
                  display: 'flex', alignItems: 'center',
                  flexWrap: 'wrap', gap: 8,
                  lineHeight: 1.2,
                }}
              >
                {category}
                {status && (
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '3px 9px', borderRadius: 99,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      background: status === 'published'     ? 'rgba(76,175,80,0.15)'
                               : status === 'ready_to_test' ? 'rgba(24,218,252,0.15)'
                               : 'var(--tint-2)',
                      color: status === 'published'     ? 'var(--green)'
                           : status === 'ready_to_test' ? 'var(--blue)'
                           : 'var(--text-3)',
                      border: status === 'published'     ? '1px solid rgba(76,175,80,0.35)'
                            : status === 'ready_to_test' ? '1px solid rgba(24,218,252,0.35)'
                            : '1px solid var(--border)',
                    }}
                  >
                    {status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Row 1 right: action buttons ── */}
        <div
          style={{
            order: isMobile ? 2 : 3,
            display: 'flex', gap: isMobile ? 6 : 8, alignItems: 'center',
            flexShrink: 0,
            marginLeft: isMobile ? 'auto' : 0,
          }}
        >
          {agentId && onEmbed && !isMobile && (
            <button
              onClick={onEmbed}
              title="Copy integration snippets"
              style={{
                padding: '8px 14px', borderRadius: 9,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-2)', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <Icon name="code" size={13} />
              Embed
            </button>
          )}
          {onPublish && (
            <button
              onClick={onPublish}
              disabled={publishing || publishDisabled}
              title={publishDisabled ? (publishHint || 'Save requirements first') : undefined}
              style={{
                padding: isMobile ? '7px 12px' : '8px 14px', borderRadius: 9,
                border: 'none',
                background: publishDisabled ? 'var(--tint-2)' : 'var(--grad-brand)',
                color: publishDisabled ? 'var(--text-3)' : '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: publishing || publishDisabled ? 'not-allowed' : 'pointer',
                opacity: publishing ? 0.7 : 1,
                boxShadow: publishDisabled ? 'none' : '0 6px 16px -6px rgba(117,91,227,0.55)',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {publishing ? 'Publishing…' : status === 'published' ? 'Re-publish' : 'Publish'}
              {!publishing && <Icon name="zap" size={12} />}
            </button>
          )}
          {!isMobile && (
            <button
              onClick={toggleTheme}
              className="tooltip-wrap"
              data-tip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              aria-label="Toggle theme"
              style={iconBtn}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
            </button>
          )}
          <button
            onClick={exitToDashboard}
            className="tooltip-wrap"
            data-tip="Close"
            aria-label="Close"
            style={iconBtn}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </header>

      <main
        style={{
          padding: isMobile ? '16px 14px 40px' : isTablet ? '20px 20px 48px' : '28px 28px 60px',
        }}
      >
        {children}
      </main>
    </div>
  );
}

const backBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 12px', borderRadius: 9,
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-2)', fontSize: 13, fontWeight: 500,
  cursor: 'pointer', transition: 'all 0.15s',
};

const iconBtn = {
  width: 36, height: 36,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 9,
  color: 'var(--text-2)',
  display: 'grid', placeItems: 'center',
  cursor: 'pointer', transition: 'all 0.15s',
};
