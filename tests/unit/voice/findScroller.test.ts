/**
 * findScroller — which element a spoken "scroll down" actually moves.
 *
 * This is the part of scrolling that fails silently when it is wrong. Picking
 * the document on a page that scrolls an inner container, or an
 * `overflow: hidden` wrapper whose content happens to overflow, produces no
 * error and no movement — voice would announce "Scrolled down" over a page that
 * did not move.
 *
 * jsdom has no layout engine, so heights are stubbed with defineProperty. That
 * is honest for this test: the question here is the SELECTION rule, not the
 * measurements, and the rule is expressible in terms of the two heights and the
 * computed overflow — all of which jsdom reports faithfully once they are set.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { findScroller } from '../../../src/voice/registry/store';

/** Give `el` a scrollable geometry and an overflow that permits scrolling. */
function makeScrollable(
  el: HTMLElement,
  { client = 800, scroll = 5000, width = 1000, overflowY = 'auto' } = {},
) {
  Object.defineProperty(el, 'clientHeight', { value: client, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scroll, configurable: true });
  Object.defineProperty(el, 'clientWidth',  { value: width,  configurable: true });
  el.style.overflowY = overflowY;
}

function layout(inner: string): HTMLElement {
  document.body.innerHTML = `<div class="app-layout">${inner}</div>`;
  return document.querySelector('.app-layout') as HTMLElement;
}

const byId = (id: string) => document.getElementById(id) as HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  // documentElement is shared across tests, so its stubs must be cleared.
  Object.defineProperty(document.documentElement, 'clientHeight', { value: 0, configurable: true });
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: 0, configurable: true });
});

describe('finding the scrollable region', () => {
  it('picks a scrolling container inside the layout', () => {
    layout('<div id="main"></div>');
    makeScrollable(byId('main'));

    expect(findScroller()).toBe(byId('main'));
  });

  it('ignores a container that overflows but is clipped', () => {
    /**
     * This is the /flows and /analytics case. AppLayout wraps full-bleed routes
     * in an `overflow: hidden` div whose content is taller than it is. That
     * element cannot scroll — scrollBy on it is a no-op — so choosing it would
     * be exactly the silent failure this function exists to avoid.
     */
    layout('<div id="clipped"><div id="real"></div></div>');
    makeScrollable(byId('clipped'), { overflowY: 'hidden' });
    makeScrollable(byId('real'), { client: 700, scroll: 4000 });

    expect(findScroller()).toBe(byId('real'));
  });

  it('prefers the larger of two scrolling regions', () => {
    // A sidebar list and the main content can both scroll. With no other
    // signal, "scroll down" means the thing being read.
    layout('<div id="aside"></div><div id="content"></div>');
    makeScrollable(byId('aside'),   { client: 300, width: 200 });
    makeScrollable(byId('content'), { client: 800, width: 1200 });

    expect(findScroller()).toBe(byId('content'));
  });

  it('prefers whatever the caret is inside, even when it is smaller', () => {
    // If the user has just typed into a scrolling panel, that panel is what
    // they mean. The biggest box on screen is a fallback, not a rule.
    layout('<div id="content"></div><div id="panel"><input id="field" /></div>');
    makeScrollable(byId('content'), { client: 900, width: 1200 });
    makeScrollable(byId('panel'),   { client: 250, width: 300 });
    byId('field').focus();

    expect(findScroller()).toBe(byId('panel'));
  });

  it('falls back to the document when no container scrolls', () => {
    /**
     * Ordinary routes work this way: .app-layout is min-height:100vh and
     * .main-content-pad sets no overflow, so the document grows and the window
     * scrolls. The root is exempt from the overflow test on purpose — its
     * computed overflow-y is `visible`, and requiring auto/scroll there would
     * make "scroll down" claim there was nothing to scroll on most of the app.
     */
    layout('<div id="plain"></div>');
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 800, configurable: true });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3000, configurable: true });

    expect(findScroller()).toBe(document.documentElement);
  });

  it('finds nothing when the page genuinely fits', () => {
    layout('<div id="short"></div>');

    expect(findScroller()).toBeNull();
  });

  it('treats a sub-pixel overflow as nothing to scroll', () => {
    // Fractional layout rounding leaves a pixel or two of phantom overflow on
    // plenty of elements. Scrolling 2px on request is worse than refusing.
    layout('<div id="rounding"></div>');
    makeScrollable(byId('rounding'), { client: 800, scroll: 802 });

    expect(findScroller()).toBeNull();
  });
});
