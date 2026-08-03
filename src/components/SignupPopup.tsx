import { useEffect, useState } from 'react';

const COUNTDOWN = 5;

function redirectToLogin() {
  const isLocalhost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';
  const callbackUrl = encodeURIComponent(
    isLocalhost
      ? `${window.location.origin}/sso/callback`
      : 'https://app.candy.cx/sso/callback'
  );
  const loginBase = isLocalhost ? 'http://localhost:5176' : 'https://spacemarvel.ai';
  window.location.href = `${loginBase}/login?redirect_uri=${callbackUrl}`;
}

interface Props {
  onClose: () => void;
}

export default function SignupPopup({ onClose }: Props) {
  const [seconds, setSeconds] = useState(COUNTDOWN);

  useEffect(() => {
    if (seconds <= 0) {
      redirectToLogin();
      return;
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'relative',
          background: 'var(--card-bg-strong)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          padding: '44px 40px',
          maxWidth: 420, width: '90%',
          boxShadow: 'var(--shadow-card), 0 0 80px rgba(117,91,227,0.25)',
          textAlign: 'center',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Countdown ring */}
        <div
          style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'var(--grad-brand)',
            display: 'grid', placeItems: 'center',
            fontSize: 32, fontWeight: 700, color: '#fff',
            margin: '0 auto 28px',
            boxShadow: '0 0 40px rgba(117,91,227,0.5)',
            transition: 'transform 0.3s',
          }}
        >
          {seconds}
        </div>

        <h2 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)', marginBottom: 12, lineHeight: 1.2 }}>
          Create your{' '}
          <span className="grad-text">free workspace</span>
        </h2>

        <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: 32, lineHeight: 1.65 }}>
          Redirecting you to sign up in{' '}
          <strong style={{ color: 'var(--text-1)' }}>
            {seconds} second{seconds !== 1 ? 's' : ''}
          </strong>
          .<br />
          Get full access to voice agents, chatbots, and automations.
        </p>

        <button
          onClick={() => { redirectToLogin(); }}
          className="btn-primary-shimmer"
          style={{
            width: '100%',
            background: 'var(--grad-brand)',
            color: '#fff', border: 'none',
            borderRadius: 'var(--radius)',
            padding: '14px 22px',
            fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 10px 30px -10px rgba(117,91,227,0.6)',
            marginBottom: 12,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            position: 'relative', overflow: 'hidden',
            letterSpacing: '0.01em',
          }}
        >
          Sign Up Now →
        </button>

        <button
          onClick={onClose}
          style={{
            width: '100%', background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 22px',
            fontSize: 13, color: 'var(--text-3)',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
        >
          Continue browsing
        </button>
      </div>
    </div>
  );
}
