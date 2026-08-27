import { useEffect } from 'react';
import Icon from '../../assets/icons';
import { redirectToOIDC } from '../../utils/sso';
import { consumeSignedOutFlag } from '../../api/auth';
import { useDebugLifecycle } from '../../utils/useDebugLifecycle';

export default function LandingPage() {
  // Flagged High in debug/AUDIT.md — the app's only unauthenticated entry point.
  useDebugLifecycle('LandingPage');
  // Redirect straight to sign-in — no countdown. Uses redirectToOIDC() (not a
  // locally-built URL) so a `?ticket=` from the Prompt Library handoff gets stashed
  // into sessionStorage before we leave for login — see utils/sso.ts for why the
  // OIDC round-trip alone can't carry it (return_to only preserves the origin).
  //
  // MUST NOT fire while AppContext's SSO interceptor is already processing an
  // incoming ?access_token=/?token= on this exact page load — this page renders
  // (via RootRedirect, `user` still null pre-hydration) at the SAME time that
  // interceptor's async exchange is in flight. Firing here launches a SECOND,
  // fully independent OIDC login cycle carrying the SAME ?ticket=, which lands a
  // second /prompts/claim call for an already-consumed single-use ticket (404).
  // Confirmed live: two complete parallel login cycles, one ticket, one 404.
  // MUST NOT fire on the mount immediately after a sign-out either. fullLogout()
  // can only clear the IDP's httpOnly cookie when logout-everywhere succeeded; if
  // it didn't, bouncing straight back to the IDP re-authenticates the user we just
  // signed out, which reads as "sign out did nothing". In that case render this
  // page so signing back in is a deliberate click.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hasIncomingToken =
      params.has('access_token') || params.has('token') || params.has('sso_token');
    if (hasIncomingToken) return;
    if (consumeSignedOutFlag()) return;
    redirectToOIDC();
  }, []);

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
      <button
        onClick={redirectToOIDC}
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
          border: 'none',
          cursor: 'pointer',
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
      </button>

      {/* Footer hint */}
      <p
        style={{
          marginTop: 32,
          fontSize: 12,
          color: 'var(--text-4)',
          textAlign: 'center',
        }}
      >
        Redirecting to sign in… — or click above to sign in now.
      </p>
    </div>
  );
}
