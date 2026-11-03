/**
 * LinkedInZipImport — "upload your LinkedIn data export" affordance, shared between the
 * onboarding personal-profile step and the profile-settings modal (docs/user-profiling-onboarding/
 * linkedin-zip-upload.md). A "?" opens step-by-step instructions for getting the ZIP from LinkedIn
 * (LinkedIn takes 10 min – 48 hrs to prepare it, so this is always a "come back later" action, not
 * something blocking); uploading hands the parsed fields to the caller via `onImported` — this
 * component never saves anything itself. Mirrors ChatPlatform-frontend-new's component of the
 * same name, adapted to this app's inline-style/useTheme pattern.
 *
 * The instructions popup closes on Escape, the X, or a click outside it — ordinary modal
 * behavior, returning to whatever page/modal is open underneath (unlike the onboarding modal
 * itself, which only closes via its own X).
 */
import { useEffect, useRef, useState } from 'react';

import { Icon } from '../assets/icons';
import { useTheme } from '../hooks/useTheme';
import { uploadLinkedInZip, type LinkedInZipData } from '../api/profile';
import { errorMessage } from '../utils/apiError';

const STEPS = [
  'Go to linkedin.com, click your profile photo, then "Settings & Privacy"',
  'Data privacy → "Get a copy of your data"',
  'Select "The works" (all LinkedIn data) → Request archive',
  "Wait for LinkedIn's email — this can take 10 minutes to 48 hours",
  'Download the ZIP from that email, then come back and upload it here',
];

export default function LinkedInZipImport({
  onImported,
}: {
  onImported: (data: LinkedInZipData) => void;
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [showHelp, setShowHelp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!showHelp) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowHelp(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSuccess(false);
    setUploading(true);
    try {
      const data = await uploadLinkedInZip(file);
      onImported(data);
      setSuccess(true);
    } catch (e) {
      setError(errorMessage(e, 'Could not read that file.'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const bg = isDark ? '#09090b' : '#ffffff';
  const line = isDark ? '#27272a' : '#e4e4e7';
  const fg = isDark ? '#ffffff' : '#18181b';
  const muted = isDark ? '#a1a1aa' : '#71717a';
  const card = isDark ? 'rgba(24,24,27,0.7)' : '#fafafa';

  return (
    <div style={{ borderRadius: 12, border: `1px solid ${line}`, background: card, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: muted, margin: 0 }}>Have your LinkedIn data export?</p>
        <button
          onClick={() => setShowHelp(true)}
          aria-label="How to get your LinkedIn data export"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 0, lineHeight: 0 }}
        >
          <Icon name="help" size={14} />
        </button>
      </div>
      <p style={{ marginTop: 4, fontSize: 12, color: muted }}>
        Upload the ZIP to fill in your title, company and bio automatically.
      </p>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '8px 0', fontSize: 12, fontWeight: 500, borderRadius: 8, border: `1px solid ${line}`,
          background: 'none', color: muted, cursor: uploading ? 'default' : 'pointer', opacity: uploading ? 0.6 : 1,
        }}
      >
        <Icon name="upload" size={14} />
        {uploading ? 'Reading your export…' : 'Upload LinkedIn ZIP'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {error && <p style={{ marginTop: 8, fontSize: 12, color: '#f87171' }}>{error}</p>}
      {success && !error && <p style={{ marginTop: 8, fontSize: 12, color: '#34d399' }}>Imported — your details have been filled in.</p>}

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How to get your LinkedIn data export"
          style={{
            position: 'fixed', inset: 0, zIndex: 10000, display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 16,
            background: 'rgba(0,0,0,0.7)',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative', width: '100%', maxWidth: 420, borderRadius: 16,
              border: `1px solid ${line}`, background: bg, padding: 24,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: fg, margin: 0 }}>Getting your LinkedIn data export</h3>
              <button
                onClick={() => setShowHelp(false)}
                aria-label="Close"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, padding: 0, lineHeight: 0 }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <ol style={{ marginTop: 16, paddingLeft: 18, fontSize: 12, color: muted, lineHeight: 1.7 }}>
              {STEPS.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p style={{ marginTop: 16, fontSize: 12, color: muted }}>
              LinkedIn needs time to prepare the archive — come back and upload it here whenever it&apos;s ready.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
