/**
 * Holds the app until the install's sign-in mode is known (src/api/standalone.ts). Only shown when
 * nothing is stored yet AND the boot check was slow or failed: guessing "Dashboard" there would send
 * a standalone install to a login page it doesn't have, so it says "Checking sign-in…" and offers
 * Retry instead.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { authModeKnown, fetchAuthMode } from '../api/standalone';

export function AuthModeGate({ children }: { children: ReactNode }) {
  const [known, setKnown] = useState(authModeKnown);
  const [checking, setChecking] = useState(!known);

  const check = useCallback(() => {
    setChecking(true);
    fetchAuthMode()
      .then(m => { if (m) setKnown(true); })
      .finally(() => setChecking(false));
  }, []);

  // Once, on mount (`check` never changes): only when the boot check left the mode unknown.
  useEffect(() => { if (!authModeKnown()) check(); }, [check]);

  if (known) return <>{children}</>;
  return (
    <div role="status" style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16,
      background: 'var(--bg, #0b0b0f)', color: 'var(--text-1, #e5e7eb)', fontSize: 14,
    }}>
      {checking ? <span>Checking sign-in…</span> : (
        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center', maxWidth: 360 }}>
          <span>We couldn’t reach Candy to check how to sign in.</span>
          <button type="button" onClick={check} style={{
            padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border, #333)',
            background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 14,
          }}>Retry</button>
        </div>
      )}
    </div>
  );
}
