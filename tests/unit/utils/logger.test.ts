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
import { logger, VERBOSE_HOSTS } from '../../../src/utils/logger';

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
