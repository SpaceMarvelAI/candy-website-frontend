import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import posthog from 'posthog-js';
import { ssoCallback } from '../../api/auth';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

type Status = 'loading' | 'error';

export default function SSOCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { signedIn } = useApp();
  const [status, setStatus] = useState<Status>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('sso_token') || searchParams.get('token');

    if (!token) {
      setErrMsg('No SSO token found in the URL. Please try signing in again from SpaceMarvel.');
      setStatus('error');
      return;
    }

    // Read these BEFORE any storage wipe — they survive even if validation fails.
    const dashboardToken = searchParams.get('access_token');
    const pendingIntent  = localStorage.getItem('candy:sso_intent');

    let cancelled = false;

    // Validate the token first. Only clear storage on success — if the token
    // is invalid the existing session is left completely untouched.
    ssoCallback(token)
      .then(async ({ user }) => {
        if (cancelled) return;

        // ssoCallback already wrote candy.token + candy.user to localStorage
        // during validation — capture them before the wipe so they can be restored.
        const candyToken = localStorage.getItem('candy.token');

        // Token is valid — wipe ALL previous session data now.
        localStorage.clear();
        sessionStorage.clear();

        // Restore the newly validated candy session and the new SpaceMarvel bearer.
        if (candyToken) localStorage.setItem('candy.token', candyToken);
        localStorage.setItem('candy.user', JSON.stringify(user));
        if (dashboardToken) localStorage.setItem('dashboard_token', dashboardToken);

        posthog.identify(user.user_id, { email: user.email, name: user.full_name });
        if (user.company_id) posthog.group('company', user.company_id, { name: user.company_name });

        // If the user was trying to reach Metaspace/Finixy before being sent
        // to login, generate an SSO token for that app and redirect there.
        if (pendingIntent && dashboardToken) {
          try {
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const smApi   = isLocal ? '/sm-api' : 'https://dashboard-api.spacemarvel.ai';
            const res = await fetch(`${smApi}/api/rbac/auth/sso/generate/`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dashboardToken}` },
              body: JSON.stringify({ app_url: pendingIntent }),
            });
            if (res.ok) {
              const data     = await res.json().catch(() => ({}));
              const ssoToken = data.sso_token || data.token;
              if (ssoToken) {
                signedIn(user);   // update React state before leaving the tab
                const target = new URL(pendingIntent);
                target.searchParams.set('sso_token', ssoToken);
                target.searchParams.set('access_token', dashboardToken);
                // Hard redirect below can kill the identify()/group() request above before
                // it sends. send_instantly + sendBeacon forces it out via the browser's
                // beacon API, which survives page unload — fire-and-forget, no added latency.
                posthog.capture('login_completed', undefined, { send_instantly: true, transport: 'sendBeacon' });
                window.location.href = target.toString();
                return;
              }
            }
          } catch { /* fall through to dashboard */ }
        }

        window.history.replaceState({}, '', '/#/dashboard');
        signedIn(user);
      })
      .catch((err: any) => {
        if (cancelled) return;
        // Token invalid — do NOT clear storage, do NOT sign in.
        const msg = err?.detail
          ? (typeof err.detail === 'string' ? err.detail : err.detail?.detail)
          : err?.message;
        setErrMsg(msg || 'SSO sign-in failed. The token may have expired — please try again.');
        setStatus('error');
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--card-bg-strong)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          padding: '44px 40px',
          backdropFilter: 'blur(30px)',
          boxShadow: 'var(--shadow-card), 0 0 60px rgba(117,91,227,0.15)',
          textAlign: 'center',
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: 52, height: 52,
            borderRadius: 14,
            background: 'var(--grad-brand)',
            display: 'grid', placeItems: 'center',
            margin: '0 auto 28px',
            boxShadow: 'var(--shadow-glow-purple)',
          }}
        >
          <Icon name="layers" size={26} style={{ color: 'white' }} />
        </div>

        {status === 'loading' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
              Signing you in…
            </h2>
            <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
              Verifying your SpaceMarvel identity. This takes just a moment.
            </p>
            <div style={spinnerWrapStyle}>
              <div style={spinnerStyle} />
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-1)', marginBottom: 10 }}>
              Sign-in failed
            </h2>
            <div
              style={{
                background: 'rgba(255,90,120,0.1)',
                border: '1px solid rgba(255,90,120,0.35)',
                borderRadius: 10,
                padding: '12px 14px',
                color: '#ff8194',
                fontSize: 13,
                lineHeight: 1.55,
                marginBottom: 28,
                textAlign: 'left',
              }}
            >
              {errMsg}
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              style={{
                width: '100%',
                background: 'var(--grad-brand)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius)',
                padding: '13px 22px',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 8px 24px -8px rgba(117,91,227,0.55)',
              }}
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const spinnerWrapStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
};

const spinnerStyle: React.CSSProperties = {
  width: 36, height: 36,
  borderRadius: '50%',
  border: '3px solid var(--border-strong)',
  borderTopColor: 'var(--purple)',
  animation: 'spin 0.75s linear infinite',
};
