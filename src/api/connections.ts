/**
 * api/connections.ts — credential vault for external app connections.
 *
 * Security model:
 *   - API keys are encrypted AES-256 server-side immediately on write.
 *     The API never returns a raw key after creation — only masked (••••abc).
 *   - OAuth tokens are stored server-side; the frontend only sees connection
 *     status and metadata.
 *   - The frontend initiates OAuth by navigating to the /oauth/start URL;
 *     Candy handles the redirect flow and stores the token.
 */
import { api } from './client';

export type AppType =
  | 'jira' | 'asana' | 'slack' | 'linear' | 'notion'
  | 'github' | 'zoho_desk' | 'zoho_crm' | 'calendly'
  | 'gmail' | 'google_sheets'
  | 'custom_webhook';

export type AuthScheme = 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'none';

export interface AppConnection {
  id:           string;
  company_id:   string;
  app_type:     AppType | string;
  display_name: string;
  auth_scheme:  AuthScheme;
  is_connected: boolean;
  masked_key?:  string;        // e.g. "••••••••abc123" — only for api_key/bearer
  scope?:       string;        // OAuth scopes granted
  expires_at?:  string | null; // OAuth token expiry (null = no expiry)
  created_at:   string;
  updated_at:   string;
  meta:         Record<string, any>;
}

export interface CreateConnectionBody {
  app_type:     AppType | string;
  display_name?: string;
  auth_scheme:  AuthScheme;
  /** Raw credential — only used for api_key / bearer / basic.
   *  Encrypted immediately server-side; never returned. */
  credential?:  string;
  /** For basic auth — combined as "user:pass" or sent as { username, password } */
  username?:    string;
  password?:    string;
  /** Extra metadata (base URL for custom endpoint, etc.) */
  meta?:        Record<string, any>;
}

// List all connections for the authenticated company
export const listConnections = () =>
  api<AppConnection[]>('/v1/connections');

// Create a connection with an API key / bearer / basic credential
export const createConnection = (body: CreateConnectionBody) =>
  api<AppConnection>('/v1/connections', {
    method: 'POST',
    body,
  });

// Update an existing connection (re-key, rename, etc.)
export const updateConnection = (id: string, body: Partial<CreateConnectionBody>) =>
  api<AppConnection>(`/v1/connections/${id}`, {
    method: 'PATCH',
    body,
  });

// Delete / disconnect an app
export const deleteConnection = (id: string) =>
  api<void>(`/v1/connections/${id}`, { method: 'DELETE' });

// Test a connection (Candy makes a lightweight API call to verify creds)
export const testConnection = (id: string) =>
  api<{ ok: boolean; message?: string }>(`/v1/connections/${id}/test`, {
    method: 'POST',
  });

// Start OAuth 2.0 flow — returns a redirect URL to send the user to
export const startOAuth = (appType: AppType, redirectBack: string) =>
  api<{ auth_url: string; state: string }>(
    `/v1/connections/oauth/start?app_type=${appType}&redirect_back=${encodeURIComponent(redirectBack)}`
  );

// ── App catalogue (static — no API call needed) ───────────────────────────────

export interface AppMeta {
  type:        AppType | string;
  label:       string;
  icon:        string;
  authScheme:  AuthScheme;
  description: string;
  color:       string;
}

export const APP_CATALOGUE: AppMeta[] = [
  { type: 'jira',          label: 'Jira',          icon: 'list',     authScheme: 'oauth2',       description: 'Create issues & link tickets',    color: '#0052CC' },
  { type: 'asana',         label: 'Asana',          icon: 'check',    authScheme: 'oauth2',       description: 'Create tasks in projects',         color: '#F06A6A' },
  { type: 'slack',         label: 'Slack',          icon: 'chat',     authScheme: 'oauth2',       description: 'Post messages to channels',        color: '#4A154B' },
  { type: 'linear',        label: 'Linear',         icon: 'zap',      authScheme: 'api_key',      description: 'Create & update Linear issues',    color: '#5E6AD2' },
  { type: 'notion',        label: 'Notion',         icon: 'book',     authScheme: 'oauth2',       description: 'Add rows to databases',            color: '#000000' },
  { type: 'github',        label: 'GitHub Issues',  icon: 'code',     authScheme: 'api_key',      description: 'Open issues on any repo',          color: '#24292F' },
  { type: 'zoho_desk',     label: 'Zoho Desk',      icon: 'help',     authScheme: 'api_key',      description: 'Create support tickets',           color: '#E42527' },
  { type: 'zoho_crm',      label: 'Zoho CRM',       icon: 'chart',    authScheme: 'api_key',      description: 'Log leads & contacts',             color: '#E42527' },
  { type: 'calendly',      label: 'Calendly',       icon: 'calendar', authScheme: 'none',         description: 'Share booking links with customers', color: '#006BFF' },
  { type: 'gmail',         label: 'Gmail',          icon: 'mail',     authScheme: 'oauth2',       description: 'Send emails from your Google account', color: '#EA4335' },
  { type: 'google_sheets', label: 'Google Sheets',  icon: 'columns',  authScheme: 'oauth2',       description: 'Log data rows to a spreadsheet',    color: '#0F9D58' },
  { type: 'custom_webhook',label: 'Custom Endpoint',icon: 'plug',     authScheme: 'none',         description: 'POST to any HTTPS URL',            color: '#7B5BE3' },
];
