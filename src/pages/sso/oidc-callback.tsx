import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setToken } from '../../api/client';
import { storeUser, type AuthUser } from '../../api/auth';
import { useApp } from '../../context/AppContext';
import Icon from '../../assets/icons';

type Status = 'loading' | 'error';

/**
 * OIDC callback landing page.
 *
 * NOTE: confirmed via live testing that this page does NOT mount on a real login —
 * the backend redirects to a plain path (https://app.candy.cx/sso/oidc/callback?...,
 * no "#"), and this app uses HashRouter, which resolves that to route "/" (RootRedirect),
 * not this route. AppContext's own SSO-token interceptor (which reads window.location.search
 * directly, unrouted) is the code path that actually runs — including the ticket-claim
 * logic, which used to live here and raced AppContext's claim for the same single-use
 * ticket (confirmed live: 3 concurrent /prompts/claim calls for one ticket, 2 failed).
 * Kept as a harmless fallback UI in case this route is ever reached via client-side nav
 * with a real "#/sso/oidc/callback" (e.g. a hand-typed or bookmarked hash URL).
 */
export default function OIDCCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { signedIn }   = useApp();
  const [status, setStatus] = useState<Status>('loading');
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    const accessToken = searchParams.get('access_token');
    const userId      = searchParams.get('user_id');

    if (!accessToken || !userId) {
      setErrMsg('No session token found in the URL. Please try signing in again from SpaceMarvel.');
      setStatus('error');
      return;
    }

    const user: AuthUser = {
      user_id:      userId,
      email:        searchParams.get('email') || '',
      role:         searchParams.get('role') || 'viewer',
      company_id:   searchParams.get('company_id') || '',
      company_name: searchParams.get('company_name') || '',
      full_name:    searchParams.get('name') || null,
    };

    try { localStorage.clear(); sessionStorage.clear(); } catch {}

    setToken(accessToken);
    storeUser(user);
    signedIn(user);
    navigate('/dashboard');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
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
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  width: 36, height: 36,
                  borderRadius: '50%',
                  border: '3px solid var(--border-strong)',
                  borderTopColor: 'var(--purple)',
                  animation: 'spin 0.75s linear infinite',
                }}
              />
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
              onClick={() => navigate('/')}
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
              Back to home
            </button>
          </>
        )}
      </div>
    </div>
  );
}
