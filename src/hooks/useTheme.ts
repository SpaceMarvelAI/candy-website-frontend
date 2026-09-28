/**
 * useTheme.ts — single source of truth for the app's color theme.
 *
 * Why one file?
 *   Everything the runtime needs to flip between dark and light lives here:
 *     · initial theme detection (saved → system pref → fallback)
 *     · the active theme value (module-level, app-wide)
 *     · the side-effect of writing to <html data-theme=…> + localStorage
 *     · the React hook that components consume
 *
 *   No React Context required — module-level state + useSyncExternalStore
 *   gives every consumer the same value with no provider boilerplate.
 *
 * Note: the small inline script in index.html applies data-theme BEFORE the
 * JS bundle parses, preventing a flash of dark content for light-mode users.
 * This module then takes over once it loads.
 */

import { useSyncExternalStore, useCallback } from 'react';
import posthog from 'posthog-js';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'theme';

// ─── Initial theme ─────────────────────────────────────────────────────────
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage may throw in private mode / sandboxed iframes
  }
  return 'light';
}

// ─── Module-level state ────────────────────────────────────────────────────
// Single source of truth shared across every useTheme() consumer.
let currentTheme: Theme = getInitialTheme();
const listeners = new Set<() => void>();

// Duration must stay in sync with the CSS rule scoped to .theme-transitioning
// in globals.css — keep both at 400ms.
const TRANSITION_MS = 400;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;

function applyTheme(next: Theme) {
  if (next === currentTheme) return;

  // Enable a brief, global color transition so the swap fades instead of
  // snapping. The class is removed immediately after, so normal fast
  // hover/focus transitions resume.
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.classList.add('theme-transitioning');

    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
      transitionTimer = null;
    }, TRANSITION_MS);

    root.setAttribute('data-theme', next);
  }

  // Client-only preference change — no server-side equivalent. The `next ===
  // currentTheme` guard above already dedupes no-op re-selections (e.g.
  // picking "System theme" when it resolves to the theme already active).
  posthog.capture('theme_changed', { theme: next });

  currentTheme = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
  listeners.forEach(fn => fn());
}

// Make sure the DOM reflects our state on first load too. The inline script
// in index.html should have already done this, but this is a safety net.
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', currentTheme);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// ─── Imperative API ────────────────────────────────────────────────────────
// Available for use outside of React components if ever needed.
export const themeStore = {
  get: () => currentTheme,
  set: (t: Theme) => applyTheme(t),
  toggle: () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'),
};

// ─── React hook ────────────────────────────────────────────────────────────
export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    () => currentTheme,
    () => 'light' as Theme, // SSR fallback
  );

  const toggleTheme = useCallback(() => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
  }, []);

  return { theme, toggleTheme, setTheme };
}
