/**
 * Tiny fetch wrapper.
 *  • Reads the JWT from localStorage (set by the auth flow) and attaches it as
 *    Authorization: Bearer <token>.
 *  • Throws an `ApiError` with .status + .detail so callers can render the
 *    server's 4xx/5xx message instead of just "fetch failed".
 *  • For multipart uploads, callers pass FormData and we drop the JSON
 *    Content-Type so the browser sets the multipart boundary.
 *  • Emits structured [API REQUEST / RESPONSE / ERROR] console logs so every
 *    network call is traceable from the browser devtools.
 */
import { logger, truncateForLog } from '../utils/logger';

const RAW_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8002';
export const API_BASE = RAW_BASE.replace(/\/$/, '');

export const TOKEN_KEY = 'access_token';
export const USER_KEY  = 'candy.user';

/**
 * The session is SESSION-SCOPED: the token lives in `sessionStorage` only, so
 * closing the browser genuinely ends the session and the next visit lands on
 * sign-in.
 *
 * This used to write `localStorage` and read `sessionStorage || localStorage`,
 * which meant (a) an un-signed-out session silently resumed days later, and
 * (b) Candy trusted a token another app (Chat/Finixy) had left under the same
 * shared key. Both were deliberate once; both are gone on purpose now.
 * `purgeLegacyAuthStorage()` clears the old keys so a token written by an
 * earlier build cannot resurrect a session after this ships.
 */
export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch { return null; }
}
export function setToken(t: string | null) {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else   sessionStorage.removeItem(TOKEN_KEY);
  } catch {}
}
/** Kept as a distinct name for the SSO call sites; same store as `setToken` now. */
export const setSessionToken = setToken;

/**
 * Drop auth left in `localStorage` by an earlier build (or by a sibling app).
 * Called once at boot, before React reads any stored user — otherwise a stale
 * `localStorage` token would keep the user "signed in" forever.
 */
export function purgeLegacyAuthStorage(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* storage blocked — nothing to purge */ }
}

/**
 * Best-effort display string for an error body. NEVER returns an object, so
 * `ApiError.message` can be rendered/interpolated without turning into
 * "[object Object]". Handles FastAPI's three shapes:
 *   • plain text body                         → the text
 *   • { detail: "msg" }                       → "msg"
 *   • { detail: { error, message, … } }       → the message (plan/credit gates)
 *   • { detail: [ { loc, msg }, … ] }         → the first msg (422 validation)
 */
function apiErrorMessage(status: number, body: any): string {
  // 5xx bodies are server internals, not something a user can act on — and this
  // backend has handlers that put raw exception text in `detail`. Show a fixed
  // message; the real body stays on `.detail`/`.payload` for logging and for
  // gateInfo(), which keys off status/code rather than message. 4xx is different:
  // those messages ARE actionable ("email already in use"), so they pass through.
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  if (typeof body === 'string' && body) return body;
  const d = body?.detail;
  if (typeof d === 'string' && d) return d;
  const m = Array.isArray(d) ? d[0]?.msg : (d?.message ?? d?.msg);
  if (typeof m === 'string' && m) return m;
  if (d && typeof d === 'object') {
    try { return JSON.stringify(d); } catch { /* circular — fall through */ }
  }
  return `HTTP ${status}`;
}

export class ApiError extends Error {
  status: number;
  detail: any;      // whole parsed response body (unchanged — existing callers rely on it)
  /**
   * FastAPI's inner `detail` value: a string for plain errors, an object for the
   * plan/credit gates (`{ error, message, current_plan?, feature?, limit?, used? }`).
   */
  payload: any;
  /**
   * Machine-readable gate code when the backend sent an object detail —
   * 'upgrade_required' | 'voice_minutes_exhausted' (403) | 'no_credits' (402).
   * Undefined for role gates (403 with a plain string) and everything else.
   * Together with `status` this is what tells a plan/role gate apart from a real
   * failure — see `gateInfo()` in src/utils/apiError.ts.
   */
  code?: string;
  constructor(status: number, detail: any) {
    super(apiErrorMessage(status, detail));
    this.status  = status;
    this.detail  = detail;
    this.payload = typeof detail === 'string' ? detail : detail?.detail;
    const c = this.payload?.error;
    this.code = typeof c === 'string' ? c : undefined;
  }
}

type Opts = {
  method?: string;
  body?: any;            // JSON-serializable value, OR FormData, OR undefined
  headers?: Record<string, string>;
  auth?: boolean;        // default true
  signal?: AbortSignal;
  timeoutMs?: number;    // default DEFAULT_TIMEOUT_MS; ignored when `signal` is supplied
};

// A hung backend must not hang the UI forever. 60s is deliberately generous so
// the slow-but-real endpoints (website crawl, LLM generation) still finish;
// callers needing more pass `timeoutMs`, or their own signal to opt out.
// No retry on purpose — these mutations are not idempotent.
const DEFAULT_TIMEOUT_MS = 60_000;

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;

  const finalHeaders: Record<string, string> = { ...headers };
  if (!isForm && body !== undefined) finalHeaders['Content-Type'] = 'application/json';
  if (auth) {
    const tok = getToken();
    if (tok) finalHeaders['Authorization'] = `Bearer ${tok}`;
  }

  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;

  // ── Log outgoing request ──────────────────────────────────────────────────
  const label = `${method} ${path}`;
  logger.api('req', label, {
    url,
    method,
    payload:  isForm ? '[FormData]' : truncateForLog(body ?? null),
    // Redact the token value but confirm whether auth is attached.
    headers:  { ...finalHeaders, Authorization: finalHeaders.Authorization ? '[Bearer ****]' : undefined },
    hasToken: !!getToken(),
  });

  // A caller-supplied signal takes over cancellation completely; otherwise we
  // arm our own so the promise can never hang indefinitely.
  const ctl = signal ? null : new AbortController();
  let timedOut = false;
  const timer = ctl ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeoutMs) : null;

  const t0 = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body)),
      signal: signal ?? ctl!.signal,
    });
  } catch (e: any) {
    const duration = performance.now() - t0;
    if (timedOut) {
      // 408 keeps timeouts distinguishable from an offline backend (status 0).
      logger.api('err', label, {
        url, method, status: 408,
        message:  `Timed out after ${timeoutMs} ms`,
        duration: `${duration.toFixed(1)} ms`,
      });
      throw new ApiError(408, `Request timed out after ${timeoutMs} ms — the server did not respond.`);
    }
    // Network-level failure (CORS block, backend offline, DNS failure, etc.)
    logger.api('err', label, {
      url,
      method,
      status:   0,
      message:  e?.message || 'Network error',
      duration: `${duration.toFixed(1)} ms`,
      error:    e,
      stack:    e?.stack,
    });
    throw new ApiError(0, e?.message || 'Network error — is the backend running on ' + API_BASE + '?');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const duration = performance.now() - t0;
  logger.performance(`[api] ${label}`, duration);

  // 204 / empty body — log and return.
  if (res.status === 204) {
    logger.api('res', label, { url, method, status: 204, duration: `${duration.toFixed(1)} ms`, data: null });
    return undefined as unknown as T;
  }

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
      logger.warn('[api] 401 received — clearing token and dispatching candy:auth-expired', { url });
      try {
        // sessionStorage is where the live session lives; clear localStorage too
        // so a legacy copy can't be picked up by anything still reading it.
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      } catch {}
      try {
        window.dispatchEvent(new CustomEvent('candy:auth-expired'));
      } catch {}
    }

    const errorDetail = typeof parsed === 'string' ? parsed : (parsed?.detail ?? `HTTP ${res.status}`);
    logger.api('err', label, {
      url,
      method,
      status:   res.status,
      message:  typeof errorDetail === 'string' ? errorDetail : JSON.stringify(errorDetail),
      duration: `${duration.toFixed(1)} ms`,
      data:     truncateForLog(parsed),
    });

    throw new ApiError(res.status, parsed);
  }

  // ── Log successful response ───────────────────────────────────────────────
  logger.api('res', label, {
    url,
    method,
    status:   res.status,
    duration: `${duration.toFixed(1)} ms`,
    data:     truncateForLog(parsed),
  });

  return parsed as T;
}
