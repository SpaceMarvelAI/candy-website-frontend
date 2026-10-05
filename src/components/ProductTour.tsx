/**
 * ProductTour — spotlight-popover walkthrough of the nav rail, sidebar and topbar. Triggered
 * manually from Profile → Help → Product Tour (AppRail.tsx), never auto-opened.
 *
 * No dimming backdrop: steps point at real, still-clickable parts of the shell (reference
 * designs do the same — the Connectors step is a live page behind the card), so this is a
 * coach-mark, not a blocking modal. A step is dropped up front if its `data-tour` anchor isn't
 * in the DOM when the tour opens (e.g. "finish-setup" once onboarding is already done).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { PRODUCT_TOUR_STEPS, type TourPlacement, type TourStep } from '../data/productTour';

const ACCENT = '#8b5cf6';
const MARGIN = 16;

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

  // Snapshot once, at open: drop any step whose anchor isn't currently mounted.
  const [steps] = useState<TourStep[]>(() =>
    PRODUCT_TOUR_STEPS.filter((s) => s.anchor === null || findAnchor(s.anchor))
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardW, setCardW] = useState(() => Math.min(400, window.innerWidth - 32));
  const [cardH, setCardH] = useState(240);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  useEffect(() => {
    function update() {
      setRect(step?.anchor ? findAnchor(step.anchor)?.getBoundingClientRect() ?? null : null);
      setCardW(Math.min(400, window.innerWidth - 32));
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [index, step, rect]);

  function next() { if (isLast) onClose(); else setIndex((i) => i + 1); }
  function back() { setIndex((i) => Math.max(0, i - 1)); }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
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

  return createPortal(
    <>
      {rect && (
        <div
          aria-hidden
          style={{
            position: 'fixed', top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
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
            onClick={onClose}
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
            onClick={onClose}
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
