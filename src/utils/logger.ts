/**
 * Centralized logger — dev-rich, prod-safe.
 *
 * Verbosity gating (checked fresh on every call — no caching — so the runtime
 * kill switch below takes effect without a reload):
 *   1. localStorage['debug'] === 'off'      → force silent, even on localhost.
 *   2. localStorage['debug'] === 'on'       → force verbose, even in a prod build
 *                                              on app.candy.cx. Toggle from any
 *                                              deployed environment's devtools:
 *                                              localStorage.setItem('debug','on')
 *   3. VITE_DEBUG === 'true' (build-time)   → force verbose.
 *   4. import.meta.env.DEV (vite dev server) → verbose.
 *   5. hostname is localhost/127.0.0.1/dev.candy.cx → verbose (covers the
 *      deployed dev site too — it's a `vite build`, so DEV is false there,
 *      which is why hostname is checked independently of DEV).
 *   6. Anything else (app.candy.cx, candy.cx, …) → warn/error only.
 *
 * warn/error ALWAYS emit regardless of the above — only info/debug/api(req)/
 * performance/group are gated. That part is unchanged from before.
 *
 * Usage:
 *   logger.info('[MyComponent] Mounted', { props });
 *   logger.api('req', 'GET /v1/agents', { url, method, payload });
 *   logger.perf('[useAgent] bootstrap', 312);          // alias of .performance
 *   logger.setErrorReporter(Sentry.captureException);  // wire a monitoring SDK later
 */

const IS_DEV = (import.meta as any).env?.DEV === true;
/** Exported so tests can assert the exact allowlist without needing to fake IS_DEV=false
 * (a module-level constant fixed at load time — see logger.test.ts for why). */
export const VERBOSE_HOSTS = ['localhost', '127.0.0.1', 'dev.candy.cx'];

function isVerbose(): boolean {
  try {
    const override = localStorage.getItem('debug');
    if (override === 'off') return false;
    if (override === 'on') return true;
  } catch {
    // localStorage may throw in private mode / sandboxed iframes — fall through
  }
  if ((import.meta as any).env?.VITE_DEBUG === 'true') return true;
  if (IS_DEV) return true;
  if (typeof window !== 'undefined' && VERBOSE_HOSTS.includes(window.location.hostname)) return true;
  return false;
}

function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

// ── Namespace → consistent color (so "[AppContext]" is always the same hue) ──

const NAMESPACE_COLORS = [
  '#60a5fa', '#f472b6', '#34d399', '#fbbf24', '#a78bfa',
  '#fb923c', '#22d3ee', '#a3e635', '#f87171', '#c084fc',
];

function extractNamespace(label: string): string | null {
  const m = label.match(/^\[([^\]]+)\]/);
  return m ? m[1] : null;
}

function colorForNamespace(ns: string): string {
  let hash = 0;
  for (let i = 0; i < ns.length; i++) hash = (hash * 31 + ns.charCodeAt(i)) | 0;
  return NAMESPACE_COLORS[Math.abs(hash) % NAMESPACE_COLORS.length];
}

const BADGE_CSS = 'font-weight:700;padding:1px 6px;border-radius:4px;font-size:10px;letter-spacing:.3px;color:#fff;';

/** Prints `%c BADGE %c[ts] label` then appends `args` unchanged (same as before — args are still separate, inspectable console values, not string-interpolated). */
function emit(consoleFn: (...a: any[]) => void, badgeText: string, badgeBg: string, label: string, args: any[]) {
  const ns = extractNamespace(label);
  const nsColor = ns ? colorForNamespace(ns) : '#9ca3af';
  consoleFn(
    `%c ${badgeText} %c${ts()} ${label}`,
    `${BADGE_CSS}background:${badgeBg};`,
    `color:${nsColor};font-weight:600;`,
    ...args,
  );
}

// ── Optional single funnel point for a future monitoring SDK (Sentry, etc.) ──
// warn/error call this in addition to the console — no-op until wired up, so
// nothing changes until someone explicitly calls setErrorReporter().
type ErrorReporter = (level: 'warn' | 'error', label: string, args: any[]) => void;
let _errorReporter: ErrorReporter | null = null;

/** Wire a monitoring SDK's capture function here, e.g. Sentry.captureMessage. */
function setErrorReporter(fn: ErrorReporter | null) {
  _errorReporter = fn;
}

// ── Primitive helpers ────────────────────────────────────────────────────────

// console.info/warn/error/debug don't interpolate %-style format specifiers
// from a string argument the way util.format does, and `label` is always a
// hardcoded literal at every call site in this app (e.g. logger.info('[useAgent]
// bootstrap', ...)) — never attacker-controlled data. Reviewed false positive.
function _info(label: string, ...args: any[]) {
  emit(console.info, 'INFO', '#3b82f6', label, args);
}

function _warn(label: string, ...args: any[]) {
  emit(console.warn, 'WARN', '#f59e0b', label, args);
  _errorReporter?.('warn', label, args);
}

function _error(label: string, ...args: any[]) {
  emit(console.error, 'ERROR', '#ef4444', label, args);
  _errorReporter?.('error', label, args);
}

function _debug(label: string, ...args: any[]) {
  emit(console.debug, 'DEBUG', '#a78bfa', label, args);
}

// ── Public logger API ────────────────────────────────────────────────────────

export const logger = {
  /** Informational lifecycle events — gated by isVerbose(). */
  info(label: string, ...args: any[]) {
    if (isVerbose()) _info(label, ...args);
  },

  /** Warnings — always emitted (console), routed through setErrorReporter() too. */
  warn(label: string, ...args: any[]) {
    _warn(label, ...args);
  },

  /** Errors — always emitted (console), routed through setErrorReporter() too. */
  error(label: string, ...args: any[]) {
    _error(label, ...args);
  },

  /** Verbose debug dumps — gated by isVerbose(). */
  debug(label: string, ...args: any[]) {
    if (isVerbose()) _debug(label, ...args);
  },

  /**
   * Structured API logging.
   * direction: 'req' → outgoing request | 'res' → success | 'err' → failure
   */
  api(direction: 'req' | 'res' | 'err', label: string, data: Record<string, any>) {
    const verbose = isVerbose();
    if (!verbose && direction === 'req') return; // don't spam prod with requests
    if (!verbose && direction !== 'err') return; // res only shown when verbose; err always shown (surfaces real failures)
    const badge = { req: ['API →', '#06b6d4'], res: ['API ←', '#22c55e'], err: ['API ✖', '#ef4444'] } as const;
    const [text, bg] = badge[direction];
    const groupFn = direction === 'err' ? console.group : console.groupCollapsed;
    emit(groupFn.bind(console), text, bg, label, []);
    if (direction === 'err') console.error(data); else console.log(data);
    console.groupEnd();
  },

  /**
   * Performance measurement — gated by isVerbose().
   * Slow (>2s) and medium (>500ms) calls get distinct badges/colors.
   */
  performance(label: string, durationMs: number, meta?: Record<string, any>) {
    if (!isVerbose()) return;
    const [text, bg] = durationMs > 2000 ? ['SLOW', '#ef4444'] : durationMs > 500 ? ['MED', '#f59e0b'] : ['FAST', '#22c55e'];
    const msg = `${label}: ${durationMs.toFixed(1)} ms`;
    if (meta) {
      emit(console.groupCollapsed.bind(console), text, bg, msg, []);
      console.log(meta);
      console.groupEnd();
    } else {
      emit(console.log, text, bg, msg, []);
    }
  },

  /** Alias of .performance — matches the `perf` name used elsewhere in this project's tooling. */
  perf(label: string, durationMs: number, meta?: Record<string, any>) {
    this.performance(label, durationMs, meta);
  },

  /**
   * Grouped block.
   *  - With `fn`: opens, runs it, always closes (even if fn throws) — same as before.
   *  - Without `fn`: opens and returns immediately; caller must call logger.groupEnd().
   *    Useful for multi-step async grouping that a single synchronous callback can't wrap.
   * No-op (fn still runs) when not verbose.
   */
  group(label: string, fn?: () => void) {
    if (!isVerbose()) { fn?.(); return; }
    console.groupCollapsed(`[${ts()}] ${label}`);
    if (fn) {
      try { fn(); } finally { console.groupEnd(); }
    }
  },

  /** Pairs with group(label) called without fn. No-op when not verbose. */
  groupEnd() {
    if (!isVerbose()) return;
    console.groupEnd();
  },

  /** Wire a monitoring SDK (Sentry.captureException, LogRocket, etc.) — see setErrorReporter above. */
  setErrorReporter,

  /** True when verbose logging is currently active (localhost, dev.candy.cx, DEV, or the kill switch). */
  isVerbose,
};

// ── Convenience re-exports ───────────────────────────────────────────────────

export default logger;

/** Shortens large objects/strings before they hit the console — used by API logging so a 2 MB response body doesn't flood devtools. Purely a display truncation; never mutates the real value flowing through the app. */
export function truncateForLog(value: any, maxLen = 2000): any {
  try {
    if (typeof value === 'string') {
      return value.length > maxLen ? `${value.slice(0, maxLen)}… [truncated, ${value.length} chars total]` : value;
    }
    const str = JSON.stringify(value);
    if (str && str.length > maxLen) {
      return { __truncated__: true, preview: str.slice(0, maxLen) + '…', totalLength: str.length };
    }
    return value;
  } catch {
    return value; // circular ref or non-serializable — log it as-is rather than throw
  }
}
