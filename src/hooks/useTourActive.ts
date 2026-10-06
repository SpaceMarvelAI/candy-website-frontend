/**
 * useTourActive — lets Sidebar force its expanded (labelled) panel open while ProductTour is
 * running, so a spotlighted nav item is never just a bare icon. Module-level state + subscribe,
 * same pattern as useTheme.ts — no context/provider needed for one shared boolean.
 */
import { useSyncExternalStore } from 'react';

let active = false;
const listeners = new Set<() => void>();

export const tourActiveStore = {
  set(next: boolean) {
    if (next === active) return;
    active = next;
    listeners.forEach((fn) => fn());
  },
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTourActive(): boolean {
  return useSyncExternalStore(subscribe, () => active, () => false);
}
