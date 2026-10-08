/**
 * CRM error classification. The backend's 4xx text can echo request data and 5xx text can be a raw
 * exception, so CRM screens NEVER render `ApiError.message`; they render fixed copy keyed off the
 * HTTP status. (The generic `gateInfo()` / PlanGateNotice path prints backend text, so it is not used.)
 */
import { ApiError } from '../api/client';

export type CrmErrorKind = 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'session' | 'network' | 'generic';
export interface CrmErrorInfo { kind: CrmErrorKind; title: string; message: string }

const COPY: Record<CrmErrorKind, Omit<CrmErrorInfo, 'kind'>> = {
  forbidden: { title: 'Access restricted', message: 'Your role does not have access to this part of the CRM. Ask a workspace admin if you need it.' },
  not_found: { title: 'Not found', message: 'This record does not exist or is not available in your workspace.' },
  invalid:   { title: 'Request not accepted', message: 'That request could not be processed. Check your filters and try again.' },
  conflict:  { title: 'Change not allowed', message: 'That change is not possible in the record’s current state, or it was changed by someone else. Refresh and try again.' },
  session:   { title: 'Session expired', message: 'Please sign in again to continue.' },
  network:   { title: 'Connection problem', message: 'We could not reach the server. Check your connection and try again.' },
  generic:   { title: 'Something went wrong', message: 'We could not load this right now. Please try again.' },
};

export function classifyCrmError(e: unknown): CrmErrorInfo {
  let kind: CrmErrorKind = 'generic';
  if (e instanceof ApiError) {
    if (e.status === 403) kind = 'forbidden';
    else if (e.status === 404) kind = 'not_found';
    else if (e.status === 400 || e.status === 422) kind = 'invalid';
    else if (e.status === 409) kind = 'conflict';
    else if (e.status === 401) kind = 'session';
    else if (e.status === 0 || e.status === 408) kind = 'network';
  }
  return { kind, ...COPY[kind] };
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
