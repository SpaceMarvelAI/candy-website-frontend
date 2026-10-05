/**
 * Cases and Tasks — list + detail screens, with create / update for working roles (see CaseForms / TaskForms).
 *
 * Role-redacted fields are rendered only when the backend sent the key. Viewers receive no case
 * description / resolution note and no task details / outcome (and a masked task contact number);
 * nothing here reconstructs them or substitutes an empty-looking placeholder.
 * The API exposes the assignee as an opaque user id only, so the UI says "Assigned" / "Unassigned".
 */
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  CRM_DEFAULT_LIMIT, getCase, getTask, listCases, listTasks,
  type CaseStatus, type Priority, type TaskStatus,
} from '../../api/crm';
import {
  Badge, Card, CrmPage, EmptyState, ErrorState, FieldList, PageHeader, Pagination, Phi, RefreshButton,
  RowLink, TableCard, TableSkeleton, Td, Th, fmtDateTime, label, selectStyle, type Tone,
} from './ui';
import { useCrmQuery } from './useCrmQuery';
import { useApp } from '../../context/AppContext';
import { canWriteCrm } from '../../utils/crmAccess';
import { CaseCreateForm, CaseEditCard } from './CaseForms';
import { TaskCreateForm, TaskEditCard } from './TaskForms';
import { buttonStyle } from './ui';

export const PRIORITY_TONE: Record<Priority, Tone> = { P1: 'bad', P2: 'warn', P3: 'info', P4: 'mute' };
export const CASE_TONE: Record<CaseStatus, Tone> = { open: 'info', in_progress: 'warn', resolved: 'good', closed: 'mute' };
export const TASK_TONE: Record<TaskStatus, Tone> = { open: 'info', in_progress: 'warn', done: 'good', cancelled: 'mute', expired: 'bad' };
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const assignee = (id: string | null) => (id ? 'Assigned' : 'Unassigned');

function PatientFilterNote({ patientId }: { patientId: string | null }) {
  if (!patientId) return null;
  return (
    <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
      Showing records for one patient. <Link to={`/crm/patients/${patientId}`} style={{ color: 'var(--blue)' }}>Back to patient</Link>
    </p>
  );
}

// ── Cases ───────────────────────────────────────────────────────────────────
export function CasesPage() {
  const [params] = useSearchParams();
  const patientId = params.get('patient_id');
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [offset, setOffset] = useState(0);
  const { user } = useApp();
  const navigate = useNavigate();
  const canWrite = canWriteCrm(user?.role);
  const [creating, setCreating] = useState(false);
  const q = useCrmQuery(
    (signal) => listCases({
      status: status || undefined, priority: priority || undefined, patient_id: patientId ?? undefined,
      sort: 'created_at', order: 'desc', limit: CRM_DEFAULT_LIMIT, offset,
    }, { signal }),
    [status, priority, patientId, offset],
  );
  const items = q.data?.items ?? [];
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Cases" title="Cases" subtitle="Follow-ups raised from patient interactions."
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Cases' }]}
        actions={<span style={{ display: 'flex', gap: 8 }}>
          {canWrite && !creating && <button type="button" style={buttonStyle} onClick={() => setCreating(true)}>New case</button>}
          <RefreshButton onClick={q.reload} />
        </span>} />
      {canWrite && creating && (
        <CaseCreateForm patientId={patientId ?? undefined} onCancel={() => setCreating(false)}
          onCreated={(c) => navigate(`/crm/cases/${c.id}`)} />
      )}
      <PatientFilterNote patientId={patientId} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select aria-label="Case status" value={status} onChange={(e) => { setStatus(e.target.value as CaseStatus | ''); setOffset(0); }} style={selectStyle}>
          <option value="">All statuses</option>
          {(['open', 'in_progress', 'resolved', 'closed'] as CaseStatus[]).map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select aria-label="Case priority" value={priority} onChange={(e) => { setPriority(e.target.value as Priority | ''); setOffset(0); }} style={selectStyle}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <>
          <TableCard>
            {q.loading ? <TableSkeleton cols={['12%', '30%', '10%', '12%', '12%', '16%']} /> : items.length === 0 ? (
              <EmptyState title="No cases found" hint="Cases appear here once they are raised." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Reference</Th><Th>Subject</Th><Th>Priority</Th><Th>Status</Th><Th>Assignee</Th><Th>Created</Th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <Td><RowLink to={`/crm/cases/${c.id}`}>{c.reference}</RowLink></Td>
                      <Td><Phi>{c.subject}</Phi></Td>
                      <Td><Badge tone={PRIORITY_TONE[c.priority] ?? 'mute'}>{c.priority}</Badge></Td>
                      <Td><Badge tone={CASE_TONE[c.status] ?? 'mute'}>{label(c.status)}</Badge></Td>
                      <Td>{assignee(c.assigned_to_user_id)}</Td>
                      <Td>{fmtDateTime(c.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          {q.data && !q.loading && <Pagination offset={q.data.offset} limit={q.data.limit} count={items.length} hasMore={q.data.has_more} onChange={setOffset} />}
        </>
      )}
    </CrmPage>
  );
}

export function CaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const q = useCrmQuery((signal) => getCase(id, { signal }), [id]);
  const c = q.data;
  const { user } = useApp();
  const navigate = useNavigate();
  const canWrite = canWriteCrm(user?.role);
  const [addingTask, setAddingTask] = useState(false);
  // Free-text keys exist only for working roles; absence means the backend withheld them.
  const hasFreeText = !!c && ('description' in c || 'resolution_note' in c);
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Cases" title={c ? c.reference : 'Case'}
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Cases', to: '/crm/cases' }, { label: 'Case' }]} actions={<RefreshButton onClick={q.reload} />} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !c || c.id !== id ? <Card><TableSkeleton cols={['30%', '30%', '30%']} /></Card> : (
        <>
          <Card title="Case">
            <FieldList fields={[
              { label: 'Subject', value: <Phi>{c.subject}</Phi> },
              { label: 'Status', value: <Badge tone={CASE_TONE[c.status] ?? 'mute'}>{label(c.status)}</Badge> },
              { label: 'Priority', value: <Badge tone={PRIORITY_TONE[c.priority] ?? 'mute'}>{c.priority}</Badge> },
              { label: 'Type', value: label(c.case_type) },
              { label: 'Category', value: c.category ? <Phi>{label(c.category)}</Phi> : '—' },
              { label: 'Source', value: label(c.source) },
              { label: 'Assignee', value: assignee(c.assigned_to_user_id) },
              { label: 'Created', value: fmtDateTime(c.created_at) },
              { label: 'Updated', value: fmtDateTime(c.updated_at) },
              { label: 'Resolved', value: fmtDateTime(c.resolved_at) },
              { label: 'Closed', value: fmtDateTime(c.closed_at) },
            ]} />
          </Card>
          {hasFreeText ? (
            <Card title="Details">
              <FieldList fields={[
                ...('description' in c ? [{ label: 'Description', value: <Phi style={{ whiteSpace: 'pre-wrap' }}>{c.description || '—'}</Phi> }] : []),
                ...('resolution_note' in c ? [{ label: 'Resolution note', value: <Phi style={{ whiteSpace: 'pre-wrap' }}>{c.resolution_note || '—'}</Phi> }] : []),
              ]} />
            </Card>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Free-text case details are not available for your role.</p>
          )}
          {canWrite && <CaseEditCard data={c} onSaved={q.reload} />}
          {canWrite && (addingTask ? (
            <TaskCreateForm caseId={c.id} patientId={c.patient_id ?? undefined} onCancel={() => setAddingTask(false)}
              onCreated={(t) => navigate(`/crm/tasks/${t.id}`)} />
          ) : (
            <div style={{ marginBottom: 20 }}><button type="button" style={buttonStyle} onClick={() => setAddingTask(true)}>Add a task for this case</button></div>
          ))}
          {c.patient_id && (
            <Card title="Related records">
              <div style={{ padding: '16px 22px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <Link to={`/crm/patients/${c.patient_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Patient</Link>
                <Link to={`/crm/tasks?patient_id=${c.patient_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Tasks for this patient</Link>
              </div>
            </Card>
          )}
        </>
      )}
    </CrmPage>
  );
}

// ── Tasks ───────────────────────────────────────────────────────────────────
export function TasksPage() {
  const [params] = useSearchParams();
  const patientId = params.get('patient_id');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [offset, setOffset] = useState(0);
  const { user } = useApp();
  const navigate = useNavigate();
  const canWrite = canWriteCrm(user?.role);
  const [creating, setCreating] = useState(false);
  const q = useCrmQuery(
    (signal) => listTasks({
      status: status || undefined, priority: priority || undefined, patient_id: patientId ?? undefined,
      sort: 'created_at', order: 'desc', limit: CRM_DEFAULT_LIMIT, offset,
    }, { signal }),
    [status, priority, patientId, offset],
  );
  const items = q.data?.items ?? [];
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Tasks" title="Tasks" subtitle="Work items for your team."
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Tasks' }]}
        actions={<span style={{ display: 'flex', gap: 8 }}>
          {canWrite && !creating && <button type="button" style={buttonStyle} onClick={() => setCreating(true)}>New task</button>}
          <RefreshButton onClick={q.reload} />
        </span>} />
      {canWrite && creating && (
        <TaskCreateForm patientId={patientId ?? undefined} onCancel={() => setCreating(false)}
          onCreated={(t) => navigate(`/crm/tasks/${t.id}`)} />
      )}
      <PatientFilterNote patientId={patientId} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <select aria-label="Task status" value={status} onChange={(e) => { setStatus(e.target.value as TaskStatus | ''); setOffset(0); }} style={selectStyle}>
          <option value="">All statuses</option>
          {(['open', 'in_progress', 'done', 'cancelled', 'expired'] as TaskStatus[]).map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <select aria-label="Task priority" value={priority} onChange={(e) => { setPriority(e.target.value as Priority | ''); setOffset(0); }} style={selectStyle}>
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <>
          <TableCard>
            {q.loading ? <TableSkeleton cols={['28%', '14%', '10%', '12%', '12%', '16%']} /> : items.length === 0 ? (
              <EmptyState title="No tasks found" hint="Tasks appear here once they are created." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Title</Th><Th>Type</Th><Th>Priority</Th><Th>Status</Th><Th>Assignee</Th><Th>Due</Th></tr></thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <Td><RowLink to={`/crm/tasks/${t.id}`}><Phi>{t.title}</Phi></RowLink></Td>
                      <Td>{label(t.task_type)}</Td>
                      <Td><Badge tone={PRIORITY_TONE[t.priority] ?? 'mute'}>{t.priority}</Badge></Td>
                      <Td><Badge tone={TASK_TONE[t.status] ?? 'mute'}>{label(t.status)}</Badge></Td>
                      <Td>{assignee(t.assigned_to_user_id)}</Td>
                      <Td>{fmtDateTime(t.due_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TableCard>
          {q.data && !q.loading && <Pagination offset={q.data.offset} limit={q.data.limit} count={items.length} hasMore={q.data.has_more} onChange={setOffset} />}
        </>
      )}
    </CrmPage>
  );
}

export function TaskDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const q = useCrmQuery((signal) => getTask(id, { signal }), [id]);
  const t = q.data;
  const { user } = useApp();
  const canWrite = canWriteCrm(user?.role);
  const fields: { label: string; value: React.ReactNode }[] = t ? [
    { label: 'Title', value: <Phi>{t.title}</Phi> },
    { label: 'Status', value: <Badge tone={TASK_TONE[t.status] ?? 'mute'}>{label(t.status)}</Badge> },
    { label: 'Priority', value: <Badge tone={PRIORITY_TONE[t.priority] ?? 'mute'}>{t.priority}</Badge> },
    { label: 'Type', value: label(t.task_type) },
    { label: 'Source', value: label(t.source) },
    { label: 'Assignee', value: assignee(t.assigned_to_user_id) },
    { label: 'Due', value: fmtDateTime(t.due_at) },
    { label: 'Created', value: fmtDateTime(t.created_at) },
    { label: 'Updated', value: fmtDateTime(t.updated_at) },
    { label: 'Closed', value: fmtDateTime(t.closed_at) },
  ] : [];
  if (t) {
    if (t.contact_phone !== undefined) fields.push({ label: 'Contact phone', value: t.contact_phone ? <Phi>{t.contact_phone}</Phi> : '—' });
    else if (t.contact_phone_masked !== undefined) fields.push({ label: 'Contact phone (masked)', value: t.contact_phone_masked ? <Phi>{t.contact_phone_masked}</Phi> : '—' });
    if (t.details !== undefined) fields.push({ label: 'Details', value: <Phi style={{ whiteSpace: 'pre-wrap' }}>{t.details || '—'}</Phi> });
    if (t.outcome !== undefined) fields.push({ label: 'Outcome', value: <Phi style={{ whiteSpace: 'pre-wrap' }}>{t.outcome || '—'}</Phi> });
  }
  const hasFreeText = !!t && ('details' in t || 'outcome' in t);
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Tasks" title="Task"
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Tasks', to: '/crm/tasks' }, { label: 'Task' }]} actions={<RefreshButton onClick={q.reload} />} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : !t || t.id !== id ? <Card><TableSkeleton cols={['30%', '30%', '30%']} /></Card> : (
        <>
          <Card title="Task"><FieldList fields={fields} /></Card>
          {!hasFreeText && <p style={{ fontSize: 12.5, color: 'var(--text-3)' }}>Task details and outcome are not available for your role.</p>}
          {canWrite && <TaskEditCard data={t} onSaved={q.reload} />}
          <Card title="Related records">
            <div style={{ padding: '16px 22px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {t.patient_id && <Link to={`/crm/patients/${t.patient_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Patient</Link>}
              {t.case_id && <Link to={`/crm/cases/${t.case_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Case</Link>}
              {!t.patient_id && !t.case_id && <span style={{ fontSize: 13, color: 'var(--text-3)' }}>Not linked to a patient or case.</span>}
            </div>
          </Card>
        </>
      )}
    </CrmPage>
  );
}
