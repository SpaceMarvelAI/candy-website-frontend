import { useEffect, useState } from 'react';
import Icon from '../../assets/icons';
import { API_BASE } from '../../api/client';

// Sign in via the OIDC Authorization-Code flow: hit the Candy backend's /login, which
// bounces through the dashboard and redirects back to /sso/oidc/callback with the token.
const SIGNIN_URL = `${API_BASE}/v1/auth/sso/oidc/login?return_to=${encodeURIComponent(window.location.origin)}`;

export default function LandingPage() {
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    if (seconds <= 0) {
      window.location.href = SIGNIN_URL;
      return;
    }
    const t = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Logo */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 48,
        }}
      >
        <div
          className="logo-mark-shine"
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'var(--grad-brand)',
            display: 'grid',
            placeItems: 'center',
            boxShadow: 'var(--shadow-glow-purple)',
            position: 'relative',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          <Icon name="layers" size={26} style={{ position: 'relative', zIndex: 1, color: '#fff' }} />
        </div>
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--text-1)',
          }}
        >
          Meta<span className="grad-text">space</span>
        </span>
      </div>

      {/* Headline */}
      <h1
        style={{
          fontSize: 'clamp(32px, 5vw, 52px)',
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: '-0.03em',
          color: 'var(--text-1)',
          textAlign: 'center',
          maxWidth: 600,
          margin: '0 0 20px',
        }}
      >
        Your <span className="grad-text">meta workspace</span> is ready.
      </h1>

      <p
        style={{
          fontSize: 16,
          color: 'var(--text-3)',
          textAlign: 'center',
          maxWidth: 440,
          lineHeight: 1.65,
          margin: '0 0 48px',
        }}
      >
        Chat with AI, build automations, and deploy voice agents across
        industries — from a single command center.
      </p>

      {/* CTA */}
      <a
        href={SIGNIN_URL}
        className="btn-primary-shimmer"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          padding: '15px 32px',
          background: 'var(--grad-brand)',
          color: '#fff',
          borderRadius: 'var(--radius)',
          fontSize: 15,
          fontWeight: 600,
          textDecoration: 'none',
          boxShadow: '0 12px 36px -10px rgba(117,91,227,0.65)',
          letterSpacing: '0.01em',
          position: 'relative',
          overflow: 'hidden',
          transition: 'transform 0.15s, box-shadow 0.2s',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 16px 40px -10px rgba(117,91,227,0.75)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.transform = '';
          (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 36px -10px rgba(117,91,227,0.65)';
        }}
      >
        <Icon name="layers" size={16} />
        Sign in with SpaceMarvel
        <Icon name="arrowRight" size={14} />
      </a>

      {/* Footer hint */}
      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: 'var(--text-4)',
          textAlign: 'center',
        }}
      >
        Redirecting in {seconds}s — or click above to sign in now.
      </p>
    </div>
  );
}
