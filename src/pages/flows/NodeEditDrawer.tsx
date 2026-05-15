/**
 * NodeEditDrawer — slide-in right panel for editing any canvas node.
 *
 * Renders different content based on node.type:
 *   'agent'   → embed snippet + entry point (how to add to website / phone)
 *   'app'     → connection setup + action config (Jira project, Slack channel…)
 *   'webhook' → generated inbound URL + secret + editable name
 */
import { useState, useEffect } from 'react';
import type { FlowNode, FlowNodeData } from '../../api/workflows';
import type { AppConnection } from '../../api/connections';
import { createConnection, testConnection, startOAuth, APP_CATALOGUE } from '../../api/connections';
import { createEmbedInstall, listEmbedInstalls, type EmbedInstall } from '../../api/agents';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8001';

// ── Shared sub-components ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={labelSt}>{label}</label>
      {children}
    </div>
  );
}

function CopyBox({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <code style={{
        flex: 1, padding: '7px 10px', borderRadius: 7,
        background: 'var(--bg-0)', border: '1px solid var(--border)',
        fontSize: 11.5, color: 'var(--text-2)', overflowX: 'auto',
        whiteSpace: 'nowrap', fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </code>
      <button onClick={copy} style={{
        ...secondaryBtn, flexShrink: 0, padding: '6px 10px', fontSize: 11,
        color: copied ? 'var(--green)' : 'var(--text-3)',
        borderColor: copied ? 'rgba(76,175,80,0.4)' : undefined,
        background: copied ? 'rgba(76,175,80,0.1)' : undefined,
      }}>
        {copied ? '✓' : <Icon name="export" size={11} />}
      </button>
    </div>
  );
}

function InfoBox({ color = 'var(--text-4)', children }: { color?: string; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, color: 'var(--text-3)', lineHeight: 1.65,
      background: 'var(--tint-2)', border: `1px solid ${color}30`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />;
}

// ── Action config fields by app type ─────────────────────────────────────────
function ActionConfigFields({
  appType, config, onChange,
}: {
  appType: string;
  config: Record<string, any>;
  onChange: (k: string, v: string) => void;
}) {
  const inp = (key: string, label: string, placeholder: string) => (
    <Field key={key} label={label}>
      <input
        style={inputSt}
        value={config[key] ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(key, e.target.value)}
      />
    </Field>
  );

  if (appType === 'jira') return (
    <>
      {inp('project_key',  'Project Key',  'e.g. SUPPORT')}
      {inp('issue_type',   'Issue Type',   'Bug / Task / Story')}
      {inp('assignee',     'Assignee',     'Jira account email (optional)')}
      {inp('base_url',     'Jira Base URL','https://yourco.atlassian.net')}
    </>
  );
  if (appType === 'asana') return (
    <>
      {inp('project_id', 'Project GID', '123456789012345')}
      {inp('section_id', 'Section GID', 'optional — pins to a section')}
      {inp('assignee',   'Assignee',    'user@yourco.com')}
    </>
  );
  if (appType === 'slack') return (
    <>
      {inp('channel',  'Channel',  '#support or channel ID')}
      {inp('mention',  'Mention',  '@here or @username (optional)')}
    </>
  );
  if (appType === 'linear') return (
    <>
      {inp('team_id',  'Team ID',    'from Linear settings')}
      {inp('state',    'State',      'Todo / In Progress')}
      {inp('assignee', 'Assignee',   'user@yourco.com (optional)')}
    </>
  );
  if (appType === 'notion') return (
    <>
      {inp('database_id', 'Database ID', '32-char Notion DB ID')}
      {inp('status_prop', 'Status Prop', 'Status property name')}
    </>
  );
  if (appType === 'github') return (
    <>
      {inp('owner',  'Repo Owner', 'your-org')}
      {inp('repo',   'Repo Name',  'your-repo')}
      {inp('labels', 'Labels',     'bug,support (comma-separated)')}
    </>
  );
  if (appType === 'zoho_desk') return (
    <>
      {inp('department_id', 'Department ID', 'from Zoho Desk settings')}
      {inp('assignee',      'Assignee',      'agent email')}
      {inp('base_url',      'Zoho Base URL', 'https://desk.zoho.com')}
    </>
  );
  if (appType === 'calendly') return (
    <>
      {inp('booking_url', 'Your Calendly booking link', 'https://calendly.com/yourname/30min')}
      {inp('event_name',  'Event name shown to customer', 'e.g. Book a 30-min demo')}
    </>
  );
  if (appType === 'custom_webhook') return (
    <>
      {inp('webhook_url',    'Webhook URL',    'https://api.yourapp.com/events')}
      {inp('custom_header',  'Custom Header',  'X-My-Token: value (optional)')}
    </>
  );
  return null;
}

// ── Embed installer — no-code UI ──────────────────────────────────────────────
function EmbedGuide({ agentId, agentName, agentType = 'chat' }: {
  agentId: string; agentName: string; agentType?: 'chat' | 'voice';
}) {
  const { addToast } = useApp();
  const BASE = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8001';
  const isVoice = agentType === 'voice';

  // Settings
  const [websiteUrl, setWebsiteUrl]   = useState('https://');
  const [greeting,   setGreeting]     = useState(
    isVoice ? 'Talk to our AI assistant — click to start' : 'Hi! How can I help you today?'
  );
  const [theme,      setTheme]        = useState<'dark'|'light'|'auto'>('dark');
  const [color,      setColor]        = useState(isVoice ? '#3b82f6' : '#7B5BE6');
  const [position,   setPosition]     = useState<'bottom-right'|'bottom-left'>('bottom-right');

  // Generated installs
  const [installs, setInstalls]   = useState<EmbedInstall[]>([]);
  const [loading,  setLoading]    = useState(false);
  const [copied,   setCopied]     = useState<string|null>(null);

  useEffect(() => {
    listEmbedInstalls(agentId).then(setInstalls).catch(() => {});
  }, [agentId]);

  function buildSnippet(inst: EmbedInstall) {
    return `<script
  src="${BASE}/static/widget.js"
  data-token="${inst.public_token}"
  data-agent="${agentId}"
  data-type="${agentType}"
  data-position="${position}"
  data-theme="${theme}"
  data-primary-color="${color}"
  data-greeting="${greeting}"
  data-agent-name="${agentName}"
  defer
></script>`;
  }

  function buildCustomSnippet(inst: EmbedInstall) {
    const btnLabel = isVoice ? 'Talk to us' : 'Chat with us';
    return `<!-- 1. Paste this script once, anywhere in your page -->
<script
  src="${BASE}/static/widget.js"
  data-token="${inst.public_token}"
  data-agent="${agentId}"
  data-type="${agentType}"
  data-theme="${theme}"
  data-primary-color="${color}"
  data-agent-name="${agentName}"
  data-hide-button="true"
  defer
></script>

<!-- 2. Your own button — style it however you like -->
<button onclick="CandyWidget.open()">${btnLabel}</button>`;
  }

  async function generate() {
    // Strip trailing slash but also reject bare protocol strings like "https:/"
    const raw = websiteUrl.trim().replace(/\/+$/, '');
    const origin = (raw && raw !== 'https:' && raw !== 'http:' && raw.includes('.'))
      ? raw
      : window.location.origin;
    setLoading(true);
    try {
      const inst = await createEmbedInstall(agentId, { origin, greeting, theme, color });
      setInstalls(prev => [inst, ...prev]);
      addToast('Embed code generated!', 'success');
    } catch (e: any) {
      const msg =
        typeof e?.detail === 'string' ? e.detail
        : typeof e?.detail?.detail === 'string' ? e.detail.detail
        : e?.message ?? 'Failed — make sure the agent is published first';
      addToast(msg, 'error');
    } finally { setLoading(false); }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  const latestInstall = installs[0];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* What it looks like */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
        background:`${color}12`, borderRadius:12, border:`1px solid ${color}30` }}>
        <div style={{ width:46, height:46, borderRadius:'50%', flexShrink:0,
          background:`linear-gradient(135deg,${color},${color}bb)`,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
          {isVoice ? '🎙' : '💬'}
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-1)' }}>
            {isVoice ? 'Voice call button' : 'Chat bubble widget'}
          </div>
          <div style={{ fontSize:11.5, color:'var(--text-4)', marginTop:2 }}>
            {isVoice
              ? 'Appears on your website · visitor clicks to start a voice call'
              : 'Appears on your website · click to open chat · fully customisable'}
          </div>
        </div>
      </div>

      {/* Settings form */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-4)', letterSpacing:'0.08em' }}>
          CONFIGURE YOUR WIDGET
        </div>

        <Field label="Your website URL">
          <input style={inputSt} value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            placeholder="https://yourwebsite.com" />
        </Field>

        <Field label="Greeting message (shown before chat opens)">
          <input style={inputSt} value={greeting}
            onChange={e => setGreeting(e.target.value)}
            placeholder="Hi! How can I help?" />
        </Field>

        <div style={{ display:'flex', gap:8 }}>
          <Field label="Theme">
            <select style={{ ...inputSt, cursor:'pointer' }} value={theme}
              onChange={e => setTheme(e.target.value as any)}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="auto">Auto (follows OS)</option>
            </select>
          </Field>
          <Field label="Position">
            <select style={{ ...inputSt, cursor:'pointer' }} value={position}
              onChange={e => setPosition(e.target.value as any)}>
              <option value="bottom-right">Bottom right</option>
              <option value="bottom-left">Bottom left</option>
            </select>
          </Field>
        </div>

        <Field label="Bubble colour">
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width:40, height:36, borderRadius:7, border:'1px solid var(--border)',
                padding:3, background:'var(--bg-0)', cursor:'pointer' }} />
            <input style={{ ...inputSt, flex:1 }} value={color}
              onChange={e => setColor(e.target.value)} placeholder="#7B5BE6" />
          </div>
        </Field>
      </div>

      {/* Generate button */}
      <button onClick={generate} disabled={loading} style={{
        ...primaryBtn, fontSize:14, padding:'11px', width:'100%',
        opacity: loading ? 0.7 : 1,
      }}>
        {loading ? 'Generating…' : latestInstall ? '🔄 Generate New Code' : '✨ Generate Embed Code'}
      </button>

      {/* Generated snippet */}
      {latestInstall && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <Divider />
          <div style={{ fontSize:10.5, fontWeight:700, color:'var(--amber)', letterSpacing:'0.08em' }}>
            ✅ YOUR EMBED CODE — COPY &amp; PASTE INTO YOUR WEBSITE
          </div>

          <InfoBox color="var(--green)">
            Open your website's HTML file. Find <code style={{ fontSize:11 }}>&lt;/body&gt;</code> near the bottom.
            Paste this code <strong style={{ color:'var(--text-1)' }}>just before</strong> that line. Save. Done — the chat bubble appears!
          </InfoBox>

          <div style={{ position:'relative' }}>
            <pre style={{ ...codePre, fontSize:11, paddingRight:70 }}>
              {buildSnippet(latestInstall)}
            </pre>
            <button
              onClick={() => copy(buildSnippet(latestInstall), 'snippet')}
              style={{ position:'absolute', top:8, right:8,
                padding:'6px 12px', borderRadius:6, border:'none',
                background: copied==='snippet' ? 'var(--green)' : 'var(--purple)',
                color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {copied==='snippet' ? '✓ Copied!' : 'Copy'}
            </button>
          </div>

          <InfoBox>
            <strong style={{ color:'var(--text-1)' }}>That's it.</strong> No login needed, no server setup.
            Just paste that one block of code and the chat icon appears on your site automatically.
          </InfoBox>

          <Divider />
          <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-4)', letterSpacing:'0.08em' }}>
            HAVE YOUR OWN BUTTON OR DESIGN?
          </div>
          <InfoBox color="var(--purple)">
            Add <code style={{ fontSize:11 }}>data-hide-button="true"</code> to hide the floating bubble.
            Then call <code style={{ fontSize:11 }}>CandyWidget.open()</code> from any button, link, or trigger on your page.
          </InfoBox>

          <div style={{ position:'relative' }}>
            <pre style={{ ...codePre, fontSize:11, paddingRight:70 }}>
              {buildCustomSnippet(latestInstall)}
            </pre>
            <button
              onClick={() => copy(buildCustomSnippet(latestInstall), 'custom')}
              style={{ position:'absolute', top:8, right:8,
                padding:'6px 12px', borderRadius:6, border:'none',
                background: copied==='custom' ? 'var(--green)' : 'var(--purple)',
                color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {copied==='custom' ? '✓ Copied!' : 'Copy'}
            </button>
          </div>

          <div style={{ fontSize:11.5, color:'var(--text-3)', lineHeight:1.75 }}>
            Works with any HTML — a link, a div, a nav button. You can also call:
            <br/><code style={{ color:'var(--purple)' }}>CandyWidget.close()</code>
            <br/><code style={{ color:'var(--purple)' }}>CandyWidget.toggle()</code>
            <br/><code style={{ color:'var(--purple)' }}>CandyWidget.showGreeting("Hey there!")</code>
          </div>
        </div>
      )}

      {/* Previous installs */}
      {installs.length > 1 && (
        <>
          <Divider />
          <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text-4)', letterSpacing:'0.08em' }}>
            PREVIOUSLY GENERATED
          </div>
          {installs.slice(1).map(inst => (
            <div key={inst.id} style={{ display:'flex', alignItems:'center', gap:8,
              padding:'8px 10px', borderRadius:8, background:'var(--bg-0)', border:'1px solid var(--border)' }}>
              <div style={{ flex:1, fontSize:11, color:'var(--text-3)',
                overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {inst.allowed_origins[0] ?? 'any origin'}
              </div>
              <button onClick={() => copy(buildSnippet(inst), inst.id)}
                style={{ ...secondaryBtn, fontSize:10, padding:'3px 8px', flexShrink:0 }}>
                {copied===inst.id ? '✓' : 'Copy'}
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── AGENT NODE EDITOR ─────────────────────────────────────────────────────────
function AgentEditor({ node }: { node: FlowNode }) {
  const isChat  = node.data.agentType === 'chat';
  const agentId = node.data.agentId ?? '';
  const [tab, setTab] = useState<'embed' | 'hosted'>('embed');

  const hostedUrl = `${window.location.protocol}//${window.location.host}/chat/${agentId}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Type badge */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
        borderRadius:8, background: isChat ? 'rgba(123,91,230,0.1)' : 'rgba(59,130,246,0.1)',
        border: `1px solid ${isChat ? 'rgba(123,91,230,0.3)' : 'rgba(59,130,246,0.3)'}` }}>
        <span style={{ fontSize:18 }}>{isChat ? '🤖' : '📞'}</span>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text-1)' }}>
            {isChat ? 'Chat Agent' : 'Voice Agent'}
          </div>
          <div style={{ fontSize:11, color:'var(--text-4)' }}>
            {isChat
              ? 'Adds a chat bubble to your website'
              : 'Adds a voice call button to your website — visitors click to speak'}
          </div>
        </div>
      </div>

      {/* Tabs — same for both chat and voice */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-0)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
        {(['embed', 'hosted'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={tabPillStyle(tab === t)}>
            {t === 'embed'
              ? (isChat ? '💬 Add to website' : '🎙 Add to website')
              : '🔗 Hosted URL'}
          </button>
        ))}
      </div>

      {tab === 'embed' && (
        <EmbedGuide
          agentId={agentId}
          agentName={node.data.agentName ?? 'Candy AI'}
          agentType={isChat ? 'chat' : 'voice'}
        />
      )}

      {tab === 'hosted' && (
        <>
          <Field label="Live hosted URL">
            <CopyBox value={hostedUrl} />
          </Field>
          <InfoBox>
            Share this URL directly — no embed needed.{' '}
            {isChat
              ? 'Opens a full-screen chat page hosted by Candy.'
              : 'Opens a full-screen voice call page hosted by Candy.'}
            {' '}The agent must be <strong style={{ color: 'var(--green)' }}>published</strong> first.
          </InfoBox>
        </>
      )}

      <Divider />
      <Field label="Agent ID">
        <CopyBox value={agentId} />
      </Field>
    </div>
  );
}

// ── APP NODE EDITOR ───────────────────────────────────────────────────────────
// Per-app guide: where to get credentials + what they're used for
const APP_KEY_GUIDE: Record<string, { label: string; where: string; url: string; note?: string }> = {
  linear: {
    label: 'Linear API Key',
    where: 'Linear → Settings → API → Personal API Keys → Create key',
    url: 'https://linear.app/settings/api',
  },
  github: {
    label: 'GitHub Personal Access Token',
    where: 'GitHub → Settings → Developer settings → Personal access tokens → Generate new token',
    url: 'https://github.com/settings/tokens',
    note: 'Needs "repo" scope to open issues.',
  },
  zoho_desk: {
    label: 'Zoho Desk OAuth Token',
    where: 'Zoho API Console → Self Client → Generate code (scope: Desk.tickets.CREATE)',
    url: 'https://api-console.zoho.com/',
  },
  zoho_crm: {
    label: 'Zoho CRM OAuth Token',
    where: 'Zoho API Console → Self Client → Generate code (scope: ZohoCRM.modules.CREATE)',
    url: 'https://api-console.zoho.com/',
  },
};

function AppEditor({
  node, connection, onUpdate, onConnectionSaved,
}: {
  node: FlowNode;
  connection?: AppConnection;
  onUpdate: (data: Partial<FlowNodeData>) => void;
  onConnectionSaved: (conn: AppConnection) => void;
}) {
  const { addToast } = useApp();
  const appMeta = APP_CATALOGUE.find(a => a.type === node.data.appType);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [actionConfig, setActionConfig] = useState<Record<string, any>>(node.data.actionConfig ?? {});

  function setField(k: string, v: string) {
    const next = { ...actionConfig, [k]: v };
    setActionConfig(next);
    onUpdate({ actionConfig: next });
  }

  async function handleOAuth() {
    if (!appMeta) return;
    try {
      const { auth_url } = await startOAuth(appMeta.type as any, window.location.href);
      window.location.href = auth_url;
    } catch { addToast('Could not start OAuth flow', 'error'); }
  }

  async function handleSave() {
    if (!appMeta) return;
    setSaving(true);
    try {
      const conn = await createConnection({
        app_type:     appMeta.type,
        display_name: appMeta.label,
        auth_scheme:  appMeta.authScheme,
        credential:   apiKey || undefined,
        meta:         actionConfig,
      });
      onConnectionSaved(conn);
      onUpdate({ connectionId: conn.id });
      addToast(`${appMeta.label} connected!`, 'success');
    } catch { addToast('Failed to save', 'error'); }
    finally { setSaving(false); }
  }

  async function handleTest() {
    if (!connection) return;
    setTesting(true);
    try { setTestResult(await testConnection(connection.id)); }
    catch { setTestResult({ ok: false, message: 'Request failed' }); }
    finally { setTesting(false); }
  }

  if (!appMeta) return <div style={{ fontSize: 13, color: 'var(--text-4)' }}>Unknown app</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Connection status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', borderRadius: 9,
        border: `1px solid ${connection?.is_connected ? 'rgba(76,175,80,0.35)' : 'var(--border)'}`,
        background: connection?.is_connected ? 'rgba(76,175,80,0.07)' : 'var(--tint-2)',
      }}>
        <span style={{ fontSize: 22 }}>{appMeta.icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{appMeta.label}</div>
          <div style={{ fontSize: 11, color: connection?.is_connected ? 'var(--green)' : 'var(--text-4)' }}>
            {connection?.is_connected ? `✓ Connected${connection.masked_key ? ` · ${connection.masked_key}` : ''}` : 'Not connected'}
          </div>
        </div>
        {connection && (
          <button onClick={handleTest} disabled={testing} style={{ ...secondaryBtn, fontSize: 11, padding: '4px 10px' }}>
            {testing ? '…' : 'Test'}
          </button>
        )}
      </div>
      {testResult && (
        <div style={{ fontSize: 12, color: testResult.ok ? 'var(--green)' : '#ff8194' }}>
          {testResult.ok ? '✓ Connection OK' : `✗ ${testResult.message}`}
        </div>
      )}

      {/* Auth setup */}
      {appMeta.authScheme === 'oauth2' ? (
        <button onClick={handleOAuth} style={primaryBtn}>
          {connection?.is_connected ? `Reconnect ${appMeta.label} ↗` : `Connect with ${appMeta.label} ↗`}
        </button>
      ) : (appMeta.authScheme === 'api_key' || appMeta.authScheme === 'bearer') ? (
        <>
          {APP_KEY_GUIDE[appMeta.type] && (
            <InfoBox color="var(--purple)">
              <strong style={{ color: 'var(--text-1)' }}>Where to get your {APP_KEY_GUIDE[appMeta.type].label}:</strong>
              <br />
              {APP_KEY_GUIDE[appMeta.type].where}
              {APP_KEY_GUIDE[appMeta.type].note && (
                <><br /><span style={{ color: 'var(--text-4)' }}>{APP_KEY_GUIDE[appMeta.type].note}</span></>
              )}
              <br />
              <a href={APP_KEY_GUIDE[appMeta.type].url} target="_blank" rel="noreferrer"
                style={{ color: 'var(--purple)', fontSize: 11.5 }}>
                Open {appMeta.label} settings ↗
              </a>
            </InfoBox>
          )}
          <Field label={appMeta.authScheme === 'bearer' ? 'Bearer Token' : 'API Key'}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="password"
                placeholder={connection?.masked_key ?? 'Paste key…'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                style={{ ...inputSt, flex: 1 }}
              />
              <button onClick={handleSave} disabled={saving || !apiKey} style={{ ...primaryBtn, flexShrink: 0, padding: '8px 12px' }}>
                {saving ? '…' : 'Save'}
              </button>
            </div>
          </Field>
        </>
      ) : appMeta.authScheme === 'none' && appMeta.type === 'calendly' ? (
        <InfoBox color="#006BFF">
          <strong style={{ color: 'var(--text-1)' }}>No account connection needed.</strong>
          <br />
          Just paste your Calendly booking page URL in the field below.
          When an escalation or demo request happens, Candy will share that link with the customer so they can book directly.
          <br /><br />
          <span style={{ color: 'var(--text-4)' }}>
            Find your link at <a href="https://calendly.com" target="_blank" rel="noreferrer"
              style={{ color: '#006BFF' }}>calendly.com</a> → your event type → Copy Link.
          </span>
        </InfoBox>
      ) : appMeta.authScheme === 'none' && appMeta.type === 'custom_webhook' ? (
        <InfoBox color="var(--purple-hi)">
          Candy signs outbound calls with <strong style={{ color: 'var(--purple-hi)' }}>HMAC-SHA256</strong>{' '}
          in the <code style={{ fontSize: 11 }}>X-Candy-Sig</code> header.
        </InfoBox>
      ) : null}

      <Divider />

      {/* Action config */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.08em' }}>
        ACTION CONFIG
      </div>
      <ActionConfigFields appType={node.data.appType ?? ''} config={actionConfig} onChange={setField} />
    </div>
  );
}

// ── WEBHOOK NODE EDITOR ───────────────────────────────────────────────────────
function WebhookEditor({
  node, onUpdate,
}: {
  node: FlowNode;
  onUpdate: (data: Partial<FlowNodeData>) => void;
}) {
  const webhookId   = node.data.webhookId   ?? node.id;
  const webhookUrl  = `${BASE_URL}/v1/inbound-webhooks/${webhookId}/receive`;
  const secret      = node.data.webhookSecret ?? '(generated on first save)';
  const [name, setName] = useState(node.data.appLabel ?? 'Inbound Webhook');
  const [eventFilter, setEventFilter] = useState(node.data.actionConfig?.event_filter ?? '');

  function commit() {
    onUpdate({ appLabel: name, actionConfig: { ...node.data.actionConfig, event_filter: eventFilter } });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <InfoBox color="var(--teal)">
        <strong style={{ color: 'var(--teal)' }}>Inbound Webhook</strong> — external systems POST to this URL.
        Candy verifies the signature and triggers connected actions.
      </InfoBox>

      <Field label="Webhook Name">
        <input
          style={inputSt}
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={commit}
          placeholder="e.g. Stripe Payment Webhook"
        />
      </Field>

      <Field label="Webhook Receive URL">
        <CopyBox value={webhookUrl} />
      </Field>

      <Field label="Signing Secret (HMAC-SHA256)">
        <CopyBox value={secret} />
      </Field>

      <InfoBox>
        <strong style={{ color: 'var(--amber)' }}>Verify incoming calls</strong> in your server:
        <pre style={{ ...codePre, marginTop: 8, fontSize: 10.5, padding: '8px 10px' }}>{`import hmac, hashlib

def verify(raw_body: bytes, header_sig: str) -> bool:
    expected = "sha256=" + hmac.new(
        SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header_sig)`}</pre>
      </InfoBox>

      <Field label="Event Filter (optional)">
        <input
          style={inputSt}
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          onBlur={commit}
          placeholder="e.g. payment.completed"
        />
      </Field>

      <Divider />

      <div style={{ fontSize: 11, color: 'var(--text-4)', lineHeight: 1.6 }}>
        After saving the workflow, register{' '}
        <code style={{ fontSize: 11, color: 'var(--teal)' }}>{webhookUrl.slice(0, 50)}…</code>{' '}
        in your external app as the webhook endpoint. Candy handles the rest.
      </div>
    </div>
  );
}

// ── Main drawer ───────────────────────────────────────────────────────────────
interface Props {
  node: FlowNode;
  connection?: AppConnection;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Partial<FlowNodeData>) => void;
  onConnectionSaved: (conn: AppConnection) => void;
}

export default function NodeEditDrawer({ node, connection, onClose, onUpdate, onConnectionSaved }: Props) {
  const appMeta = APP_CATALOGUE.find(a => a.type === node.data.appType);

  const title = node.type === 'agent'   ? (node.data.agentName ?? 'Agent')
              : node.type === 'webhook' ? (node.data.appLabel ?? 'Inbound Webhook')
              : (appMeta?.label ?? node.data.appLabel ?? 'App');

  const icon  = node.type === 'agent'   ? (node.data.agentType === 'chat' ? '🤖' : '📞')
              : node.type === 'webhook' ? '🪝'
              : (appMeta?.icon ?? '🔗');

  const subtitle = node.type === 'agent'
    ? `${node.data.agentType} · ${node.data.agentId?.slice(0, 8)}…`
    : node.type === 'webhook' ? 'Inbound trigger'
    : appMeta?.description ?? '';

  return (
    <div style={drawerSt} onClick={e => e.stopPropagation()}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>{subtitle}</div>
        </div>
        <button onClick={onClose} style={closeBtn}>
          <Icon name="x" size={14} />
        </button>
      </div>

      {/* Body */}
      {node.type === 'agent' && <AgentEditor node={node} />}
      {node.type === 'app'   && (
        <AppEditor
          node={node}
          connection={connection}
          onUpdate={data => onUpdate(node.id, data)}
          onConnectionSaved={onConnectionSaved}
        />
      )}
      {node.type === 'webhook' && (
        <WebhookEditor node={node} onUpdate={data => onUpdate(node.id, data)} />
      )}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const drawerSt: React.CSSProperties = {
  position: 'absolute', top: 0, right: 0, bottom: 0,
  width: 340, zIndex: 100,
  background: 'var(--bg-1)',
  borderLeft: '1px solid var(--border)',
  padding: '18px 18px',
  overflowY: 'auto',
  boxShadow: '-12px 0 40px rgba(0,0,0,0.45)',
  display: 'flex', flexDirection: 'column', gap: 0,
};

const closeBtn: React.CSSProperties = {
  flexShrink: 0, width: 28, height: 28, borderRadius: 7,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-3)', cursor: 'pointer', display: 'grid', placeItems: 'center',
};

const labelSt: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase',
};

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: '1px solid var(--border)', background: 'var(--bg-0)',
  color: 'var(--text-1)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const codePre: React.CSSProperties = {
  margin: 0, padding: '12px 14px',
  background: 'var(--bg-0)', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 11.5, lineHeight: 1.65, color: 'var(--text-2)',
  overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'monospace',
  maxHeight: 240, overflowY: 'auto',
};

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: 'var(--grad-brand)', color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

const secondaryBtn: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 7,
  border: '1px solid var(--border)', background: 'transparent',
  color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
};

function tabPillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '5px 14px', borderRadius: 6, border: 'none',
    fontSize: 12, fontWeight: active ? 600 : 400,
    background: active ? 'var(--purple)' : 'transparent',
    color: active ? '#fff' : 'var(--text-3)',
    cursor: 'pointer', transition: 'all 0.12s',
  };
}
