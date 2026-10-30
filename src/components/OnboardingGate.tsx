/**
 * OnboardingGate — decides whether the user sees the setup pop-up, the "Finish setup" widget, or
 * nothing at all. Mount it ONCE, high up (App), not per page.
 *
 * It branches on ONE flag from the backend, `auto_open`, rather than re-deriving the rule from
 * `completed`/`dismissed`. That flag exists precisely so the frontend and the backend cannot drift
 * apart on it:
 *
 *   auto_open            -> open the pop-up at current_step
 *   !auto_open && !done  -> the user closed it; show the widget so the rest stays reachable
 *   completed            -> nothing, ever again
 *
 * WHY A WIDGET AND NOT JUST RE-OPENING THE POP-UP. Something that comes straight back after you
 * close it is the behaviour people hate; throwing away the remaining steps because they closed it
 * once is worse. The widget is the middle ground.
 */
import { useEffect, useState } from 'react';
import posthog from 'posthog-js';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { getToken } from '../api/client';
import { getOnboarding, type OnboardingState } from '../api/onboarding';
import OnboardingConnectorModal from './OnboardingConnectorModal';
import OnboardingModal from './OnboardingModal';
import { visibleProgress } from '../utils/onboardingProgress';

export default function OnboardingGate() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  // AppContext's SSO token exchange (a fresh LinkedIn/OIDC login) is asynchronous --
  // setToken() only runs once that network round trip finishes. A mount-once effect with
  // an empty dependency array checks getToken() before that exchange completes, finds
  // nothing, and never asks again. Depending on `user` here re-runs the check the moment
  // sign-in actually finishes, instead of only at the first (too-early) render.
  const { user } = useApp();

  const [state, setState] = useState<OnboardingState | null>(null);
  const [open, setOpen] = useState(false);
  /** Hides the widget for this page view only — not persisted. The server already knows the flow
   *  was dismissed; this is just "stop nudging me right now". */
  const [hidden, setHidden] = useState(false);
  // Tracks whether the GitHub-profile pre-step should show on this open. STATE, not a ref mutated
  // during render — a ref mutated in the render body reads differently across React StrictMode's
  // dev-only double-invoke of the render call (first call sees it false and returns the connector
  // step; the second call then sees the ref already flipped true and returns OnboardingModal
  // instead, which is the call React actually uses), so the connector pre-step could never appear
  // in local dev at all.
  const [connectorShown, setConnectorShown] = useState(false);

  useEffect(() => {
    // No session yet (login screen, logged out) — onboarding is not the concern then, and asking
    // would just produce a 401 in the console on every public page.
    if (!getToken()) return;

    let alive = true;
    getOnboarding()
      .then((s) => {
        if (!alive) return;
        setState(s);
        if (s.auto_open) { setOpen(true); setConnectorShown(true); }
      })
      // Deliberately silent: a user who cannot reach onboarding has a bigger problem, and this is
      // a nudge, not a feature they asked for. Never block the app on it.
      .catch(() => {});
    return () => { alive = false; };
  }, [user]);

  if (!state || state.completed) return null;

  if (open) {
    const sharedProps = {
      onClose: () => { setOpen(false); setConnectorShown(false); },
      onFinished: () => { setConnectorShown(false); getOnboarding().then(setState).catch(() => {}); },
    };

    // Show the GitHub-profile pre-step on first open. onClose/onFinished above clear
    // connectorShown either way, so a later widget re-open goes straight to the standard flow.
    if (connectorShown) {
      return <OnboardingConnectorModal {...sharedProps} />;
    }

    return <OnboardingModal {...sharedProps} />;
  }

  if (hidden) return null;

  // The server counts the `connectors` step Candy never shows, so its steps_total is 4 while the
  // pop-up has 3 screens. Show the count of what the user can actually see.
  const { done, total } = visibleProgress(state);

  const bg = isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.96)';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';

  return (
    <div data-tour="finish-setup" style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9998 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px 10px 16px',
        borderRadius: 999, border: `1px solid ${line}`, background: bg,
        boxShadow: '0 10px 25px rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
      }}>
        <button
          onClick={() => { posthog.capture('onboarding_widget_reopened', { product: 'candy' }); setOpen(true); }}
          aria-label={`Finish setup, ${done} of ${total} done`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'none',
            border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
          }}
        >
          <Icon name="spark" size={16} style={{ color: '#fbbf24' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: fg }}>Finish setup</span>
          <span style={{ fontSize: 12, color: muted }}>
            {done} of {total}
          </span>
        </button>
        <button
          onClick={() => setHidden(true)}
          aria-label="Hide for now"
          title="Hide for now — it will be back next time"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 6, lineHeight: 0 }}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    </div>
  );
}
