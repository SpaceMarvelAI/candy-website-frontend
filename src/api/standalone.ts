/**
 * Standalone mode (an install with no Dashboard — the backend has no DASHBOARD_BASE_URL).
 * Design: docs/workspace-company-access/STEP3_STANDALONE_PLAN_2026-11-25.md (sibling docs repo).
 *
 * The backend says which login to use (GET /v1/auth/mode), so the frontend needs no second flag:
 *   "ecosystem"  → the Dashboard login (redirectToOIDC, unchanged)
 *   "standalone" → Candy's own pages: #/login, #/signup (first person only), #/invite/:token
 *
 * The answer is per install and never changes while it runs, so it is cached in localStorage
 * (install config, not auth data) and refreshed in the background on every load. Only the very
 * first load waits for it (loadAuthMode() in main.tsx) — so redirectToOIDC() can stay synchronous.
 */
import { api, setToken } from './client';
import { storeUser, type AuthUser, type TokenResponse } from './auth';

export type AuthModeName = 'ecosystem' | 'standalone';
export interface AuthMode {
  mode: AuthModeName;
  signup_open: boolean;
  workspace_name?: string | null;
}

const MODE_KEY = 'candy.auth_mode';
const ECOSYSTEM: AuthMode = { mode: 'ecosystem', signup_open: false };

let cached: AuthMode | null = null;

function readStored(): AuthMode | null {
  try {
    const raw = localStorage.getItem(MODE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && (parsed.mode === 'standalone' || parsed.mode === 'ecosystem') ? parsed : null;
  } catch { return null; }
}

/** Ask the backend (fresh). On any failure: the pre-standalone behaviour (Dashboard login). */
export async function fetchAuthMode(): Promise<AuthMode> {
  try {
    const m = await api<AuthMode>('/v1/auth/mode', { auth: false });
    cached = m.mode === 'standalone' ? m : { ...ECOSYSTEM };
    try { localStorage.setItem(MODE_KEY, JSON.stringify({ mode: cached.mode })); } catch { /* blocked */ }
  } catch {
    cached = cached ?? readStored() ?? { ...ECOSYSTEM };
  }
  return cached;
}

/** Boot: resolve the mode before the app renders. Instant when a previous load stored it (then
 *  refreshed in the background); the first load ever waits up to `timeoutMs`. */
export async function loadAuthMode(timeoutMs = 3000): Promise<void> {
  const stored = readStored();
  if (stored) {
    cached = cached ?? stored;
    void fetchAuthMode();
    return;
  }
  await Promise.race([fetchAuthMode(), new Promise(r => setTimeout(r, timeoutMs))]);
}

/** Synchronous — what redirectToOIDC() and the menu read. Unknown = ecosystem (as before). */
export function isStandaloneMode(): boolean {
  return (cached ?? readStored())?.mode === 'standalone';
}

/** Test-only. */
export function _resetAuthModeCache(): void {
  cached = null;
  try { localStorage.removeItem(MODE_KEY); } catch { /* blocked */ }
}

/** Store a standalone session exactly like the Dashboard login does (sessionStorage token +
 *  stored user), and return the user for AppContext.signedIn(). */
export function storeStandaloneSession(tok: TokenResponse & { refresh_token?: string | null }): AuthUser {
  setToken(tok.access_token);
  const user: AuthUser = {
    user_id: tok.user_id, email: tok.email, role: tok.role,
    company_id: tok.company_id, company_name: tok.company_name, full_name: null,
  };
  storeUser(user);
  return user;
}

// ── Auth ──────────────────────────────────────────────────────────────────────────────────────

export const standaloneAuth = {
  login: (email: string, password: string) =>
    api<TokenResponse>('/v1/auth/login', { method: 'POST', auth: false, body: { email, password } }),
  signup: (body: { company_name: string; email: string; password: string; full_name?: string }) =>
    api<TokenResponse>('/v1/auth/signup', { method: 'POST', auth: false, body }),
  validateInvitation: (token: string) =>
    api<{ email: string; role: string; workspace_name: string; expires_at: string }>(
      `/v1/team/invitations/validate/${encodeURIComponent(token)}`, { auth: false }),
  acceptInvitation: (token: string, body: { full_name: string; password: string }) =>
    api<TokenResponse>(`/v1/team/invitations/accept/${encodeURIComponent(token)}`,
      { method: 'POST', auth: false, body }),
};

// ── Team (Owner / Admin) ──────────────────────────────────────────────────────────────────────

export type CompanyAccess = 'all' | 'selected';
export interface TeamMember {
  user_id: string; email: string; full_name: string | null; role: string;
  company_access: CompanyAccess; company_ids: string[];
  /** The selected companies with names — every member sees everyone's access by name. */
  companies?: { id: string; name: string }[];
}
export interface TeamInvitation {
  id: string; email: string; role: string; company_access: CompanyAccess; company_ids: string[];
  expires_at: string; created_at: string;
}
export interface InviteResult extends TeamInvitation {
  emailed: boolean; accept_url: string | null; token: string | null;
}
export interface TeamDomain {
  id: string; domain: string; state: 'pending' | 'verified'; verified_at: string | null;
  txt_record?: { type: string; host: string; value: string };
}
export interface DomainJoinSettings { domain_join_access: 'off' | CompanyAccess; company_ids: string[] }

type Wrapped<T> = { status: string; data: T };
const data = <T,>(p: Promise<Wrapped<T>>) => p.then(r => r.data);
/** Empty / missing = all companies, the same convention as the backend. */
const idsOrAll = (ids: string[] | null) => (ids && ids.length ? ids : null);

export const teamApi = {
  members:      () => data(api<Wrapped<TeamMember[]>>('/v1/team/members')),
  companies:    () => data(api<Wrapped<{ id: string; name: string }[]>>('/v1/team/companies')),
  invitations:  () => data(api<Wrapped<TeamInvitation[]>>('/v1/team/invitations')),
  invite: (email: string, role: string, companyIds: string[] | null) =>
    api<InviteResult>('/v1/team/invitations', {
      method: 'POST', body: { email, role, company_ids: idsOrAll(companyIds) } }),
  cancelInvitation: (id: string) => api(`/v1/team/invitations/${id}`, { method: 'DELETE' }),
  setMemberCompanies: (userId: string, companyIds: string[] | null) =>
    api(`/v1/team/members/${userId}/companies`, { method: 'PUT', body: { company_ids: idsOrAll(companyIds) } }),
  setMemberRole: (userId: string, role: string) =>
    api(`/v1/team/members/${userId}/role`, { method: 'PUT', body: { role } }),
  removeMember: (userId: string) => api(`/v1/team/members/${userId}`, { method: 'DELETE' }),
  domains:      () => data(api<Wrapped<TeamDomain[]>>('/v1/team/domains')),
  addDomain:    (domain: string) => data(api<Wrapped<TeamDomain>>('/v1/team/domains', { method: 'POST', body: { domain } })),
  verifyDomain: (id: string) => data(api<Wrapped<TeamDomain>>(`/v1/team/domains/${id}/verify`, { method: 'POST' })),
  removeDomain: (id: string) => api(`/v1/team/domains/${id}`, { method: 'DELETE' }),
  domainSettings: () => data(api<Wrapped<DomainJoinSettings>>('/v1/team/domains/settings')),
  saveDomainSettings: (access: DomainJoinSettings['domain_join_access'], companyIds: string[]) =>
    data(api<Wrapped<DomainJoinSettings>>('/v1/team/domains/settings', {
      method: 'PUT', body: { domain_join_access: access, company_ids: access === 'selected' ? companyIds : null } })),
};
