/**
 * ProductTour — spotlight-popover walkthrough of the nav rail, sidebar and topbar. Triggered
 * manually from Profile → Help → Product Tour (AppRail.tsx), never auto-opened.
 *
 * The backdrop is 4 blurred/dimmed panels framing a cutout over the anchor (no CSS mask/
 * clip-path — plain rects work in every browser that supports backdrop-filter), so only the
 * spotlighted element stays sharp and clickable. A step is dropped up front if its `data-tour`
 * anchor isn't in the DOM when the tour opens (e.g. "finish-setup" once onboarding is done).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { tourActiveStore } from '../hooks/useTourActive';
import { PRODUCT_TOUR_STEPS, TOUR_END_PATH, type TourPlacement, type TourStep } from '../data/productTour';

const ACCENT = '#8b5cf6';
const MARGIN = 16;
const HOLE_PAD = 6;

function panelStyle(r: { top: number | string; left: number | string; width: number | string; height: number | string }): CSSProperties {
  return {
    position: 'fixed', ...r,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    zIndex: 9999,
    transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
  } as CSSProperties;
}

function findAnchor(id: string | null): HTMLElement | null {
  return id ? document.querySelector<HTMLElement>(`[data-tour="${id}"]`) : null;
}

function cardPos(rect: DOMRect | null, placement: TourPlacement, cardW: number, cardH: number) {
  const vw = window.innerWidth, vh = window.innerHeight;
  let top: number, left: number;
  if (!rect || placement === 'center') {
    top = vh / 2 - cardH / 2;
    left = vw / 2 - cardW / 2;
  } else {
    switch (placement) {
      case 'right': left = rect.right + MARGIN; top = rect.top + rect.height / 2 - cardH / 2; break;
      case 'left':  left = rect.left - cardW - MARGIN; top = rect.top + rect.height / 2 - cardH / 2; break;
      case 'bottom':top = rect.bottom + MARGIN; left = rect.left + rect.width / 2 - cardW / 2; break;
      default:      top = rect.top - cardH - MARGIN; left = rect.left + rect.width / 2 - cardW / 2; break;
    }
  }
  return {
    top: Math.min(Math.max(top, 12), vh - cardH - 12),
    left: Math.min(Math.max(left, 12), vw - cardW - 12),
  };
}

/** Where the little diamond nub sits on the card's edge, pointing back at the anchor. */
function arrowPos(rect: DOMRect | null, placement: TourPlacement, pos: { top: number; left: number }, cardW: number, cardH: number) {
  if (!rect || placement === 'center') return null;
  const size = 12;
  if (placement === 'right' || placement === 'left') {
    const target = Math.min(Math.max(rect.top + rect.height / 2 - pos.top, 20), cardH - 20) - size / 2;
    return placement === 'right' ? { left: -size / 2, top: target } : { right: -size / 2, top: target };
  }
  const target = Math.min(Math.max(rect.left + rect.width / 2 - pos.left, 20), cardW - 20) - size / 2;
  return placement === 'bottom' ? { top: -size / 2, left: target } : { bottom: -size / 2, left: target };
}

export default function ProductTour({ onClose }: { onClose: () => void }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();
  const location = useLocation();

  // Snapshot once, at open: drop any step whose anchor isn't currently mounted — except a
  // step with its own `path`, which isn't expected to exist until the tour navigates there.
  const [steps] = useState<TourStep[]>(() =>
    PRODUCT_TOUR_STEPS.filter((s) => s.anchor === null || s.path || findAnchor(s.anchor))
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardW, setCardW] = useState(() => Math.min(400, window.innerWidth - 32));
  const [cardH, setCardH] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  // Keep the sidebar's labelled panel open for the whole tour, not just the steps that spotlight it.
  useEffect(() => {
    tourActiveStore.set(true);
    return () => tourActiveStore.set(false);
  }, []);

  // Entering a step: navigate to its route if needed, optionally click another anchor to
  // reveal this one (e.g. a use-case card that opens the create-agent modal), then poll for
  // the anchor — a fresh route/modal mounts a beat after navigate()/click(), not synchronously.
  useEffect(() => {
    let alive = true;
    let clicked = false;
    setRect(null);

    if (step?.path && location.pathname !== step.path) navigate(step.path, { replace: true });

    function tick(triesLeft: number) {
      if (!alive) return;
      if (step?.clickAnchor && !clicked) {
        const trigger = findAnchor(step.clickAnchor);
        if (trigger) { trigger.click(); clicked = true; }
      }
      const el = step?.anchor ? findAnchor(step.anchor) : null;
      if (el) { setRect(el.getBoundingClientRect()); return; }
      if (!step?.anchor) return; // centered step, nothing to find
      if (triesLeft > 0) setTimeout(() => tick(triesLeft - 1), 75);
      // else: give up quietly — the card falls back to a centered, un-spotlit layout.
    }
    tick(40); // ~3s

    function onResize() {
      setRect(step?.anchor ? findAnchor(step.anchor)?.getBoundingClientRect() ?? null : null);
      setCardW(Math.min(400, window.innerWidth - 32));
    }
    window.addEventListener('resize', onResize);
    return () => { alive = false; window.removeEventListener('resize', onResize); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, step, rect]);

  // Every way the tour ends — Finish, Skip tour, the ✕, Escape — lands back on the
  // Healthcare dashboard rather than wherever the last step happened to navigate to.
  function finish() {
    if (location.pathname !== TOUR_END_PATH) navigate(TOUR_END_PATH, { replace: true });
    onClose();
  }

  function next() { if (isLast) finish(); else setIndex((i) => i + 1); }
  function back() { setIndex((i) => Math.max(0, i - 1)); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, steps.length]);

  if (!step) return null;

  const pos = cardPos(rect, step.placement, cardW, cardH);
  const arrow = arrowPos(rect, step.placement, pos, cardW, cardH);

  const bg = isDark ? '#111113' : '#ffffff';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';
  const eyebrowColor = isDark ? '#c4b5fd' : '#7c3aed';
  const progressPct = ((index + 1) / steps.length) * 100;

  const hole = rect ? {
    top: rect.top - HOLE_PAD, left: rect.left - HOLE_PAD,
    width: rect.width + HOLE_PAD * 2, height: rect.height + HOLE_PAD * 2,
  } : null;

  return createPortal(
    <>
      {!step.noBlur && (hole ? (
        <>
          <div aria-hidden style={panelStyle({ top: 0, left: 0, width: '100vw', height: hole.top })} />
          <div aria-hidden style={panelStyle({ top: hole.top + hole.height, left: 0, width: '100vw', height: `calc(100vh - ${hole.top + hole.height}px)` })} />
          <div aria-hidden style={panelStyle({ top: hole.top, left: 0, width: hole.left, height: hole.height })} />
          <div aria-hidden style={panelStyle({ top: hole.top, left: hole.left + hole.width, width: `calc(100vw - ${hole.left + hole.width}px)`, height: hole.height })} />
        </>
      ) : (
        <div aria-hidden style={panelStyle({ top: 0, left: 0, width: '100vw', height: '100vh' })} />
      ))}

      {hole && (
        <div
          aria-hidden
          style={{
            position: 'fixed', top: hole.top, left: hole.left,
            width: hole.width, height: hole.height,
            borderRadius: 14, border: `2px solid ${ACCENT}`,
            boxShadow: `0 0 0 4px rgba(139,92,246,0.18), 0 0 20px rgba(139,92,246,0.35)`,
            pointerEvents: 'none', zIndex: 10000,
            transition: 'top .18s ease, left .18s ease, width .18s ease, height .18s ease',
          }}
        />
      )}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="false"
        aria-label={step.title}
        style={{
          position: 'fixed', top: pos.top, left: pos.left, width: cardW,
          background: bg, border: `1px solid ${line}`, borderRadius: 18,
          padding: 24, zIndex: 10001, boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
          transition: 'top .18s ease, left .18s ease',
        }}
      >
        {arrow && (
          <div aria-hidden style={{
            position: 'absolute', ...arrow, width: 12, height: 12,
            background: bg, border: `1px solid ${line}`, borderTop: 'none', borderLeft: 'none',
            transform: 'rotate(45deg)',
          }} />
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: eyebrowColor }}>
            {step.eyebrow} · {index + 1} OF {steps.length}
          </span>
          <button
            onClick={finish}
            aria-label="Close tour"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 2, lineHeight: 0, flexShrink: 0 }}
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <h3 style={{ margin: '10px 0 0', fontSize: 18, fontWeight: 700, color: fg }}>{step.title}</h3>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55, color: muted }}>{step.desc}</p>

        <div style={{ marginTop: 20, height: 3, borderRadius: 999, background: line }}>
          <div style={{
            height: '100%', borderRadius: 999, background: ACCENT,
            width: `${progressPct}%`, transition: 'width .2s ease',
          }} />
        </div>

        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={finish}
            style={{ background: 'none', border: 'none', fontSize: 13, color: muted, cursor: 'pointer', padding: '8px 4px' }}
          >
            Skip tour
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={back}
                aria-label="Previous step"
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: `1px solid ${line}`,
                  background: 'transparent', color: fg, cursor: 'pointer',
                  display: 'grid', placeItems: 'center',
                }}
              >
                <Icon name="arrowRight" size={13} style={{ transform: 'rotate(180deg)' }} />
              </button>
            )}
            <button
              onClick={next}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px',
                fontSize: 13.5, fontWeight: 600, borderRadius: 999, border: 'none',
                background: ACCENT, color: '#fff', cursor: 'pointer',
              }}
            >
              {isFirst ? 'Start tour' : isLast ? 'Finish' : 'Next'}
              {!isLast && <Icon name="arrowRight" size={13} />}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
