import { useEffect } from 'react';
import Icon from '../../assets/icons';

export default function ComposioCallbackPage() {
  const params  = new URLSearchParams(window.location.search);
  const appName = params.get('appName') ?? params.get('app') ?? 'App';
  const status  = params.get('status') ?? 'success';
  const success = status === 'success' || status === 'connected';

  useEffect(() => {
    try {
      window.opener?.postMessage(
        { type: 'composio-connected', app: appName, status },
        window.location.origin
      );
    } catch {}

    const t = setTimeout(() => { try { window.close(); } catch {} }, 1200);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-0)',
        padding: 24,
      }}
    >
      <div
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: success ? 'rgba(76,175,80,0.15)' : 'rgba(255,92,122,0.12)',
            border: `1px solid ${success ? 'rgba(76,175,80,0.4)' : 'rgba(255,92,122,0.4)'}`,
            display: 'grid', placeItems: 'center',
            fontSize: 26,
            color: success ? 'var(--green)' : 'var(--red)',
          }}
        >
          <Icon name={success ? 'check' : 'x'} size={26} />
        </div>

        <div>
          <h2
            style={{
              fontSize: 18, fontWeight: 700,
              color: success ? 'var(--green)' : 'var(--red)',
              margin: '0 0 6px',
            }}
          >
            {success ? `Connected to ${appName}!` : 'Connection failed'}
          </h2>
          <p style={{ color: 'var(--text-3)', fontSize: 13, margin: 0 }}>
            Closing window…
          </p>
        </div>
      </div>
    </div>
  );
}
