/**
 * Three error-boundary variants:
 *
 *  GlobalErrorBoundary  — wraps the entire React tree in main.tsx.
 *                         Shows a full-page crash screen with a reload button.
 *
 *  RouteErrorBoundary   — wraps individual lazy-loaded route components.
 *                         Shows a mid-page error panel so the sidebar/topbar stay alive.
 *
 *  ComponentErrorBoundary — wraps individual UI widgets (e.g. KnowledgeBase, TestPanel).
 *                           Shows a compact inline error with the component name.
 *
 * All three log via logger.error so the crash is traceable from the console.
 */
import React from 'react';
import posthog from 'posthog-js';
import { logger } from '../utils/logger';
import Icon from '../assets/icons';

// ── Base ─────────────────────────────────────────────────────────────────────

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

interface BaseProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  label?: string;
}

class ErrorBoundaryBase extends React.Component<BaseProps, State> {
  constructor(props: BaseProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const label = this.props.label ?? 'ErrorBoundary';
    logger.error(`[${label}] React render error caught`, {
      message:        error.message,
      stack:          error.stack,
      componentStack: errorInfo.componentStack,
    });
    // capture_exceptions autocapture only sees window-level errors — React
    // ErrorBoundary catches render errors before they ever reach window.onerror,
    // so without this explicit call they'd be invisible to PostHog entirely.
    posthog.captureException(error, { boundary: label, componentStack: errorInfo.componentStack });
    this.props.onError?.(error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      // Generic inline fallback (dev: shows details; prod: keeps it terse)
      const isDev = (import.meta as any).env?.DEV === true;
      return (
        <div style={inlineError}>
          <strong>Something went wrong</strong>
          {isDev && (
            <pre style={devStack}>
              {this.state.error?.message}
              {'\n\n--- Component stack ---\n'}
              {this.state.errorInfo?.componentStack}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

// ── GlobalErrorBoundary ───────────────────────────────────────────────────────

export function GlobalErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryBase
      label="GlobalErrorBoundary"
      fallback={<GlobalCrashScreen />}
    >
      {children}
    </ErrorBoundaryBase>
  );
}

function GlobalCrashScreen() {
  return (
    <div style={fullPage}>
      <div style={{ color: '#ff8194' }}><Icon name="alert" size={36} /></div>
      <h2 style={{ margin: '12px 0 8px', fontSize: 20, color: '#ff8194', fontWeight: 700 }}>
        Application Error
      </h2>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.55)', maxWidth: 380, textAlign: 'center' }}>
        The application crashed unexpectedly. Open the browser console for
        the full stack trace.
      </p>
      <button
        style={reloadBtn}
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  );
}

// ── RouteErrorBoundary ────────────────────────────────────────────────────────

export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryBase
      label="RouteErrorBoundary"
      fallback={<RouteErrorScreen />}
    >
      {children}
    </ErrorBoundaryBase>
  );
}

function RouteErrorScreen() {
  return (
    <div style={midPage}>
      <div style={{ color: '#ff8194' }}><Icon name="alert" size={28} /></div>
      <h3 style={{ margin: '10px 0 6px', fontSize: 16, color: '#ff8194', fontWeight: 700 }}>
        Page Error
      </h3>
      <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
        This page crashed — check the console for details. Use the sidebar to
        navigate to a working section.
      </p>
    </div>
  );
}

// ── ComponentErrorBoundary ────────────────────────────────────────────────────

export function ComponentErrorBoundary({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <ErrorBoundaryBase label={label ?? 'ComponentErrorBoundary'}>
      {children}
    </ErrorBoundaryBase>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const fullPage: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  minHeight:      '100vh',
  gap:            8,
  background:     'var(--bg-0, #0d0d12)',
  padding:        '32px 24px',
};

const midPage: React.CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  minHeight:      '50vh',
  gap:            6,
  padding:        '40px 24px',
};

const inlineError: React.CSSProperties = {
  background:   'rgba(255,90,120,0.08)',
  border:       '1px solid rgba(255,90,120,0.3)',
  borderRadius: 10,
  color:        '#ff8194',
  padding:      '12px 14px',
  fontSize:     13,
};

const devStack: React.CSSProperties = {
  marginTop:  10,
  fontSize:   10,
  whiteSpace: 'pre-wrap',
  wordBreak:  'break-all',
  opacity:    0.75,
};

const reloadBtn: React.CSSProperties = {
  marginTop:    16,
  padding:      '9px 22px',
  background:   'rgba(255,90,120,0.12)',
  border:       '1px solid rgba(255,90,120,0.35)',
  borderRadius: 8,
  color:        '#ff8194',
  cursor:       'pointer',
  fontSize:     13,
  fontWeight:   600,
};
