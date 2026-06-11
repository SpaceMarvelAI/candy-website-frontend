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
import { logger } from '../../../src/utils/logger';

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
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const meta = { retries: 3 };
    logger.warn('[test] warn with meta', meta);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[test] warn with meta'), meta);
  });
});

describe('logger.error — always emits', () => {
  it('calls console.error with the label', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[test] crash happened', { err: new Error('x') });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('[test] crash happened');
  });

  it('timestamp prefix is in HH:MM:SS.mmm format', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('[test] timed error');
    const label: string = spy.mock.calls[0][0];
    expect(label).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
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
  it('emits ⚡ FAST for durations < 500 ms', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] fast', 200);
    expect(spy.mock.calls[0][0]).toContain('⚡ FAST');
  });

  it('emits ⏱ MED for durations between 500 ms and 2 s', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] medium', 800);
    expect(spy.mock.calls[0][0]).toContain('⏱ MED');
  });

  it('emits 🐢 SLOW for durations > 2 s', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.performance('[api] slow', 3500);
    expect(spy.mock.calls[0][0]).toContain('🐢 SLOW');
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
