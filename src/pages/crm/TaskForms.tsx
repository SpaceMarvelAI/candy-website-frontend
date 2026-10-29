/**
 * Task writes (create + update) for working roles. Contract: services/crm_service.py + api/v1/crm_work.py.
 *
 *  • Create sends title / task_type / priority / details / due_at / patient_id / case_id / assignee. When a task is
 *    created from a case or a patient the link is sent and the backend verifies tenant ownership and that the
 *    patient matches the case's patient. Source, contact number and the originating interaction are not writable.
 *  • Update is a PATCH of ONLY the changed fields. `expired` is system-only and never offered. A done, cancelled or
 *    expired task is read-only (the backend 409s). Status choices follow the legal moves — advisory; the database
 *    trigger is the authority.
 */
import { useState } from 'react';
import {
  TASK_TRANSITIONS, createTask, updateTask,
  type CrmTaskDetail, type Priority, type TaskCreate, type TaskStatus, type TaskType, type TaskUpdate,
} from '../../api/crm';
import { useApp } from '../../context/AppContext';
import {
  AssigneeField, MutationError, SaveBar, SelectField, SuccessNote, TextAreaField, TextField, assigneeValue, formBody, formGrid,
  type AssigneeChoice,
} from './forms';
import { Card, label } from './ui';
import { useCrmMutation } from './useCrmMutation';

export const TASK_LIMITS = { title: 500, details: 10_000, outcome: 4_000 } as const;
const TASK_TYPES: TaskType[] = ['other', 'callback', 'waitlist_followup', 'document_followup', 'reminder', 'outreach'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const typeOptions = TASK_TYPES.map((t) => ({ value: t, label: label(t) }));
const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: p }));

type Errors = Partial<Record<'title' | 'details' | 'outcome' | 'due', string>>;

const pad = (n: number) => String(n).padStart(2, '0');
/** ISO instant → the value a <input type="datetime-local"> expects, in the viewer's local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const toIso = (local: string): string | null => {
  const d = new Date(local);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

function validate(v: { title: string; details: string; outcome?: string; due: string }): Errors {
  const e: Errors = {};
  if (!v.title.trim()) e.title = 'Enter a title.';
  else if (v.title.trim().length > TASK_LIMITS.title) e.title = `Title can be at most ${TASK_LIMITS.title} characters.`;
  if (v.details.length > TASK_LIMITS.details) e.details = `Details can be at most ${TASK_LIMITS.details.toLocaleString()} characters.`;
  if ((v.outcome ?? '').length > TASK_LIMITS.outcome) e.outcome = `Outcome can be at most ${TASK_LIMITS.outcome.toLocaleString()} characters.`;
  if (v.due && toIso(v.due) === null) e.due = 'Enter a valid date and time.';
  return e;
}

// ── create ──────────────────────────────────────────────────────────────────
export function TaskCreateForm({ patientId, caseId, onCreated, onCancel }: {
  patientId?: string; caseId?: string; onCreated: (t: CrmTaskDetail) => void; onCancel: () => void;
}) {
  const { user } = useApp();
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('other');
  const [priority, setPriority] = useState<Priority>('P3');
  const [details, setDetails] = useState('');
  const [due, setDue] = useState('');
  const [assignee, setAssignee] = useState<AssigneeChoice>('none');
  const [errors, setErrors] = useState<Errors>({});
  const save = useCrmMutation((body: TaskCreate) => createTask(body));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate({ title, details, due });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: TaskCreate = { title: title.trim(), task_type: taskType, priority };
    if (details.trim()) body.details = details.trim();
    if (due) body.due_at = toIso(due) as string;
    if (patientId) body.patient_id = patientId;
    if (caseId) body.case_id = caseId;
    const who = assigneeValue(assignee, user?.user_id);
    if (typeof who === 'string') body.assigned_to_user_id = who;
    const created = await save.run(body);
    if (created) onCreated(created);
  };

  return (
    <Card title="New task">
      <form onSubmit={submit} aria-label="New task" style={formBody} noValidate>
        <TextField label="Title" value={title} maxLength={TASK_LIMITS.title} error={errors.title} disabled={save.saving} onChange={setTitle} />
        <div style={formGrid}>
          <SelectField label="Type" value={taskType} onChange={setTaskType} options={typeOptions} disabled={save.saving} />
          <SelectField label="Priority" value={priority} onChange={setPriority} options={priorityOptions} disabled={save.saving} />
          <TextField label="Due (optional)" type="datetime-local" value={due} error={errors.due} disabled={save.saving} onChange={setDue} />
          <AssigneeField value={assignee} onChange={setAssignee} editing={false} disabled={save.saving} />
        </div>
        <TextAreaField label="Details (optional)" value={details} maxLength={TASK_LIMITS.details} error={errors.details} disabled={save.saving} onChange={setDetails} />
        <MutationError error={save.error} />
        <SaveBar saving={save.saving} label="Create task" savingLabel="Creating…" onCancel={onCancel} />
      </form>
    </Card>
  );
}

// ── edit ────────────────────────────────────────────────────────────────────
export function TaskEditCard({ data, onSaved }: { data: CrmTaskDetail; onSaved: () => void }) {
  const [saved, setSaved] = useState<string | null>(null);
  if (data.status === 'done' || data.status === 'cancelled' || data.status === 'expired') {
    return (
      <Card title="Update task">
        {/* The record may have just become terminal because of this very save — keep the confirmation visible. */}
        {saved && <div style={{ padding: '16px 22px 0' }}><SuccessNote message={saved} /></div>}
        <p style={{ margin: 0, padding: '16px 22px', fontSize: 13, color: 'var(--text-3)' }}>A {data.status} task cannot be changed.</p>
      </Card>
    );
  }
  return (
    <Card title="Update task">
      {/* Re-keyed on updated_at so the fields re-seed from the saved record. */}
      <TaskEditForm key={data.updated_at} data={data} onSaved={() => { setSaved('Task updated.'); onSaved(); }} />
      <div style={{ padding: saved ? '0 22px 16px' : 0 }}><SuccessNote message={saved} /></div>
    </Card>
  );
}

function TaskEditForm({ data, onSaved }: { data: CrmTaskDetail; onSaved: () => void }) {
  const { user } = useApp();
  const [status, setStatus] = useState<TaskStatus>(data.status);
  const [priority, setPriority] = useState<Priority>(data.priority);
  const [title, setTitle] = useState(data.title);
  const [details, setDetails] = useState(data.details ?? '');
  const [outcome, setOutcome] = useState(data.outcome ?? '');
  const [due, setDue] = useState(toLocalInput(data.due_at));
  const [assignee, setAssignee] = useState<AssigneeChoice>('keep');
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const save = useCrmMutation((body: TaskUpdate) => updateTask(data.id, body));

  const statusOptions = [data.status, ...TASK_TRANSITIONS[data.status]].map((s) => ({ value: s, label: label(s) }));
  const hasDetails = 'details' in data;
  const hasOutcome = 'outcome' in data;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const errs = validate({ title, details, outcome, due });
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: TaskUpdate = {};
    if (status !== data.status) body.status = status as TaskUpdate['status'];
    if (priority !== data.priority) body.priority = priority;
    if (title.trim() !== data.title) body.title = title.trim();
    if (hasDetails && details.trim() !== (data.details ?? '')) body.details = details.trim() || null;
    if (hasOutcome && outcome.trim() !== (data.outcome ?? '')) body.outcome = outcome.trim() || null;
    if (due !== toLocalInput(data.due_at)) body.due_at = due ? toIso(due) : null;
    const who = assigneeValue(assignee, user?.user_id);
    if (who !== undefined && who !== data.assigned_to_user_id) body.assigned_to_user_id = who;
    if (Object.keys(body).length === 0) { setNotice('No changes to save.'); return; }
    const updated = await save.run(body);
    if (updated) onSaved();
  };

  return (
    <form onSubmit={submit} aria-label="Update task" style={formBody} noValidate>
      <div style={formGrid}>
        <SelectField label="Status" value={status} onChange={setStatus} options={statusOptions} disabled={save.saving} />
        <SelectField label="Priority" value={priority} onChange={setPriority} options={priorityOptions} disabled={save.saving} />
        <AssigneeField value={assignee} onChange={setAssignee} current={data.assigned_to_user_id} myId={user?.user_id} editing disabled={save.saving} />
        <TextField label="Due" type="datetime-local" value={due} error={errors.due} disabled={save.saving} onChange={setDue} hint="Clear the field to remove the due date." />
      </div>
      <TextField label="Title" value={title} maxLength={TASK_LIMITS.title} error={errors.title} disabled={save.saving} onChange={setTitle} />
      {hasDetails && <TextAreaField label="Details" value={details} maxLength={TASK_LIMITS.details} error={errors.details} disabled={save.saving} onChange={setDetails} />}
      {hasOutcome && <TextAreaField label="Outcome" rows={3} value={outcome} maxLength={TASK_LIMITS.outcome} error={errors.outcome} disabled={save.saving} onChange={setOutcome} />}
      {notice && <div role="status" style={{ fontSize: 13, color: 'var(--text-3)' }}>{notice}</div>}
      <MutationError error={save.error} />
      <SaveBar saving={save.saving} label="Save changes" />
    </form>
  );
}
