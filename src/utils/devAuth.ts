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

    // Respect an explicit sign-out for this one page load, then resume normal reseeding —
    // otherwise fullLogout()'s local wipe gets silently undone the moment the page reloads.
    if (localStorage.getItem('candy.dev_logout')) {
      localStorage.removeItem('candy.dev_logout');
      console.info('[devAuth] skipping reseed — user just signed out');
      return;
    }

    const token = import.meta.env.VITE_DEV_TOKEN as string | undefined;
    const userRaw = import.meta.env.VITE_DEV_USER as string | undefined;
    if (!token || !userRaw) return;

    // Always (re)seed on localhost when a dev token is configured — this
    // overwrites any stale/expired token left by an earlier SSO attempt that
    // would otherwise 401 and bounce back to the production callback.
    // sessionStorage, NOT localStorage: the app is session-scoped now (see
    // client.ts getToken/setToken), so a localStorage seed would never be read
    // and localhost would appear permanently signed out. This also makes a dev
    // session end on browser close, matching production.
    sessionStorage.setItem('access_token', token);
    sessionStorage.setItem('candy.user', userRaw);
    // Drop any legacy localStorage copy so it can't linger and confuse debugging.
    try {
      localStorage.removeItem('access_token');
      localStorage.removeItem('candy.user');
    } catch { /* ignore */ }
    // eslint-disable-next-line no-console
    console.info('[devAuth] localhost dev session seeded — skipping SSO');
  } catch {
    /* ignore — never block boot */
  }
}
