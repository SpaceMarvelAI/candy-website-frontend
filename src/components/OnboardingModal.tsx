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
 * 3. Candy now shows the shared flow's `connectors` step too (2026-10-30) — same 6 apps as
 *    Metaspace's and Finixy's onboarding (Gmail, LinkedIn, Instagram, Jira, Slack, Facebook),
 *    each a real, standalone Composio toolkit. Previously this step was hidden entirely (its
 *    tiles only recorded intent and never opened a real connection) — see
 *    docs/user-profiling-onboarding/candy-onboarding-edge-cases-2026-10-30.md #12 for the full
 *    history, including a known pre-existing issue left alone on purpose: `../api/composio`
 *    proxies every call through Metaspace's backend rather than Candy's own (which has the
 *    identical routes) — not fixed here, flagged for later.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { errorMessage } from '../utils/apiError';
import { visibleProgress } from '../utils/onboardingProgress';
import {
  completeOnboarding,
  dismissOnboarding,
  enrichOrg,
  getOnboarding,
  saveOnboardingStep,
  skipOnboardingStep,
  uploadOrgTree,
  downloadOrgTreeTemplate,
  type EnrichedOrgProfile,
  type OnboardingState,
  type OnboardingStep,
} from '../api/onboarding';
import { connectComposioApp, getAppAuthInfo, getComposioConnections, connectedAppId, isActiveConnection, redirectUrl, type ComposioConnection } from '../api/composio';

/** All steps the shared flow can send, including `number` — a legacy display name a very old
 *  onboarding row's `current_step`/`skipped_steps` can still carry (the phone-number step it
 *  stood for was removed 2026-10-28). Never reachable from a fresh flow going forward; kept only
 *  so old data doesn't need a cast. */
type ShownStep = OnboardingStep;

/** Same list as ChatPlatform-frontend-new's and Finixy_workflow's own copies — keep in sync if
 *  it changes (see docs/user-profiling-onboarding/candy-onboarding-edge-cases-2026-10-30.md #12). */
const CONNECTORS: { app: string; name: string; blurb: string; icon: string }[] = [
  { app: 'gmail',     name: 'Google',    blurb: 'Add your Gmail, Calendar, and Contacts.', icon: 'https://logos.composio.dev/api/gmail' },
  { app: 'linkedin',  name: 'LinkedIn',  blurb: 'Add your LinkedIn connections.',           icon: 'https://logos.composio.dev/api/linkedin' },
  { app: 'instagram', name: 'Instagram', blurb: 'Schedule and manage your posts.',          icon: 'https://logos.composio.dev/api/instagram' },
  { app: 'jira',      name: 'Jira',      blurb: 'Add your tickets and project boards.',     icon: 'https://logos.composio.dev/api/jira' },
  { app: 'slack',     name: 'Slack',     blurb: 'Send and receive messages in Slack.',      icon: 'https://logos.composio.dev/api/slack' },
  { app: 'facebook',  name: 'Facebook',  blurb: 'Schedule and manage your posts.',          icon: 'https://logos.composio.dev/api/facebook' },
];

/** Organisation-profile step dropdowns — fixed option sets, matching the design
 *  (designs/Company Profile (1).png) exactly. Free-form on the backend (CharField), so picking
 *  from this list is a UI convenience, not a server-enforced enum. */
const ORG_SIZE_OPTIONS = ['1-15 Employees', '16-49 Employees', '50-199 Employees', '200-1,999 Employees', '2000+ Employees'];
const INDUSTRY_OPTIONS = ['AI & DeepTech', 'SaaS', 'Healthcare', 'FinTech', 'E-commerce', 'Other'];

const STEP_COPY: Record<ShownStep, { title: string; sub: string }> = {
  // 'choose' ("What would you like to manage?") was removed as its own step 2026-10-27 — that
  // use-case selection is now the role/interest chips on OnboardingConnectorModal's review screen,
  // which runs before this flow entirely. Entry kept so the Record<ShownStep,...> type (which
  // still includes 'choose' for old selections/skipped_steps data) doesn't need a cast here.
  choose:       { title: 'What would you like to manage?', sub: "We'll take you exactly where you need to go." },
  org_gate:     { title: 'Are you setting up for an organisation?', sub: 'Founders can add organisation details — everyone else can jump straight in.' },
  // 'number' no longer asks for a phone number (removed 2026-10-28 — the new design has no phone
  // screen, and the personal-profile pre-step, OnboardingConnectorModal, already collects it and
  // forwards it to the Dashboard directly). Never reachable from a fresh flow now that
  // `connectors` has its own real screen (note 3) — kept only for a very old row whose
  // current_step/skipped_steps still literally says "number".
  number:       { title: "You're all set!", sub: 'Finish setting up your Candy workspace.' },
  organisation: { title: 'Tell us about your organisation', sub: "Enter your organisation's domain and we'll fill in what we can — edit anything." },
  connectors:   { title: 'Connect your tools, unlock your workflow', sub: 'Start with a few. You can add more anytime.' },
  // No team-invite UI here on purpose: a first-time signup is always on the free plan, and the
  // Dashboard's invite endpoint 403s anything below a paid Business plan (rbac/invitation_views.py's
  // B2B_PLANS check) regardless of workspace type — offering it here would be a guaranteed error.
  // This step is organisation-tree (org chart — who reports to who) upload only; invites live in
  // settings, once the user has actually upgraded.
  invite:       { title: 'Upload your organisation tree', sub: 'Your org chart — who reports to who. Optional, download the template to get started.' },
};

const ALL_STEPS: ShownStep[] = ['org_gate', 'organisation', 'invite', 'connectors'];

export default function OnboardingModal({
  onClose,
  onFinished,
  preview = false,
}: {
  /** The ✕ / backdrop. Dismisses (recoverable) — never completes. */
  onClose: () => void;
  onFinished?: () => void;
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
  const [editedDomain, setEditedDomain] = useState<string | null>(null);
  const [editedOrgName, setEditedOrgName] = useState<string | null>(null);
  const [editedOrgSize, setEditedOrgSize] = useState<string | null>(null);
  const [editedIndustry, setEditedIndustry] = useState<string | null>(null);
  const [editedTags, setEditedTags] = useState<string[] | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [enrichResult, setEnrichResult] = useState<EnrichedOrgProfile | null>(null);
  const [logoFailed, setLogoFailed] = useState(false);
  const [orgTreeFile, setOrgTreeFile] = useState<File | null>(null);
  const [orgTreeError, setOrgTreeError] = useState<string | null>(null);
  const [editedOrgGate, setEditedOrgGate] = useState<string | null>(null);
  const [connections, setConnections] = useState<ComposioConnection[]>([]);
  const [connectError, setConnectError] = useState<string | null>(null);

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

  // `connectors` is a real, shown step now (note 3) — no display-name remapping needed. A fixed
  // index still matters here for the same reason it did before this change: `steps.indexOf(step)`
  // must find a real match, or `Math.max(0, -1)` silently clamps to 0 and breaks Back/isLast on
  // the final screen (see git history on this file for the live incident that taught us that).
  const steps = (state?.steps ?? ALL_STEPS) as ShownStep[];
  const serverStep = state?.current_step;
  const step: ShownStep = viewing ?? serverStep ?? steps[steps.length - 1];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const isLast = stepIndex === steps.length - 1;

  const refetchConnections = () => {
    getComposioConnections().then(setConnections).catch(() => {});
  };
  // Fetch once the connectors screen is actually reached — not on mount — same reasoning as the
  // rest of this component's data being fetched lazily per step, and avoids an unnecessary call
  // (through the Metaspace proxy, see note 3) for a user who never reaches this screen at all.
  useEffect(() => {
    if (!preview && step === 'connectors') refetchConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, preview]);

  // Progress over the screens the user can see — `connectors` is no longer hidden (note 3), so
  // this now equals the server's own total for every product (see utils/onboardingProgress).
  // Preview mode has no server state: 0%.
  const progress = state ? visibleProgress(state) : { done: 0, total: steps.length };
  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  const saved = (state?.selections ?? {}) as Record<string, unknown>;
  // `organisation` used to be saved as a bare domain string — kept for old rows; going forward
  // it's an object carrying the whole organisation-profile form (Name/Size/Industry/Tagline).
  const savedOrg = saved.organisation;
  const savedOrgObj = savedOrg && typeof savedOrg === 'object' ? (savedOrg as Record<string, unknown>) : null;
  const domain = editedDomain ?? (typeof savedOrg === 'string' ? savedOrg : (typeof savedOrgObj?.domain === 'string' ? savedOrgObj.domain : ''));
  // Preference order: the user's own edit, then a just-fetched enrichment preview (freshest
  // signal before the first save round-trips), then whatever was already saved.
  const orgName = editedOrgName ?? enrichResult?.name ?? (typeof savedOrgObj?.name === 'string' ? savedOrgObj.name : '');
  const orgSize = editedOrgSize ?? enrichResult?.org_size ?? (typeof savedOrgObj?.org_size === 'string' ? savedOrgObj.org_size : '');
  const industry = editedIndustry ?? enrichResult?.industry ?? (typeof savedOrgObj?.industry === 'string' ? savedOrgObj.industry : '');
  const taglineFallback = enrichResult?.description ?? (typeof savedOrgObj?.description === 'string' ? savedOrgObj.description : '');
  const tags = editedTags ?? (taglineFallback ? taglineFallback.split(/\s+/).filter(Boolean) : []);
  const orgGate = editedOrgGate ?? (typeof saved.org_gate === 'string' ? saved.org_gate : '');

  function applyState(next: OnboardingState) {
    setState(next);
    setViewing(null);           // follow the server again after any write
    if (next.completed) onFinished?.();
  }

  /** What this step would submit, or undefined when it has nothing to say. */
  function valueFor(s: ShownStep): unknown {
    if (s === 'org_gate') return orgGate || undefined;
    // connectors (and the legacy 'number' name it can arrive as — see STEP_COPY's comment) has
    // nothing to save as a step "value": connection state lives in Composio's own records, not
    // in the onboarding row. Advancing past this screen is always a skip.
    if (s === 'connectors' || s === 'number') return undefined;
    if (s === 'organisation') {
      const description = tags.join(' ');
      if (!domain.trim() && !orgName.trim() && !orgSize.trim() && !industry.trim() && !description.trim()) {
        return undefined;
      }
      return {
        domain: domain.trim() || undefined,
        name: orgName.trim() || undefined,
        org_size: orgSize.trim() || undefined,
        industry: industry.trim() || undefined,
        description: description.trim() || undefined,
      };
    }
    // invite: no team-invite answer to save (free-plan signups can't invite — see STEP_COPY's own
    // comment). The org-tree upload is a side-effect fired separately in advance(), not a value.
    return undefined;
  }

  function addTag(val: string) {
    const trimmed = val.replace(/^#/, '').trim();
    if (trimmed && !tags.includes(trimmed)) setEditedTags([...tags, trimmed]);
    setTagInput('');
  }
  function removeTag(t: string) {
    setEditedTags(tags.filter((x) => x !== t));
  }

  /** Preview mode: Next / Skip just move to the next screen, Finish closes. */
  function previewNext() {
    if (isLast) onClose();
    else setViewing(steps[stepIndex + 1]);
  }

  // 'number' is a legacy display name only a very old row can still carry (STEP_COPY's comment on
  // it) — never reachable from a fresh flow, but if it ever is, the dashboard rejects it as
  // invalid_step (it dropped that step entirely), so translate it to the real current name here.
  const realStep = step === 'number' ? 'connectors' : step;

  async function advance() {
    if (preview) { previewNext(); return; }
    setError(null);
    setBusy(true);
    try {
      const value = valueFor(step);
      // Fire org enrichment alongside the step save — fire-and-forget, never blocks advance.
      // Built straight from state, not cast from `value`: the enrich endpoint's `name_override`
      // is a distinct field from the step value's own `name` key (see api/onboarding.ts's enrichOrg).
      if (step === 'organisation' && value && typeof value === 'object') {
        enrichOrg({
          domain: domain.trim(),
          name_override: orgName.trim() || undefined,
          org_size: orgSize.trim() || undefined,
          industry: industry.trim() || undefined,
          description: tags.join(' ').trim() || undefined,
        }).then((r) => { if (r) setEnrichResult(r); }).catch(() => {});
      }
      // Org chart upload: best-effort, fire-and-forget, through our own backend's /org-tree route
      // (forwards to the Dashboard there — no local-file-storage equivalent for standalone mode).
      if (step === 'invite' && orgTreeFile) {
        uploadOrgTree(orgTreeFile);
      }
      // Blank means skip — see note 2 at the top.
      const next = value === undefined
        ? await skipOnboardingStep(realStep)
        : await saveOnboardingStep(realStep, value);
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
    try { applyState(await skipOnboardingStep(realStep)); }
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

  return createPortal(
    <div
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
                  {step === 'org_gate' && (
                    <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {([
                        { value: 'personal', label: 'Candy Workspace', blurb: 'Your workspace is ready' },
                        { value: 'organisation', label: 'Set Up Your Organisation', blurb: 'Set up your organisation details' },
                      ] as const).map((o, i) => (
                        <Fragment key={o.value}>
                          {i === 1 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
                              <div style={{ height: 1, flex: 1, background: line }} />
                              <span style={{ fontSize: 12, color: muted }}>or</span>
                              <div style={{ height: 1, flex: 1, background: line }} />
                            </div>
                          )}
                          <button
                            type="button"
                            aria-pressed={orgGate === o.value}
                            onClick={() => setEditedOrgGate(o.value)}
                            style={{
                              width: '100%', textAlign: 'left', padding: '14px 20px', borderRadius: 16,
                              border: `1px solid ${line}`, background: orgGate === o.value ? card : 'transparent',
                              cursor: 'pointer',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                border: `1px solid ${orgGate === o.value ? fg : line}`,
                              }}>
                                {orgGate === o.value && (
                                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: fg }} />
                                )}
                              </span>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 500, color: fg }}>{o.label}</div>
                                <div style={{ fontSize: 12, color: muted }}>{o.blurb}</div>
                              </div>
                            </div>
                          </button>
                        </Fragment>
                      ))}
                    </div>
                  )}


                  {step === 'organisation' && (
                    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Name + Domain — matches the design (Company Profile.png) exactly, just
                          "Organisation" throughout instead of "Company". */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: muted }}>Organisation Name</label>
                          <input
                            value={orgName}
                            onChange={(e) => setEditedOrgName(e.target.value)}
                            type="text"
                            autoComplete="organization"
                            placeholder="Acme Inc."
                            style={{
                              width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 12,
                              border: `1px solid ${line}`, background: card, color: fg, outline: 'none', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: muted }}>Organisation Domain / Website</label>
                          <input
                            value={domain}
                            onChange={(e) => { setEditedDomain(e.target.value); setLogoFailed(false); setEnrichResult(null); }}
                            onBlur={() => { if (domain.trim()) enrichOrg({ domain: domain.trim() }).then((r) => { if (r) setEnrichResult(r); }).catch(() => {}); }}
                            type="text"
                            inputMode="url"
                            autoComplete="url"
                            placeholder="https://acme.com/"
                            style={{
                              width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 12,
                              border: `1px solid ${line}`, background: card, color: fg, outline: 'none', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      </div>

                      {/* Clearbit logo — shown live as user types; no API key, no backend needed */}
                      {domain.trim().length >= 4 && domain.includes('.') && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 16px', borderRadius: 16,
                          border: `1px solid ${line}`, background: card,
                        }}>
                          {!logoFailed ? (
                            <img
                              key={domain.trim()}
                              src={`https://logo.clearbit.com/${domain.trim()}`}
                              alt=""
                              onError={() => setLogoFailed(true)}
                              style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }}
                            />
                          ) : (
                            <Icon name="globe" size={20} style={{ color: muted, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 13, color: muted }}>{domain.trim()}</span>
                        </div>
                      )}

                      {/* Size + Industry — editable dropdowns, pre-filled from enrichment when
                          available but always user-overridable, matching the design. */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: muted }}>Organisation Size</label>
                          <select
                            value={orgSize}
                            onChange={(e) => setEditedOrgSize(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 12,
                              border: `1px solid ${line}`, background: card, color: fg, outline: 'none', boxSizing: 'border-box',
                            }}
                          >
                            <option value="">Select size…</option>
                            {ORG_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: muted }}>Industry / Sector</label>
                          <select
                            value={industry}
                            onChange={(e) => setEditedIndustry(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 12,
                              border: `1px solid ${line}`, background: card, color: fg, outline: 'none', boxSizing: 'border-box',
                            }}
                          >
                            <option value="">Select industry…</option>
                            {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Tagline — tag chips, matching the design's #AI Product #candy style. */}
                      <div>
                        <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: muted }}>Organisation Tagline</label>
                        <div style={{
                          padding: '8px 12px', borderRadius: 12, border: `1px solid ${line}`, background: card,
                          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                        }}>
                          {tags.map((t) => (
                            <span key={t} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12,
                              borderRadius: 999, background: isDark ? '#27272a' : '#e4e4e7', color: fg,
                            }}>
                              #{t}
                              <button
                                type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 0 }}
                              >
                                <Icon name="x" size={10} />
                              </button>
                            </span>
                          ))}
                          <input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput); } }}
                            placeholder={tags.length ? '' : 'Add a tag and press Enter…'}
                            style={{
                              flex: 1, minWidth: 100, background: 'transparent', border: 'none', outline: 'none',
                              fontSize: 12, color: fg,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 'invite' && (
                    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* No team-invite UI here on purpose — see STEP_COPY's own comment: a
                          first-time signup is always on the free plan, and the Dashboard's invite
                          endpoint 403s below a paid Business plan regardless of workspace type. */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: muted }}>Organisation Tree (Org Chart)</span>
                        <button
                          type="button"
                          onClick={async () => {
                            const blob = await downloadOrgTreeTemplate();
                            if (!blob) return; // standalone mode or request failed — best-effort
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = 'organisation-tree-template.xlsx';
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500,
                            background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa',
                          }}
                        >
                          <Icon name="export" size={14} />
                          Download template
                        </button>
                      </div>
                      <label
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                          gap: 6, padding: '32px 16px', borderRadius: 16, border: `1px dashed ${line}`,
                          background: card, cursor: 'pointer', textAlign: 'center',
                        }}
                      >
                        <Icon name="upload" size={20} style={{ color: muted }} />
                        <span style={{ fontSize: 14, color: fg }}>
                          {orgTreeFile ? orgTreeFile.name : (<><span style={{ textDecoration: 'underline' }}>Click to upload</span> or drag and drop</>)}
                        </span>
                        <span style={{ fontSize: 12, color: muted }}>CSV or XLSX · max 12MB · download the template above to fill in</span>
                        <input
                          type="file"
                          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                          style={{ display: 'none' }}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            if (f && f.size > 12 * 1024 * 1024) { setOrgTreeError('File too large — max 12MB.'); return; }
                            setOrgTreeError(null);
                            setOrgTreeFile(f);
                          }}
                        />
                      </label>
                      {orgTreeError && <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{orgTreeError}</p>}
                    </div>
                  )}

                  {step === 'connectors' && (
                    <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {CONNECTORS.map((c) => (
                        <ConnectorRow
                          key={c.app}
                          c={c}
                          connected={connections.some((conn) => connectedAppId(conn) === c.app && isActiveConnection(conn))}
                          isDark={isDark}
                          line={line}
                          card={card}
                          fg={fg}
                          muted={muted}
                          onConnected={refetchConnections}
                          onError={setConnectError}
                        />
                      ))}
                      {connectError && <p style={{ margin: 0, fontSize: 12, color: '#f87171' }}>{connectError}</p>}
                    </div>
                  )}
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
              width: `${progressPct}%`,
            }} />
          </div>

          <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <button
              onClick={() => {
                // Step back past any SKIPPED step too, not just one array position — landing on
                // a step the user never actually saw (e.g. organisation/invite, auto-skipped by
                // org_gate="personal") is confusing, not a real "go back and review" target.
                const skipped = new Set(state?.skipped_steps ?? []);
                let i = stepIndex - 1;
                while (i > 0 && skipped.has(steps[i])) i--;
                setViewing(steps[Math.max(0, i)]);
              }}
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

/** One connector tile — same shape/behavior as ChatPlatform-frontend-new's ConnectorRow. */
function ConnectorRow({
  c, connected, isDark, line, card, fg, muted, onConnected, onError,
}: {
  c: { app: string; name: string; blurb: string; icon: string };
  connected: boolean;
  isDark: boolean; line: string; card: string; fg: string; muted: string;
  onConnected: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      // Ask what kind of auth it needs first: an OAuth app hands back a redirect URL, an
      // api_key app connects on the spot. Guessing wrong leaves the user staring at nothing.
      const info = await getAppAuthInfo(c.app).catch(() => null);
      const res = await connectComposioApp(c.app);
      const url = redirectUrl(res);
      if (url) {
        const w = window.open(url, 'composio-connect', 'width=520,height=680');
        if (!w) {
          onError('Your browser blocked the connect window. Allow pop-ups and try again.');
          setBusy(false);
          return;
        }
        // Composio's hosted OAuth page gives no postMessage callback — the popup closing is the
        // only signal we get that the user finished (or abandoned) it. Refetching right after
        // window.open() (before the user has done anything in the popup) always finds the
        // connection not-yet-made — see ChatPlatform-frontend-new's identical fix, same day.
        const poll = setInterval(() => {
          if (w.closed) {
            clearInterval(poll);
            onConnected();
            setBusy(false);
          }
        }, 500);
        return;
      }
      if (info?.auth_type && info.auth_type !== 'no_auth' && info.auth_type !== 'api_key') {
        onError(`${c.name} needs details we can't collect here — use the Connectors panel.`);
      }
      onConnected();
    } catch {
      onError(`Could not connect ${c.name}.`);
    }
    setBusy(false);
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
      borderRadius: 16, border: `1px solid ${line}`, background: card,
    }}>
      {!iconFailed ? (
        <img
          src={c.icon}
          alt=""
          onError={() => setIconFailed(true)}
          style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: isDark ? '#27272a' : '#fff' }}
        />
      ) : (
        <Icon name="globe" size={20} style={{ color: muted, flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: fg }}>{c.name}</div>
        <div style={{ fontSize: 12, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.blurb}</div>
      </div>
      {connected ? (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12,
          borderRadius: 10, background: 'rgba(16,185,129,0.12)', color: '#34d399', border: '1px solid rgba(16,185,129,0.3)',
        }}>
          <Icon name="check" size={12} /> Connected
        </span>
      ) : (
        <button
          type="button"
          onClick={connect}
          disabled={busy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12,
            fontWeight: 500, borderRadius: 10, border: 'none', cursor: busy ? 'not-allowed' : 'pointer',
            background: '#7c3aed', color: '#fff', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      )}
    </div>
  );
}
