import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ssoCallback } from '../../api/auth';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

type Status = 'loading' | 'error';

export default function SSOCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { signedIn }   = useApp();
  const [status, setStatus] = useState<Status>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    // SpaceMarvel sends the token as ?sso_token=; backend expects ?token=
    const token = searchParams.get('sso_token') || searchParams.get('token');

    if (!token) {
      setErrMsg('No SSO token found in the URL. Please try signing in again from SpaceMarvel.');
      setStatus('error');
      return;
    }

    let cancelled = false;

    ssoCallback(token)
      .then(({ user }) => {
        if (cancelled) return;
        // Clear the token from the URL so it can't be reused via browser history
        window.history.replaceState({}, '', '/dashboard');
        signedIn(user);
      })
      .catch((err: any) => {
        if (cancelled) return;
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
