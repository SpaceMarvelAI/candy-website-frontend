/**
 * Case writes (create + update) for working roles. Contract: services/crm_service.py + api/v1/crm_work.py.
 *
 *  • Create sends only subject / case_type / category / priority / description / patient_id / assignee. The
 *    reference, source and originating interaction are set by the backend and are not sent (the API rejects them).
 *  • Update is a PATCH of ONLY the fields the user changed. A closed case is read-only (the backend 409s).
 *    Status choices are limited to the legal moves, which is advisory — the database trigger is the authority.
 *  • Nothing here widens access: restricted roles never see these controls, and the backend refuses them anyway.
 */
import { useState } from 'react';
import {
  CASE_TRANSITIONS, createCase, updateCase,
  type CaseCreate, type CaseStatus, type CaseType, type CaseUpdate, type CrmCaseDetail, type Priority,
} from '../../api/crm';
import { useApp } from '../../context/AppContext';
import {
  AssigneeField, MutationError, SaveBar, SelectField, SuccessNote, TextAreaField, TextField, assigneeValue, formBody, formGrid,
  type AssigneeChoice,
} from './forms';
import { Card, label } from './ui';
import { useCrmMutation } from './useCrmMutation';

export const CASE_LIMITS = { subject: 500, category: 100, description: 10_000, resolution: 4_000 } as const;
const CASE_TYPES: CaseType[] = ['service_request', 'complaint', 'medication_refill', 'red_flag', 'intake', 'other'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const typeOptions = CASE_TYPES.map((t) => ({ value: t, label: label(t) }));
const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: p }));

type Errors = Partial<Record<'subject' | 'category' | 'description' | 'resolution', string>>;

function validate(v: { subject: string; category: string; description: string; resolution?: string }): Errors {
  const e: Errors = {};
  if (!v.subject.trim()) e.subject = 'Enter a subject.';
  else if (v.subject.trim().length > CASE_LIMITS.subject) e.subject = `Subject can be at most ${CASE_LIMITS.subject} characters.`;
  if (v.category.trim().length > CASE_LIMITS.category) e.category = `Category can be at most ${CASE_LIMITS.category} characters.`;
  if (v.description.length > CASE_LIMITS.description) e.description = `Description can be at most ${CASE_LIMITS.description.toLocaleString()} characters.`;
  if ((v.resolution ?? '').length > CASE_LIMITS.resolution) e.resolution = `Resolution note can be at most ${CASE_LIMITS.resolution.toLocaleString()} characters.`;
  return e;
}

// ── create ──────────────────────────────────────────────────────────────────
export function CaseCreateForm({ patientId, onCreated, onCancel }: {
  patientId?: string; onCreated: (c: CrmCaseDetail) => void; onCancel: () => void;
}) {
  const { user } = useApp();
  const [subject, setSubject] = useState('');
  const [caseType, setCaseType] = useState<CaseType>('service_request');
  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<Priority>('P3');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState<AssigneeChoice>('none');
  const [errors, setErrors] = useState<Errors>({});
  const save = useCrmMutation((body: CaseCreate) => createCase(body));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate({ subject, category, description });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: CaseCreate = { subject: subject.trim(), case_type: caseType, priority };
    if (category.trim()) body.category = category.trim();
    if (description.trim()) body.description = description.trim();
    if (patientId) body.patient_id = patientId;
    const who = assigneeValue(assignee, user?.user_id);
    if (typeof who === 'string') body.assigned_to_user_id = who;
    const created = await save.run(body);
    if (created) onCreated(created);
  };

  return (
    <Card title="New case">
      <form onSubmit={submit} aria-label="New case" style={formBody} noValidate>
        <TextField label="Subject" value={subject} maxLength={CASE_LIMITS.subject} error={errors.subject} disabled={save.saving} onChange={setSubject} />
        <div style={formGrid}>
          <SelectField label="Type" value={caseType} onChange={setCaseType} options={typeOptions} disabled={save.saving} />
          <SelectField label="Priority" value={priority} onChange={setPriority} options={priorityOptions} disabled={save.saving} />
          <TextField label="Category (optional)" value={category} maxLength={CASE_LIMITS.category} error={errors.category} disabled={save.saving} onChange={setCategory} />
          <AssigneeField value={assignee} onChange={setAssignee} editing={false} disabled={save.saving} />
        </div>
        <TextAreaField label="Description (optional)" value={description} maxLength={CASE_LIMITS.description} error={errors.description} disabled={save.saving} onChange={setDescription} />
        <MutationError error={save.error} />
        <SaveBar saving={save.saving} label="Create case" savingLabel="Creating…" onCancel={onCancel} />
      </form>
    </Card>
  );
}

// ── edit ────────────────────────────────────────────────────────────────────
export function CaseEditCard({ data, onSaved }: { data: CrmCaseDetail; onSaved: () => void }) {
  const [saved, setSaved] = useState<string | null>(null);
  if (data.status === 'closed') {
    return (
      <Card title="Update case">
        {/* The case may have just been closed by this very save — keep the confirmation visible. */}
        {saved && <div style={{ padding: '16px 22px 0' }}><SuccessNote message={saved} /></div>}
        <p style={{ margin: 0, padding: '16px 22px', fontSize: 13, color: 'var(--text-3)' }}>A closed case cannot be changed.</p>
      </Card>
    );
  }
  return (
    <Card title="Update case">
      {/* Re-keyed on updated_at so the fields re-seed from the saved record. */}
      <CaseEditForm key={data.updated_at} data={data} onSaved={() => { setSaved('Case updated.'); onSaved(); }} />
      <div style={{ padding: saved ? '0 22px 16px' : 0 }}><SuccessNote message={saved} /></div>
    </Card>
  );
}

function CaseEditForm({ data, onSaved }: { data: CrmCaseDetail; onSaved: () => void }) {
  const { user } = useApp();
  const [status, setStatus] = useState<CaseStatus>(data.status);
  const [priority, setPriority] = useState<Priority>(data.priority);
  const [subject, setSubject] = useState(data.subject);
  const [category, setCategory] = useState(data.category ?? '');
  const [description, setDescription] = useState(data.description ?? '');
  const [resolution, setResolution] = useState(data.resolution_note ?? '');
  const [assignee, setAssignee] = useState<AssigneeChoice>('keep');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const save = useCrmMutation((body: CaseUpdate) => updateCase(data.id, body));

  const statusOptions = [data.status, ...CASE_TRANSITIONS[data.status]].map((s) => ({ value: s, label: label(s) }));
  // Free-text keys exist only when the backend sent them (working roles).
  const hasDescription = 'description' in data;
  const hasResolution = 'resolution_note' in data;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const errs = validate({ subject, category, description, resolution });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: CaseUpdate = {};
    if (status !== data.status) body.status = status;
    if (priority !== data.priority) body.priority = priority;
    if (subject.trim() !== data.subject) body.subject = subject.trim();
    if (category.trim() !== (data.category ?? '')) body.category = category.trim() || null;
    if (hasDescription && description.trim() !== (data.description ?? '')) body.description = description.trim() || null;
    if (hasResolution && resolution.trim() !== (data.resolution_note ?? '')) body.resolution_note = resolution.trim() || null;
    const who = assigneeValue(assignee, user?.user_id);
    if (who !== undefined && who !== data.assigned_to_user_id) body.assigned_to_user_id = who;
    if (Object.keys(body).length === 0) { setNotice('No changes to save.'); return; }
    const updated = await save.run(body);
    if (updated) onSaved();
  };

  return (
    <form onSubmit={submit} aria-label="Update case" style={formBody} noValidate>
      <div style={formGrid}>
        <SelectField label="Status" value={status} onChange={setStatus} options={statusOptions} disabled={save.saving} />
        <SelectField label="Priority" value={priority} onChange={setPriority} options={priorityOptions} disabled={save.saving} />
        <AssigneeField value={assignee} onChange={setAssignee} current={data.assigned_to_user_id} myId={user?.user_id} editing disabled={save.saving} />
        <TextField label="Category" value={category} maxLength={CASE_LIMITS.category} error={errors.category} disabled={save.saving} onChange={setCategory} />
      </div>
      <TextField label="Subject" value={subject} maxLength={CASE_LIMITS.subject} error={errors.subject} disabled={save.saving} onChange={setSubject} />
      {hasDescription && <TextAreaField label="Description" value={description} maxLength={CASE_LIMITS.description} error={errors.description} disabled={save.saving} onChange={setDescription} />}
      {hasResolution && <TextAreaField label="Resolution note" rows={3} value={resolution} maxLength={CASE_LIMITS.resolution} error={errors.resolution} disabled={save.saving} onChange={setResolution} />}
      {notice && <div role="status" style={{ fontSize: 13, color: 'var(--text-3)' }}>{notice}</div>}
      <MutationError error={save.error} />
      <SaveBar saving={save.saving} label="Save changes" />
    </form>
  );
}
