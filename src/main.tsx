import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { AppProvider } from './context/AppContext'
import App from './App'
import './styles/globals.css'
import { GlobalErrorBoundary } from './components/ErrorBoundary'
import { logger } from './utils/logger'

// Strips access/refresh tokens from any URL PostHog would otherwise capture
// verbatim (e.g. $current_url on autocaptured events) — the SSO/OIDC callback
// routes in this app briefly carry raw tokens in the query string/hash.
const SENSITIVE_URL_PARAMS = ['access_token', 'refresh_token', 'token', 'sso_token', 'code'];
function stripSensitiveParams(url: string): string {
  try {
    const u = new URL(url);
    let changed = false;
    for (const p of SENSITIVE_URL_PARAMS) {
      if (u.searchParams.has(p)) {
        u.searchParams.set(p, 'REDACTED');
        changed = true;
      }
    }
    return changed ? u.toString() : url;
  } catch {
    return url;
  }
}

// Product analytics (PostHog). No-op if the key is unset (e.g. local dev).
// Max-privacy session replay posture — Candy handles business calls, so mask
// everything by default rather than opting specific fields out.
const posthogKey = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
    },
    capture_exceptions: true, // error tracking — feeds PostHog's Error Tracking product
    capture_heatmaps: true, // feeds PostHog's Heatmaps toolbar (enable_heatmaps is the deprecated alias)
    before_send: (cr) => {
      if (!cr) return cr;
      if (typeof cr.properties?.$current_url === 'string') {
        cr.properties.$current_url = stripSensitiveParams(cr.properties.$current_url);
      }
      if (typeof cr.properties?.$referrer === 'string') {
        cr.properties.$referrer = stripSensitiveParams(cr.properties.$referrer);
      }
      return cr;
    },
  });
}

// ── Global error listeners ────────────────────────────────────────────────────
// Catches errors that escape React's error boundaries (e.g. event handlers,
// setTimeout callbacks, third-party scripts).

window.addEventListener('error', (event) => {
  logger.error('[window:error] Uncaught runtime error', {
    message:  event.message,
    filename: event.filename,
    lineno:   event.lineno,
    colno:    event.colno,
    stack:    event.error?.stack,
    error:    event.error,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('[window:unhandledrejection] Unhandled Promise rejection', {
    reason:  event.reason,
    message: event.reason?.message,
    stack:   event.reason?.stack,
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <PostHogProvider client={posthog}>
        <HashRouter>
          <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </PostHogProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>,
)
