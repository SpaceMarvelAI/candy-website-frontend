/**
 * Where the install's sign-in mode (GET /v1/auth/mode, src/api/standalone.ts) is kept between
 * loads. It is install config, not auth data, so it must survive the "wipe everything" steps of
 * sign-out and the OIDC callback — otherwise the next load has nothing stored and (on a slow or
 * failed mode check) can't tell which login to show. Kept apart from standalone.ts so auth.ts can
 * use it without an import cycle.
 */
export const AUTH_MODE_KEY = 'candy.auth_mode';

export type StoredModeName = 'ecosystem' | 'standalone';

export function storedAuthModeName(): StoredModeName | null {
  try {
    const raw = localStorage.getItem(AUTH_MODE_KEY);
    const mode = raw ? JSON.parse(raw)?.mode : null;
    return mode === 'standalone' || mode === 'ecosystem' ? mode : null;
  } catch { return null; }
}

/** localStorage.clear(), keeping only the stored sign-in mode. */
export function clearLocalStorageKeepingAuthMode(): void {
  let kept: string | null = null;
  try { kept = localStorage.getItem(AUTH_MODE_KEY); } catch { /* blocked */ }
  try { localStorage.clear(); } catch { /* blocked */ }
  if (kept) { try { localStorage.setItem(AUTH_MODE_KEY, kept); } catch { /* blocked */ } }
}
