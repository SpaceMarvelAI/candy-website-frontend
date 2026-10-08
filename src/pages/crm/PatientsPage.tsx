import { useState } from 'react';
import {
  CRM_DEFAULT_LIMIT, listPatients, searchPatients,
  type LifecycleStage, type PatientListItem, type PatientSearchBody, type PatientSearchKind, type PatientStatus,
} from '../../api/crm';
import {
  Badge, CrmPage, EmptyState, ErrorState, PageHeader, Pagination, Phi, RefreshButton, RowLink,
  TableCard, TableSkeleton, Td, Th, buttonStyle, fmtDateTime, label, selectStyle, type Tone,
} from './ui';
import { useCrmQuery } from './useCrmQuery';

const STATUS_TONE: Record<PatientStatus, Tone> = { active: 'good', inactive: 'mute', merged: 'warn' };

type SearchMode = 'name' | PatientSearchKind;
const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'mrn', label: 'MRN' },
  { value: 'uhid', label: 'UHID' },
  { value: 'external', label: 'External reference' },
];

/** Search values live only in component state: they are sent in a POST body, never put in a URL or storage. */
function toSearchBody(mode: SearchMode, value: string): PatientSearchBody | null {
  const v = value.trim();
  if (mode === 'name') return v.length >= 2 ? { name: v } : null;
  return v ? { kind: mode, value: v } : null;
}

export function PatientRows({ rows }: { rows: PatientListItem[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr><Th>Patient</Th><Th>Phone</Th><Th>Stage</Th><Th>Status</Th><Th>Preferred provider</Th><Th>Created</Th></tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <Td><RowLink to={`/crm/patients/${p.id}`}><Phi>{p.full_name || 'Unnamed patient'}</Phi></RowLink></Td>
            <Td>{p.phone_masked ? <Phi>{p.phone_masked}</Phi> : '—'}</Td>
            <Td>{label(p.lifecycle_stage)}</Td>
            <Td><Badge tone={STATUS_TONE[p.status] ?? 'mute'}>{label(p.status)}</Badge></Td>
            <Td>{p.preferred_provider ? <Phi>{p.preferred_provider}</Phi> : '—'}</Td>
            <Td>{fmtDateTime(p.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PatientsPage() {
  const [stage, setStage] = useState<LifecycleStage | ''>('');
  const [status, setStatus] = useState<PatientStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<SearchMode>('name');
  const [draft, setDraft] = useState('');
  const [active, setActive] = useState<PatientSearchBody | null>(null);

  const list = useCrmQuery(
    (signal) => active
      ? searchPatients(active, CRM_DEFAULT_LIMIT, { signal }).then((items) => ({ items, limit: CRM_DEFAULT_LIMIT, offset: 0, has_more: false }))
      : listPatients({ lifecycle_stage: stage || undefined, status: status || undefined, sort: 'created_at', order: 'desc', limit: CRM_DEFAULT_LIMIT, offset }, { signal }),
    [stage, status, offset, active],
  );

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const body = toSearchBody(mode, draft);
    if (body) { setActive(body); setOffset(0); }
  };
  const clearSearch = () => { setActive(null); setDraft(''); setOffset(0); };

  const page = list.data;
  const items = page?.items ?? [];

  return (
    <CrmPage>
      <PageHeader
        eyebrow="CRM · Patients"
        title="Patients"
        subtitle="Patient records captured from your agents and channels."
        crumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Patients' }]}
        actions={<RefreshButton onClick={list.reload} />}
      />

      <form onSubmit={submitSearch} role="search" aria-label="Search patients" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <select aria-label="Search by" value={mode} onChange={(e) => setMode(e.target.value as SearchMode)} style={selectStyle}>
          {SEARCH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <input
          aria-label="Search value" value={draft} onChange={(e) => setDraft(e.target.value)}
          autoComplete="off" spellCheck={false}
          placeholder={mode === 'name' ? 'At least 2 characters' : 'Exact value'}
          style={{ ...selectStyle, minWidth: 220 }}
        />
        <button type="submit" style={buttonStyle} disabled={!toSearchBody(mode, draft)}>Search</button>
        {active && <button type="button" style={buttonStyle} onClick={clearSearch}>Clear search</button>}
      </form>

      {!active && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <select aria-label="Lifecycle stage" value={stage} onChange={(e) => { setStage(e.target.value as LifecycleStage | ''); setOffset(0); }} style={selectStyle}>
            <option value="">All stages</option><option value="enquiry">Enquiry</option><option value="patient">Patient</option>
          </select>
          <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as PatientStatus | ''); setOffset(0); }} style={selectStyle}>
            <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="merged">Merged</option>
          </select>
        </div>
      )}

      {list.error ? (
        <ErrorState error={list.error} onRetry={list.reload} />
      ) : (
        <>
          <TableCard>
            {list.loading ? (
              <TableSkeleton cols={['22%', '16%', '12%', '12%', '18%', '16%']} />
            ) : items.length === 0 ? (
              <EmptyState
                title={active ? 'No matching patients' : 'No patients yet'}
                hint={active ? 'Search needs an exact match for phone, email and ID values.' : 'Patients appear here as your agents record them.'}
              />
            ) : (
              <PatientRows rows={items} />
            )}
          </TableCard>
          {page && !active && !list.loading && (
            <Pagination offset={page.offset} limit={page.limit} count={items.length} hasMore={page.has_more} onChange={setOffset} />
          )}
        </>
      )}
    </CrmPage>
  );
}
