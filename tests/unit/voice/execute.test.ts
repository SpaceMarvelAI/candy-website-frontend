/**
 * execute — the scroll branch.
 *
 * Scrolling is the only action whose correctness is arithmetic rather than
 * resolution, and it is also the only one jsdom cannot observe: it implements
 * neither scrollTo nor scrollBy, and reports every height as zero. That is why
 * ExecutorDeps takes a `getScroller` returning a structural ScrollTarget rather
 * than reaching for `window` — it makes the distances assertable here, in the
 * one place they can be checked exactly.
 *
 * What findScroller() picks in a real browser is a separate question, and not
 * one a layout-less environment can answer; see its own note in
 * registry/store.ts for why it is resolved per utterance.
 */
import { describe, it, expect, vi } from 'vitest';
import { executeAction, type ExecutorDeps, type ScrollTarget } from '../../../src/voice/execute';
import type { ExecutableAction, ScreenSnapshot } from '../../../src/voice/types';

/** Scroll never reads the snapshot — it names no target. */
const NO_TARGETS: ScreenSnapshot = {
  route: '/healthcare', routeId: 'healthcare', title: 'Healthcare', targets: [],
};

interface Fake {
  target: ScrollTarget;
  to: number[];
  by: number[];
}

function fakeScroller(clientHeight = 800, scrollHeight = 5000): Fake {
  const to: number[] = [];
  const by: number[] = [];
  return {
    to,
    by,
    target: {
      clientHeight,
      scrollHeight,
      scrollTo: o => { to.push(o.top); },
      scrollBy: o => { by.push(o.top); },
    },
  };
}

function run(action: ExecutableAction, scroller: ScrollTarget | null) {
  const deps: ExecutorDeps = {
    navigate:    vi.fn(),
    goHistory:   vi.fn(),
    getElement:  vi.fn(),
    getScroller: () => scroller,
  };
  return executeAction(action, NO_TARGETS, deps);
}

const scroll = (direction: 'up' | 'down' | 'top' | 'bottom', amount?: number) =>
  ({ kind: 'scroll', direction, ...(amount === undefined ? {} : { amount }) }) as ExecutableAction;

describe('scrolling by a page', () => {
  it('moves most of a screen down, not all of it', () => {
    // A full-height jump loses the line the reader was on. Leaving a strip of
    // the previous screen visible is what Page Down does, and what keeps a
    // listener oriented when they cannot watch the scrollbar move.
    const s = fakeScroller(800);
    const r = run(scroll('down'), s.target);

    expect(s.by).toEqual([640]);
    expect(r).toEqual({ ok: true, say: 'Scrolled down' });
  });

  it('moves the same distance upwards', () => {
    const s = fakeScroller(800);
    const r = run(scroll('up'), s.target);

    expect(s.by).toEqual([-640]);
    expect(r.say).toBe('Scrolled up');
  });

  it('scales the step to the viewport rather than using fixed pixels', () => {
    const small = fakeScroller(400);
    const large = fakeScroller(1600);
    run(scroll('down'), small.target);
    run(scroll('down'), large.target);

    expect(small.by).toEqual([320]);
    expect(large.by).toEqual([1280]);
  });

  it('still moves when the container reports no height', () => {
    // Zero clientHeight happens in jsdom and on a collapsed container. Without
    // a floor the step would be 0: a scroll that reports success and does
    // nothing, which is the failure this feature keeps refusing to ship.
    const s = fakeScroller(0);
    const r = run(scroll('down'), s.target);

    expect(s.by[0]).toBeGreaterThan(0);
    expect(r.ok).toBe(true);
  });
});

describe('scrolling to an end', () => {
  it('goes to the very top', () => {
    const s = fakeScroller();
    const r = run(scroll('top'), s.target);

    expect(s.to).toEqual([0]);
    expect(s.by).toEqual([]);
    expect(r).toEqual({ ok: true, say: 'Scrolled to the top' });
  });

  it('goes to the full scroll height, not one page down', () => {
    const s = fakeScroller(800, 5000);
    const r = run(scroll('bottom'), s.target);

    expect(s.to).toEqual([5000]);
    expect(r.say).toBe('Scrolled to the bottom');
  });
});

describe('an explicit distance', () => {
  it('overrides the page step', () => {
    // The browser's grammar has no unit for "a bit", so this is the server's
    // way of expressing one. See parseScrollCommand.
    const s = fakeScroller(800);
    run(scroll('down', 150), s.target);

    expect(s.by).toEqual([150]);
  });

  it('is capped, because a model chose the number', () => {
    /**
     * `amount` is the only magnitude in the pipeline an LLM can set.
     * validate.ts rejects zero, negatives and non-finite values; this bounds
     * the other end, so a hallucinated 1e9 is a long scroll rather than
     * undefined behaviour.
     */
    const s = fakeScroller(800);
    run(scroll('down', 1e9), s.target);

    expect(s.by[0]).toBeLessThanOrEqual(20_000);
    expect(s.by[0]).toBeGreaterThan(0);
  });
});

describe('when the page cannot scroll', () => {
  it('says so instead of announcing a scroll that did not happen', () => {
    const r = run(scroll('down'), null);

    expect(r.ok).toBe(false);
    expect(r.say).toBe('There is nothing to scroll here.');
  });

  it('touches nothing', () => {
    const s = fakeScroller();
    run(scroll('top'), null);

    expect(s.to).toEqual([]);
    expect(s.by).toEqual([]);
  });
});
