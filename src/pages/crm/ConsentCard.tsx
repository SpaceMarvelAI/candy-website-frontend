/**
 * Consent ledger for one patient.
 *
 *  • Read (any role): the CURRENT state per consent type, derived from the ledger, plus the full history.
 *    The backend says the ledger "reports; it does not enforce or imply consent", so the wording here is
 *    "recorded as …", never "has consented" / "is authorised".
 *  • Write (owner/admin ONLY — narrower than other CRM writes): appends ONE new event. Entries are immutable;
 *    changing a decision is a new entry. Because that cannot be undone, recording takes an explicit confirm step.
 *    A merged patient takes no new entries (backend 409), so the form is not offered.
 *  • Retries are safe: each entry carries an idempotency key, regenerated whenever the user edits the form, so a
 *    lost response can be resent as a no-op replay while a changed entry is never mistaken for the old one.
 *  • No verification, OTP or factor data exists in these responses and none is shown. Values render through <Phi>.
 */
import { useRef, useState } from 'react';
import {
  CRM_DEFAULT_LIMIT, listConsents, listCurrentConsents, recordConsent,
  type ConsentAction, type ConsentChannel, type ConsentCreate, type ConsentEvent, type ConsentState, type PatientStatus,
} from '../../api/crm';
import { useApp } from '../../context/AppContext';
import { canRecordConsent } from '../../utils/crmAccess';
import { MutationError, SaveBar, SelectField, SuccessNote, TextField, formBody, formGrid } from './forms';
import {
  Badge, Card, EmptyState, ErrorState, Pagination, Phi, TableSkeleton, Td, Th, buttonStyle, fmtDateTime, label, type Tone,
} from './ui';
import { useCrmMutation } from './useCrmMutation';
import { useCrmQuery } from './useCrmQuery';

export const CONSENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{1,63}$/;
const ACTIONS: { value: ConsentAction; label: string }[] = [
  { value: 'granted', label: 'Granted' },
  { value: 'denied', label: 'Denied' },
  { value: 'withdrawn', label: 'Withdrawn' },
];
const CHANNELS: { value: ConsentChannel; label: string }[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'dashboard', label: 'Dashboard' },
];
const LIST_ID = 'crm-consent-types';

function newKey(): string {
  try { return crypto.randomUUID(); } catch { return `k-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

export function stateOf(s: Pick<ConsentState, 'action' | 'granted' | 'expired'>): { text: string; tone: Tone } {
  if (s.expired) return { text: 'Grant expired', tone: 'warn' };
  if (s.granted) return { text: 'Recorded as granted', tone: 'good' };
  if (s.action === 'denied') return { text: 'Recorded as denied', tone: 'bad' };
  return { text: 'Recorded as withdrawn', tone: 'mute' };
}

type Errors = Partial<Record<'type' | 'language' | 'expires', string>>;

export function ConsentCard({ patientId, patientStatus }: { patientId: string; patientStatus: PatientStatus }) {
  const { user } = useApp();
  const mayRecord = canRecordConsent(user?.role);
  const frozen = patientStatus === 'merged';
  const [offset, setOffset] = useState(0);
  const current = useCrmQuery((signal) => listCurrentConsents(patientId, { signal }), [patientId]);
  const history = useCrmQuery((signal) => listConsents(patientId, { limit: CRM_DEFAULT_LIMIT, offset }, { signal }), [patientId, offset]);

  const reload = () => { current.reload(); if (offset === 0) history.reload(); else setOffset(0); };
  const states = current.data ?? [];
  const events = history.data?.items ?? [];

  return (
    <Card title="Consent">
      <p style={{ margin: 0, padding: '14px 22px 0', fontSize: 12.5, color: 'var(--text-3)' }}>
        Shows what the consent ledger records. It does not enforce or confirm consent. Entries cannot be edited or removed.
      </p>

      <h3 style={subhead}>Current</h3>
      {current.error ? <div style={{ padding: 16 }}><ErrorState error={current.error} onRetry={current.reload} /></div>
        : current.loading && !current.data ? <TableSkeleton cols={['30%', '24%', '16%', '20%']} />
        : states.length === 0 ? <EmptyState title="No consent recorded" hint="Entries appear here once recorded." />
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th>Consent</Th><Th>State</Th><Th>Channel</Th><Th>Recorded</Th><Th>Expires</Th></tr></thead>
              <tbody>
                {states.map((s) => {
                  const st = stateOf(s);
                  return (
                    <tr key={s.consent_type}>
                      <Td><Phi>{label(s.consent_type)}</Phi></Td>
                      <Td><Badge tone={st.tone}>{st.text}</Badge></Td>
                      <Td>{label(s.channel)}</Td>
                      <Td>{fmtDateTime(s.captured_at)}</Td>
                      <Td>{fmtDateTime(s.expires_at)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      <h3 style={subhead}>History</h3>
      {history.error ? <div style={{ padding: 16 }}><ErrorState error={history.error} onRetry={history.reload} /></div>
        : history.loading && !history.data ? <TableSkeleton cols={['24%', '16%', '14%', '20%']} />
        : events.length === 0 ? <EmptyState title="No history yet" />
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th>Consent</Th><Th>Entry</Th><Th>Channel</Th><Th>Source</Th><Th>Language</Th><Th>Recorded</Th></tr></thead>
              <tbody>
                {events.map((e: ConsentEvent) => (
                  <tr key={e.id}>
                    <Td><Phi>{label(e.consent_type)}</Phi></Td>
                    <Td>{label(e.action)}{e.expired ? ' (expired)' : ''}</Td>
                    <Td>{label(e.channel)}</Td>
                    <Td>{label(e.source)}</Td>
                    <Td>{e.language ? <Phi>{e.language}</Phi> : '—'}</Td>
                    <Td>{fmtDateTime(e.captured_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {history.data && (
        <div style={{ padding: '0 18px' }}>
          <Pagination offset={history.data.offset} limit={history.data.limit} count={events.length} hasMore={history.data.has_more} onChange={setOffset} />
        </div>
      )}

      {frozen ? (
        <p style={note}>A merged patient cannot receive new consent entries.</p>
      ) : mayRecord ? (
        <RecordForm patientId={patientId} knownTypes={states.map((s) => s.consent_type)} onRecorded={reload} />
      ) : (
        <p style={note}>Only owners and admins can record consent.</p>
      )}
    </Card>
  );
}

const subhead: React.CSSProperties = { margin: 0, padding: '16px 22px 8px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)' };
const note: React.CSSProperties = { margin: 0, padding: '14px 22px', fontSize: 13, color: 'var(--text-3)', borderTop: '1px solid var(--border)' };

function RecordForm({ patientId, knownTypes, onRecorded }: { patientId: string; knownTypes: string[]; onRecorded: () => void }) {
  const [type, setType] = useState('');
  const [action, setAction] = useState<ConsentAction>('granted');
  const [channel, setChannel] = useState<ConsentChannel>('staff');
  const [language, setLanguage] = useState('');
  const [expires, setExpires] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const key = useRef(newKey());
  const save = useCrmMutation((body: ConsentCreate) => recordConsent(patientId, body));

  // Any edit means "a different entry": new idempotency key, and the confirm step starts over.
  const touch = () => { key.current = newKey(); setConfirming(false); setSaved(null); };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!CONSENT_TYPE_PATTERN.test(type.trim())) e.type = 'Use 2–64 lowercase letters, digits or underscores, starting with a letter.';
    const lang = language.trim();
    if (lang && (lang.length < 2 || lang.length > 16)) e.language = 'Language must be 2–16 characters.';
    if (expires) {
      const t = new Date(expires).getTime();
      if (Number.isNaN(t)) e.expires = 'Enter a valid date and time.';
      else if (t <= Date.now()) e.expires = 'Expiry must be in the future.';
    }
    return e;
  };

  const review = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(null);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length === 0) setConfirming(true);
  };

  const confirm = async () => {
    const body: ConsentCreate = { consent_type: type.trim(), action, channel, idempotency_key: key.current };
    if (language.trim()) body.language = language.trim();
    if (expires) body.expires_at = new Date(expires).toISOString();
    const event = await save.run(body);
    setConfirming(false);
    if (event) {
      setType(''); setAction('granted'); setChannel('staff'); setLanguage(''); setExpires('');
      key.current = newKey();
      setSaved('Consent entry recorded.');
      onRecorded();
    }
  };

  return (
    <form onSubmit={review} aria-label="Record consent" style={{ ...formBody, borderTop: '1px solid var(--border)' }} noValidate>
      <h3 style={{ ...subhead, padding: 0 }}>Record consent</h3>
      <datalist id={LIST_ID}>{knownTypes.map((t) => <option key={t} value={t} />)}</datalist>
      <div style={formGrid}>
        <TextField label="Consent type" value={type} maxLength={64} list={LIST_ID} error={errors.type} disabled={save.saving}
          hint={knownTypes.length ? 'Pick an existing type or enter a new one.' : 'For example: call_consent'}
          onChange={(v) => { setType(v); touch(); }} />
        <SelectField label="Entry" value={action} onChange={(v) => { setAction(v); touch(); }} options={ACTIONS} disabled={save.saving} />
        <SelectField label="Channel" value={channel} onChange={(v) => { setChannel(v); touch(); }} options={CHANNELS} disabled={save.saving} />
        <TextField label="Language (optional)" value={language} maxLength={16} error={errors.language} disabled={save.saving} onChange={(v) => { setLanguage(v); touch(); }} />
        <TextField label="Expires (optional)" type="datetime-local" value={expires} error={errors.expires} disabled={save.saving} onChange={(v) => { setExpires(v); touch(); }} />
      </div>
      <MutationError error={save.error} />
      <SuccessNote message={saved} />
      {confirming ? (
        <div role="group" aria-label="Confirm consent entry" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: 13 }}>
            Record <strong><Phi>{label(type.trim())}</Phi></strong> as <strong>{label(action).toLowerCase()}</strong> via {label(channel).toLowerCase()}?
            {' '}This entry cannot be edited or removed.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={confirm} disabled={save.saving} aria-busy={save.saving}
              style={{ ...buttonStyle, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)', opacity: save.saving ? 0.6 : 1 }}>
              {save.saving ? 'Recording…' : 'Confirm and record'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={save.saving} style={buttonStyle}>Back</button>
          </div>
        </div>
      ) : (
        <SaveBar saving={false} label="Review entry" />
      )}
    </form>
  );
}
