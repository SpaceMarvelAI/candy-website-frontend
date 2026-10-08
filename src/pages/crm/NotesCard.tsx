/**
 * Patient notes — free-text PHI, append-only (the API has no edit or delete, so neither does this UI).
 *
 * Access: the backend allows notes only for owner/admin/member/builder. A restricted role (viewer) is shown a
 * neutral line and NO request is made. That role check is UX only — if the backend still answers 403 (stale
 * role claim, changed role) the card renders the same fixed "Access restricted" state as the rest of the CRM.
 * Note text is rendered through <Phi>, typed into PHI-classed inputs, and never put in a URL, storage or log.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CRM_DEFAULT_LIMIT, createPatientNote, listPatientNotes, type NoteType, type PatientNote } from '../../api/crm';
import { useApp } from '../../context/AppContext';
import { canWriteCrm } from '../../utils/crmAccess';
import { MutationError, SaveBar, SelectField, SuccessNote, TextAreaField, formBody } from './forms';
import { Card, EmptyState, ErrorState, Pagination, Phi, TableSkeleton, fmtDateTime, label } from './ui';
import { useCrmMutation } from './useCrmMutation';
import { useCrmQuery } from './useCrmQuery';

export const NOTE_MAX = 10_000;
const NOTE_TYPES: { value: NoteType; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'intake', label: 'Intake' },
  { value: 'follow_up', label: 'Follow up' },
  { value: 'operational', label: 'Operational' },
];
const AUTHOR: Record<PatientNote['author_type'], string> = { staff: 'Staff', agent: 'Agent', system: 'System' };

/** `frozen`: a merged patient still shows its notes but takes no new ones (the backend answers 409). */
export function NotesCard({ patientId, frozen = false }: { patientId: string; frozen?: boolean }) {
  const { user } = useApp();
  if (!canWriteCrm(user?.role)) {
    return (
      <Card title="Notes">
        <p style={{ margin: 0, padding: '16px 22px', fontSize: 13, color: 'var(--text-3)' }}>Notes are not available for your role.</p>
      </Card>
    );
  }
  return <NotesPanel patientId={patientId} frozen={frozen} />;
}

function NotesPanel({ patientId, frozen }: { patientId: string; frozen: boolean }) {
  const [offset, setOffset] = useState(0);
  const [body, setBody] = useState('');
  const [noteType, setNoteType] = useState<NoteType>('staff');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const q = useCrmQuery((signal) => listPatientNotes(patientId, { limit: CRM_DEFAULT_LIMIT, offset }, { signal }), [patientId, offset]);
  const save = useCrmMutation((text: string, type: NoteType) => createPatientNote(patientId, { body: text, note_type: type }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    setSaved(null);
    if (!text) { setFieldError('Write a note before saving.'); return; }
    if (text.length > NOTE_MAX) { setFieldError(`Notes can be at most ${NOTE_MAX.toLocaleString()} characters.`); return; }
    setFieldError(null);
    const note = await save.run(text, noteType);
    if (note) {
      setBody('');
      setSaved('Note added.');
      if (offset === 0) q.reload(); else setOffset(0);
    }
  };

  const items = q.data?.items ?? [];
  return (
    <Card title="Notes">
      {q.error ? (
        <div style={{ padding: 16 }}><ErrorState error={q.error} onRetry={q.reload} /></div>
      ) : (
        <>
          {frozen ? (
            <p style={{ margin: 0, padding: '14px 22px', fontSize: 13, color: 'var(--text-3)' }}>A merged patient cannot receive new notes.</p>
          ) : (
          <form onSubmit={submit} aria-label="Add a note" style={formBody} noValidate>
            <TextAreaField label="New note" value={body} maxLength={NOTE_MAX} error={fieldError} disabled={save.saving}
              hint="Notes cannot be edited or deleted once saved."
              onChange={(v) => { setBody(v); setFieldError(null); setSaved(null); }} />
            <div style={{ maxWidth: 240 }}>
              <SelectField label="Note type" value={noteType} onChange={setNoteType} options={NOTE_TYPES} disabled={save.saving} />
            </div>
            <MutationError error={save.error} />
            <SuccessNote message={saved} />
            <SaveBar saving={save.saving} label="Add note" />
          </form>
          )}
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {q.loading ? <TableSkeleton cols={['60%', '20%']} /> : items.length === 0 ? (
              <EmptyState title="No notes yet" hint="Notes you add appear here, newest first." />
            ) : (
              <ul aria-label="Notes" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((n) => (
                  <li key={n.id} style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{label(n.note_type)}</span><span>{AUTHOR[n.author_type] ?? '—'}</span><span>{fmtDateTime(n.created_at)}</span>
                      {n.case_id && <Link to={`/crm/cases/${n.case_id}`} style={{ color: 'var(--blue)' }}>Case</Link>}
                      {n.task_id && <Link to={`/crm/tasks/${n.task_id}`} style={{ color: 'var(--blue)' }}>Task</Link>}
                    </div>
                    <p style={{ margin: '6px 0 0', fontSize: 13.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}><Phi>{n.body}</Phi></p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {q.data && !q.loading && (
            <div style={{ padding: '0 18px' }}>
              <Pagination offset={q.data.offset} limit={q.data.limit} count={items.length} hasMore={q.data.has_more} onChange={setOffset} />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
