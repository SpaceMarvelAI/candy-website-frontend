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
