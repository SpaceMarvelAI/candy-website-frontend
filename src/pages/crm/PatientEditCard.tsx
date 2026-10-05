/**
 * Patient profile edit for working roles. Contract: PATCH /v1/crm/patients/{id} (owner/admin/member/builder).
 *
 *  • Only the five fields the backend allows: name, preferred provider, preferred language, lifecycle stage and
 *    status (active/inactive). Phone, email, date of birth and the external reference are identity fields the API
 *    refuses (422), so they are never offered here. "merged" is not a status a person can set, and a merged
 *    patient is frozen (409) — it gets a read-only line instead of a form.
 *  • PATCH semantics: only changed fields are sent; clearing provider or language sends an explicit null.
 *  • Language names come from the existing public catalog (/v1/languages); the CRM stores only its numeric id.
 */
import { useState } from 'react';
import { updatePatient, type LifecycleStage, type PatientDetail, type PatientUpdate } from '../../api/crm';
import { listLanguages } from '../../api/languages';
import { MutationError, SaveBar, SelectField, SuccessNote, TextField, formBody, formGrid } from './forms';
import { Card, buttonStyle } from './ui';
import { useCrmMutation } from './useCrmMutation';
import { useCrmQuery } from './useCrmQuery';

export const PATIENT_LIMITS = { name: 200, provider: 200 } as const;
type Editable = 'active' | 'inactive';
type Errors = Partial<Record<'name' | 'provider', string>>;

const STAGES: { value: LifecycleStage; label: string }[] = [{ value: 'enquiry', label: 'Enquiry' }, { value: 'patient', label: 'Patient' }];
const STATUSES: { value: Editable; label: string }[] = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }];

export function PatientEditCard({ data, onSaved }: { data: PatientDetail; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  if (data.status === 'merged') {
    return (
      <Card title="Edit patient">
        <p style={{ margin: 0, padding: '16px 22px', fontSize: 13, color: 'var(--text-3)' }}>A merged patient cannot be edited.</p>
      </Card>
    );
  }
  return (
    <Card title="Edit patient">
      {editing ? (
        <EditForm key={data.updated_at} data={data} onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); setSaved('Patient updated.'); onSaved(); }} />
      ) : (
        <div style={{ padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" style={buttonStyle} onClick={() => { setSaved(null); setEditing(true); }}>Edit details</button>
          <span style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Phone, email and date of birth cannot be edited here.</span>
          <SuccessNote message={saved} />
        </div>
      )}
    </Card>
  );
}

function EditForm({ data, onSaved, onCancel }: { data: PatientDetail; onSaved: () => void; onCancel: () => void }) {
  const [name, setName] = useState(data.full_name ?? '');
  const [provider, setProvider] = useState(data.preferred_provider ?? '');
  const [language, setLanguage] = useState(data.preferred_language_id != null ? String(data.preferred_language_id) : '');
  const [stage, setStage] = useState<LifecycleStage>(data.lifecycle_stage);
  const [status, setStatus] = useState<Editable>(data.status === 'inactive' ? 'inactive' : 'active');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const languages = useCrmQuery(() => listLanguages(), []);
  const save = useCrmMutation((body: PatientUpdate) => updatePatient(data.id, body));

  const options = [{ value: '', label: 'Not set' }, ...(languages.data ?? []).map((l) => ({ value: String(l.id), label: l.name }))];
  // The current language may not be in the catalog (still loading, or retired): keep it selectable, without showing a raw id.
  if (language && !options.some((o) => o.value === language)) options.push({ value: language, label: 'Current setting' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const errs: Errors = {};
    if (!name.trim()) errs.name = 'Enter a name.';
    else if (name.trim().length > PATIENT_LIMITS.name) errs.name = `Name can be at most ${PATIENT_LIMITS.name} characters.`;
    if (provider.trim().length > PATIENT_LIMITS.provider) errs.provider = `Provider can be at most ${PATIENT_LIMITS.provider} characters.`;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body: PatientUpdate = {};
    if (name.trim() !== (data.full_name ?? '')) body.full_name = name.trim();
    if (provider.trim() !== (data.preferred_provider ?? '')) body.preferred_provider = provider.trim() || null;
    const langId = language ? Number(language) : null;
    if (langId !== (data.preferred_language_id ?? null)) body.preferred_language_id = langId;
    if (stage !== data.lifecycle_stage) body.lifecycle_stage = stage;
    if (status !== data.status) body.status = status;
    if (Object.keys(body).length === 0) { setNotice('No changes to save.'); return; }
    const updated = await save.run(body);
    if (updated) onSaved();
  };

  return (
    <form onSubmit={submit} aria-label="Edit patient" style={formBody} noValidate>
      <TextField label="Name" value={name} maxLength={PATIENT_LIMITS.name} error={errors.name} disabled={save.saving} onChange={setName} />
      <div style={formGrid}>
        <TextField label="Preferred provider" value={provider} maxLength={PATIENT_LIMITS.provider} error={errors.provider} disabled={save.saving} onChange={setProvider} />
        <SelectField label="Preferred language" value={language} onChange={setLanguage} options={options} disabled={save.saving} />
        <SelectField label="Lifecycle stage" value={stage} onChange={setStage} options={STAGES} disabled={save.saving} />
        <SelectField label="Status" value={status} onChange={setStatus} options={STATUSES} disabled={save.saving} />
      </div>
      {notice && <div role="status" style={{ fontSize: 13, color: 'var(--text-3)' }}>{notice}</div>}
      <MutationError error={save.error} />
      <SaveBar saving={save.saving} label="Save changes" onCancel={onCancel} />
    </form>
  );
}
