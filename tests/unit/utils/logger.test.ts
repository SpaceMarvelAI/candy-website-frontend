/**
 * Logger tests run in Vitest's development mode (IS_DEV=true by default).
 * We test:
 *   1. warn/error always call console — these survive to production.
 *   2. info/debug DO call console in development mode (the happy path).
 *   3. performance classifies durations into correct tier labels.
 *   4. api groups are emitted in dev mode.
 *
 * Production-only silencing (info/debug suppressed when IS_DEV=false) is
 * enforced by the logger source itself and is a code-review concern:
 * the conditional `if (IS_DEV) ...` gates each method. It cannot be tested
 * through env-stubbing because `IS_DEV` is a module-level constant captured at
 * load time, and Vitest's `(import.meta as any).env` pattern is resolved before
 * any per-test stub can take effect.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger, VERBOSE_HOSTS, truncateForLog } from '../../../src/utils/logger';

afterEach(() => vi.restoreAllMocks());

// ── Always-on: warn + error emit regardless of mode ──────────────────────────

describe('logger.warn — always emits', () => {
  it('calls console.warn with the label', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('[test] something degraded', { code: 42 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[test] something degraded');
  });

  it('includes extra args in the call', () => {
    // The colored-badge format prepends two %c style args before any data args
    // (format string, badge CSS, namespace-color CSS, ...args) — meta is still
    // passed through untouched, just at a later position in the call.
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const meta = { retries: 3 };
    logger.warn('[test] warn with meta', meta);
    expect(spy.mock.calls[0][0]).toContain('[test] warn with meta');
    expect(spy.mock.calls[0]).toContain(meta);
  });
});

describe('logger.error — always emits', () => {
  it('calls console.error with the label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[test] crash happened', { err: new Error('x') });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[test] crash happened');
  });

  it('timestamp in HH:MM:SS.mmm format is present in the badge line', () => {
    // Format is now `%c ERROR %c<timestamp> <label>` (colored badge prefix)
    // rather than a leading bracketed timestamp — the timestamp itself is
    // still HH:MM:SS.mmm, just positioned after the badge.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[test] timed error');
    const label: string = spy.mock.calls[0][0];
    expect(label).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
  });
});

// ── Dev-mode: info + debug emit when IS_DEV=true ──────────────────────────────
// (Vitest runs with DEV=true, so we verify these methods reach the console)

describe('logger.info — emits in dev mode', () => {
  it('calls console.info with the label', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('[test] component mounted', { slug: 'ecommerce' });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[test] component mounted');
  });
});

describe('logger.debug — emits in dev mode', () => {
  it('calls console.debug with the label', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('[test] verbose state', { count: 5 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[test] verbose state');
  });
});

// ── Performance tier labels ───────────────────────────────────────────────────

describe('logger.performance — tier classification', () => {
  // Tier labels are now colored badges (FAST=green/MED=amber/SLOW=red via %c)
  // instead of emoji prefixes — same three tiers, same thresholds, new display.
  it('emits a FAST badge for durations < 500 ms', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] fast', 200);
    expect(spy.mock.calls[0][0]).toContain('FAST');
  });

  it('emits a MED badge for durations between 500 ms and 2 s', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] medium', 800);
    expect(spy.mock.calls[0][0]).toContain('MED');
  });

  it('emits a SLOW badge for durations > 2 s', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] slow', 3500);
    expect(spy.mock.calls[0][0]).toContain('SLOW');
  });

  it('reports the duration in ms', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] timed', 342);
    expect(spy.mock.calls[0][0]).toContain('342.0 ms');
  });
});

// ── API direction groups ──────────────────────────────────────────────────────

describe('logger.api — grouped output in dev mode', () => {
  it('uses groupCollapsed for "res" direction', () => {
    const spy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.api('res', 'GET /v1/agents', { status: 200 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('GET /v1/agents');
  });

  it('uses group (not groupCollapsed) for "err" direction', () => {
    const groupSpy     = vi.spyOn(console, 'group').mockImplementation(() => {});
    const collapsedSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.api('err', 'GET /v1/agents', { status: 500 });
    expect(groupSpy).toHaveBeenCalledOnce();
    expect(collapsedSpy).not.toHaveBeenCalled();
  });
});

// ── performance with meta + group() ────────────────────────────────────────────

describe('logger.performance — with meta object', () => {
  it('groups the metadata under the timing line', () => {
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const logSpy   = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.performance('[api] with meta', 120, { rows: 3 });
    expect(groupSpy).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledWith({ rows: 3 });
  });
});

// ── Hostname/kill-switch gating (the core of this session's ask: verbose on
// localhost + dev.candy.cx even in a deployed build, quiet on app.candy.cx) ──
// Vitest runs with DEV=true, so isVerbose() would be true regardless of
// hostname via that branch alone — these tests stub `localStorage['debug']`
// to force the OTHER branches (override on/off) so hostname/kill-switch logic
// is actually exercised independent of the DEV flag.

describe('logger.isVerbose — runtime kill switch', () => {
  afterEach(() => localStorage.removeItem('debug'));

  it('is true by default in this test env (vite dev mode)', () => {
    expect(logger.isVerbose()).toBe(true);
  });

  it('localStorage debug="off" forces silence even when otherwise verbose', () => {
    localStorage.setItem('debug', 'off');
    expect(logger.isVerbose()).toBe(false);
  });

  it('localStorage debug="on" forces verbose (this is the deployed-prod escape hatch)', () => {
    localStorage.setItem('debug', 'on');
    expect(logger.isVerbose()).toBe(true);
  });

  it('debug="off" actually silences logger.info at the console level', () => {
    localStorage.setItem('debug', 'off');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('[test] should not print');
    expect(spy).not.toHaveBeenCalled();
  });

  it('warn/error still emit even with debug="off" (always-on tier is untouched)', () => {
    localStorage.setItem('debug', 'off');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[test] still visible');
    expect(spy).toHaveBeenCalledOnce();
  });

  // NOTE: the hostname branch itself (localhost/dev.candy.cx verbose, app.candy.cx
  // quiet, when IS_DEV=false — i.e. a real deployed build) can't be exercised
  // end-to-end here for the same reason IS_DEV can't be flipped per-test (see
  // this file's header comment) — Vitest runs with DEV=true, which short-circuits
  // isVerbose() to true before the hostname check is ever reached. This at least
  // pins the exact allowlist so a future edit can't silently drop dev.candy.cx.
  it('the verbose-hosts allowlist is exactly localhost, 127.0.0.1, and dev.candy.cx', () => {
    expect(VERBOSE_HOSTS).toEqual(['localhost', '127.0.0.1', 'dev.candy.cx']);
  });

  it('a thrown localStorage access (private mode / sandboxed iframe) is caught and falls through', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => logger.isVerbose()).not.toThrow();
    expect(logger.isVerbose()).toBe(true); // falls through to the IS_DEV branch
    spy.mockRestore();
  });

  // NOTE: the VITE_DEBUG branch (`(import.meta as any).env?.VITE_DEBUG === 'true'`)
  // can't be exercised either, for a more specific reason than the IS_DEV note
  // above: Vite's static import.meta.env analysis (which is what makes
  // vi.stubEnv()/direct-assignment stubbing of env vars actually reach the
  // module under test, as used successfully in devAuth.test.ts) only wires up
  // live bindings for the literal `import.meta.env.KEY` access pattern.
  // `(import.meta as any).env?.KEY` — the pattern this file's source uses —
  // isn't recognized by that static scan, so no test-only stubbing technique
  // (vi.stubEnv, direct assignment, defineProperty, or a fresh module via
  // vi.resetModules()) can make this branch observe a stubbed value; verified
  // empirically with a minimal two-file repro before writing this note.

  it('debug="off" also silences logger.debug at the console level', () => {
    localStorage.setItem('debug', 'off');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('[test] should not print');
    expect(spy).not.toHaveBeenCalled();
  });
});

// ── Namespace extraction — label without a leading [Namespace] prefix ────────

describe('logger namespace color — label without a [Namespace] prefix', () => {
  it('still emits, using the default (non-namespace) color', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('no namespace here', { ok: true });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('no namespace here');
  });
});

// ── Error reporter funnel — warn/error route to a registered monitoring SDK ──

describe('logger error reporter — optional monitoring funnel', () => {
  afterEach(() => logger.setErrorReporter(null));

  it('routes warn() to the registered reporter', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reporter = vi.fn();
    logger.setErrorReporter(reporter);
    logger.warn('[test] warn routed', { a: 1 });
    expect(reporter).toHaveBeenCalledWith('warn', '[test] warn routed', [{ a: 1 }]);
  });

  it('routes error() to the registered reporter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reporter = vi.fn();
    logger.setErrorReporter(reporter);
    logger.error('[test] error routed', { a: 2 });
    expect(reporter).toHaveBeenCalledWith('error', '[test] error routed', [{ a: 2 }]);
  });
});

// ── logger.api — verbosity gating across all three directions ────────────────

describe('logger.api — verbosity gating across directions', () => {
  afterEach(() => localStorage.removeItem('debug'));

  it('"req" is suppressed entirely when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const spy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    logger.api('req', 'GET /v1/agents', {});
    expect(spy).not.toHaveBeenCalled();
  });

  it('"req" proceeds (groupCollapsed) when verbose', () => {
    localStorage.setItem('debug', 'on');
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.api('req', 'GET /v1/agents', {});
    expect(groupSpy).toHaveBeenCalledOnce();
  });

  it('"res" is suppressed entirely when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const spy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    logger.api('res', 'GET /v1/agents', { status: 200 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('"err" still emits even when not verbose (failures always surface)', () => {
    localStorage.setItem('debug', 'off');
    const groupSpy = vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.api('err', 'GET /v1/agents', { status: 500 });
    expect(groupSpy).toHaveBeenCalledOnce();
  });
});

// ── logger.performance — verbosity gate + perf() alias ────────────────────────

describe('logger.performance — verbosity gating and alias', () => {
  afterEach(() => localStorage.removeItem('debug'));

  it('is a no-op when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    logger.performance('[api] silent', 100);
    expect(logSpy).not.toHaveBeenCalled();
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it('perf() is an alias for performance()', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.perf('[api] alias', 200);
    expect(spy.mock.calls[0][0]).toContain('FAST');
  });
});

// ── logger.group / groupEnd — remaining branches ──────────────────────────────

describe('logger.group — remaining branches', () => {
  afterEach(() => localStorage.removeItem('debug'));

  it('still runs fn but skips console output when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const fn = vi.fn();
    logger.group('[block] silent', fn);
    expect(fn).toHaveBeenCalledOnce();
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it('is a no-op with no fn when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    expect(() => logger.group('[block] silent-no-fn')).not.toThrow();
    expect(groupSpy).not.toHaveBeenCalled();
  });

  it('opens a group without closing it when called without fn (verbose)', () => {
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.group('[block] open-ended');
    expect(groupSpy).toHaveBeenCalledOnce();
    expect(endSpy).not.toHaveBeenCalled();
  });
});

describe('logger.groupEnd — verbosity gate', () => {
  afterEach(() => localStorage.removeItem('debug'));

  it('closes the group when verbose', () => {
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.groupEnd();
    expect(endSpy).toHaveBeenCalledOnce();
  });

  it('is a no-op when not verbose', () => {
    localStorage.setItem('debug', 'off');
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    logger.groupEnd();
    expect(endSpy).not.toHaveBeenCalled();
  });
});

// ── truncateForLog — display truncation for large console payloads ───────────

describe('truncateForLog', () => {
  it('returns short strings unchanged', () => {
    expect(truncateForLog('hello')).toBe('hello');
  });

  it('truncates long strings with a marker', () => {
    const long = 'x'.repeat(3000);
    const result = truncateForLog(long, 100);
    expect(result).toContain('truncated');
    expect(result).toContain('3000 chars total');
  });

  it('returns small objects unchanged', () => {
    const obj = { a: 1 };
    expect(truncateForLog(obj)).toEqual(obj);
  });

  it('truncates large objects into a preview wrapper', () => {
    const obj = { data: 'y'.repeat(3000) };
    const result = truncateForLog(obj, 100);
    expect(result.__truncated__).toBe(true);
    expect(result.preview).toContain('…');
    expect(typeof result.totalLength).toBe('number');
  });

  it('returns the value unchanged when JSON.stringify yields undefined (non-serializable)', () => {
    expect(truncateForLog(undefined)).toBeUndefined();
  });

  it('handles a circular reference without throwing, and never returns the raw object', () => {
    const circular: any = { password: 'hunter2' };
    circular.self = circular;
    const out = truncateForLog(circular);
    // Must not hand back the original reference — it could carry a secret.
    expect(out).not.toBe(circular);
    expect(out.password).toBe('[redacted]');
    expect(out.self).toBe('[circular]');
  });
});

describe('logger.group', () => {
  it('runs the callback inside a collapsed group', () => {
    const groupSpy = vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const endSpy   = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    const fn = vi.fn();
    logger.group('[block] dump', fn);
    expect(groupSpy).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledOnce();
    expect(endSpy).toHaveBeenCalledOnce();
  });

  it('still closes the group if the callback throws', () => {
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    const endSpy = vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    expect(() => logger.group('[block] boom', () => { throw new Error('x'); })).toThrow();
    expect(endSpy).toHaveBeenCalledOnce();
  });
});

// ── Redaction — the login password must never reach a log ─────────────────────
// client.ts logs every request body via truncateForLog, and auth.ts posts
// { email, password }. Before this, the plaintext password was printed whenever
// isVerbose() was true — which is ALWAYS on dev.candy.cx, a deployed public site.

describe('truncateForLog — secret redaction', () => {
  it('masks a login body but keeps the non-sensitive fields', () => {
    const out = truncateForLog({ email: 'a@b.com', password: 'hunter2' });
    expect(out.password).toBe('[redacted]');
    expect(out.email).toBe('a@b.com');
  });

  it('masks every sensitive key variant', () => {
    const out = truncateForLog({
      password: 'p', new_password: 'p', current_password: 'p',
      token: 't', access_token: 't', refresh_token: 't', dashboard_token: 't',
      secret: 's', client_secret: 's', api_key: 'k', apiKey: 'k',
      authorization: 'Bearer x', credential: 'c', private_key: 'pk',
    });
    for (const v of Object.values(out)) expect(v).toBe('[redacted]');
  });

  it('masks nested and array payloads', () => {
    const out = truncateForLog({ user: { name: 'x', password: 'p' }, list: [{ token: 't' }] });
    expect(out.user.password).toBe('[redacted]');
    expect(out.user.name).toBe('x');
    expect(out.list[0].token).toBe('[redacted]');
  });

  it('NEVER mutates the caller-supplied object', () => {
    // The value passed in is the live request body about to be sent. Redacting in
    // place would strip the password before it reached the server — breaking login.
    const body = { email: 'a@b.com', password: 'hunter2' };
    truncateForLog(body);
    expect(body.password).toBe('hunter2');
  });

  it('keeps a secret out of the truncated preview string too', () => {
    const out = truncateForLog({ password: 'hunter2', filler: 'x'.repeat(5000) }, 200);
    expect(JSON.stringify(out)).not.toContain('hunter2');
  });
});
