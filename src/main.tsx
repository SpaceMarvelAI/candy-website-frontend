import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import App from './App'
import './styles/globals.css'
import { GlobalErrorBoundary } from './components/ErrorBoundary'
import { logger } from './utils/logger'
import { installDevAuth } from './utils/devAuth'

// Localhost-only: seed a dev session before React mounts so the app doesn't
// bounce to the (production-only) OIDC callback. No-op in production builds.
installDevAuth()

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
      <HashRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </HashRouter>
    </GlobalErrorBoundary>
  </React.StrictMode>,
)
