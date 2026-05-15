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
  category, icon, tint = 'purple',
  status, agentId, onPublish, onEmbed, publishing, publishDisabled, publishHint,
  children,
}: Props) {
  const { showView, setActiveNav } = useApp();
  const { theme, toggleTheme } = useTheme();

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
          gap: 16,
          padding: '14px 28px',
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <button onClick={exitToDashboard} style={backBtn}>
          <Icon name="arrowRight" size={13} style={{ transform: 'rotate(180deg)' }} />
          Back to dashboard
        </button>

        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38, height: 38, borderRadius: 11,
                background: 'var(--tint-2)',
                border: `1px solid ${tintGlow[tint]}`,
                display: 'grid', placeItems: 'center',
                color: tintColor[tint],
                boxShadow: `0 0 24px ${tintGlow[tint]}`,
              }}
            >
              <Icon name={icon} size={18} />
            </div>
            <div>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: tintColor[tint],
                }}
              >
                Voice Agent
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)' }}>
                {category}
                {status && (
                  <span
                    style={{
                      marginLeft: 10,
                      fontSize: 10.5, fontWeight: 600, padding: '3px 8px',
                      borderRadius: 99,
                      letterSpacing: '0.04em', textTransform: 'uppercase',
                      background: status === 'published' ? 'rgba(76,175,80,0.15)'
                              : status === 'ready_to_test' ? 'rgba(24,218,252,0.15)'
                              : 'var(--tint-2)',
                      color: status === 'published' ? 'var(--green)'
                          : status === 'ready_to_test' ? 'var(--blue)'
                          : 'var(--text-3)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    {status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {agentId && onEmbed && (
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
                padding: '8px 14px', borderRadius: 9,
                border: 'none',
                background: publishDisabled
                  ? 'var(--tint-2)'
                  : 'var(--grad-brand)',
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
          <button
            onClick={toggleTheme}
            className="tooltip-wrap"
            data-tip={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            aria-label="Toggle theme"
            style={iconBtn}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
          </button>
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
          padding: '28px 28px 60px',
          maxWidth: 1440,
          margin: '0 auto',
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
