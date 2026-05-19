/**
 * Tiny fetch wrapper.
 *  • Reads the JWT from localStorage (set by the auth flow) and attaches it as
 *    Authorization: Bearer <token>.
 *  • Throws an `ApiError` with .status + .detail so callers can render the
 *    server's 4xx/5xx message instead of just "fetch failed".
 *  • For multipart uploads, callers pass FormData and we drop the JSON
 *    Content-Type so the browser sets the multipart boundary.
 */
const RAW_BASE = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8001';
export const API_BASE = RAW_BASE.replace(/\/$/, '');

const TOKEN_KEY = 'candy.token';

// SSO tokens land in sessionStorage (tab-scoped, cleared on close).
// Regular login tokens stay in localStorage.
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
  } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else   localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
export function setSessionToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else   sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export class ApiError extends Error {
  status: number;
  detail: any;
  constructor(status: number, detail: any) {
    super(typeof detail === 'string' ? detail : (detail?.detail ?? `HTTP ${status}`));
    this.status = status;
    this.detail = detail;
  }
}

type Opts = {
  method?: string;
  body?: any;            // JSON-serializable value, OR FormData, OR undefined
  headers?: Record<string, string>;
  auth?: boolean;        // default true
  signal?: AbortSignal;
};

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true, signal } = opts;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const finalHeaders: Record<string, string> = { ...headers };
  if (!isForm && body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (auth) {
    const tok = getToken();
    if (tok) finalHeaders['Authorization'] = `Bearer ${tok}`;
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      signal,
    });
  } catch (e: any) {
    throw new ApiError(0, e?.message || 'Network error — is the backend running on ' + API_BASE + '?');
  }

  // 204 / empty body
  if (res.status === 204) return undefined as unknown as T;

  const text = await res.text();
  let parsed: any = text;
  if (text) {
    try { parsed = JSON.parse(text); } catch { /* leave as text */ }
  }

  if (!res.ok) {
    // 401 means the JWT is expired/invalid. Wipe it AND dispatch an event so
    // the AppContext can clear the user and bounce back to the auth page —
    // otherwise every following call returns nothing and the UI looks broken.
    if (res.status === 401 && auth) {
      try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem('candy.user');
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('candy:auth-expired'));
      } catch {}
    }
    // Always log non-2xx so the network/console gives the user something to
    // grep when something behaves "silently".
    try {
      console.error(`[api] ${method} ${url} → ${res.status}`, parsed);
    } catch {}
    throw new ApiError(res.status, parsed);
  }
  return parsed as T;
}
