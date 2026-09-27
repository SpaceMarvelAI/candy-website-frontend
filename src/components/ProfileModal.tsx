/**
 * ProfileModal — view/edit the current user's profile (name/phone/address/bio/avatar).
 * Talks to Candy's own backend (src/api/profile.ts → GET/PATCH /v1/profile).
 * Each text field saves independently via its own small save button.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '../assets/icons';
import { getProfile, updateProfile, deleteAvatar, type UserProfile } from '../api/profile';
import { errorMessage } from '../utils/apiError';

interface Props {
  onClose: () => void;
  /** Called with the freshly saved profile so the sidebar can update immediately, without
   *  waiting for the next login to refresh AppContext's cached user. */
  onSaved?: (profile: UserProfile) => void;
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/png'];

type FieldKey = 'name' | 'phone' | 'address' | 'bio';
type FieldStatus = 'idle' | 'saving' | 'error';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text-1)', fontSize: 13, boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-4)', marginBottom: 4, display: 'block' };

interface FieldRowProps {
  field: FieldKey;
  label: string;
  value: string;
  dirty: boolean;
  status: FieldStatus;
  error: string;
  multiline?: boolean;
  onChange: (field: FieldKey, value: string) => void;
  onSave: (field: FieldKey) => void;
}

function FieldRow({ field, label, value, dirty, status, error, multiline, onChange, onSave }: FieldRowProps) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: multiline ? 'flex-start' : 'center' }}>
        {multiline ? (
          <textarea
            style={{ ...inputStyle, resize: 'none' }}
            rows={3}
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder="A little about you"
          />
        ) : (
          <input
            style={inputStyle}
            value={value}
            onChange={(e) => onChange(field, e.target.value)}
            placeholder={label}
          />
        )}
        {dirty && (
          <button
            type="button"
            onClick={() => onSave(field)}
            disabled={status === 'saving'}
            title="Save"
            style={{
              flexShrink: 0, width: 30, height: 30, borderRadius: 8, border: 'none',
              background: 'var(--purple)', color: '#fff', cursor: status === 'saving' ? 'default' : 'pointer',
              display: 'grid', placeItems: 'center', opacity: status === 'saving' ? 0.6 : 1,
            }}
          >
            <Icon name="check" size={14} />
          </button>
        )}
      </div>
      {error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{error}</div>}
    </div>
  );
}

export default function ProfileModal({ onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const [saved, setSaved] = useState<Record<FieldKey, string>>({ name: '', phone: '', address: '', bio: '' });
  const [draft, setDraft] = useState<Record<FieldKey, string>>({ name: '', phone: '', address: '', bio: '' });
  const [fieldStatus, setFieldStatus] = useState<Record<FieldKey, FieldStatus>>({ name: 'idle', phone: 'idle', address: 'idle', bio: 'idle' });
  const [fieldError, setFieldError]   = useState<Record<FieldKey, string>>({ name: '', phone: '', address: '', bio: '' });

  const [email, setEmail]     = useState('');
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getProfile();
        if (cancelled) return;
        const fields: Record<FieldKey, string> = {
          name: profile.name ?? '', phone: profile.phone ?? '', address: profile.address ?? '', bio: profile.bio ?? '',
        };
        setSaved(fields);
        setDraft(fields);
        setEmail(profile.email ?? '');
        setAvatarUrl(profile.avatar_url);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const initials = (saved.name || email || '?').split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();

  function onFieldChange(field: FieldKey, value: string) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function saveField(field: FieldKey) {
    setFieldStatus((s) => ({ ...s, [field]: 'saving' }));
    setFieldError((e) => ({ ...e, [field]: '' }));
    try {
      const profile = await updateProfile({ [field]: draft[field] });
      setSaved((s) => ({ ...s, [field]: draft[field] }));
      setFieldStatus((s) => ({ ...s, [field]: 'idle' }));
      onSaved?.(profile);
    } catch (err) {
      setFieldStatus((s) => ({ ...s, [field]: 'error' }));
      setFieldError((e) => ({ ...e, [field]: errorMessage(err) }));
    }
  }

  async function onPickAvatar(file: File | undefined) {
    if (!file) return;
    setError('');
    if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
      setError('Invalid file type. Allowed: JPEG, PNG.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError('File too large. Max size is 5MB.');
      return;
    }
    setAvatarUploading(true);
    try {
      const profile = await updateProfile({ avatarFile: file });
      setAvatarUrl(profile.avatar_url);
      onSaved?.(profile);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRemoveAvatar() {
    setRemovingAvatar(true);
    setError('');
    try {
      const profile = await deleteAvatar();
      setAvatarUrl(profile.avatar_url);
      onSaved?.(profile);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemovingAvatar(false);
    }
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: 440, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 24px 80px -8px rgba(0,0,0,0.7)', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
        }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>Profile</div>
          <button
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-4)', fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  style={{
                    width: 60, height: 60, borderRadius: '50%', border: 'none', cursor: avatarUploading ? 'default' : 'pointer',
                    padding: 0, position: 'relative', opacity: avatarUploading ? 0.6 : 1,
                  }}
                  title="Change avatar"
                >
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      onError={() => setAvatarUrl(null)}
                      style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{
                      width: 60, height: 60, borderRadius: '50%', background: 'var(--grad-brand)',
                      display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, color: '#fff',
                    }}>
                      {initials}
                    </div>
                  )}
                </button>
                {avatarUrl && !avatarUploading && (
                  <button
                    type="button"
                    onClick={handleRemoveAvatar}
                    disabled={removingAvatar}
                    title="Remove photo"
                    style={{
                      position: 'absolute', bottom: -2, right: -2, width: 22, height: 22,
                      borderRadius: '50%', border: '2px solid var(--bg-1)', cursor: 'pointer',
                      background: '#f87171', color: '#fff', display: 'grid', placeItems: 'center',
                      opacity: removingAvatar ? 0.6 : 1,
                    }}
                  >
                    <Icon name="trash" size={11} />
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                style={{ display: 'none' }}
                onChange={(e) => onPickAvatar(e.target.files?.[0])}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{saved.name || email}</div>
                <div style={{ fontSize: 11, color: 'var(--text-4)' }}>{email}</div>
              </div>
            </div>

            <FieldRow field="name" label="Name" value={draft.name} dirty={draft.name !== saved.name}
              status={fieldStatus.name} error={fieldError.name} onChange={onFieldChange} onSave={saveField} />
            <FieldRow field="phone" label="Phone" value={draft.phone} dirty={draft.phone !== saved.phone}
              status={fieldStatus.phone} error={fieldError.phone} onChange={onFieldChange} onSave={saveField} />
            <FieldRow field="address" label="Address" value={draft.address} dirty={draft.address !== saved.address}
              status={fieldStatus.address} error={fieldError.address} onChange={onFieldChange} onSave={saveField} />
            <FieldRow field="bio" label="Bio" value={draft.bio} dirty={draft.bio !== saved.bio}
              status={fieldStatus.bio} error={fieldError.bio} multiline onChange={onFieldChange} onSave={saveField} />

            {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}
          </div>
        )}

        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8,
          padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
