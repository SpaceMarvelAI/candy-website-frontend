import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  CRM_DEFAULT_LIMIT, getPatient, getPatientVerification, listPatientInteractions,
  type PatientDetail,
} from '../../api/crm';
import {
  Badge, Card, CrmPage, EmptyState, ErrorState, FieldList, PageHeader, Pagination, Phi, RefreshButton,
  TableSkeleton, Td, Th, fmtDateTime, label,
} from './ui';
import { useCrmQuery } from './useCrmQuery';
import { VerificationCard } from './VerificationCard';
import { NotesCard } from './NotesCard';
import { ConsentCard } from './ConsentCard';
import { PatientEditCard } from './PatientEditCard';
import { useApp } from '../../context/AppContext';
import { canWriteCrm } from '../../utils/crmAccess';
import { PatientAppointmentsCard, PatientCasesCard, PatientTasksCard, SectionNav } from './PatientWorkspace';

const anchor = { scrollMarginTop: 80 } as const;

/**
 * Renders exactly the contact keys the backend sent. Working roles get phone/email/date_of_birth;
 * viewers get phone_masked/email_masked and no date_of_birth. A masked value is shown as received —
 * never expanded — and a key that is absent is simply not rendered.
 */
function patientFields(p: PatientDetail) {
  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Name', value: <Phi>{p.full_name || '—'}</Phi> },
    { label: 'Lifecycle stage', value: label(p.lifecycle_stage) },
    { label: 'Status', value: <Badge tone={p.status === 'active' ? 'good' : p.status === 'merged' ? 'warn' : 'mute'}>{label(p.status)}</Badge> },
  ];
  if (p.phone !== undefined) fields.push({ label: 'Phone', value: p.phone ? <Phi>{p.phone}</Phi> : '—' });
  else if (p.phone_masked !== undefined) fields.push({ label: 'Phone (masked)', value: p.phone_masked ? <Phi>{p.phone_masked}</Phi> : '—' });
  if (p.email !== undefined) fields.push({ label: 'Email', value: p.email ? <Phi>{p.email}</Phi> : '—' });
  else if (p.email_masked !== undefined) fields.push({ label: 'Email (masked)', value: p.email_masked ? <Phi>{p.email_masked}</Phi> : '—' });
  if (p.date_of_birth !== undefined) fields.push({ label: 'Date of birth', value: p.date_of_birth ? <Phi>{p.date_of_birth}</Phi> : '—' });
  fields.push(
    { label: 'Preferred provider', value: p.preferred_provider ? <Phi>{p.preferred_provider}</Phi> : '—' },
    { label: 'External reference', value: p.external_ref ? <Phi>{p.external_ref}</Phi> : '—' },
  );
  if (p.merged_into) {
    fields.push({ label: 'Merged into', value: <Link to={`/crm/patients/${p.merged_into}`} style={{ color: 'var(--blue)' }}>View the surviving record</Link> });
  }
  fields.push({ label: 'Created', value: fmtDateTime(p.created_at) }, { label: 'Updated', value: fmtDateTime(p.updated_at) });
  return fields;
}

function InteractionsCard({ patientId }: { patientId: string }) {
  const [offset, setOffset] = useState(0);
  const q = useCrmQuery(
    (signal) => listPatientInteractions(patientId, { limit: CRM_DEFAULT_LIMIT, offset, order: 'desc' }, { signal }),
    [patientId, offset],
  );
  const items = q.data?.items ?? [];
  return (
    <Card title="Interactions">
      {q.error ? (
        <div style={{ padding: 16 }}><ErrorState error={q.error} onRetry={q.reload} /></div>
      ) : q.loading ? (
        <TableSkeleton cols={['18%', '18%', '16%', '24%', '16%']} />
      ) : items.length === 0 ? (
        <EmptyState title="No interactions yet" hint="Calls and chats linked to this patient appear here." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th>Channel</Th><Th>Origin</Th><Th>Direction</Th><Th>Started</Th><Th>Source</Th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <Td>{label(i.channel)}</Td>
                  <Td>{label(i.origin)}</Td>
                  <Td>{label(i.direction)}</Td>
                  <Td>{fmtDateTime(i.started_at)}</Td>
                  <Td>{label(i.source_kind)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.data && !q.loading && (
        <div style={{ padding: '0 18px' }}>
          <Pagination offset={q.data.offset} limit={q.data.limit} count={items.length} hasMore={q.data.has_more} onChange={setOffset} />
        </div>
      )}
    </Card>
  );
}

export default function PatientDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const patient = useCrmQuery((signal) => getPatient(id, { signal }), [id]);
  const verification = useCrmQuery((signal) => getPatientVerification(id, { signal }), [id]);

  const p = patient.data;
  const { user } = useApp();
  const canWrite = canWriteCrm(user?.role);
  const masked = !!p && (p.phone_masked !== undefined || p.email_masked !== undefined);
  const crumbs = [{ label: 'CRM', to: '/crm' }, { label: 'Patients', to: '/crm/patients' }, { label: 'Patient' }];

  return (
    <CrmPage>
      <PageHeader
        eyebrow="CRM · Patients"
        title="Patient"
        crumbs={crumbs}
        actions={<RefreshButton onClick={() => { patient.reload(); verification.reload(); }} />}
      />

      {patient.error ? (
        <ErrorState error={patient.error} onRetry={patient.reload} />
      ) : !p || p.id !== id ? (
        <Card><TableSkeleton cols={['30%', '30%', '30%']} /></Card>
      ) : (
        <>
          <SectionNav />
          <div id="section-info" style={anchor} />
          <Card title="Patient information">
            {masked && (
              <p style={{ margin: 0, padding: '12px 22px 0', fontSize: 12.5, color: 'var(--text-3)' }}>
                Some contact details are masked for your role.
              </p>
            )}
            <FieldList fields={patientFields(p)} />
          </Card>
          {canWrite && <PatientEditCard data={p} onSaved={patient.reload} />}

          <div id="section-verification" style={anchor} />
          {verification.error ? (
            <Card title="Verification"><div style={{ padding: 16 }}><ErrorState error={verification.error} onRetry={verification.reload} /></div></Card>
          ) : verification.loading || !verification.data ? (
            <Card title="Verification"><TableSkeleton cols={['40%', '30%']} /></Card>
          ) : (
            <VerificationCard verification={verification.data} />
          )}

          <div id="section-consent" style={anchor} />
          <ConsentCard patientId={id} patientStatus={p.status} />

          <div id="section-interactions" style={anchor} />
          <InteractionsCard patientId={id} />

          <div id="section-notes" style={anchor} />
          <NotesCard patientId={id} frozen={p.status === 'merged'} />

          <div id="section-cases" style={anchor} />
          <PatientCasesCard patientId={id} frozen={p.status === 'merged'} />

          <div id="section-tasks" style={anchor} />
          <PatientTasksCard patientId={id} frozen={p.status === 'merged'} />

          <div id="section-appointments" style={anchor} />
          <PatientAppointmentsCard patientId={id} />
        </>
      )}
    </CrmPage>
  );
}
