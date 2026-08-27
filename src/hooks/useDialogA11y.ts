import { useEffect } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Baseline dialog accessibility: focus the dialog on mount, close on Escape,
 * optionally trap Tab inside it, and return focus to whatever opened it.
 *
 * Originally lived in `pages/flows/NodeEditDrawer.tsx`. Moved here so shared
 * components can use it without importing from a page.
 *
 * `trapFocus` is deliberately opt-in: trapping is right for a modal that must be
 * answered (a destructive confirm) and wrong for a side drawer whose page stays
 * operable behind it — trapping there strands keyboard users.
 */
export function useDialogA11y(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  trapFocus = false,
) {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (!trapFocus || e.key !== 'Tab' || !ref.current) return;
      const els = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first)      { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [ref, onClose, trapFocus]);
}
