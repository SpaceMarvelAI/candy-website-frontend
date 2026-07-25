const SM_API    = (import.meta as any).env?.VITE_SM_API_URL    || 'https://dashboard-api.spacemarvel.ai';
const META_API  = (import.meta as any).env?.VITE_META_API_URL  || 'https://meta-api.spacemarvel.ai';
const META_APP  = (import.meta as any).env?.VITE_META_APP_URL  || 'https://meta.spacemarvel.ai';

let _metaToken: string | null = null;
let _metaTokenExpiry = 0;

async function getMetaToken(): Promise<string> {
  // Return cached Metaspace JWT if still valid (30s buffer)
  if (_metaToken && Date.now() < _metaTokenExpiry - 30_000) return _metaToken;

  // Step 1 — generate a SpaceMarvel SSO JWT for meta.spacemarvel.ai
  const dashboardToken = localStorage.getItem('dashboard_token');
  if (!dashboardToken) throw new Error('COMPOSIO_UNAUTHORIZED');

  const ssoRes = await fetch(`${SM_API}/api/rbac/auth/sso/generate/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${dashboardToken}`,
    },
    body: JSON.stringify({ app_url: META_APP }),
  });
  if (!ssoRes.ok) throw new Error('COMPOSIO_UNAUTHORIZED');
  const ssoData = await ssoRes.json().catch(() => ({}));
  if (!ssoData.sso_token) throw new Error('COMPOSIO_UNAUTHORIZED');

  // Step 2 — exchange the SpaceMarvel SSO JWT for a Metaspace app-scoped JWT
  const metaRes = await fetch(
    `${META_API}/api/sso/callback?token=${encodeURIComponent(ssoData.sso_token)}`
  );
  if (!metaRes.ok) throw new Error('COMPOSIO_UNAUTHORIZED');
  const metaData = await metaRes.json().catch(() => ({}));
  if (!metaData.access_token) throw new Error('COMPOSIO_UNAUTHORIZED');

  // Cache for token lifetime (1h default)
  _metaToken = metaData.access_token as string;
  _metaTokenExpiry = Date.now() + (metaData.expires_in ?? 3600) * 1_000;
  return _metaToken;
}

async function metaFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getMetaToken();
  const res = await fetch(`${META_API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...opts.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      _metaToken = null;
      _metaTokenExpiry = 0;
      throw new Error('COMPOSIO_UNAUTHORIZED');
    }
    throw new Error(`${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComposioApp {
  appId?: string;
  app_id?: string;
  name: string;
  description?: string;
  logo?: string;
  logo_url?: string;
  categories?: string[];
  category?: string;
  isEnabled?: boolean;
}

export interface ComposioConnection {
  id?: string;
  connection_id?: string;
  app?: string;
  appName?: string;
  app_name?: string;
  appId?: string;
  app_id?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
}

export interface ConnectResponse {
  connect_url?: string;
  redirectUrl?: string;
  redirect_url?: string;
  authUrl?: string;
  auth_url?: string;
  connectionId?: string;
  connection_id?: string;
  status?: string;
  message?: string;
}

export interface AuthInfoField {
  name: string;
  label: string;
  type: string; // "text" | "password" | "url"
}

export interface AuthInfo {
  app: string;
  auth_type: 'oauth' | 'api_key' | 'no_auth';
  required_fields?: AuthInfoField[];
  display_name?: string;
  connect_flow?: string;
}

// ── Normalise helpers ─────────────────────────────────────────────────────────

export function appId(a: ComposioApp): string {
  return (a.appId ?? a.app_id ?? a.name ?? '').toLowerCase();
}

export function appLogo(a: ComposioApp): string | undefined {
  return a.logo ?? a.logo_url;
}

export function appCategory(a: ComposioApp): string {
  if (a.categories?.length) return a.categories[0];
  return a.category ?? 'Other';
}

export function connectedAppId(c: ComposioConnection): string {
  return (c.app ?? c.appId ?? c.app_id ?? c.appName ?? c.app_name ?? '').toLowerCase();
}

/** Returns true for live connections — only rejects known-inactive statuses */
export function isActiveConnection(c: ComposioConnection): boolean {
  if (!c.status) return true; // no status field → assume API only returns active rows
  const s = c.status.toLowerCase();
  // Block only statuses that explicitly mean "not yet connected" or "no longer connected"
  return !['initiated', 'pending', 'failed', 'expired', 'revoked', 'error', 'disabled', 'inactive'].includes(s);
}

export function redirectUrl(r: ConnectResponse): string | undefined {
  return r.connect_url ?? r.redirectUrl ?? r.redirect_url ?? r.authUrl ?? r.auth_url;
}

// ── API calls ─────────────────────────────────────────────────────────────────

/** GET /api/composio/apps — list all available apps */
export async function getComposioApps(): Promise<ComposioApp[]> {
  const res = await metaFetch<ComposioApp[] | { apps: ComposioApp[] }>('/api/composio/apps');
  return Array.isArray(res) ? res : (res as { apps: ComposioApp[] }).apps ?? [];
}

/** GET /api/composio/connections — list user's active connections */
export async function getComposioConnections(): Promise<ComposioConnection[]> {
  const res = await metaFetch<ComposioConnection[] | { connections: ComposioConnection[] }>('/api/composio/connections');
  return Array.isArray(res) ? res : (res as { connections: ComposioConnection[] }).connections ?? [];
}

/** GET /api/composio/apps/{app}/auth-info — returns auth_type before connecting */
export async function getAppAuthInfo(appName: string): Promise<AuthInfo> {
  return metaFetch<AuthInfo>(`/api/composio/apps/${encodeURIComponent(appName)}/auth-info`);
}

/** POST /api/composio/connect — OAuth / no-auth flow (no credentials) */
export async function connectComposioApp(appName: string): Promise<ConnectResponse> {
  return metaFetch<ConnectResponse>('/api/composio/connect', {
    method: 'POST',
    body: JSON.stringify({
      app: appName,
      redirect_url: `${window.location.origin}/#/composio/callback`,
    }),
  });
}

/** POST /api/composio/connect — API-key flow (with credentials) */
export async function connectComposioAppWithCredentials(
  appName: string,
  credentials: Record<string, string>,
): Promise<ConnectResponse> {
  return metaFetch<ConnectResponse>('/api/composio/connect', {
    method: 'POST',
    body: JSON.stringify({ app: appName, credentials }),
  });
}
