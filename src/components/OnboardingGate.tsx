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
import { getToken } from '../api/client';
import { getOnboarding, type OnboardingState } from '../api/onboarding';
import OnboardingModal from './OnboardingModal';

export default function OnboardingGate({ canInvite = true }: { canInvite?: boolean }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [state, setState] = useState<OnboardingState | null>(null);
  const [open, setOpen] = useState(false);
  /** Hides the widget for this page view only — not persisted. The server already knows the flow
   *  was dismissed; this is just "stop nudging me right now". */
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    // No session yet (login screen, logged out) — onboarding is not the concern then, and asking
    // would just produce a 401 in the console on every public page.
    if (!getToken()) return;

    let alive = true;
    getOnboarding()
      .then((s) => {
        if (!alive) return;
        setState(s);
        if (s.auto_open) setOpen(true);
      })
      // Deliberately silent: a user who cannot reach onboarding has a bigger problem, and this is
      // a nudge, not a feature they asked for. Never block the app on it.
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state || state.completed) return null;

  if (open) {
    return (
      <OnboardingModal
        canInvite={canInvite}
        onClose={() => setOpen(false)}
        onFinished={() => getOnboarding().then(setState).catch(() => {})}
      />
    );
  }

  if (hidden) return null;

  const bg = isDark ? 'rgba(24,24,27,0.92)' : 'rgba(255,255,255,0.96)';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9998 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px 10px 16px',
        borderRadius: 999, border: `1px solid ${line}`, background: bg,
        boxShadow: '0 10px 25px rgba(0,0,0,0.25)', backdropFilter: 'blur(6px)',
      }}>
        <button
          onClick={() => { posthog.capture('onboarding_widget_reopened', { product: 'candy' }); setOpen(true); }}
          aria-label={`Finish setup, ${state.steps_done} of ${state.steps_total} done`}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, background: 'none',
            border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
          }}
        >
          <Icon name="spark" size={16} style={{ color: '#fbbf24' }} />
          <span style={{ fontSize: 14, fontWeight: 500, color: fg }}>Finish setup</span>
          <span style={{ fontSize: 12, color: muted }}>
            {state.steps_done} of {state.steps_total}
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
