/**
 * voice/registry/store.ts — what is addressable right now.
 *
 * Two kinds of target meet here. NAV_TARGETS are static because a route can be
 * navigated to whether or not anything on screen links to it. Everything
 * DOM-bound — buttons, inputs, selects, in-page tabs — registers itself when it
 * mounts and unregisters when it goes away.
 *
 * Module-level state rather than context, following useToast.ts and useTheme.ts,
 * which both document why: a provider holding this would re-render every
 * consumer on each registration, and pages here register dozens of targets in
 * one mount.
 *
 * Nothing subscribes to this store. The snapshot is built on demand, once per
 * utterance, and deliberately not memoised — a target that was visible when the
 * user started speaking may be behind a closed drawer by the time they stop.
 */
import { useCallback, useRef } from 'react';
import { NAV_TARGETS } from './navTargets';
import { FLOWS_STATIC } from './flowsTargets';
import { isInScope } from '../resolve';
import type { ScreenSnapshot, VoiceTarget } from '../types';

/**
 * Every target that exists without an element behind it.
 *
 * NAV_TARGETS is routes, which are reachable whether or not anything on screen
 * links to them. FLOWS_STATIC is the other elementless case: controls carrying
 * `unavailable`, which resolve to a spoken answer rather than to an action and
 * so never need a node to click. Both are route-scoped, so a page's entries
 * only surface on that page.
 */
const STATIC_TARGETS: readonly VoiceTarget[] = [...NAV_TARGETS, ...FLOWS_STATIC];

interface LiveEntry {
  target: VoiceTarget;
  el:     HTMLElement;
}

const live = new Map<string, LiveEntry>();

/**
 * Add a DOM-bound target. Returns its unregister function.
 *
 * The unregister checks the element still matches before deleting: under
 * StrictMode double-invocation, and on any remount, the new element registers
 * before the old one cleans up, and an unguarded delete would remove the live
 * entry and leave the target unaddressable.
 */
export function registerTarget(target: VoiceTarget, el: HTMLElement): () => void {
  live.set(target.id, { target, el });
  return () => {
    if (live.get(target.id)?.el === el) live.delete(target.id);
  };
}

export function elementFor(id: string): HTMLElement | undefined {
  return live.get(id)?.el;
}

/** Drop every live registration. For tests and hard resets. */
export function resetVoiceRegistry(): void {
  live.clear();
}

/**
 * Is this element really on screen?
 *
 * Deliberately no bounding-box measurement. jsdom has no layout engine, so
 * every element reports zero boxes there and a box check would hide the whole
 * registry in tests while looking correct in a browser. These checks cover what
 * actually happens in this app — unmounted, `hidden`, `aria-hidden`, inert, or
 * display/visibility off — and behave identically in both environments.
 */
export function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.hidden) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (typeof el.closest === 'function' && el.closest('[inert]')) return false;

  if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

/**
 * A reachable scroll of less than this is rounding on a fractional-pixel
 * layout, not content the user can actually get to.
 */
const SCROLL_SLACK = 4;

function canScroll(el: Element): boolean {
  // Cheap test first. This rejects almost every node in the tree without
  // touching getComputedStyle, which is the expensive half of the check.
  if (el.scrollHeight - el.clientHeight <= SCROLL_SLACK) return false;
  if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') return false;
  const overflowY = window.getComputedStyle(el).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

/**
 * What "scroll down" should actually move.
 *
 * There is no single answer in this app, and getting it wrong fails silently.
 * Ordinary pages let the document grow — `.app-layout` is `min-height: 100vh`
 * and `.main-content-pad` sets no overflow — so the window scrolls. But the
 * full-bleed routes (AppLayout's FULL_BLEED: /flows and /analytics) are
 * `overflow: hidden` and scroll an inner container instead, so a
 * `window.scrollBy` there does nothing at all and reports no error. That is the
 * same class of quiet lie as typing into the inert search box, so the target is
 * resolved per utterance rather than assumed:
 *
 *   1. the nearest scrollable ancestor of whatever has focus — if the caret is
 *      inside a scrolling panel, that panel is what the user means
 *   2. otherwise the largest scrollable box on screen, which is the main
 *      content region on both layouts this app uses
 *   3. otherwise the document scroller
 *
 * Returns null when nothing can scroll, so the caller says so instead of
 * announcing a scroll that never happened.
 */
export function findScroller(): Element | null {
  if (typeof document === 'undefined') return null;

  for (let node = document.activeElement; node && node !== document.body; node = node.parentElement) {
    if (canScroll(node)) return node;
  }

  let best: Element | null = null;
  let bestArea = 0;
  for (const el of Array.from(document.querySelectorAll('.app-layout *'))) {
    if (!canScroll(el)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  if (best) return best;

  // The document scroller is the one element exempt from the overflow test.
  // The root's computed overflow-y is `visible` on a normal page, so running it
  // through canScroll() would reject the viewport itself — and since ordinary
  // routes here scroll the document rather than a container, that would make
  // "scroll down" answer "there is nothing to scroll" on most of the app.
  const root = document.scrollingElement ?? document.documentElement;
  return root && root.scrollHeight - root.clientHeight > SCROLL_SLACK ? root : null;
}

/** First path segment, so /analytics/summary reports as "analytics". */
export function routeIdFor(route: string): string {
  return route.split('/').filter(Boolean)[0] ?? 'root';
}

/**
 * Everything voice may act on for `route`, right now. This is both the pool the
 * resolver searches and the exact list sent to the parse endpoint — so the
 * model can only ever name an id that is real and reachable.
 */
export function buildSnapshot(route: string, title = ''): ScreenSnapshot {
  const targets: VoiceTarget[] = [];
  const seen = new Set<string>();

  for (const t of STATIC_TARGETS) {
    if (isInScope(t, route) || t.path !== undefined) {
      targets.push(t);
      seen.add(t.id);
    }
  }
  for (const { target, el } of live.values()) {
    if (seen.has(target.id)) continue;
    if (!isInScope(target, route)) continue;
    if (!isVisible(el)) continue;
    targets.push(target);
    seen.add(target.id);
  }

  return { route, routeId: routeIdFor(route), title, targets };
}

/**
 * Declare an element voice can address. Returns a ref callback:
 *
 *   const ref = useVoiceTarget({ id: 'flows.save', kind: 'button', ... });
 *   return <button ref={ref} onClick={save}>Save</button>;
 *
 * Voice is additive — the element keeps its own handlers, and the executor
 * drives it through real DOM events, so mouse and keyboard paths are untouched.
 */
export function useVoiceTarget<T extends HTMLElement = HTMLElement>(
  target: VoiceTarget | null,
): (el: T | null) => void {
  const cleanup = useRef<(() => void) | null>(null);
  const latest  = useRef(target);
  latest.current = target;

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    const t = latest.current;
    if (el && t) cleanup.current = registerTarget(t, el);
  }, []);
}
