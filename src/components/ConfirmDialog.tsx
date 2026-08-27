/**
 * In-app replacement for `window.confirm()`.
 *
 * The native dialog was being used for four irreversible deletes. It cannot be
 * styled, announces the origin ("localhost:3000 says"), gives the destructive and
 * the safe choice identical weight, and puts focus on OK — so Return deletes.
 *
 * Promise-based on purpose: call sites keep the shape they already had,
 *
 *     if (!await confirm({ … })) return;
 *
 * so adopting it is a one-line change per site rather than a state rewrite.
 */
import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y';

export interface ConfirmOptions {
  title: string;
  /** Supporting detail. Newlines render as separate paragraphs. */
  body?: string;
  /** Action label, e.g. "Delete agent" — say what happens, never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red styling + warning glyph. Defaults to true; every current caller deletes. */
  danger?: boolean;
  /** Callout line naming exactly what will be destroyed. */
  consequence?: string;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>(resolve => { resolverRef.current = resolve; });
  }, []);

  const settle = useCallback((ok: boolean) => {
    setOpts(null);
    resolverRef.current?.(ok);
    resolverRef.current = null;
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && <ConfirmCard opts={opts} onSettle={settle} />}
    </ConfirmContext.Provider>
  );
}

/** Split out so useDialogA11y's effects run only while the dialog is mounted. */
function ConfirmCard({ opts, onSettle }: { opts: ConfirmOptions; onSettle: (ok: boolean) => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const cancel = useCallback(() => onSettle(false), [onSettle]);
  // trapFocus: true — a destructive confirm must be answered before anything else
  // is reachable.
  useDialogA11y(cardRef, cancel, true);

  const danger = opts.danger !== false;
  // Theme tokens, so the dialog follows dark mode. The rgba tints stay literal —
  // they are low-alpha overlays that read correctly on either ground.
  const accent = danger ? 'var(--red)' : 'var(--blue)';
  const paragraphs = useMemo(
    () => (opts.body ?? '').split('\n').map(s => s.trim()).filter(Boolean),
    [opts.body],
  );

  return (
    <div
      onClick={cancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'rgba(8,12,20,0.55)', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={paragraphs.length ? 'confirm-body' : undefined}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 60px rgba(8,12,20,0.28)',
          padding: '22px 24px 18px',
          outline: 'none',
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <div
            aria-hidden="true"
            style={{
              flex: 'none', width: 38, height: 38, borderRadius: 10,
              display: 'grid', placeItems: 'center',
              background: danger ? 'rgba(217,45,32,0.10)' : 'rgba(37,99,235,0.10)',
              color: accent, fontSize: 19, fontWeight: 700, lineHeight: 1,
            }}
          >
            {danger ? '!' : '?'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2
              id="confirm-title"
              style={{
                margin: 0, fontSize: 16.5, fontWeight: 650, lineHeight: 1.3,
                color: 'var(--text-1)', textWrap: 'balance',
              }}
            >
              {opts.title}
            </h2>
            {paragraphs.length > 0 && (
              <div id="confirm-body" style={{ marginTop: 8 }}>
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    style={{
                      margin: i === 0 ? 0 : '8px 0 0',
                      fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-3)',
                    }}
                  >
                    {p}
                  </p>
                ))}
              </div>
            )}
            {opts.consequence && (
              <div
                style={{
                  marginTop: 12, padding: '9px 11px',
                  borderRadius: 'var(--radius)',
                  background: danger ? 'rgba(217,45,32,0.06)' : 'var(--bg-2)',
                  borderLeft: `2px solid ${accent}`,
                  fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-2)',
                }}
              >
                {opts.consequence}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9, justifyContent: 'flex-end', marginTop: 20 }}>
          {/* Cancel is first in DOM order so it receives initial focus and Return
              is safe. The native dialog focused OK, which made Return destructive. */}
          <button
            type="button"
            onClick={cancel}
            style={{
              padding: '9px 15px', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-1)', color: 'var(--text-1)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => onSettle(true)}
            style={{
              padding: '9px 15px', borderRadius: 'var(--radius)',
              border: `1px solid ${accent}`, background: accent, color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {opts.confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
