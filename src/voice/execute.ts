/**
 * voice/execute.ts — carry out an action that has already been validated.
 *
 * The one rule worth stating plainly: a destination is read off the registered
 * target, never off the action. The action carries an id; `target.path` supplies
 * the route. There is no code path here that turns spoken text into a URL, a
 * selector or markup, which is why a hostile or misheard transcript cannot do
 * anything worse than fail to resolve.
 *
 * Navigation goes through react-router's navigate() rather than window.location
 * — the app mounts a HashRouter (src/main.tsx), so assigning a location would
 * reload the SPA rather than route within it. Clicks go through real DOM events
 * so React's root listener sees them and state updates exactly as it does for a
 * mouse.
 */
import type { ExecutableAction, ScreenSnapshot, VoiceTarget } from './types';

/**
 * The scrollable thing, described structurally rather than as an `Element`.
 *
 * Element satisfies this, so findScroller() slots straight in — but naming only
 * what is used keeps the scroll branch assertable in the suite. jsdom
 * implements neither scrollTo nor scrollBy and reports every height as zero, so
 * a DOM-typed dependency would make this arithmetic untestable.
 */
export interface ScrollTarget {
  clientHeight: number;
  scrollHeight: number;
  scrollTo(options: { top: number; behavior?: ScrollBehavior }): void;
  scrollBy(options: { top: number; behavior?: ScrollBehavior }): void;
}

export interface ExecutorDeps {
  /** react-router navigate(path). */
  navigate:   (path: string) => void;
  /** react-router navigate(delta) — kept separate so deps stay unambiguous. */
  goHistory:  (delta: number) => void;
  getElement: (id: string) => HTMLElement | undefined;
  /** Whatever should scroll on this page, or null when nothing can. */
  getScroller: () => ScrollTarget | null;
}

export interface ExecutionResult {
  ok:  boolean;
  /** One short line for the toast and the live region. */
  say: string;
}

function find(snapshot: ScreenSnapshot, id: string): VoiceTarget | undefined {
  return snapshot.targets.find(t => t.id === id);
}

/**
 * A real click, so React's synthetic event system and the element's own
 * handlers both fire. Focus first, because some handlers in this app read
 * document.activeElement, and because it leaves the keyboard where a sighted
 * mouse user would expect it.
 */
function clickElement(el: HTMLElement): void {
  if (typeof el.focus === 'function') el.focus();
  el.click();
}

/**
 * Put `value` into a field so that React actually sees it.
 *
 * Assigning `el.value` directly updates the DOM and React never notices:
 * react-dom attaches a value tracker to the node and suppresses the synthetic
 * change event when the property is written behind its back, so a controlled
 * input snaps straight back to its state value on the next render. Writing
 * through the prototype's own setter goes around the tracker, and the bubbling
 * `input` event then reaches React's root listener exactly as a keystroke does.
 *
 * Returns false for anything that is not a text field, so the caller can say so
 * rather than silently doing nothing.
 */
function setNativeValue(el: HTMLElement, value: string): boolean {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype :
    el instanceof HTMLInputElement    ? HTMLInputElement.prototype :
    null;
  if (!proto) return false;

  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) return false;

  if (typeof el.focus === 'function') el.focus();
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * How far one "scroll down" moves.
 *
 * A fraction of the visible height rather than a fixed pixel count, so the step
 * is proportionate on a laptop and on a wall display. 0.8 leaves a strip of the
 * previous screen in view, which is what Page Down does and what keeps a reader
 * oriented — a full-height jump loses the line you were on.
 */
const PAGE_FRACTION = 0.8;

/**
 * Never move more than this in one utterance, however large `amount` is.
 *
 * `amount` is the only number in the whole pipeline that a language model can
 * put a magnitude into. validate.ts already rejects zero, negatives and
 * non-finite values; this bounds the other end, so a hallucinated 1e9 scrolls a
 * long way rather than doing something undefined.
 */
const MAX_SCROLL_PX = 20_000;

function scrollStep(scroller: ScrollTarget, amount: number | undefined): number {
  if (amount !== undefined) return Math.min(amount, MAX_SCROLL_PX);
  // clientHeight is 0 in jsdom and could be on a collapsed container; a floor
  // keeps "scroll down" from being a no-op that still reports success.
  return Math.max(120, Math.round(scroller.clientHeight * PAGE_FRACTION));
}

export function executeAction(
  action:   ExecutableAction,
  snapshot: ScreenSnapshot,
  deps:     ExecutorDeps,
): ExecutionResult {
  switch (action.kind) {
    case 'back':
      deps.goHistory(-1);
      return { ok: true, say: 'Going back' };

    case 'forward':
      deps.goHistory(1);
      return { ok: true, say: 'Going forward' };

    case 'navigate': {
      const target = find(snapshot, action.targetId);
      // Validation guarantees both of these; failing closed rather than
      // throwing keeps a stale snapshot from taking the whole hook down.
      if (!target?.path) return { ok: false, say: 'I lost track of that — try again.' };
      deps.navigate(target.path);
      return { ok: true, say: `Opening ${target.label}` };
    }

    case 'openTab': {
      const target = find(snapshot, action.targetId);
      if (!target) return { ok: false, say: 'I lost track of that — try again.' };
      // Tabs are routes on /analytics and /live, and in-page controls elsewhere.
      if (target.path) {
        deps.navigate(target.path);
        return { ok: true, say: `Opening ${target.label}` };
      }
      const el = deps.getElement(target.id);
      if (!el) return { ok: false, say: `${target.label} is no longer on screen.` };
      clickElement(el);
      return { ok: true, say: `Opening ${target.label}` };
    }

    case 'click': {
      const target = find(snapshot, action.targetId);
      if (!target) return { ok: false, say: 'I lost track of that — try again.' };

      // A nav or a tab can legitimately be clicked ("click Analytics"), and
      // routing is the right way to carry that out rather than hunting for a
      // sidebar element that may not be rendered on this page at all.
      // validate.ts allows all three kinds here for exactly that reason.
      if (target.path) {
        deps.navigate(target.path);
        return { ok: true, say: `Opening ${target.label}` };
      }

      const el = deps.getElement(target.id);
      // Registered when the snapshot was built and gone by now — a drawer
      // closing mid-utterance. Say so rather than failing silently.
      if (!el) return { ok: false, say: `${target.label} is no longer on screen.` };
      clickElement(el);
      return { ok: true, say: target.label };
    }

    case 'type': {
      const target = find(snapshot, action.targetId);
      if (!target) return { ok: false, say: 'I lost track of that — try again.' };
      const el = deps.getElement(target.id);
      if (!el) return { ok: false, say: `${target.label} is no longer on screen.` };

      if (!setNativeValue(el, action.value)) {
        return { ok: false, say: `I could not type into ${target.label}.` };
      }
      return { ok: true, say: `Typed ${action.value} into ${target.label}` };
    }

    case 'scroll': {
      const scroller = deps.getScroller();
      // Nothing on the page overflows. Saying so is the point: announcing
      // "Scrolled down" over a page that cannot move is the same quiet lie as
      // typing into a box nothing reads.
      if (!scroller) return { ok: false, say: 'There is nothing to scroll here.' };

      switch (action.direction) {
        case 'top':
          scroller.scrollTo({ top: 0, behavior: 'smooth' });
          return { ok: true, say: 'Scrolled to the top' };
        case 'bottom':
          scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
          return { ok: true, say: 'Scrolled to the bottom' };
        default: {
          const step = scrollStep(scroller, action.amount);
          scroller.scrollBy({
            top: action.direction === 'up' ? -step : step,
            behavior: 'smooth',
          });
          return { ok: true, say: action.direction === 'up' ? 'Scrolled up' : 'Scrolled down' };
        }
      }
    }

    default:
      // select / search / confirm / cancel. `search` has nowhere to go at all —
      // the topbar box consumes nothing — and parseLocal answers that one with
      // its own sentence rather than letting it reach here. The rest arrive in
      // slice 6, and voice_intent.py's EXECUTABLE_KINDS refuses them
      // server-side too, so this is only reachable if a caller hands us one
      // directly.
      return { ok: false, say: 'I cannot do that yet.' };
  }
}
