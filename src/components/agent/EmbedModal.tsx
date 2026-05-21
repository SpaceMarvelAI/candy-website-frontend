/**
 * EmbedModal — shows HTML / JS / Python integration snippets for a published agent.
 * Opens when the user clicks "Embed" in AgentShell.
 */
import { useState } from 'react';
import type React from 'react';
import Icon from '../../assets/icons';

interface Props {
  agentId: string;
  agentName?: string;
  onClose: () => void;
}

const BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? 'http://localhost:8002';

// ── Snippet generators ────────────────────────────────────────────────────────
//
// Auth model:
//   • Widget token  — safe to expose in client-side HTML/JS.  Scoped to one
//     published agent; cannot access admin APIs.  Obtained once via the
//     Management API (POST /v1/agents/:id/widget-token) and stored on your
//     server.  Pass it to the widget so it can open anonymous chat sessions.
//
//   • JWT (Bearer)  — your Candy *admin* session token.  NEVER put this in
//     client-side code.  Use it only in server-side code (Python, Node, etc.)
//     to call management endpoints: register webhooks, read analytics, etc.
//     Obtain it via POST /v1/auth/login with your Candy email + password.

function snippetHtml(agentId: string) {
  return `<!-- ─────────────────────────────────────────────────────────────
  Candy Chat Widget  —  paste before </body>
  ─────────────────────────────────────────────────────────────
  HOW AUTH WORKS
  ──────────────
  The widget uses a *widget token* — a read-only, public-safe key
  scoped to this one published agent.  It is NOT your admin JWT.

  Step 1 — Get your widget token (run this once on your server):
    curl -s -X POST ${BASE_URL}/v1/agents/${agentId}/widget-token \\
         -H "Authorization: Bearer YOUR_ADMIN_JWT"
    → {"widget_token": "wt_xxxxxxxxxxxx"}

  Step 2 — Paste that token below (safe to commit to frontend code).
──────────────────────────────────────────────────────────────── -->
<script
  src="${BASE_URL}/widget/candy.js"
  data-agent-id="${agentId}"
  data-widget-token="wt_REPLACE_WITH_YOUR_WIDGET_TOKEN"
  async
></script>

<!-- Optional config via data attributes:
  data-theme="dark"              light | dark | auto (default: auto)
  data-position="bottom-right"   bottom-right | bottom-left
  data-primary-color="#7b5be3"
-->`;
}

function snippetJs(agentId: string) {
  return `// ─────────────────────────────────────────────────────────────────
// Candy Chat Widget  —  npm / bundled frontend
//
// HOW AUTH WORKS
// ──────────────
// The widget uses a *widget token* — a public-safe key scoped to
// this published agent.  It is NOT your admin JWT.
//
// Get your widget token once (server-side only, keep it secret-ish):
//   POST ${BASE_URL}/v1/agents/${agentId}/widget-token
//   Authorization: Bearer <YOUR_ADMIN_JWT>
//   → { "widget_token": "wt_xxxxxxxxxxxx" }
//
// Inject it into your frontend via an env variable or meta tag,
// then pass it here.  It cannot call admin APIs — safe to expose.
// ─────────────────────────────────────────────────────────────────
import { CandyChat } from '@candy-ai/widget';  // npm i @candy-ai/widget

const chat = new CandyChat({
  agentId:     '${agentId}',
  widgetToken: 'wt_REPLACE_WITH_YOUR_WIDGET_TOKEN',  // ← from step above
  apiBase:     '${BASE_URL}',

  // Optional:
  // theme:        'dark',          // 'light' | 'dark' | 'auto'
  // position:     'bottom-right',  // 'bottom-right' | 'bottom-left'
  // primaryColor: '#7b5be3',

  // Pass your own user's identity so Candy can personalise replies:
  // userContext: { name: 'Jane', email: 'jane@acme.com', plan: 'pro' },
});

chat.mount();  // renders the floating bubble

// Open / close programmatically:
// document.getElementById('help-btn').onclick = () => chat.open();`;
}

function snippetPython(agentId: string) {
  return `"""
Candy  —  server-side integration  (Python)

HOW AUTH WORKS
──────────────
• ADMIN_JWT      Your Candy login token.  Used ONLY in your backend to call
                 management APIs (register webhooks, pull analytics, get a
                 widget token).  Never expose it in client-side code.
                 Obtain it:  POST /v1/auth/login  {email, password}

• WIDGET_TOKEN   A public-safe, agent-scoped key you vend to your frontend
                 so the chat widget can open sessions.
                 Obtain it:  POST /v1/agents/:id/widget-token  (needs JWT)

• WEBHOOK_SECRET HMAC-SHA256 key returned when you register a webhook.
                 Use it to verify that incoming events are really from Candy.
"""
import requests, hmac, hashlib, os

CANDY_BASE     = "${BASE_URL}"
AGENT_ID       = "${agentId}"
ADMIN_JWT      = os.environ["CANDY_ADMIN_JWT"]      # never hard-code this
WEBHOOK_SECRET = os.environ.get("CANDY_WEBHOOK_SECRET", "")

admin_headers = {
    "Authorization": f"Bearer {ADMIN_JWT}",
    "Content-Type":  "application/json",
}

# ── 1. Get a widget token for your frontend ──────────────────────────────────
r = requests.post(f"{CANDY_BASE}/v1/agents/{AGENT_ID}/widget-token",
                  headers=admin_headers)
widget_token = r.json()["widget_token"]
print("Widget token (safe for frontend):", widget_token)
# → inject into your HTML as data-widget-token="..." or an env var

# ── 2. Register a webhook ────────────────────────────────────────────────────
r = requests.post(f"{CANDY_BASE}/v1/webhooks", headers=admin_headers, json={
    "url":         "https://your-server.com/candy/events",
    "event_types": ["session.started", "session.ended", "session.escalated"],
    "description": "Production webhook",
})
wh = r.json()
WEBHOOK_SECRET = wh["secret"]   # store this in your env — you only see it once
print("Webhook ID:", wh["id"])
print("Secret (save to env!):", WEBHOOK_SECRET)

# ── 3. Verify incoming webhook signatures ────────────────────────────────────
def verify_candy_signature(raw_body: bytes, header_sig: str) -> bool:
    """Call this inside your webhook handler before processing the event."""
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, header_sig)

# Flask example:
# @app.route("/candy/events", methods=["POST"])
# def candy_webhook():
#     if not verify_candy_signature(request.get_data(),
#                                   request.headers.get("X-Candy-Sig","")):
#         abort(403)
#     event = request.json
#     print(event["event_type"], event["data"])
#     return "", 200

# ── 4. Read analytics (server-side only) ─────────────────────────────────────
r = requests.get(f"{CANDY_BASE}/v1/analytics/summary?days=7",
                 headers=admin_headers)
print(r.json())`;
}

// ── Tab pill ──────────────────────────────────────────────────────────────────

function TabPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: 'none',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        background: active ? 'var(--purple)' : 'transparent',
        color: active ? '#fff' : 'var(--text-3)',
        cursor: 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ── Code block with copy button ───────────────────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ position: 'relative' }}>
      <pre
        style={{
          margin: 0,
          padding: '18px 20px',
          background: 'var(--bg-0)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          fontSize: 12.5,
          lineHeight: 1.7,
          color: 'var(--text-2)',
          overflowX: 'auto',
          whiteSpace: 'pre',
          fontFamily: "'Zalando Sans'",
          maxHeight: 320,
          overflowY: 'auto',
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        onClick={copy}
        title="Copy to clipboard"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          padding: '5px 10px',
          borderRadius: 7,
          border: '1px solid var(--border)',
          background: copied ? 'rgba(76,175,80,0.2)' : 'var(--surface)',
          color: copied ? 'var(--green)' : 'var(--text-3)',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          transition: 'all 0.15s',
        }}
      >
        <Icon name={copied ? 'check' : 'export'} size={12} />
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

// ── Step pill ─────────────────────────────────────────────────────────────────

function Step({ n, text }: { n: number; text: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
      <div
        style={{
          minWidth: 22, height: 22, borderRadius: '50%',
          background: 'rgba(117,91,227,0.18)',
          color: 'var(--purple)',
          fontSize: 11, fontWeight: 700,
          display: 'grid', placeItems: 'center',
          marginTop: 1,
        }}
      >
        {n}
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55 }}>{text}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type Tab = 'html' | 'js' | 'python';

export default function EmbedModal({ agentId, agentName, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('html');

  const code = tab === 'html' ? snippetHtml(agentId)
             : tab === 'js'   ? snippetJs(agentId)
             :                  snippetPython(agentId);

  // Close on backdrop click
  function onBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).id === 'embed-backdrop') onClose();
  }

  return (
    <div
      id="embed-backdrop"
      onClick={onBackdrop}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 680,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 24px 80px -8px rgba(0,0,0,0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 34, height: 34, borderRadius: 9,
                background: 'rgba(117,91,227,0.15)',
                border: '1px solid rgba(117,91,227,0.3)',
                display: 'grid', placeItems: 'center',
                color: 'var(--purple)',
              }}
            >
              <Icon name="code" size={16} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                Embed Agent
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>
                {agentName ?? 'Published agent'} · <code style={{ fontSize: 11, color: 'var(--purple)' }}>{agentId.slice(0, 8)}…</code>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 32, height: 32, borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-3)',
              display: 'grid', placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* How-to steps */}
          <div
            style={{
              background: 'var(--bg-0)',
              borderRadius: 10,
              border: '1px solid var(--border)',
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10 }}>
              Quick Start
            </div>
            <Step n={1} text={<>Run <code style={{fontSize:11,background:'rgba(117,91,227,0.15)',color:'var(--purple)',padding:'1px 5px',borderRadius:4}}>POST /v1/agents/{agentId.slice(0,8)}…/widget-token</code> with your admin JWT to get a widget token — safe to put in your frontend.</>} />
            <Step n={2} text="Paste the widget token into the HTML or JS snippet below. Never put your admin JWT in client-side code." />
            <Step n={3} text="Register a webhook on your backend (see Python tab) to receive session.started / session.ended events in real-time." />
            <Step n={4} text="Verify every incoming webhook with HMAC-SHA256 using the secret returned at registration." />
          </div>

          {/* Tab strip */}
          <div
            style={{
              display: 'flex', gap: 4,
              background: 'var(--bg-0)',
              borderRadius: 10, padding: 4,
              border: '1px solid var(--border)',
              width: 'fit-content',
            }}
          >
            <TabPill label="HTML / Script tag" active={tab === 'html'} onClick={() => setTab('html')} />
            <TabPill label="JavaScript" active={tab === 'js'}   onClick={() => setTab('js')} />
            <TabPill label="Python"     active={tab === 'python'} onClick={() => setTab('python')} />
          </div>

          {/* Code */}
          <CodeBlock code={code} />

          {/* Footer note */}
          <div
            style={{
              fontSize: 12, color: 'var(--text-4)', lineHeight: 1.6,
              background: 'rgba(255,181,71,0.07)',
              border: '1px solid rgba(255,181,71,0.25)',
              borderRadius: 8, padding: '10px 13px',
            }}
          >
            <strong style={{ color: 'var(--amber)' }}>Auth reminder:</strong> Your <strong>admin JWT</strong> is your Candy login token — use it only in server-side code to call management APIs. The <strong>widget token</strong> (<code style={{fontSize:11}}>wt_…</code>) is a separate public-safe key you generate once and embed in your site. For full docs on token scopes, webhook events, and HMAC verification, see the{' '}
            <a
              href="/candy-developer-docs.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--purple)', textDecoration: 'none' }}
            >
              integration guide ↗
            </a>.
          </div>
        </div>
      </div>
    </div>
  );
}
