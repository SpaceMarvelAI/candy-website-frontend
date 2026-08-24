/**
 * Compact popover for one agent-config panel.
 *
 * Replaces the right-hand accordion column. That column was a fixed 420px for
 * four panels that are each opened briefly and then closed, so it permanently
 * cost the chat area a third of the width. As triggers in the top bar they take
 * a single row, and the panel itself gets more room than the old column had.
 *
 * Right-aligned by default so a wide panel opens back into the page rather than
 * off the right edge.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import Icon from '../../assets/icons';
import { useDialogA11y } from '../../hooks/useDialogA11y';

export default function ConfigPopover({
  label, icon, color, badge, width = 520, align = 'right',
  open: openProp, onOpenChange, children,
}: {
  label: string;
  icon: string;
  color: string;
  /** Small count beside the label, e.g. attached skills. */
  badge?: number;
  width?: number;
  align?: 'left' | 'right';
  /** Controlled mode. Requirements uses it so the prompt-library handoff can pop
   *  the panel open after loading a draft — behaviour the old accordion had via
   *  setReqOpen(true). Leave both undefined for normal uncontrolled use. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const [openSelf, setOpenSelf] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openSelf;
  const setOpen = useCallback((next: boolean) => {
    if (!controlled) setOpenSelf(next);
    onOpenChange?.(next);
  }, [controlled, onOpenChange]);
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), [setOpen]);
  // trapFocus false: these are editors, not modals — the page behind stays
  // usable, and trapping would strand keyboard users inside a config panel.
  useDialogA11y(panelRef, close, false);

  return (
    // flex:1 + minWidth:0 so the six pickers divide the bar evenly instead of
    // sizing to their labels and leaving dead space on the right.
    <div style={{ position: 'relative', flex: '1 1 150px', minWidth: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, width: '100%',
          padding: '8px 11px', borderRadius: 9, cursor: 'pointer',
          fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap',
          overflow: 'hidden',
          background: open ? `${color}1f` : 'var(--card-bg)',
          border: `1px solid ${open ? color : 'var(--border)'}`,
          color: 'var(--text-1)', transition: 'all 0.15s',
        }}
      >
        <Icon name={icon} size={13} style={{ color, flex: 'none' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            style={{
              fontSize: 10, fontWeight: 700, minWidth: 16, padding: '1px 5px',
              borderRadius: 99, background: `${color}2e`, color,
            }}
          >
            {badge}
          </span>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: 9 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open && (
        <>
          {/* Transparent click-away — the page stays visible behind the panel. */}
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="false"
            aria-label={label}
            tabIndex={-1}
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', zIndex: 61,
              ...(align === 'right' ? { right: 0 } : { left: 0 }),
              width: `min(92vw, ${width}px)`,
              maxHeight: 'min(70vh, 620px)', overflowY: 'auto',
              background: 'var(--bg-1)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 18px 44px rgba(8,12,20,0.22)',
              outline: 'none',
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, background: 'var(--bg-1)', zIndex: 1,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 650 }}>
                <Icon name={icon} size={14} style={{ color }} />
                {label}
              </span>
              <button
                type="button"
                onClick={close}
                aria-label={`Close ${label}`}
                style={{
                  width: 26, height: 26, display: 'grid', placeItems: 'center',
                  background: 'transparent', border: 'none', borderRadius: 7,
                  color: 'var(--text-3)', cursor: 'pointer',
                }}
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            {children}
          </div>
        </>
      )}
    </div>
  );
}
