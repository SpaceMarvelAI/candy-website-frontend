/**
 * WhatsAppConnectionPanel
 *
 * Connect/view/disconnect this agent's WhatsApp Business number. Mirrors
 * EntryPointBanner's telephony section (same visual language, same
 * assign/remove interaction shape) since the two are structurally
 * identical — "assign an external channel identifier to this agent" — just
 * with more fields, because a WhatsApp connection needs a phone_number_id,
 * a WABA id, and an access token where the VoBiz flow needs only a number.
 *
 * The access token is entered once and never redisplayed — the backend
 * response never echoes it back (see api/whatsapp.ts's ConnectWhatsAppBody
 * comment), matching the same "write-only secret" pattern the platform
 * already uses for connections.py's other third-party credentials.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │  💬 WhatsApp      │  +1 555 000 1234  ●Connected  [Disconnect]   │
 * │                   │  Phone Number ID: pn_xxxxx                    │
 * └──────────────────────────────────────────────────────────────────┘
 */
import { useState, useEffect } from 'react';
import {
  listWhatsAppAccounts,
  connectWhatsAppAccount,
  disconnectWhatsAppAccount,
  type WhatsAppAccount,
} from '../../api/whatsapp';
import { errorMessage, gateInfo, type GateInfo } from '../../utils/apiError';
import PlanGateNotice from '../PlanGateNotice';
import Icon from '../../assets/icons';

interface Props {
  agentId: string | null;
  tint?:   string;
}

const tintColor: Record<string, string> = {
  purple: 'var(--purple-hi)', blue: 'var(--blue)', teal: 'var(--teal)',
  green: 'var(--green)', amber: 'var(--amber)', pink: 'var(--pink)', violet: 'var(--violet)',
};

export default function WhatsAppConnectionPanel({ agentId, tint = 'green' }: Props) {
  const color = tintColor[tint] ?? tintColor.green;

  const [accounts, setAccounts]   = useState<WhatsAppAccount[]>([]);
  const [loading, setLoading]     = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [formOpen, setFormOpen]   = useState(false);
  const [error, setError]         = useState('');
  const [gate, setGate]           = useState<GateInfo | null>(null);

  const [phoneNumberId, setPhoneNumberId]     = useState('');
  const [displayNumber, setDisplayNumber]     = useState('');
  const [wabaId, setWabaId]                   = useState('');
  const [appId, setAppId]                     = useState('');
  const [accessToken, setAccessToken]         = useState('');

  useEffect(() => {
    if (!agentId) { setAccounts([]); return; }
    setLoading(true);
    listWhatsAppAccounts(agentId)
      .then(a => { setAccounts(a); setGate(null); })
      .catch(e => { setAccounts([]); setGate(gateInfo(e)); })
      .finally(() => setLoading(false));
  }, [agentId]);

  async function connect() {
    if (!agentId || !phoneNumberId.trim() || !accessToken.trim() || connecting) return;
    setError('');
    setGate(null);
    setConnecting(true);
    try {
      const acc = await connectWhatsAppAccount(agentId, {
        phone_number_id: phoneNumberId.trim(),
        display_phone_number: displayNumber.trim() || undefined,
        waba_id: wabaId.trim() || undefined,
        app_id: appId.trim() || undefined,
        access_token: accessToken.trim(),
      });
      setAccounts(prev => [...prev.filter(a => a.id !== acc.id), acc]);
      setPhoneNumberId(''); setDisplayNumber(''); setWabaId(''); setAppId(''); setAccessToken('');
      setFormOpen(false);
    } catch (e) {
      const g = gateInfo(e);
      if (g) setGate(g);
      else setError(errorMessage(e, 'Failed to connect WhatsApp number'));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(account: WhatsAppAccount) {
    if (!agentId) return;
    try {
      await disconnectWhatsAppAccount(agentId, account.id);
      setAccounts(prev => prev.filter(a => a.id !== account.id));
    } catch (e) {
      const g = gateInfo(e);
      if (g) setGate(g);
      else setError(errorMessage(e, 'Failed to disconnect WhatsApp number'));
    }
  }

  if (!agentId) return null;

  const active = accounts.find(a => a.is_active);

  return (
    <div style={bannerWrap(color)}>
      <div style={badgeCol}>
        <div style={{ ...iconCircle(color), color }}><Icon name="chat" size={20} /></div>
        <div>
          <div style={badgeTitle}>WhatsApp</div>
          <div style={{ ...badgeSub, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: active ? 'var(--green)' : 'var(--text-4)', fontWeight: 600 }}>●</span>
            {active ? 'Connected' : 'Not connected'}
          </div>
        </div>
      </div>

      <div style={divider} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {gate && <PlanGateNotice gate={gate} compact />}
        {error && <div style={{ fontSize: 11, color: 'var(--red)' }}>{error}</div>}

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-4)' }}>Loading…</div>
        ) : active ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 90 }}>Number</span>
              <code style={codeStyle}>{active.display_phone_number || active.phone_number_id}</code>
              <button onClick={() => disconnect(active)} style={removeBtnStyle} title="Disconnect">
                <Icon name="x" size={12} /> Disconnect
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              Phone Number ID: <code style={{ fontSize: 10 }}>{active.phone_number_id}</code>
              {active.waba_id && <> · WABA: <code style={{ fontSize: 10 }}>{active.waba_id}</code></>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>
              Webhook URL: set in Meta App → WhatsApp → Configuration to your deployment's{' '}
              <code style={{ fontSize: 10 }}>/v1/whatsapp/webhook</code>.
            </div>
          </>
        ) : !formOpen ? (
          <>
            <div style={unpublishedNote}>No WhatsApp number connected yet.</div>
            <button onClick={() => setFormOpen(true)} style={assignBtnStyle(color)}>
              <Icon name="plus" size={12} /> Connect WhatsApp
            </button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Field label="Phone Number ID *" value={phoneNumberId} onChange={setPhoneNumberId}
                   placeholder="from Meta App → WhatsApp → API Setup" />
            <Field label="Display number" value={displayNumber} onChange={setDisplayNumber}
                   placeholder="+1 555 000 1234 (optional, for display only)" />
            <Field label="WABA ID" value={wabaId} onChange={setWabaId}
                   placeholder="WhatsApp Business Account ID (optional)" />
            <Field label="Meta App ID" value={appId} onChange={setAppId}
                   placeholder="optional" />
            <Field label="Access Token *" value={accessToken} onChange={setAccessToken}
                   placeholder="permanent or system-user token" secret />
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                onClick={connect}
                disabled={connecting || !phoneNumberId.trim() || !accessToken.trim()}
                style={assignBtnStyle(color, connecting || !phoneNumberId.trim() || !accessToken.trim())}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button onClick={() => setFormOpen(false)} style={cancelBtnStyle}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, secret }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 110 }}>{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        style={{
          flex: 1, minWidth: 160, padding: '6px 10px',
          borderRadius: 7, border: '1px solid var(--border)',
          background: 'var(--bg-1)', color: 'var(--text-1)',
          fontSize: 12.5, fontFamily: secret ? 'inherit' : 'monospace',
        }}
      />
    </div>
  );
}

// ── Styles (matches EntryPointBanner.tsx's tokens/spacing) ──────────────────
function bannerWrap(color: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'flex-start', gap: 16,
    padding: '12px 16px', borderRadius: 12,
    border: `1px solid ${color}28`, background: `${color}08`,
    marginBottom: 16, flexWrap: 'wrap',
  };
}
const badgeCol: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 };
function iconCircle(color: string): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: 10, background: `${color}18`,
    border: `1px solid ${color}30`, display: 'grid', placeItems: 'center',
    fontSize: 17, flexShrink: 0,
  };
}
const badgeTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.2 };
const badgeSub: React.CSSProperties = { fontSize: 11, color: 'var(--text-4)', marginTop: 2 };
const divider: React.CSSProperties = { width: 1, alignSelf: 'stretch', background: 'var(--border)', flexShrink: 0 };
const unpublishedNote: React.CSSProperties = { fontSize: 12, color: 'var(--text-4)', fontStyle: 'italic' };
const codeStyle: React.CSSProperties = {
  flex: 1, fontSize: 12, color: 'var(--text-2)', background: 'var(--bg-0)',
  border: '1px solid var(--border)', borderRadius: 6, padding: '4px 9px',
  overflowX: 'auto', whiteSpace: 'nowrap', minWidth: 0,
};
const removeBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-4)',
  background: 'none', border: '1px solid var(--border)', cursor: 'pointer',
  padding: '4px 10px', borderRadius: 7,
};
function assignBtnStyle(color: string, disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 8,
    border: `1px solid ${color}44`, background: `${color}12`, color,
    fontSize: 12.5, fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    width: 'fit-content',
  };
}
const cancelBtnStyle: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-0)', color: 'var(--text-4)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
};
