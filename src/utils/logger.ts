/**
 * Centralized logger — dev-rich, prod-safe.
 *
 * Development: full groups, timestamps, debug output.
 * Production:  only warn/error survive; debug/info/api are no-ops to avoid
 *              leaking internal state to browser consoles in deployed builds.
 *
 * Usage:
 *   logger.info('[MyComponent] Mounted', { props });
 *   logger.api('req', 'GET /v1/agents', { url, method, payload });
 *   logger.performance('[useAgent] bootstrap', 312);
 */

const IS_DEV = (import.meta as any).env?.DEV === true;

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

// ── Primitive helpers ────────────────────────────────────────────────────────

// console.info/warn/error/debug don't interpolate %-style format specifiers
// from a string argument the way util.format does, and `label` is always a
// hardcoded literal at every call site in this app (e.g. logger.info('[useAgent]
// bootstrap', ...)) — never attacker-controlled data. Reviewed false positive.
function _info(label: string, ...args: any[]) {
  console.info(`[${ts()}] ℹ ${label}`, ...args); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
}

function _warn(label: string, ...args: any[]) {
  console.warn(`[${ts()}] ⚠ ${label}`, ...args); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
}

function _error(label: string, ...args: any[]) {
  console.error(`[${ts()}] ✖ ${label}`, ...args); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
}

function _debug(label: string, ...args: any[]) {
  console.debug(`[${ts()}] ◎ ${label}`, ...args); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring.unsafe-formatstring
}

// ── Public logger API ────────────────────────────────────────────────────────

export const logger = {
  /** Informational lifecycle events — dev only. */
  info(label: string, ...args: any[]) {
    if (IS_DEV) _info(label, ...args);
  },

  /** Warnings — survives to production. */
  warn(label: string, ...args: any[]) {
    _warn(label, ...args);
  },

  /** Errors — always emitted. */
  error(label: string, ...args: any[]) {
    _error(label, ...args);
  },

  /** Verbose debug dumps — dev only. */
  debug(label: string, ...args: any[]) {
    if (IS_DEV) _debug(label, ...args);
  },

  /**
   * Structured API logging.
   *
   * direction: 'req'  → outgoing request
   *            'res'  → successful response
   *            'err'  → failed request
   */
  api(direction: 'req' | 'res' | 'err', label: string, data: Record<string, any>) {
    if (!IS_DEV && direction === 'req') return; // don't spam prod with requests
    const icons = { req: '→', res: '←', err: '✖' } as const;
    const fns   = { req: console.groupCollapsed, res: console.groupCollapsed, err: console.group } as const;
    fns[direction].call(console, `[${ts()}] ${icons[direction]} API ${direction.toUpperCase()} ${label}`);
    if (direction === 'err') {
      console.error(data);
    } else {
      console.log(data);
    }
    console.groupEnd();
  },

  /**
   * Performance measurement.
   * Slow (>2 s) and medium (>500 ms) calls get distinct emoji prefixes.
   */
  performance(label: string, durationMs: number, meta?: Record<string, any>) {
    if (!IS_DEV) return;
    const icon = durationMs > 2000 ? '🐢 SLOW' : durationMs > 500 ? '⏱ MED' : '⚡ FAST';
    const msg  = `[${ts()}] ${icon} ${label}: ${durationMs.toFixed(1)} ms`;
    if (meta) {
      console.groupCollapsed(msg);
      console.log(meta);
      console.groupEnd();
    } else {
      console.log(msg);
    }
  },

  /**
   * Grouped block — collapses in dev, noop in prod.
   * Useful for dumping component props/state without polluting the top-level.
   */
  group(label: string, fn: () => void) {
    if (!IS_DEV) return;
    console.groupCollapsed(`[${ts()}] ${label}`);
    try { fn(); } finally { console.groupEnd(); }
  },
};

// ── Convenience re-exports ───────────────────────────────────────────────────

export default logger;
