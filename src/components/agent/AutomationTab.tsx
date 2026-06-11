/**
 * AutomationTab — visual no-code integration builder.
 *
 * Left panel: app library (drag / click to add)
 * Right canvas: active connections for this agent
 * Drawer: config form for each connection
 *
 * Backed by GET|POST|PATCH|DELETE /v1/escalations/configs
 */
import { useState, useEffect, useCallback } from 'react';
import Icon from '../../assets/icons';
import {
  listAutomations, createAutomation, updateAutomation,
  deleteAutomation, testAutomation, listPresets,
  type AutomationConfig, type AutomationPreset,
  type CreateAutomationBody, type TriggerType, type AuthType,
} from '../../api/automations';
import { useApp } from '../../context/AppContext';

// ── App catalogue ─────────────────────────────────────────────────────────────
// These are shown in the left panel. app_type must match backend preset keys.
const APP_CATALOGUE = [
  { app_type: 'zoho_desk',     label: 'Zoho Desk',     icon: 'help',     color: '#E53935', desc: 'Support tickets' },
  { app_type: 'zoho_projects', label: 'Zoho Projects',  icon: 'list',     color: '#E53935', desc: 'Project tasks' },
  { app_type: 'jira',          label: 'Jira',           icon: 'list',     color: '#0052CC', desc: 'Issue tracker' },
  { app_type: 'asana',         label: 'Asana',          icon: 'check',    color: '#F06A6A', desc: 'Tasks & projects' },
  { app_type: 'linear',        label: 'Linear',         icon: 'zap',      color: '#5E6AD2', desc: 'Issue tracking' },
  { app_type: 'notion',        label: 'Notion',         icon: 'book',     color: '#888888', desc: 'Databases' },
  { app_type: 'github_issues', label: 'GitHub Issues',  icon: 'code',     color: '#24292E', desc: 'Issue tracker' },
  { app_type: 'calendly',      label: 'Calendly',       icon: 'calendar', color: '#006BFF', desc: 'Demo booking' },
  { app_type: 'custom_http',   label: 'Custom Webhook', icon: 'plug',     color: '#18DAFC', desc: 'Any HTTP endpoint' },
];

const TRIGGER_LABELS: Record<TriggerType, string> = {
  escalation:   'On Escalation',
  demo_booking: 'On Demo Booking',
  both:         'Both',
};

const AUTH_LABELS: Record<AuthType, string> = {
  none:    'No Auth',
  bearer:  'Bearer Token',
  api_key: 'API Key Header',
  basic:   'Basic Auth',
};

interface Props {
  agentId:   string | null;
  agentSlug: string;
  tint?:     string;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AutomationTab({ agentId, agentSlug, tint = 'purple' }: Props) {
  const { addToast } = useApp();

  const [configs,  setConfigs]  = useState<AutomationConfig[]>([]);
  const [presets,  setPresets]  = useState<AutomationPreset[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [drawer,   setDrawer]   = useState<'closed' | 'new' | 'edit'>('closed');
  const [editing,  setEditing]  = useState<AutomationConfig | null>(null);
  const [selected, setSelected] = useState<string | null>(null); // app_type for new
  const [testing,  setTesting]  = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [search,   setSearch]   = useState('');

  // Form state
  const [formUrl,      setFormUrl]      = useState('');
  const [formAuth,     setFormAuth]     = useState<AuthType>('none');
  const [formAuthKey,  setFormAuthKey]  = useState('');
  const [formAuthVal,  setFormAuthVal]  = useState('');
  const [formTrigger,  setFormTrigger]  = useState<TriggerType>('escalation');
  const [formBody,     setFormBody]     = useState('');
  const [formName,     setFormName]     = useState('');
  const [saving,       setSaving]       = useState(false);

  // Load
  const reload = useCallback(async () => {
    if (!agentId) return;
    setLoading(true);
    try {
      const [cfgs, pres] = await Promise.all([
        listAutomations(agentId),
        listPresets().catch(() => [] as AutomationPreset[]),
      ]);
      setConfigs(cfgs);
      setPresets(pres);
    } catch (e) {
      console.warn('[AutomationTab] load failed', e);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => { reload(); }, [reload]);

  // Open drawer for new connection
  function openNew(appType: string) {
    if (!agentId) { addToast('Pick an agent first', 'error'); return; }
    setSelected(appType);
    setEditing(null);
    const preset = presets.find(p => p.app_type === appType);
    const appMeta = APP_CATALOGUE.find(a => a.app_type === appType);
    setFormName(appMeta?.label ?? appType);
    setFormUrl(preset?.webhook_url_hint ?? '');
    setFormAuth((preset?.auth_type ?? 'none') as AuthType);
    setFormAuthKey('');
    setFormAuthVal('');
    setFormTrigger('escalation');
    setFormBody(preset ? JSON.stringify(preset.body_template, null, 2) : '{}');
    setTestResult(null);
    setDrawer('new');
  }

  // Open drawer to edit existing
  function openEdit(cfg: AutomationConfig) {
    setEditing(cfg);
    setSelected(cfg.app_type);
    setFormName(cfg.display_name);
    setFormUrl(cfg.webhook_url);
    setFormAuth(cfg.auth_type);
    const ac = cfg.auth_config || {};
    setFormAuthKey(ac.header_name ?? ac.username ?? '');
    setFormAuthVal(ac.token ?? ac.api_key ?? ac.password ?? '');
    setFormTrigger(cfg.trigger_type);
    setFormBody(JSON.stringify(cfg.body_template, null, 2));
    setTestResult(null);
    setDrawer('edit');
  }

  function closeDrawer() {
    setDrawer('closed');
    setEditing(null);
    setSelected(null);
    setTestResult(null);
  }

  async function save() {
    if (!agentId || !selected) return;
    setSaving(true);
    try {
      let parsedBody: Record<string, any> = {};
      try { parsedBody = JSON.parse(formBody); } catch { parsedBody = {}; }
      const authConfig: Record<string, string> = {};
      if (formAuth === 'bearer')  authConfig.token       = formAuthVal;
      if (formAuth === 'api_key') { authConfig.header_name = formAuthKey; authConfig.api_key = formAuthVal; }
      if (formAuth === 'basic')   { authConfig.username = formAuthKey;  authConfig.password = formAuthVal; }

      const body: CreateAutomationBody = {
        app_type:            selected,
        display_name:        formName,
        webhook_url:         formUrl,
        body_template:       parsedBody,
        auth_type:           formAuth,
        auth_config:         authConfig,
        trigger_type:        formTrigger,
        trigger_agent_slugs: [agentSlug],
        is_active:           true,
      };

      if (drawer === 'edit' && editing) {
        await updateAutomation(editing.id, body);
        addToast(`${formName} updated`, 'success');
      } else {
        await createAutomation(agentId, body);
        addToast(`${formName} connected`, 'success');
      }
      await reload();
      closeDrawer();
    } catch (e: any) {
      addToast(`Save failed: ${e?.message ?? e}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} connection?`)) return;
    try {
      await deleteAutomation(id);
      await reload();
      addToast(`${name} removed`, 'success');
    } catch (e: any) {
      addToast(`Remove failed: ${e?.message ?? e}`, 'error');
    }
  }

  async function runTest() {
    if (!editing) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testAutomation(editing.id, true);
      setTestResult({ ok: r.success, msg: r.success ? `${r.status_code} — webhook reachable` : `${r.error ?? 'failed'}` });
    } catch (e: any) {
      setTestResult({ ok: false, msg: `Error: ${e?.message ?? e}` });
    } finally {
      setTesting(false);
    }
  }

  const filtered = APP_CATALOGUE.filter(a =>
    a.label.toLowerCase().includes(search.toLowerCase()) ||
    a.desc.toLowerCase().includes(search.toLowerCase())
  );

  const drawerOpen = drawer !== 'closed';
  const appMeta = APP_CATALOGUE.find(a => a.app_type === selected);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', minHeight: 400 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0, minHeight: 400 }}>

        {/* ── Left: App Library ─────────────────────────────────────────────── */}
        <div style={{
          borderRight: '1px solid var(--border)',
          background: 'var(--bg-0)',
          padding: '14px 12px',
          overflowY: 'auto',
          maxHeight: 620,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>
            App Library
          </div>
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search apps…"
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--text-1)',
                outline: 'none',
              }}
            />
          </div>
          {/* App tiles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(app => {
              const connected = configs.some(c => c.app_type === app.app_type && c.is_active);
              return (
                <button
                  key={app.app_type}
                  onClick={() => openNew(app.app_type)}
                  disabled={!agentId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 10px', borderRadius: 8,
                    border: `1px solid ${connected ? 'rgba(76,175,80,0.4)' : 'var(--border)'}`,
                    background: connected ? 'rgba(76,175,80,0.07)' : 'var(--surface)',
                    cursor: agentId ? 'pointer' : 'not-allowed',
                    opacity: agentId ? 1 : 0.4,
                    textAlign: 'left',
                    transition: 'all 0.12s',
                  }}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: app.color + '22',
                    border: `1px solid ${app.color}44`,
                    display: 'grid', placeItems: 'center',
                    fontSize: 16, flexShrink: 0, color: app.color,
                  }}>
                    <Icon name={app.icon} size={16} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)' }}>{app.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{app.desc}</div>
                  </div>
                  {connected && (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'var(--green)', flexShrink: 0,
                    }} />
                  )}
                  {!connected && (
                    <span style={{ fontSize: 16, color: 'var(--text-4)', flexShrink: 0 }}>+</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Canvas ──────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 20px', background: 'var(--bg-1)', overflowY: 'auto', maxHeight: 620 }}>
          {!agentId ? (
            <div style={emptyStyle}>Pick an agent above to manage its automations.</div>
          ) : loading ? (
            <div style={emptyStyle}>Loading…</div>
          ) : configs.length === 0 ? (
            <div style={{ ...emptyStyle, flexDirection: 'column', gap: 12 }}>
              <div style={{ color: 'var(--text-3)' }}><Icon name="plug" size={32} /></div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
                No automations yet.<br/>Click an app on the left to connect it.
              </div>
            </div>
          ) : (
            <>
              {/* Agent node */}
              <div style={agentNodeStyle}>
                <Icon name="mic" size={16} />
                <span style={{ fontSize: 12.5, fontWeight: 600 }}>This Agent</span>
              </div>
              {/* Connection lines + app nodes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {configs.map(cfg => {
                  const meta = APP_CATALOGUE.find(a => a.app_type === cfg.app_type);
                  return (
                    <div key={cfg.id} style={connectionRowStyle}>
                      {/* Line */}
                      <div style={connectorLineStyle} />
                      {/* App card */}
                      <div style={{
                        ...appCardStyle,
                        borderColor: cfg.is_active ? (meta?.color ?? 'var(--border)') + '55' : 'var(--border)',
                        opacity: cfg.is_active ? 1 : 0.5,
                      }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: 9,
                          background: (meta?.color ?? '#888') + '22',
                          border: `1px solid ${meta?.color ?? '#888'}44`,
                          display: 'grid', placeItems: 'center',
                          fontSize: 18, flexShrink: 0, color: meta?.color ?? '#888',
                        }}>
                          <Icon name={meta?.icon ?? 'plug'} size={18} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{cfg.display_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                            <span style={triggerBadge(cfg.trigger_type)}>{TRIGGER_LABELS[cfg.trigger_type]}</span>
                            {' · '}
                            <span style={{ fontFamily: 'inherit', fontSize: 10.5 }}>
                              {(cfg.webhook_url ?? '').replace(/^https?:\/\//, '').slice(0, 38)}
                              {(cfg.webhook_url?.length ?? 0) > 45 ? '…' : ''}
                            </span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => openEdit(cfg)} style={iconBtnStyle} title="Edit">
                            <Icon name="settings" size={13} />
                          </button>
                          <button onClick={() => remove(cfg.id, cfg.display_name)} style={{ ...iconBtnStyle, color: 'var(--red)' }} title="Remove">
                            <Icon name="x" size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Config Drawer ──────────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          zIndex: 20,
          display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end',
        }}
          onClick={e => { if ((e.target as HTMLElement).dataset.backdrop) closeDrawer(); }}
          data-backdrop="1"
        >
          <div style={{
            width: '100%', maxWidth: 440,
            background: 'var(--bg-1)',
            borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* Drawer header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '16px 18px', borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: (appMeta?.color ?? '#888') + '22',
                border: `1px solid ${appMeta?.color ?? '#888'}44`,
                display: 'grid', placeItems: 'center', fontSize: 18, color: appMeta?.color ?? '#888',
              }}>
                <Icon name={appMeta?.icon ?? 'plug'} size={18} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                  {drawer === 'edit' ? 'Edit Connection' : `Connect ${appMeta?.label}`}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{appMeta?.desc}</div>
              </div>
              <button onClick={closeDrawer} style={{ ...iconBtnStyle, width: 30, height: 30 }}>
                <Icon name="x" size={15} />
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              <Field label="Connection Name">
                <input style={inputStyle} value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Jira Support Board" />
              </Field>

              <Field label="Trigger">
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['escalation', 'demo_booking', 'both'] as TriggerType[]).map(t => (
                    <button
                      key={t}
                      onClick={() => setFormTrigger(t)}
                      style={{
                        flex: 1, padding: '7px 4px', borderRadius: 7, border: 'none',
                        fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        background: formTrigger === t ? 'var(--purple)' : 'var(--tint-2)',
                        color: formTrigger === t ? '#fff' : 'var(--text-3)',
                        transition: 'all 0.12s',
                      }}
                    >{TRIGGER_LABELS[t]}</button>
                  ))}
                </div>
              </Field>

              <Field label="Webhook URL">
                <input
                  style={inputStyle}
                  value={formUrl}
                  onChange={e => setFormUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>

              <Field label="Authentication">
                <select style={inputStyle} value={formAuth} onChange={e => setFormAuth(e.target.value as AuthType)}>
                  {(Object.entries(AUTH_LABELS) as [AuthType, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </Field>

              {formAuth === 'bearer' && (
                <Field label="Bearer Token">
                  <input style={inputStyle} type="password" value={formAuthVal} onChange={e => setFormAuthVal(e.target.value)} placeholder="eyJ…" />
                </Field>
              )}
              {formAuth === 'api_key' && (
                <>
                  <Field label="Header Name">
                    <input style={inputStyle} value={formAuthKey} onChange={e => setFormAuthKey(e.target.value)} placeholder="X-Api-Key" />
                  </Field>
                  <Field label="API Key">
                    <input style={inputStyle} type="password" value={formAuthVal} onChange={e => setFormAuthVal(e.target.value)} placeholder="key_…" />
                  </Field>
                </>
              )}
              {formAuth === 'basic' && (
                <>
                  <Field label="Username / Email">
                    <input style={inputStyle} value={formAuthKey} onChange={e => setFormAuthKey(e.target.value)} />
                  </Field>
                  <Field label="Password / Token">
                    <input style={inputStyle} type="password" value={formAuthVal} onChange={e => setFormAuthVal(e.target.value)} />
                  </Field>
                </>
              )}

              <Field label="Body Template (JSON)" hint="Use {{variable}} for dynamic values">
                <textarea
                  style={{ ...inputStyle, fontFamily: 'inherit', fontSize: 11.5, minHeight: 130, resize: 'vertical' }}
                  value={formBody}
                  onChange={e => setFormBody(e.target.value)}
                  spellCheck={false}
                />
              </Field>

              <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.5 }}>
                Available variables: <code style={{ fontSize: 10.5, color: 'var(--purple)' }}>{'{{session_id}} {{agent_name}} {{user_message}} {{transcript}} {{issue_summary}} {{priority}} {{user_email}} {{escalation_reason}}'}</code>
              </div>

              {/* Test result */}
              {testResult && (
                <div style={{
                  padding: '9px 12px', borderRadius: 8, fontSize: 12.5,
                  background: testResult.ok ? 'rgba(76,175,80,0.12)' : 'rgba(255,90,120,0.12)',
                  border: `1px solid ${testResult.ok ? 'rgba(76,175,80,0.4)' : 'rgba(255,90,120,0.4)'}`,
                  color: testResult.ok ? 'var(--green)' : '#ff8194',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Icon name={testResult.ok ? 'check' : 'x'} size={13} />
                  {testResult.msg}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div style={{
              padding: '14px 18px', borderTop: '1px solid var(--border)',
              background: 'var(--surface)',
              display: 'flex', gap: 8,
            }}>
              {drawer === 'edit' && (
                <button
                  onClick={runTest}
                  disabled={testing}
                  style={{ ...secondaryBtnStyle, marginRight: 'auto' }}
                >
                  {testing ? 'Testing…' : '▷ Test'}
                </button>
              )}
              <button onClick={closeDrawer} style={secondaryBtnStyle}>Cancel</button>
              <button onClick={save} disabled={saving || !formUrl} style={primaryBtnStyle}>
                {saving ? 'Saving…' : drawer === 'edit' ? 'Update' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-3)', display: 'flex', gap: 6, alignItems: 'baseline' }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: 'var(--text-4)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const emptyStyle: React.CSSProperties = {
  height: '100%', minHeight: 300,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-3)', fontSize: 13,
};

const agentNodeStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '8px 14px', borderRadius: 10,
  background: 'rgba(117,91,227,0.15)',
  border: '1px solid rgba(117,91,227,0.4)',
  color: 'var(--purple)',
  fontSize: 13, fontWeight: 600,
};

const connectionRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
};

const connectorLineStyle: React.CSSProperties = {
  width: 28, height: 2,
  background: 'var(--border)',
  flexShrink: 0,
  marginLeft: 16,
};

const appCardStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '10px 12px', borderRadius: 10,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  transition: 'border-color 0.15s',
};

const iconBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-3)',
  display: 'grid', placeItems: 'center',
  cursor: 'pointer',
  transition: 'all 0.12s',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-0)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 12.5,
  color: 'var(--text-1)',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 8, border: 'none',
  background: 'var(--grad-brand)', color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text-2)',
  fontSize: 13, fontWeight: 500, cursor: 'pointer',
};

function triggerBadge(t: TriggerType): React.CSSProperties {
  const colors: Record<TriggerType, string> = {
    escalation:   'rgba(255,90,120,0.18)',
    demo_booking: 'rgba(76,175,80,0.18)',
    both:         'rgba(255,181,71,0.18)',
  };
  return {
    display: 'inline',
    background: colors[t],
    borderRadius: 4,
    padding: '1px 5px',
    fontSize: 10.5,
    fontWeight: 600,
    color: t === 'escalation' ? '#ff8194' : t === 'demo_booking' ? 'var(--green)' : 'var(--amber)',
  };
}
