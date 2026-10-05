/**
 * Form primitives for CRM writes, in the same inline-style idiom as ui.tsx. Every free-text control carries the
 * PHI classes (`ph-mask ph-no-capture`) on top of PostHog's maskAllInputs, and nothing here persists a draft
 * anywhere (no localStorage, no URL).
 */
import React, { useId } from 'react';
import type { CrmErrorInfo } from '../../utils/crmErrors';
import { buttonStyle, selectStyle } from './ui';

const PHI_INPUT = 'ph-mask ph-no-capture';
const controlStyle: React.CSSProperties = { ...selectStyle, width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13.5 };

export function FormField({ label, id, error, hint, children }: {
  label: string; id: string; error?: string | null; hint?: string; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)' }}>{label}</label>
      {children}
      {error ? <span role="alert" style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>
        : hint ? <span style={{ fontSize: 12, color: 'var(--text-4)' }}>{hint}</span> : null}
    </div>
  );
}

interface BaseProps { label: string; error?: string | null; hint?: string; disabled?: boolean }

export function TextField({ label, error, hint, value, onChange, maxLength, disabled, type = 'text', list }: BaseProps & {
  value: string; onChange: (v: string) => void; maxLength?: number; type?: 'text' | 'datetime-local';
  /** id of a <datalist> offering suggestions. */
  list?: string;
}) {
  const id = useId();
  return (
    <FormField label={label} id={id} error={error} hint={hint}>
      <input id={id} type={type} className={PHI_INPUT} value={value} maxLength={maxLength} disabled={disabled} list={list}
        autoComplete="off" spellCheck={false} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)} style={controlStyle} />
    </FormField>
  );
}

export function TextAreaField({ label, error, hint, value, onChange, maxLength, disabled, rows = 4 }: BaseProps & {
  value: string; onChange: (v: string) => void; maxLength?: number; rows?: number;
}) {
  const id = useId();
  return (
    <FormField label={label} id={id} error={error} hint={hint}>
      <textarea id={id} className={PHI_INPUT} value={value} maxLength={maxLength} rows={rows} disabled={disabled}
        autoComplete="off" spellCheck={false} aria-invalid={!!error} onChange={(e) => onChange(e.target.value)}
        style={{ ...controlStyle, resize: 'vertical' }} />
    </FormField>
  );
}

export function SelectField<T extends string>({ label, value, onChange, options, disabled }: BaseProps & {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[];
}) {
  const id = useId();
  return (
    <FormField label={label} id={id}>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)} style={controlStyle}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </FormField>
  );
}

/**
 * Assignee choice. The CRM API accepts only a raw user id and offers no user directory, so the only honest
 * choices are "me" (the signed-in user's own id) and "unassigned" (explicit null). The backend still verifies the
 * assignee is an active working-role user of the same company.
 */
export type AssigneeChoice = 'keep' | 'me' | 'none';

export function AssigneeField({ value, onChange, current, myId, editing, disabled }: {
  value: AssigneeChoice; onChange: (v: AssigneeChoice) => void; current?: string | null; myId?: string | null;
  editing: boolean; disabled?: boolean;
}) {
  const currentLabel = !current ? 'Unassigned' : current === myId ? 'Assigned to you' : 'Assigned to someone else';
  const options: { value: AssigneeChoice; label: string }[] = editing
    ? [{ value: 'keep', label: `Keep current (${currentLabel})` }, { value: 'me', label: 'Assign to me' }, { value: 'none', label: 'Unassign' }]
    : [{ value: 'none', label: 'Unassigned' }, { value: 'me', label: 'Assign to me' }];
  return <SelectField label="Assignee" value={value} onChange={onChange} options={options} disabled={disabled} />;
}

/** undefined = leave unchanged; string = assign to that user; null = unassign. */
export function assigneeValue(choice: AssigneeChoice, myId?: string | null): string | null | undefined {
  if (choice === 'me') return myId ?? undefined;
  if (choice === 'none') return null;
  return undefined;
}

/** Fixed-copy failure banner for a write. Never shows backend text. */
export function MutationError({ error }: { error: CrmErrorInfo | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="ph-mask" style={{ padding: '10px 14px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 'var(--radius)', fontSize: 13 }}>
      <strong>{error.title}.</strong> <span style={{ color: 'var(--text-3)' }}>{error.message}</span>
    </div>
  );
}

export function SuccessNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status" style={{ padding: '10px 14px', background: 'rgba(34,197,94,.10)', border: '1px solid rgba(34,197,94,.25)', borderRadius: 'var(--radius)', fontSize: 13, color: 'var(--text-1)' }}>
      {message}
    </div>
  );
}

/** Submit / cancel row: submit is disabled and relabelled while the request is in flight. */
export function SaveBar({ saving, label, savingLabel = 'Saving…', onCancel, disabled }: {
  saving: boolean; label: string; savingLabel?: string; onCancel?: () => void; disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="submit" disabled={saving || disabled} aria-busy={saving}
        style={{ ...buttonStyle, background: 'var(--blue)', color: '#fff', border: '1px solid var(--blue)', opacity: saving || disabled ? 0.6 : 1 }}>
        {saving ? savingLabel : label}
      </button>
      {onCancel && <button type="button" onClick={onCancel} disabled={saving} style={buttonStyle}>Cancel</button>}
    </div>
  );
}

export const formGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 };
export const formBody: React.CSSProperties = { padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 };
