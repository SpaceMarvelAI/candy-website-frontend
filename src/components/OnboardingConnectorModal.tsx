/**
 * Personal-profile pre-step — shown BEFORE the standard OnboardingModal, matching the "Filled
 * form" design (docs/user-profiling-onboarding/designs/Filled form.png): avatar, name, interest
 * tags, email (read-only), phone, LinkedIn, X.com, plus an optional LinkedIn data-export ZIP
 * upload. Mirrors ChatPlatform-frontend-new's component of the same name. GitHub's company/
 * location and detected tech-stack (top_languages) are shown on the profile-settings page only,
 * not here — the design only shows name on this screen.
 *
 * Any first-time login (Google/GitHub/LinkedIn) gets avatar/name pre-filled from the dashboard
 * profile (api/onboarding.ts's getOnboardingProfile, which forwards to the Dashboard's
 * /api/v1/users/me/profile/); LinkedIn and X.com are always manual — neither provider's data is
 * ever pulled into those two fields, and Candy has no LinkedIn-OAuth enrichment flow of its own
 * (that's MetaSpace-only). Only a genuinely blank profile (password/magic-link signup, no OAuth
 * data at all) skips straight to OnboardingModal — nothing to review.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { useApp } from '../context/AppContext';
import { getOnboardingProfile } from '../api/onboarding';
import { updateProfile, type LinkedInZipData } from '../api/profile';
import LinkedInZipImport from './LinkedInZipImport';
import OnboardingModal from './OnboardingModal';

type Phase = 'checking' | 'review' | 'done';

const INTEREST_SUGGESTIONS = [
  'Customer Support Calls', 'Appointment & Scheduling', 'Workflow Automation', 'Research & Writing',
  'Content & Social Media', 'Prompt & AI Workflows', 'Data Science', 'Marketing',
];

export default function OnboardingConnectorModal({
  onClose,
  onFinished,
}: {
  onClose: () => void;
  onFinished?: () => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const { user } = useApp();

  const [phase, setPhase] = useState<Phase>('checking');
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>();
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  // bio/employer have no input on this minimal screen by design — a LinkedIn ZIP import still
  // fills them silently here and pushes them on save, reviewable later in full Profile Settings.
  const [bio, setBio] = useState('');
  const [employer, setEmployer] = useState('');
  const [interests, setInterests] = useState<string[]>([]);
  const [interestInput, setInterestInput] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [twitter, setTwitter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    getOnboardingProfile()
      .then((p) => {
        if (!alive) return;
        // Any provider gives us at least name/avatar at login (Google/LinkedIn) — GitHub also
        // gives company/location, but that's not shown on this screen (design only shows
        // avatar/name/interests/contact fields here). Show the review step pre-filled with
        // whatever we have; only a genuinely blank profile (password/magic-link signup, no
        // OAuth data at all) skips straight to the standard flow.
        if (p.github?.connected || p.avatar_url || p.full_name) {
          setAvatarUrl(p.avatar_url ?? p.github?.avatar_url ?? undefined);
          setName(p.full_name ?? '');
          setPhase('review');
        } else {
          setPhase('done');
        }
      })
      // Backend unreachable or no profile yet — don't block onboarding on it.
      .catch(() => { if (alive) setPhase('done'); });
    return () => { alive = false; };
  }, []);

  function addInterest(val: string) {
    const trimmed = val.trim();
    if (trimmed && !interests.includes(trimmed)) setInterests((prev) => [...prev, trimmed]);
    setInterestInput('');
  }

  function applyLinkedInZip(data: LinkedInZipData) {
    if (data.name) setName(data.name);
    if (data.title) setJobTitle(data.title);
    if (data.bio) setBio(data.bio);
    if (data.company) setEmployer(data.company);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await updateProfile({
        name, phone, title: jobTitle,
        ...(bio ? { bio } : {}),
        ...(employer ? { employer } : {}),
      });
    } catch {
      /* non-fatal — still proceed to the standard flow */
    } finally {
      setSaving(false);
      setPhase('done');
    }
  }

  // Nothing to review (not GitHub-connected, or still checking) — hand off immediately.
  if (phase !== 'review') {
    return <OnboardingModal onClose={onClose} onFinished={onFinished} />;
  }

  const bg = isDark ? '#09090b' : '#ffffff';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';
  const card = isDark ? 'rgba(24,24,27,0.7)' : '#fafafa';

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 16px', fontSize: 14, borderRadius: 12,
    border: `1px solid ${line}`, background: card, color: fg, outline: 'none', boxSizing: 'border-box',
  };
  const initials = (name || user?.email || '?')
    .split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Set up your profile"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 16,
        background: 'rgba(0,0,0,0.7)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto',
          borderRadius: 24, border: `1px solid ${line}`, background: bg,
        }}
      >
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
              onClick={onClose}
              aria-label="Close setup"
              title="You can finish this later"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 6 }}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div style={{ marginTop: 32 }}>
            {/* Avatar + name/title/company/location */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ flexShrink: 0 }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', background: '#7c3aed', color: '#fff', fontSize: 20, fontWeight: 600,
                  }}>
                    {initials}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" style={{ ...inputStyle, fontWeight: 500 }} />
              </div>
            </div>

            {/* Role tags — design shows these as bare chips, no label above them */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                {interests.map((t) => (
                  <span
                    key={t}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', fontSize: 12,
                      borderRadius: 999, border: '1px solid #6d28d9', background: 'rgba(124,58,237,0.15)', color: '#c4b5fd',
                    }}
                  >
                    {t}
                    <button
                      onClick={() => setInterests((prev) => prev.filter((x) => x !== t))}
                      aria-label={`Remove ${t}`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, lineHeight: 0 }}
                    >
                      <Icon name="x" size={10} />
                    </button>
                  </span>
                ))}
                {INTEREST_SUGGESTIONS.filter((s) => !interests.includes(s)).slice(0, 8).map((s) => (
                  <button
                    key={s}
                    onClick={() => setInterests((prev) => [...prev, s])}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12,
                      borderRadius: 999, border: `1px solid ${line}`, background: 'none', color: muted, cursor: 'pointer',
                    }}
                  >
                    <Icon name="plus" size={10} /> {s}
                  </button>
                ))}
              </div>
              <input
                value={interestInput}
                onChange={(e) => setInterestInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addInterest(interestInput); } }}
                placeholder="Type an interest and press Enter…"
                style={{ ...inputStyle, fontSize: 12 }}
              />
            </div>

            {/* Email (read-only) + Phone + LinkedIn + X.com — LinkedIn/X.com are always manual */}
            <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <input value={user?.email ?? ''} readOnly style={{ ...inputStyle, opacity: 0.6, cursor: 'default' }} placeholder="Email" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="Phone number" style={inputStyle} />
              <input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="linkedin.com/in/yourname" style={inputStyle} />
              <input value={twitter} onChange={(e) => setTwitter(e.target.value)} placeholder="x.com/yourhandle" style={inputStyle} />
            </div>

            <div style={{ marginTop: 16 }}>
              <LinkedInZipImport onImported={applyLinkedInZip} />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                marginTop: 24, width: '100%', padding: '14px 20px', fontSize: 14, fontWeight: 500,
                borderRadius: 999, border: 'none', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
                background: fg, color: bg,
              }}
            >
              {saving ? 'Saving…' : 'Looks good — continue'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
