/**
 * EntryPointBanner
 *
 * Shows how customers reach this agent — displayed between the AgentPicker
 * and the main content grid in both AgentWorkspace and ChatbotWorkspace.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  🌐 Website Chat  │  Hosted URL: https://…/chat/<id>  [Copy]    │
 * │                   │  [Copy embed snippet ↗]                      │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  📞 Telephony     │  +1 (555) 000-1234  [Copy]  · inbound       │
 * │  (voice agents)   │  or: [Request a number →]                    │
 * └──────────────────────────────────────────────────────────────────┘
 */
import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import Icon from '../../assets/icons';

// ── colours ──────────────────────────────────────────────────────────────────
const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
};

// ── types ─────────────────────────────────────────────────────────────────────
interface InboundRoute {
  phone_number: string;
  friendly_name?: string;
}

interface Props {
  agentId:       string | null;
  callDirection: string;          // 'chat' | 'inbound' | 'outbound' | 'both'
  tint?:         string;
  onEmbed?:      () => void;      // opens EmbedModal from parent
  isPublished?:  boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────
function CopyBtn({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} style={copyBtnStyle(copied)}>
      <Icon name={copied ? 'check' : 'export'} size={11} />
      {copied ? 'Copied!' : label}
    </button>
  );
}

function copyBtnStyle(copied: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '4px 10px', borderRadius: 7,
    border: copied ? '1px solid rgba(76,175,80,0.4)' : '1px solid var(--border)',
    background: copied ? 'rgba(76,175,80,0.12)' : 'var(--surface)',
    color: copied ? 'var(--green)' : 'var(--text-3)',
    fontSize: 11, fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.15s',
    flexShrink: 0,
  };
}

// ── EndpointRow: a URL/number with an inline copy button ─────────────────────
function EndpointRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 90 }}>{label}</span>
      <code
        style={{
          flex: 1,
          fontSize: 12,
          color: 'var(--text-2)',
          background: 'var(--bg-0)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '4px 9px',
          fontFamily: mono ? "'JetBrains Mono','Fira Code',monospace" : 'inherit',
          overflowX: 'auto', whiteSpace: 'nowrap',
          minWidth: 0,
        }}
      >
        {value}
      </code>
      <CopyBtn text={value} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EntryPointBanner({
  agentId, callDirection, tint = 'purple', onEmbed, isPublished,
}: Props) {
  const isChat  = callDirection === 'chat';
  const isVoice = !isChat;

  const [routes, setRoutes] = useState<InboundRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [requestingNumber, setRequestingNumber] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const BASE_URL  = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8002';
  const hostedUrl = agentId
    ? `${window.location.protocol}//${window.location.host}/chat/${agentId}`
    : '';

  const color = tintColor[tint] ?? tintColor.purple;

  // Load inbound routes for voice agents
  useEffect(() => {
    if (!agentId || !isVoice) { setRoutes([]); return; }
    setLoadingRoutes(true);
    api<InboundRoute[]>(`/v1/agents/${agentId}/inbound-routes`)
      .then(r => setRoutes(r))
      .catch(() => setRoutes([]))
      .finally(() => setLoadingRoutes(false));
  }, [agentId, isVoice]);

  async function requestNumber() {
    if (!agentId || requestingNumber) return;
    setRequestingNumber(true);
    try {
      await api(`/v1/agents/${agentId}/inbound-routes`, {
        method: 'POST',
        body: JSON.stringify({ country_code: 'US' }),
      });
      // Reload routes
      const r = await api<InboundRoute[]>(`/v1/agents/${agentId}/inbound-routes`);
      setRoutes(r);
    } catch {
      setRequestSent(true); // fallback: show "request sent" optimistically
    } finally {
      setRequestingNumber(false);
    }
  }

  if (!agentId) return null;

  // ── Chat entry point ────────────────────────────────────────────────────────
  if (isChat) {
    return (
      <div style={bannerWrap(color)}>
        {/* Left badge */}
        <div style={badgeCol}>
          <div style={iconCircle(color)}>🌐</div>
          <div>
            <div style={badgeTitle}>Website Chat</div>
            <div style={badgeSub}>Hosted widget + embed</div>
          </div>
        </div>

        {/* Divider */}
        <div style={divider} />

        {/* Right: endpoints */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isPublished ? (
            <EndpointRow label="Live URL" value={hostedUrl} />
          ) : (
            <div style={unpublishedNote}>
              Publish this agent to get a live hosted URL.
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 90 }}>Embed snippet</span>
            <button
              onClick={onEmbed}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 7,
                border: `1px solid ${color}44`,
                background: `${color}10`,
                color,
                fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Icon name="code" size={12} />
              Copy embed code ↗
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>HTML · JS · Python</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Voice entry point ───────────────────────────────────────────────────────
  const dirLabel = callDirection === 'inbound' ? 'Inbound calls'
                 : callDirection === 'outbound' ? 'Outbound calls'
                 : 'Inbound + Outbound';
  const dirColor = callDirection === 'inbound'  ? 'var(--green)'
                 : callDirection === 'outbound' ? 'var(--amber)'
                 : 'var(--blue)';

  const primaryRoute = routes[0];

  return (
    <div style={bannerWrap(color)}>
      {/* Left badge */}
      <div style={badgeCol}>
        <div style={iconCircle(color)}>📞</div>
        <div>
          <div style={badgeTitle}>Telephony</div>
          <div style={{ ...badgeSub, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: dirColor, fontWeight: 600 }}>●</span> {dirLabel}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={divider} />

      {/* Right: phone number or provision CTA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loadingRoutes ? (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading number…</div>
        ) : primaryRoute ? (
          <>
            <EndpointRow label="Phone number" value={primaryRoute.phone_number} />
            {primaryRoute.friendly_name && (
              <EndpointRow label="Friendly name" value={primaryRoute.friendly_name} mono={false} />
            )}
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
              Route your Twilio number to Candy — see{' '}
              <a href="/integration-guide" target="_blank" style={{ color }}>
                integration guide ↗
              </a>
            </div>
          </>
        ) : requestSent ? (
          <div style={{ fontSize: 13, color: 'var(--green)' }}>
            ✓ Number request submitted — your number will appear here shortly.
          </div>
        ) : (
          <>
            <div style={unpublishedNote}>
              No phone number assigned yet.
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                onClick={requestNumber}
                disabled={requestingNumber}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  border: `1px solid ${color}44`,
                  background: `${color}12`,
                  color,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: requestingNumber ? 'wait' : 'pointer',
                  opacity: requestingNumber ? 0.6 : 1,
                }}
              >
                {requestingNumber ? 'Requesting…' : '+ Provision a US number'}
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
                or bring your own Twilio number in settings
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function bannerWrap(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '12px 16px',
    borderRadius: 12,
    border: `1px solid ${color}28`,
    background: `${color}08`,
    marginBottom: 16,
    flexWrap: 'wrap',
  };
}

const badgeCol: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
};

function iconCircle(color: string): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 10,
    background: `${color}18`,
    border: `1px solid ${color}30`,
    display: 'grid', placeItems: 'center',
    fontSize: 17,
    flexShrink: 0,
  };
}

const badgeTitle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text-1)',
  lineHeight: 1.2,
};

const badgeSub: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-4)',
  marginTop: 2,
};

const divider: React.CSSProperties = {
  width: 1,
  alignSelf: 'stretch',
  background: 'var(--border)',
  flexShrink: 0,
};

const unpublishedNote: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-4)',
  fontStyle: 'italic',
};
