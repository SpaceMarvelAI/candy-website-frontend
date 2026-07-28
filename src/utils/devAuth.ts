// Localhost-only dev auto-login. Runs before React mounts so the app boots
// already authenticated — bypassing the OIDC redirect, which can't complete
// on localhost (the callback is registered for production only).
//
// Enabled ONLY when BOTH hold:
//   • the page is served from localhost / 127.0.0.1, AND
//   • VITE_DEV_TOKEN is set (in .env.local, git-ignored, dev machines only).
// A production build without VITE_DEV_TOKEN is a complete no-op.

export function installDevAuth(): void {
  try {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal) return;

    const token = import.meta.env.VITE_DEV_TOKEN as string | undefined;
    const userRaw = import.meta.env.VITE_DEV_USER as string | undefined;
    if (!token || !userRaw) return;

    // Always (re)seed on localhost when a dev token is configured — this
    // overwrites any stale/expired token left by an earlier SSO attempt that
    // would otherwise 401 and bounce back to the production callback.
    localStorage.setItem('access_token', token);
    localStorage.setItem('candy.user', userRaw);
    // SSO paths also read sessionStorage first — clear it so localStorage wins.
    try {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('candy.user');
    } catch { /* ignore */ }
    // eslint-disable-next-line no-console
    console.info('[devAuth] localhost dev session seeded — skipping SSO');
  } catch {
    /* ignore — never block boot */
  }
}
