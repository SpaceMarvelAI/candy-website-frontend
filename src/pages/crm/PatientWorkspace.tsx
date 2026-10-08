/**
 * Pieces that make the patient detail page the CRM workspace for one patient: a section navigator and compact
 * Cases / Tasks / Appointments cards scoped by `patient_id`. They reuse the list endpoints and the same create
 * forms as the full pages — nothing here is a new data path. Write controls are for working roles only (UX; the
 * backend enforces). Patient text is rendered through <Phi>; the patient id is only ever sent in the API path/query.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listAppointments, listCases, listTasks } from '../../api/crm';
import { useApp } from '../../context/AppContext';
import { canWriteCrm } from '../../utils/crmAccess';
import { CaseCreateForm } from './CaseForms';
import { SuccessNote } from './forms';
import { APPT_TONE } from './SchedulingPages';
import { TaskCreateForm } from './TaskForms';
import { CASE_TONE, PRIORITY_TONE, TASK_TONE } from './WorkPages';
import {
  Badge, Card, EmptyState, ErrorState, Phi, RowLink, TableSkeleton, Td, Th, buttonStyle, fmtDateTime, label,
} from './ui';
import { useCrmQuery } from './useCrmQuery';

const PREVIEW = 5;

export const WORKSPACE_SECTIONS = [
  { id: 'section-info', label: 'Information' },
  { id: 'section-verification', label: 'Verification' },
  { id: 'section-consent', label: 'Consent' },
  { id: 'section-interactions', label: 'Interactions' },
  { id: 'section-notes', label: 'Notes' },
  { id: 'section-cases', label: 'Cases' },
  { id: 'section-tasks', label: 'Tasks' },
  { id: 'section-appointments', label: 'Appointments' },
] as const;

/** In-page jump links. Buttons, not `#anchors`: the app uses a hash router, so a hash link would change the route. */
export function SectionNav() {
  return (
    <nav aria-label="Patient sections" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
      {WORKSPACE_SECTIONS.map((s) => (
        <button key={s.id} type="button" style={{ ...buttonStyle, padding: '6px 12px', fontSize: 12.5 }}
          onClick={() => document.getElementById(s.id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function CardActions({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 22px', borderBottom: '1px solid var(--border)' }}>{children}</div>;
}

/** `frozen` (merged patient): the lists stay readable but no new case/task can be started — the backend answers 409. */
export function PatientCasesCard({ patientId, frozen = false }: { patientId: string; frozen?: boolean }) {
  const { user } = useApp();
  const canWrite = canWriteCrm(user?.role) && !frozen;
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const q = useCrmQuery((signal) => listCases({ patient_id: patientId, sort: 'created_at', order: 'desc', limit: PREVIEW }, { signal }), [patientId]);
  const items = q.data?.items ?? [];
  return (
    <>
      {canWrite && creating && (
        <CaseCreateForm patientId={patientId} onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); setNotice('Case created.'); q.reload(); }} />
      )}
      <Card title="Cases">
        <CardActions>
          {canWrite && !creating && <button type="button" style={buttonStyle} onClick={() => { setNotice(null); setCreating(true); }}>New case</button>}
          <Link to={`/crm/cases?patient_id=${patientId}`} style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>View all cases</Link>
          <SuccessNote message={notice} />
        </CardActions>
        {q.error ? <div style={{ padding: 16 }}><ErrorState error={q.error} onRetry={q.reload} /></div>
          : q.loading ? <TableSkeleton cols={['16%', '40%', '12%', '14%']} />
          : items.length === 0 ? <EmptyState title="No cases for this patient" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Reference</Th><Th>Subject</Th><Th>Priority</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id}>
                      <Td><RowLink to={`/crm/cases/${c.id}`}>{c.reference}</RowLink></Td>
                      <Td><Phi>{c.subject}</Phi></Td>
                      <Td><Badge tone={PRIORITY_TONE[c.priority] ?? 'mute'}>{c.priority}</Badge></Td>
                      <Td><Badge tone={CASE_TONE[c.status] ?? 'mute'}>{label(c.status)}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}

export function PatientTasksCard({ patientId, frozen = false }: { patientId: string; frozen?: boolean }) {
  const { user } = useApp();
  const canWrite = canWriteCrm(user?.role) && !frozen;
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const q = useCrmQuery((signal) => listTasks({ patient_id: patientId, sort: 'created_at', order: 'desc', limit: PREVIEW }, { signal }), [patientId]);
  const items = q.data?.items ?? [];
  return (
    <>
      {canWrite && creating && (
        <TaskCreateForm patientId={patientId} onCancel={() => setCreating(false)}
          onCreated={() => { setCreating(false); setNotice('Task created.'); q.reload(); }} />
      )}
      <Card title="Tasks">
        <CardActions>
          {canWrite && !creating && <button type="button" style={buttonStyle} onClick={() => { setNotice(null); setCreating(true); }}>New task</button>}
          <Link to={`/crm/tasks?patient_id=${patientId}`} style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>View all tasks</Link>
          <SuccessNote message={notice} />
        </CardActions>
        {q.error ? <div style={{ padding: 16 }}><ErrorState error={q.error} onRetry={q.reload} /></div>
          : q.loading ? <TableSkeleton cols={['40%', '14%', '12%', '14%']} />
          : items.length === 0 ? <EmptyState title="No tasks for this patient" />
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Title</Th><Th>Priority</Th><Th>Status</Th><Th>Due</Th></tr></thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <Td><RowLink to={`/crm/tasks/${t.id}`}><Phi>{t.title}</Phi></RowLink></Td>
                      <Td><Badge tone={PRIORITY_TONE[t.priority] ?? 'mute'}>{t.priority}</Badge></Td>
                      <Td><Badge tone={TASK_TONE[t.status] ?? 'mute'}>{label(t.status)}</Badge></Td>
                      <Td>{fmtDateTime(t.due_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}

export function PatientAppointmentsCard({ patientId }: { patientId: string }) {
  const q = useCrmQuery((signal) => listAppointments({ patient_id: patientId, sort: 'starts_at', order: 'desc', limit: PREVIEW }, { signal }), [patientId]);
  const items = q.data?.items ?? [];
  return (
    <Card title="Appointments">
      <CardActions>
        <Link to={`/crm/appointments?patient_id=${patientId}`} style={{ color: 'var(--blue)', fontWeight: 600, fontSize: 13 }}>View all appointments</Link>
      </CardActions>
      {q.error ? <div style={{ padding: 16 }}><ErrorState error={q.error} onRetry={q.reload} /></div>
        : q.loading ? <TableSkeleton cols={['30%', '30%', '16%']} />
        : items.length === 0 ? <EmptyState title="No appointments for this patient" />
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th>Starts</Th><Th>Provider</Th><Th>Status</Th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <Td><RowLink to={`/crm/appointments/${a.id}`}>{fmtDateTime(a.starts_at)}</RowLink></Td>
                    <Td>{a.provider_name ? <Phi>{a.provider_name}</Phi> : '—'}</Td>
                    <Td><Badge tone={APPT_TONE[a.status] ?? 'mute'}>{label(a.status)}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  );
}
