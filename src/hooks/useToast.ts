/**
 * useToast.ts — app-wide toast queue.
 *
 * Deliberately NOT React context. `addToast` is called from ~22 components but
 * `toasts` is read by exactly one (<ToastHost/>). When the queue lived in
 * AppContext's value, every toast re-rendered all ~30 context consumers twice
 * (once to add, once when the auto-dismiss timer removed it) — including the
 * 1,000+ line workspace pages. Module-level state + useSyncExternalStore gives
 * ToastHost the updates and leaves everyone else alone; same pattern as
 * useTheme.ts.
 *
 * `addToast` is a module function, so it is referentially stable for the whole
 * session: no useCallback, no provider identity to invalidate, and the
 * auto-dismiss timer closes over module state instead of a component's
 * setState (which is what previously kept an unmounted provider's closure
 * alive when a toast fired just before navigation).
 */
import { useSyncExternalStore } from 'react';
import posthog from 'posthog-js';
import { logger } from '../utils/logger';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  msg: string;
  kind: ToastKind;
}

export interface AddToastOptions {
  /** Skip the app-wide `error_toast_shown` capture — for callers that already
   *  fire a richer, more specific event for the same failure. */
  skipCapture?: boolean;
}

export type AddToast = (msg: string, kind?: ToastKind, opts?: AddToastOptions) => void;

/** Must stay just above the toast-in CSS animation's total duration. */
const DISMISS_MS = 3100;

let toasts: readonly Toast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
  listeners.forEach(fn => fn());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function remove(id: number) {
  const timer = timers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter(t => t.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}

export const addToast: AddToast = (msg, kind = 'success', opts) => {
  const id = Date.now() + Math.random();
  logger.debug('[toast] addToast', { msg, kind });
  if (kind === 'error' && !opts?.skipCapture) {
    // Single, app-wide capture point for user-facing failures — covers every
    // component that calls addToast(msg, 'error') without needing its own
    // posthog.capture() call site.
    posthog.capture('error_toast_shown', { message: msg });
  }
  toasts = [...toasts, { id, msg, kind }];
  emit();
  timers.set(id, setTimeout(() => remove(id), DISMISS_MS));
};

export const toastStore = {
  get: () => toasts,
  add: addToast,
  dismiss: remove,
  /** Drop every queued toast and its pending timer. For tests and hard resets. */
  reset() {
    timers.forEach(clearTimeout);
    timers.clear();
    if (toasts.length === 0) return;
    toasts = [];
    emit();
  },
};

export function useToasts(): readonly Toast[] {
  return useSyncExternalStore(subscribe, toastStore.get, () => toasts);
}
