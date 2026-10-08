/**
 * Appointments and Providers — read-only. Scheduling itself stays in the existing calendar
 * integrations; this only shows what the CRM has recorded. The backend never returns appointment
 * notes or external references, so none are shown.
 */
import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  CRM_DEFAULT_LIMIT, getAppointment, getProvider, listAppointments, listProviders,
  type AppointmentStatus,
} from '../../api/crm';
import {
  Badge, Card, CrmPage, EmptyState, ErrorState, FieldList, PageHeader, Pagination, Phi, RefreshButton,
  RowLink, Select, TableCard, TableSkeleton, Td, Th, fmtDateTime, label, type Tone,
} from './ui';
import { useCrmQuery } from './useCrmQuery';

export const APPT_TONE: Record<AppointmentStatus, Tone> = {
  booked: 'info', rescheduled: 'warn', cancelled: 'mute', completed: 'good', no_show: 'bad',
};
const APPT_STATUSES: AppointmentStatus[] = ['booked', 'rescheduled', 'cancelled', 'completed', 'no_show'];

// ── Appointments ────────────────────────────────────────────────────────────
export function AppointmentsPage() {
  const [params] = useSearchParams();
  const patientId = params.get('patient_id');
  const providerId = params.get('provider_id');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const q = useCrmQuery(
    (signal) => listAppointments({
      status: status || undefined, patient_id: patientId ?? undefined, provider_id: providerId ?? undefined,
      sort: 'starts_at', order: 'desc', limit: CRM_DEFAULT_LIMIT, offset,
    }, { signal }),
    [status, patientId, providerId, offset],
  );
  const items = q.data?.items ?? [];
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Appointments" title="Appointments" subtitle="Appointments recorded for your patients."
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Appointments' }]} actions={<RefreshButton onClick={q.reload} />} />
      {patientId && (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Showing appointments for one patient. <Link to={`/crm/patients/${patientId}`} style={{ color: 'var(--blue)' }}>Back to patient</Link>
        </p>
      )}
      {providerId && (
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px' }}>
          Showing appointments for one provider. <Link to={`/crm/providers/${providerId}`} style={{ color: 'var(--blue)' }}>Back to provider</Link>
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Select
          ariaLabel="Appointment status" value={status} style={{ minWidth: 150 }}
          onChange={(v) => { setStatus(v); setOffset(0); }}
          options={[{ value: '', label: 'All statuses' }, ...APPT_STATUSES.map((s) => ({ value: s, label: label(s) }))]}
        />
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <>
          <TableCard>
            {q.loading ? <TableSkeleton cols={['22%', '22%', '18%', '14%', '14%']} /> : items.length === 0 ? (
              <EmptyState title="No appointments found" hint="Appointments appear here once they are booked." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Starts</Th><Th>Provider</Th><Th>Department</Th><Th>Status</Th><Th>Source</Th></tr></thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <Td><RowLink to={`/crm/appointments/${a.id}`}>{fmtDateTime(a.starts_at)}</RowLink></Td>
                      <Td>{a.provider_name ? <Phi>{a.provider_name}</Phi> : '—'}</Td>
                      <Td>{a.department ? <Phi>{label(a.department)}</Phi> : '—'}</Td>
                      <Td><Badge tone={APPT_TONE[a.status] ?? 'mute'}>{label(a.status)}</Badge></Td>
                      <Td>{label(a.external_source)}</Td>
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

export function AppointmentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const q = useCrmQuery((signal) => getAppointment(id, { signal }), [id]);
  const a = q.data;
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Appointments" title="Appointment"
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Appointments', to: '/crm/appointments' }, { label: 'Appointment' }]} actions={<RefreshButton onClick={q.reload} />} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.loading || !a ? <Card><TableSkeleton cols={['30%', '30%', '30%']} /></Card> : (
        <>
          <Card title="Appointment">
            <FieldList fields={[
              { label: 'Status', value: <Badge tone={APPT_TONE[a.status] ?? 'mute'}>{label(a.status)}</Badge> },
              { label: 'Starts', value: fmtDateTime(a.starts_at) },
              { label: 'Ends', value: fmtDateTime(a.ends_at) },
              { label: 'Provider', value: a.provider_name ? <Phi>{a.provider_name}</Phi> : '—' },
              { label: 'Department', value: a.department ? <Phi>{label(a.department)}</Phi> : '—' },
              { label: 'Source', value: label(a.external_source) },
              { label: 'Created', value: fmtDateTime(a.created_at) },
              { label: 'Updated', value: fmtDateTime(a.updated_at) },
            ]} />
          </Card>
          <Card title="Related records">
            <div style={{ padding: '16px 22px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {a.patient_id && <Link to={`/crm/patients/${a.patient_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Patient</Link>}
              {a.provider_id && <Link to={`/crm/providers/${a.provider_id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>Provider</Link>}
            </div>
          </Card>
        </>
      )}
    </CrmPage>
  );
}

// ── Providers ───────────────────────────────────────────────────────────────
export function ProvidersPage() {
  const [active, setActive] = useState<'' | 'true' | 'false'>('');
  const [offset, setOffset] = useState(0);
  const q = useCrmQuery(
    (signal) => listProviders({ is_active: active === '' ? undefined : active === 'true', limit: CRM_DEFAULT_LIMIT, offset }, { signal }),
    [active, offset],
  );
  const items = q.data?.items ?? [];
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Providers" title="Providers" subtitle="Clinicians and services patients can be booked with."
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Providers' }]} actions={<RefreshButton onClick={q.reload} />} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <Select
          ariaLabel="Provider availability" value={active} style={{ minWidth: 150 }}
          onChange={(v) => { setActive(v); setOffset(0); }}
          options={[{ value: '', label: 'All providers' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }]}
        />
      </div>
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : (
        <>
          <TableCard>
            {q.loading ? <TableSkeleton cols={['30%', '24%', '16%', '16%']} /> : items.length === 0 ? (
              <EmptyState title="No providers found" hint="Providers appear here once they are set up." />
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th>Name</Th><Th>Department</Th><Th>Slot length</Th><Th>Status</Th></tr></thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <Td><RowLink to={`/crm/providers/${p.id}`}><Phi>{p.name}</Phi></RowLink></Td>
                      <Td>{label(p.department)}</Td>
                      <Td>{p.slot_minutes ? `${p.slot_minutes} min` : '—'}</Td>
                      <Td><Badge tone={p.is_active ? 'good' : 'mute'}>{p.is_active ? 'Active' : 'Inactive'}</Badge></Td>
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

export function ProviderDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const q = useCrmQuery((signal) => getProvider(id, { signal }), [id]);
  const p = q.data;
  return (
    <CrmPage>
      <PageHeader eyebrow="CRM · Providers" title="Provider"
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Providers', to: '/crm/providers' }, { label: 'Provider' }]} actions={<RefreshButton onClick={q.reload} />} />
      {q.error ? <ErrorState error={q.error} onRetry={q.reload} /> : q.loading || !p ? <Card><TableSkeleton cols={['30%', '30%', '30%']} /></Card> : (
        <Card title="Provider">
          <FieldList fields={[
            { label: 'Name', value: <Phi>{p.name}</Phi> },
            { label: 'Department', value: label(p.department) },
            { label: 'Slot length', value: p.slot_minutes ? `${p.slot_minutes} min` : '—' },
            { label: 'Status', value: <Badge tone={p.is_active ? 'good' : 'mute'}>{p.is_active ? 'Active' : 'Inactive'}</Badge> },
            { label: 'Created', value: fmtDateTime(p.created_at) },
            { label: 'Updated', value: fmtDateTime(p.updated_at) },
          ]} />
          <div style={{ padding: '0 22px 16px' }}>
            <Link to={`/crm/appointments?provider_id=${p.id}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>View appointments</Link>
          </div>
        </Card>
      )}
    </CrmPage>
  );
}
