import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';
import { ApiError } from '../../api/client';
import {
  listWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  listWebhookDeliveries,
  pingWebhook,
  type Webhook,
  type WebhookCreate,
  type WebhookDelivery,
} from '../../api/webhooks';

// ── Shared event types offered when creating / editing a webhook ──────────────
const ALL_EVENTS = [
  'session.started',
  'session.ended',
  'session.escalated',
  'turn.completed',
  'agent.published',
  'adaptive_prompt.promoted',
  'autotest.run_completed',
];

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(); } catch { return iso ?? '—'; }
}

// ── Status pills ──────────────────────────────────────────────────────────────
function ActivePill({ active }: { active: boolean }) {
  return (
    <span
      style={{
        fontSize: 10.5, padding: '2px 9px', borderRadius: 99, fontWeight: 600,
        background: active ? 'rgba(76,175,80,0.14)' : 'var(--tint-2)',
        color: active ? 'var(--green)' : 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function DeliveryStatusPill({ status, httpStatus }: { status: string; httpStatus: number | null }) {
  const ok = status === 'success' || (httpStatus != null && httpStatus >= 200 && httpStatus < 300);
  return (
    <span
      style={{
        fontSize: 10.5, padding: '2px 9px', borderRadius: 99, fontWeight: 600,
        background: ok ? 'rgba(76,175,80,0.14)' : 'rgba(255,92,122,0.12)',
        color: ok ? 'var(--green)' : 'var(--red)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}
    >
      {status}
    </span>
  );
}

// ── Deliveries inline panel ───────────────────────────────────────────────────
function DeliveriesPanel({ webhookId }: { webhookId: string }) {
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [expanded, setExpanded]     = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    listWebhookDeliveries(webhookId)
      .then(d => { if (mounted) { setDeliveries(d); setLoading(false); } })
      .catch(e => {
        if (!mounted) return;
        setError(e instanceof ApiError ? e.message : (e as Error).message);
        setLoading(false);
      });
    return () => { mounted = false; };
  }, [webhookId]);

  if (loading) return (
    <div style={{ padding: '16px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading deliveries…</div>
  );
  if (error) return (
    <div style={{ padding: '12px 22px', color: 'var(--red)', fontSize: 13 }}>{error}</div>
  );
  if (deliveries.length === 0) return (
    <div style={{ padding: '16px 22px', color: 'var(--text-3)', fontSize: 13 }}>
      No deliveries yet — trigger an event or use the Ping button.
    </div>
  );

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div style={{ padding: '10px 22px 6px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-4)' }}>
        Deliveries ({deliveries.length})
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {['Time', 'Event', 'Status', 'HTTP', ''].map((h, i) => (
              <th
                key={h || i}
                style={{
                  textAlign: 'left', padding: '8px 22px',
                  color: 'var(--text-4)', fontSize: 10.5, textTransform: 'uppercase',
                  letterSpacing: '0.12em', fontWeight: 500,
                  background: 'rgba(255,255,255,0.02)',
                  borderBottom: '1px solid var(--border)',
                }}
              >{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {deliveries.map(d => {
            const isOpen = expanded === d.id;
            return (
              <>
                <tr
                  key={d.id}
                  style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                >
                  <td style={{ padding: '10px 22px', color: 'var(--text-3)', fontSize: 12 }}>
                    {fmtTime(d.delivered_at ?? d.created_at)}
                  </td>
                  <td style={{ padding: '10px 22px', fontFamily: "'Zalando Sans'", fontSize: 11.5, color: 'var(--text-2)' }}>
                    {d.event_type}
                  </td>
                  <td style={{ padding: '10px 22px' }}>
                    <DeliveryStatusPill status={d.status} httpStatus={d.http_status} />
                  </td>
                  <td style={{ padding: '10px 22px', fontFamily: "'Zalando Sans'", color: 'var(--text-3)' }}>
                    {d.http_status ?? '—'}
                  </td>
                  <td style={{ padding: '10px 22px', textAlign: 'right', color: 'var(--text-4)', fontSize: 11 }}>
                    {isOpen ? '▲ Hide' : '▼ Detail'}
                  </td>
                </tr>

                {isOpen && (
                  <tr key={`${d.id}-detail`} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td colSpan={5} style={{ padding: '0 22px 16px' }}>
                      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                        {d.response_body ? (
                          <div style={{ flex: 1, minWidth: 260 }}>
                            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-4)', marginBottom: 6 }}>Response</div>
                            <pre
                              style={{
                                background: 'var(--bg-3)', border: '1px solid var(--border)',
                                borderRadius: 8, padding: '10px 14px', fontSize: 11.5,
                                color: 'var(--text-2)', overflowX: 'auto', margin: 0,
                                fontFamily: "'Zalando Sans'", lineHeight: 1.6,
                                maxHeight: 200, overflowY: 'auto',
                              }}
                            >
                              {(() => { try { return JSON.stringify(JSON.parse(d.response_body!), null, 2); } catch { return d.response_body; } })()}
                            </pre>
                          </div>
                        ) : (
                          <div style={{ padding: '12px 0', color: 'var(--text-4)', fontSize: 12 }}>No response body recorded.</div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Create / Edit drawer ──────────────────────────────────────────────────────
interface DrawerProps {
  existing: Webhook | null;
  onSave: (w: Webhook) => void;
  onClose: () => void;
}

function WebhookDrawer({ existing, onSave, onClose }: DrawerProps) {
  const { addToast } = useApp();

  const [url,         setUrl]         = useState(existing?.url ?? '');
  const [eventTypes,  setEventTypes]  = useState<string[]>(existing?.event_types ?? []);
  const [isActive,    setIsActive]    = useState(existing?.is_active ?? true);
  const [description, setDescription] = useState(existing?.description ?? '');
  const [saving,      setSaving]      = useState(false);

  function toggleEvent(ev: string) {
    setEventTypes(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  }

  async function handleSave() {
    if (!url.trim()) { addToast('URL is required', 'error'); return; }
    if (eventTypes.length === 0) { addToast('Select at least one event', 'error'); return; }
    setSaving(true);
    try {
      const saved = existing
        ? await updateWebhook(existing.id, { url: url.trim(), event_types: eventTypes, is_active: isActive, description: description.trim() || undefined })
        : await createWebhook({ url: url.trim(), event_types: eventTypes, description: description.trim() || undefined });
      addToast(existing ? 'Webhook updated' : 'Webhook created', 'success');
      onSave(saved);
    } catch (e) {
      addToast(e instanceof ApiError ? e.message : (e as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-3)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: '10px 13px',
    color: 'var(--text-1)',
    fontSize: 13,
    outline: 'none',
    transition: 'border-color 0.15s',
    boxSizing: 'border-box',
  };

  return (
    <>
      {/* Dim overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.50)' }}
      />

      {/* Right-side drawer */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 'min(480px, 46vw)',
          zIndex: 1001,
          background: '#18181f',
          borderLeft: '1px solid var(--border-strong)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '-16px 0 56px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(117,91,227,0.15)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
          }}>
            <Icon name="zap" size={16} style={{ color: 'var(--purple-hi)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
              {existing ? 'Edit Webhook' : 'Create Webhook'}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
              {existing ? 'Update your endpoint settings' : 'Register a new webhook endpoint'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-2)', display: 'grid', placeItems: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* URL */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 7 }}>
              Endpoint URL *
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhooks"
              style={inputStyle}
            />
          </div>

          {/* Events */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 7 }}>
              Events to subscribe *
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ALL_EVENTS.map(ev => (
                <label
                  key={ev}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                    background: eventTypes.includes(ev) ? 'rgba(117,91,227,0.1)' : 'var(--bg-3)',
                    border: `1px solid ${eventTypes.includes(ev) ? 'var(--border-accent)' : 'var(--border)'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <div
                    style={{
                      width: 16, height: 16, borderRadius: 4,
                      background: eventTypes.includes(ev) ? 'var(--purple)' : 'var(--tint-2)',
                      border: `1px solid ${eventTypes.includes(ev) ? 'var(--purple)' : 'var(--border-strong)'}`,
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                      transition: 'all 0.15s',
                    }}
                    onClick={() => toggleEvent(ev)}
                  >
                    {eventTypes.includes(ev) && <Icon name="check" size={10} style={{ color: '#fff' }} />}
                  </div>
                  <span
                    style={{ fontSize: 12.5, color: 'var(--text-2)', fontFamily: "'Zalando Sans'" }}
                    onClick={() => toggleEvent(ev)}
                  >
                    {ev}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 7 }}>
              Description <span style={{ color: 'var(--text-4)', fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. Slack notifications for session events"
              style={inputStyle}
            />
          </div>

          {/* Active toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>Active</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                Inactive webhooks receive no events.
              </div>
            </div>
            <button
              onClick={() => setIsActive(a => !a)}
              style={{
                width: 42, height: 24, borderRadius: 99,
                background: isActive ? 'var(--purple)' : 'var(--tint-4)',
                border: 'none', cursor: 'pointer', position: 'relative',
                transition: 'background 0.2s', flexShrink: 0,
              }}
            >
              <span
                style={{
                  position: 'absolute', top: 3,
                  left: isActive ? 21 : 3,
                  width: 18, height: 18, borderRadius: 99,
                  background: '#fff',
                  transition: 'left 0.2s',
                }}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px', borderTop: '1px solid var(--border)',
            display: 'flex', gap: 10, flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 9,
              background: 'var(--tint-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 9,
              background: saving ? 'var(--tint-4)' : 'var(--grad-brand)',
              border: 'none',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
              transition: 'all 0.15s',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}
          >
            {saving && <Icon name="refresh" size={13} />}
            {saving ? 'Saving…' : (existing ? 'Update Webhook' : 'Create Webhook')}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function WebhooksPage() {
  const { addToast } = useApp();

  const [webhooks,    setWebhooks]    = useState<Webhook[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  const [drawerOpen,  setDrawerOpen]  = useState(false);
  const [editing,     setEditing]     = useState<Webhook | null>(null);

  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [pingingId,   setPingingId]   = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const initRef = useRef(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await listWebhooks();
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    refresh();
  }, []);

  function openCreate() { setEditing(null); setDrawerOpen(true); }
  function openEdit(w: Webhook) { setEditing(w); setDrawerOpen(true); }

  function handleSaved(w: Webhook) {
    setWebhooks(prev => {
      const idx = prev.findIndex(x => x.id === w.id);
      return idx >= 0
        ? prev.map((x, i) => (i === idx ? w : x))
        : [w, ...prev];
    });
    setDrawerOpen(false);
  }

  async function handlePing(w: Webhook) {
    if (pingingId) return;
    setPingingId(w.id);
    try {
      await pingWebhook(w.id);
      addToast(`Ping sent to ${w.url}`, 'success');
    } catch (e) {
      addToast(e instanceof ApiError ? e.message : (e as Error).message, 'error');
    } finally {
      setPingingId(null);
    }
  }

  async function handleDelete(w: Webhook) {
    if (deletingId) return;
    if (!window.confirm(`Delete this webhook permanently?\n\nURL: ${w.url}\nEvents: ${w.event_types.join(', ')}`)) return;
    setDeletingId(w.id);
    try {
      await deleteWebhook(w.id);
      setWebhooks(prev => prev.filter(x => x.id !== w.id));
      if (expandedId === w.id) setExpandedId(null);
      addToast('Webhook deleted', 'success');
    } catch (e) {
      addToast(e instanceof ApiError ? e.message : (e as Error).message, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  const iconBtnBase: React.CSSProperties = {
    width: 30, height: 30, borderRadius: 8,
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--text-2)', cursor: 'pointer',
    display: 'inline-grid', placeItems: 'center',
    transition: 'all 0.15s',
  };

  return (
    <div className="fade-up">
      {/* ── Page header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.2em', color: 'var(--blue)', marginBottom: 10 }}>
            Integrations · Webhooks
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--text-1)' }}>
            Webhooks
          </h1>
          <p style={{ color: 'var(--text-3)', fontSize: 15, marginTop: 8 }}>
            {loading ? 'Loading…' : `${webhooks.length} webhook${webhooks.length === 1 ? '' : 's'} registered`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingTop: 4 }}>
          <button
            onClick={() => { refresh().then(() => addToast('Webhooks refreshed', 'success')); }}
            style={{
              padding: '9px 14px', borderRadius: 9,
              background: 'var(--tint-2)', border: '1px solid var(--border)',
              color: 'var(--text-2)', cursor: 'pointer', fontSize: 13,
              display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <Icon name="refresh" size={13} /> Refresh
          </button>
          <button
            onClick={openCreate}
            style={{
              padding: '9px 16px', borderRadius: 9,
              background: 'var(--grad-brand)', border: 'none',
              color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 7,
              transition: 'all 0.15s',
            }}
          >
            <Icon name="plus" size={14} /> Create Webhook
          </button>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div
          role="alert"
          style={{
            background: 'rgba(255,90,120,0.1)',
            border: '1px solid rgba(255,90,120,0.4)',
            color: '#ff8194',
            padding: '12px 14px', borderRadius: 10,
            fontSize: 13, marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* ── Webhooks table ── */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          backdropFilter: 'blur(20px)',
        }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 }}>
            {webhooks.length} webhook{webhooks.length === 1 ? '' : 's'}
          </h3>
        </div>

        {loading && webhooks.length === 0 ? (
          <div style={{ padding: '28px 22px', color: 'var(--text-3)', fontSize: 13 }}>Loading…</div>
        ) : webhooks.length === 0 ? (
          <div style={{ padding: '40px 22px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>
              No webhooks yet. Create one to start receiving event notifications.
            </div>
            <button
              onClick={openCreate}
              style={{
                padding: '9px 18px', borderRadius: 9,
                background: 'var(--grad-brand)', border: 'none',
                color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 7,
              }}
            >
              <Icon name="plus" size={13} /> Create your first webhook
            </button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['URL', 'Events', 'Status', 'Created', ''].map((h, i) => (
                  <th
                    key={h || i}
                    style={{
                      textAlign: i === 4 ? 'right' : 'left',
                      padding: '12px 22px',
                      color: 'var(--text-3)', fontSize: 11, textTransform: 'uppercase',
                      letterSpacing: '0.12em', fontWeight: 500,
                      background: 'var(--surface-soft)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {webhooks.map(w => {
                const isExpanded = expandedId === w.id;
                const isPinging  = pingingId  === w.id;
                const isDeleting = deletingId === w.id;

                return (
                  <>
                    <tr key={w.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                      {/* URL */}
                      <td style={{ padding: '14px 22px', maxWidth: 280 }}>
                        <div
                          style={{
                            fontWeight: 500, color: 'var(--text-1)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            fontFamily: "'Zalando Sans'", fontSize: 12.5,
                          }}
                          title={w.url}
                        >
                          {w.url}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2, fontFamily: "'Zalando Sans'" }}>
                          {w.id.slice(0, 8)}…
                        </div>
                      </td>

                      {/* Events */}
                      <td style={{ padding: '14px 22px', maxWidth: 260 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {(w.event_types || []).slice(0, 3).map(ev => (
                            <span
                              key={ev}
                              style={{
                                fontSize: 10.5, padding: '1px 7px', borderRadius: 99,
                                background: 'var(--tint-2)', color: 'var(--text-3)',
                                fontFamily: "'Zalando Sans'", fontWeight: 500,
                              }}
                            >
                              {ev}
                            </span>
                          ))}
                          {w.event_types && w.event_types.length > 3 && (
                            <span style={{ fontSize: 10.5, color: 'var(--text-4)', padding: '1px 4px' }}>
                              +{w.event_types.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 22px' }}>
                        <ActivePill active={w.is_active} />
                      </td>

                      {/* Created */}
                      <td style={{ padding: '14px 22px', color: 'var(--text-3)', fontSize: 12 }}>
                        {fmtTime(w.created_at)}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '14px 22px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          {/* Deliveries toggle */}
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : w.id)}
                            title="View deliveries"
                            style={{
                              ...iconBtnBase,
                              background: isExpanded ? 'rgba(24,218,252,0.1)' : 'transparent',
                              borderColor: isExpanded ? 'var(--blue)' : 'var(--border)',
                              color: isExpanded ? 'var(--blue)' : 'var(--text-2)',
                            }}
                          >
                            <Icon name="list" size={13} />
                          </button>

                          {/* Ping */}
                          <button
                            onClick={() => handlePing(w)}
                            disabled={isPinging}
                            title="Ping webhook"
                            style={{
                              ...iconBtnBase,
                              color: isPinging ? 'var(--amber)' : 'var(--text-2)',
                              borderColor: isPinging ? 'var(--amber)' : 'var(--border)',
                              background: isPinging ? 'rgba(255,181,71,0.1)' : 'transparent',
                              cursor: isPinging ? 'wait' : 'pointer',
                            }}
                          >
                            <Icon name={isPinging ? 'refresh' : 'zap'} size={13} />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => openEdit(w)}
                            title="Edit webhook"
                            style={iconBtnBase}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(117,91,227,0.1)'; e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--purple-hi)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
                          >
                            <Icon name="settings" size={13} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(w)}
                            disabled={isDeleting}
                            title="Delete webhook"
                            style={{
                              ...iconBtnBase,
                              background: isDeleting ? 'rgba(255,92,122,0.15)' : 'transparent',
                              borderColor: isDeleting ? 'rgba(255,92,122,0.4)' : 'var(--border)',
                              color: isDeleting ? 'var(--red)' : 'var(--text-2)',
                              cursor: isDeleting ? 'wait' : 'pointer',
                            }}
                            onMouseEnter={e => {
                              if (!isDeleting) {
                                e.currentTarget.style.background = 'rgba(255,92,122,0.1)';
                                e.currentTarget.style.borderColor = 'rgba(255,92,122,0.4)';
                                e.currentTarget.style.color = 'var(--red)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isDeleting) {
                                e.currentTarget.style.background = 'transparent';
                                e.currentTarget.style.borderColor = 'var(--border)';
                                e.currentTarget.style.color = 'var(--text-2)';
                              }
                            }}
                          >
                            <Icon name={isDeleting ? 'refresh' : 'x'} size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Deliveries inline panel */}
                    {isExpanded && (
                      <tr key={`${w.id}-deliveries`} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <DeliveriesPanel webhookId={w.id} />
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Create / Edit drawer ── */}
      {drawerOpen && (
        <WebhookDrawer
          existing={editing}
          onSave={handleSaved}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}
