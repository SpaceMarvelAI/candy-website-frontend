/**
 * OnboardingModal — the 3-step setup pop-up. Designs: docs/workspace-onboarding/screens/04..07.
 *
 * Talks to CANDY's backend (`/v1/onboarding`), which forwards to the dashboard using the token it
 * already stores per user. State lives on the dashboard, one row per user — not here and not in
 * localStorage. That is what makes the flow resumable across a reload, across a workspace switch,
 * and across products: start it here, finish it in MetaSpace, never asked twice.
 *
 * THREE THINGS THAT LOOK LIKE DETAILS AND ARE NOT:
 *
 * 1. The ✕ DISMISSES, it does not complete. It stops the pop-up auto-opening but leaves the
 *    remaining steps reachable from the "Finish setup" widget. Wiring ✕ to complete would mean
 *    anyone who closes it on step 1 never sees the rest again.
 * 2. An empty step is submitted as a SKIP, not as an answer. The backend refuses a null value on
 *    purpose (400 value_required), and leaving a step blank genuinely is skipping it.
 * 3. Candy does NOT show the shared flow's `connectors` step — its tiles only recorded intent and
 *    never opened a real connection. The dashboard may still list it, so it is filtered out here.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { errorMessage } from '../utils/apiError';
import {
  completeOnboarding,
  dismissOnboarding,
  getOnboarding,
  saveOnboardingStep,
  skipOnboardingStep,
  type OnboardingState,
  type OnboardingStep,
} from '../api/onboarding';

/** Screen 04, multi-select. Not validated by the backend — the options differ per product and
 *  change with pricing, so a server-side list would need a deploy every time. */
const MANAGE_OPTIONS = [
  'Customer Support Calls', 'Appointment & Scheduling', 'Workflow Automation',
  'Research & Writing', 'Content & Social Media', 'Prompt & AI Workflows',
  'Finance & Accounting', 'Reporting & CFO Insights',
];

/** The shared flow's steps minus `connectors`, which Candy does not show (note 3). */
type ShownStep = Exclude<OnboardingStep, 'connectors'>;

const STEP_COPY: Record<ShownStep, { title: string; sub: string }> = {
  choose:     { title: 'What would you like to manage?', sub: "We'll take you exactly where you need to go." },
  number:     { title: "What's your number?", sub: 'So your agents can reach you, and call on your behalf.' },
  invite:     { title: 'Invite people to your workspace', sub: 'Great tools are more fun with witnesses.' },
};

const ALL_STEPS: ShownStep[] = ['choose', 'number', 'invite'];

export default function OnboardingModal({
  onClose,
  onFinished,
  canInvite = true,
  preview = false,
}: {
  /** The ✕ / backdrop. Dismisses (recoverable) — never completes. */
  onClose: () => void;
  onFinished?: () => void;
  /**
   * false when the user is on a PERSONAL subscription workspace — the backend refuses invitations
   * there (403), so offering an input would only produce an error.
   */
  canInvite?: boolean;
  /** Testing only (Help → Onboarding): walk the screens locally, never read or write the server. */
  preview?: boolean;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Local "went Back to look at an earlier step". The server owns the real position. */
  const [viewing, setViewing] = useState<ShownStep | null>(preview ? ALL_STEPS[0] : null);

  /**
   * Inputs are DERIVED from the server's saved answers until the user touches them. `null` means
   * "untouched, show what the server has"; anything else is the user's own edit and always wins.
   *
   * Copying them into state on every server update looks simpler and is wrong: it fires after
   * each save and overwrites what the user typed on a step they are not looking at — type a phone
   * number, go Back to change step 1, and the number is silently replaced by an older value.
   */
  const [editedChosen, setEditedChosen] = useState<string[] | null>(null);
  const [editedPhone, setEditedPhone] = useState<string | null>(null);
  const [editedEmails, setEditedEmails] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (preview) { setLoading(false); return; }
    getOnboarding()
      .then((s) => { if (alive.current) setState(s); })
      .catch((e) => { if (alive.current) setError(errorMessage(e)); })
      .finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [preview]);

  const steps = (state?.steps ?? ALL_STEPS).filter((s): s is ShownStep => s !== 'connectors');
  // ponytail: a server parked on `connectors` is shown `number`; if the dashboard then refuses
  // `number` out of order, skip `connectors` server-side here instead.
  const serverStep = state?.current_step === 'connectors' ? 'number' : state?.current_step;
  const step: ShownStep = viewing ?? serverStep ?? steps[steps.length - 1];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isLast = stepIndex === steps.length - 1;

  const saved = (state?.selections ?? {}) as Record<string, unknown>;
  const chosen = editedChosen ?? (Array.isArray(saved.choose) ? (saved.choose as string[]) : []);
  const phone = editedPhone ?? (typeof saved.number === 'string' ? saved.number : '');
  const emails = editedEmails ?? (Array.isArray(saved.invite) ? (saved.invite as string[]).join(', ') : '');

  function applyState(next: OnboardingState) {
    setState(next);
    setViewing(null);           // follow the server again after any write
    if (next.completed) onFinished?.();
  }

  /** What this step would submit, or undefined when it has nothing to say. */
  function valueFor(s: ShownStep): unknown {
    if (s === 'choose') return chosen.length ? chosen : undefined;
    if (s === 'number') return phone.trim() || undefined;
    const list = parseEmails(emails);
    return list.length ? list : undefined;
  }

  /** Preview mode: Next / Skip just move to the next screen, Finish closes. */
  function previewNext() {
    if (isLast) onClose();
    else setViewing(steps[stepIndex + 1]);
  }

  async function advance() {
    if (preview) { previewNext(); return; }
    setError(null);
    setBusy(true);
    try {
      const value = valueFor(step);
      // Blank means skip — see note 2 at the top.
      const next = value === undefined
        ? await skipOnboardingStep(step)
        : await saveOnboardingStep(step, value);
      applyState(next);
      if (isLast) {
        applyState(await completeOnboarding());
        onFinished?.();
        onClose();
      }
    } catch (e) {
      setError(errorMessage(e));
    }
    setBusy(false);
  }

  async function skipThis() {
    if (preview) { previewNext(); return; }
    setError(null);
    setBusy(true);
    try { applyState(await skipOnboardingStep(step)); }
    catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  }

  async function close() {
    if (preview) { onClose(); return; }
    // Close either way — a failed dismiss must not trap the user in the pop-up.
    try { await dismissOnboarding(); } catch { /* ignore */ }
    onClose();
  }

  // ── styling, matching the app's other portalled modals ─────────────────────────────────
  const bg = isDark ? '#09090b' : '#ffffff';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';
  const card = isDark ? 'rgba(24,24,27,0.7)' : '#fafafa';

  const pill = (on: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 14, borderRadius: 999, cursor: 'pointer',
    border: `1px solid ${on ? fg : line}`,
    background: on ? fg : 'transparent',
    color: on ? bg : muted,
    transition: 'all .12s ease',
  });

  return createPortal(
    <div
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Set up your workspace"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 880, borderRadius: 24,
          border: `1px solid ${line}`, background: bg, overflow: 'hidden',
        }}
      >
        {/* the faint top-left wash from the designs */}
        <div
          aria-hidden
          style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.6,
            background: 'radial-gradient(120% 90% at 0% 0%, rgba(52,211,153,0.10) 0%, rgba(0,0,0,0) 55%)',
          }}
        />

        <div style={{ position: 'relative', padding: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 18, fontWeight: 600, color: fg }}>Space Marvel</span>
            <button
              onClick={close}
              aria-label="Close setup"
              title="You can finish this later from “Finish setup”"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 6 }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div style={{ marginTop: 40, minHeight: 300 }}>
            {loading ? (
              <div style={{ color: muted, fontSize: 14, paddingTop: 80, textAlign: 'center' }}>Loading…</div>
            ) : (
              <>
                <h2 style={{ fontSize: 28, fontWeight: 700, color: fg, margin: 0 }}>{STEP_COPY[step].title}</h2>
                <p style={{ marginTop: 8, fontSize: 14, color: muted }}>{STEP_COPY[step].sub}</p>

                <div style={{ marginTop: 32 }}>
                  {step === 'choose' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                      {MANAGE_OPTIONS.map((o) => {
                        const on = chosen.includes(o);
                        return (
                          <button
                            key={o}
                            aria-pressed={on}
                            onClick={() => setEditedChosen(on ? chosen.filter((x) => x !== o) : [...chosen, o])}
                            style={pill(on)}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {step === 'number' && (
                    <input
                      value={phone}
                      onChange={(e) => setEditedPhone(e.target.value)}
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+91 98765 43210"
                      style={{
                        width: '100%', maxWidth: 420, padding: '14px 20px', fontSize: 14,
                        borderRadius: 999, border: `1px solid ${line}`, background: card, color: fg,
                        outline: 'none',
                      }}
                    />
                  )}

                  {step === 'invite' && (canInvite ? (
                    <>
                      <input
                        value={emails}
                        onChange={(e) => setEditedEmails(e.target.value)}
                        placeholder="Enter Email addresses (or paste multiple)"
                        style={{
                          width: '100%', padding: '14px 20px', fontSize: 14, borderRadius: 999,
                          border: `1px solid ${line}`, background: card, color: fg, outline: 'none',
                        }}
                      />
                      <div style={{
                        marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 8, fontSize: 12,
                        background: 'rgba(6,78,59,0.35)', color: '#6ee7b7',
                        border: '1px solid rgba(6,95,70,0.6)',
                      }}>
                        <Icon name="bulb" size={14} />
                        Don&apos;t do it alone — invite your team to get started 200% faster.
                      </div>
                    </>
                  ) : (
                    // The backend returns 403 here on a personal workspace, so an input would
                    // only produce an error.
                    <div style={{
                      maxWidth: 420, fontSize: 14, color: muted, padding: '14px 16px',
                      borderRadius: 12, border: `1px solid ${line}`, background: card,
                    }}>
                      Inviting people needs a <strong style={{ color: fg }}>team workspace</strong>.
                      You&apos;re on a personal one — create a team workspace from Billing, then invite
                      from there.
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && (
            <div style={{
              marginTop: 16, fontSize: 12, padding: '8px 12px', borderRadius: 8,
              border: '1px solid rgba(127,29,29,0.6)', background: 'rgba(69,10,10,0.4)', color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          {/* progress — driven by steps DONE on the server, not by where you are looking */}
          <div style={{ marginTop: 32, height: 3, borderRadius: 999, background: line }}>
            <div style={{
              height: '100%', borderRadius: 999, background: fg, transition: 'width .2s ease',
              width: `${(((state?.steps_done ?? 0) / (state?.steps_total ?? 4)) * 100).toFixed(0)}%`,
            }} />
          </div>

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => setViewing(steps[Math.max(0, stepIndex - 1)])}
              disabled={stepIndex === 0 || busy}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                fontSize: 14, borderRadius: 12, border: `1px solid ${line}`, color: fg,
                background: 'transparent', cursor: stepIndex === 0 || busy ? 'not-allowed' : 'pointer',
                opacity: stepIndex === 0 || busy ? 0.4 : 1,
              }}
            >
              Back
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={skipThis}
                disabled={busy}
                style={{ background: 'none', border: 'none', fontSize: 14, color: muted, cursor: busy ? 'not-allowed' : 'pointer', padding: '10px 12px' }}
              >
                Skip
              </button>
              <button
                onClick={advance}
                disabled={busy}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px',
                  fontSize: 14, fontWeight: 500, borderRadius: 12, border: 'none',
                  background: fg, color: bg, cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? 'Saving…' : isLast ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function parseEmails(raw: string): string[] {
  return raw.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes('@'));
}
