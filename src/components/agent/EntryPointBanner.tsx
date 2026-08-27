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
import { errorMessage, gateInfo, type GateInfo } from '../../utils/apiError';
import PlanGateNotice from '../PlanGateNotice';
import Icon from '../../assets/icons';

// ── colours ──────────────────────────────────────────────────────────────────
const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)',
  blue:   'var(--blue)',
  teal:   'var(--teal)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  pink:   'var(--pink)',
  violet: 'var(--violet)',
};

// ── types ─────────────────────────────────────────────────────────────────────
interface InboundRoute {
  id:             string;
  twilio_number:  string;
  is_active?:     boolean;
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
    background: copied ? 'rgba(76,175,80,0.12)' : 'var(--card-bg)',
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
          fontFamily: mono ? "'Zalando Sans'" : 'inherit',
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
  const [numberInput, setNumberInput] = useState('');
  const [assignError, setAssignError] = useState('');
  // 402/403 from the plan / credit / role gates — shown as a notice, not an error.
  const [gate, setGate] = useState<GateInfo | null>(null);

  const hostedUrl = agentId
    ? `${window.location.protocol}//${window.location.host}/chat/${agentId}`
    : '';

  const color = tintColor[tint] ?? tintColor.purple;

  // Load inbound routes for voice agents
  useEffect(() => {
    if (!agentId || !isVoice) { setRoutes([]); return; }
    setLoadingRoutes(true);
    api<InboundRoute[]>(`/v1/agents/${agentId}/inbound-routes`)
      .then(r => { setRoutes(r); setGate(null); })
      .catch(e => { setRoutes([]); setGate(gateInfo(e)); })
      .finally(() => setLoadingRoutes(false));
  }, [agentId, isVoice]);

  async function assignVoBizNumber() {
    const num = numberInput.trim();
    if (!agentId || !num || requestingNumber) return;
    setAssignError('');
    setGate(null);
    setRequestingNumber(true);
    try {
      await api(`/v1/agents/${agentId}/inbound-routes`, {
        method: 'POST',
        body: { twilio_number: num },
      });
      const r = await api<InboundRoute[]>(`/v1/agents/${agentId}/inbound-routes`);
      setRoutes(r);
      setNumberInput('');
    } catch (e) {
      // A plan/role gate is an expected answer — show the notice, not an error.
      const g = gateInfo(e);
      if (g) setGate(g);
      else setAssignError(errorMessage(e, 'Failed to assign number'));
    } finally {
      setRequestingNumber(false);
    }
  }

  async function removeNumber(num: string) {
    if (!agentId) return;
    try {
      const r = routes.find(r => r.twilio_number === num);
      if (!r) return;
      await api(`/v1/agents/${agentId}/inbound-routes/${(r as any).id}`, { method: 'DELETE' });
      setRoutes(prev => prev.filter(x => x.twilio_number !== num));
    } catch (e) {
      // Deleting a route is admin-only; don't fail silently on the role gate.
      const g = gateInfo(e);
      if (g) setGate(g);
      else setAssignError(errorMessage(e, 'Failed to remove number'));
    }
  }

  if (!agentId) return null;

  // ── Chat entry point ────────────────────────────────────────────────────────
  if (isChat) {
    return (
      <div style={bannerWrap(color)}>
        {/* Left badge */}
        <div style={badgeCol}>
          <div style={{ ...iconCircle(color), color }}><Icon name="globe" size={20} /></div>
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
        <div style={{ ...iconCircle(color), color }}><Icon name="phone" size={20} /></div>
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
        {gate && <PlanGateNotice gate={gate} compact />}
        {assignError && (
          <div style={{ fontSize: 11, color: 'var(--red)' }}>{assignError}</div>
        )}
        {loadingRoutes ? (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading…</div>
        ) : primaryRoute ? (
          <>
            {/* Assigned number + remove */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <EndpointRow label="VoBiz number" value={primaryRoute.twilio_number} />
              <button
                onClick={() => removeNumber(primaryRoute.twilio_number)}
                style={{
                  fontSize: 11, color: 'var(--text-4)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '2px 6px',
                  borderRadius: 4,
                }}
                title="Remove number"
              ><Icon name="x" size={12} /></button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              Inbound: set Answer URL in VoBiz → <code style={{ fontSize: 10 }}>POST /v1/vobiz/answer</code>
            </div>

            {/* Outbound dial — no backend endpoint exists yet (VoBiz exposes only
                /answer, /hangup, /audio), so the control is inert on purpose
                rather than firing a 404. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 60 }}>Dial out</span>
              <input
                disabled
                readOnly
                aria-label="Outbound number — dialling from the dashboard is not available yet"
                placeholder="+91XXXXXXXXXX"
                style={{
                  flex: 1, minWidth: 150, padding: '5px 9px',
                  borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-0)', color: 'var(--text-4)',
                  fontSize: 12.5, fontFamily: 'monospace',
                  cursor: 'not-allowed',
                }}
              />
              <button
                type="button"
                disabled
                title="Dialling from the dashboard isn't available yet"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 13px', borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-0)',
                  color: 'var(--text-4)',
                  fontSize: 12.5, fontWeight: 600,
                  cursor: 'not-allowed',
                }}
              >
                <Icon name="phone" size={13} /> Call — coming soon
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              Outbound dialling from the dashboard isn’t available yet. Place outbound
              calls from VoBiz for now.
            </div>
          </>
        ) : (
          <>
            <div style={unpublishedNote}>No VoBiz number assigned yet.</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={numberInput}
                onChange={e => setNumberInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && assignVoBizNumber()}
                placeholder="+91XXXXXXXXXX or +1XXXXXXXXXX"
                style={{
                  flex: 1, minWidth: 180, padding: '6px 10px',
                  borderRadius: 7, border: '1px solid var(--border)',
                  background: 'var(--bg-1)', color: 'var(--text-1)',
                  fontSize: 12.5, fontFamily: 'monospace',
                }}
              />
              <button
                onClick={assignVoBizNumber}
                disabled={requestingNumber || !numberInput.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 8,
                  border: `1px solid ${color}44`,
                  background: `${color}12`, color,
                  fontSize: 12.5, fontWeight: 600,
                  cursor: (requestingNumber || !numberInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (requestingNumber || !numberInput.trim()) ? 0.5 : 1,
                }}
              >
                {requestingNumber ? 'Assigning…' : '+ Assign'}
              </button>
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
