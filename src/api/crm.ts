/**
 * CRM service layer (/v1/crm/*). Every call goes through the shared `api()` client with
 * `sensitive: true`, so request/response bodies and query strings never reach the console
 * or PostHog. Search sends its value in the POST body — never in a URL.
 */
import { api } from './client';
import type {
  Appointment, AppointmentStatus, CaseCreate, CaseStatus, CaseUpdate, CrmCase, CrmCaseDetail, CrmTask,
  CrmTaskDetail, Interaction, InteractionChannel, LifecycleStage, NoteCreate, Page, PatientDetail,
  PatientListItem, PatientNote, PatientSearchBody, PatientStatus, PatientVerification, Priority, Provider,
  TaskCreate, TaskStatus, TaskUpdate, ConsentCreate, ConsentEvent, ConsentState, PatientUpdate,
} from './crmTypes';

export * from './crmTypes';

// Backend paging contract: limit 1–100 (default 25), offset 0–10,000.
export const CRM_DEFAULT_LIMIT = 25;
export const CRM_MAX_LIMIT = 100;
export const CRM_MAX_OFFSET = 10_000;

export const clampLimit = (n: number): number =>
  Math.min(CRM_MAX_LIMIT, Math.max(1, Math.floor(Number.isFinite(n) ? n : CRM_DEFAULT_LIMIT)));
export const clampOffset = (n: number): number =>
  Math.min(CRM_MAX_OFFSET, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
/** The offset of the next page, or null when there is none or it would exceed the backend cap. */
export function nextOffset(offset: number, limit: number, hasMore: boolean): number | null {
  const next = offset + limit;
  return hasMore && next <= CRM_MAX_OFFSET ? next : null;
}
export function prevOffset(offset: number, limit: number): number | null {
  return offset > 0 ? clampOffset(offset - limit) : null;
}

export interface PageParams { limit?: number; offset?: number }
interface Req { signal?: AbortSignal }

function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}
const paging = (p: PageParams) => ({
  limit: clampLimit(p.limit ?? CRM_DEFAULT_LIMIT),
  offset: clampOffset(p.offset ?? 0),
});
const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { sensitive: true, signal });

// ── Patients ────────────────────────────────────────────────────────────────
export interface PatientFilters extends PageParams {
  lifecycle_stage?: LifecycleStage;
  status?: PatientStatus;
  sort?: 'created_at' | 'updated_at' | 'full_name';
  order?: 'asc' | 'desc';
}
export const listPatients = (f: PatientFilters = {}, r: Req = {}) =>
  get<Page<PatientListItem>>(`/v1/crm/patients${qs({
    lifecycle_stage: f.lifecycle_stage, status: f.status, sort: f.sort, order: f.order, ...paging(f),
  })}`, r.signal);

export const searchPatients = (body: PatientSearchBody, limit = CRM_DEFAULT_LIMIT, r: Req = {}) =>
  api<PatientListItem[]>(`/v1/crm/patients/search${qs({ limit: clampLimit(limit) })}`, {
    method: 'POST', body, sensitive: true, signal: r.signal,
  });

export const getPatient = (id: string, r: Req = {}) =>
  get<PatientDetail>(`/v1/crm/patients/${encodeURIComponent(id)}`, r.signal);
export const getPatientVerification = (id: string, r: Req = {}) =>
  get<PatientVerification>(`/v1/crm/patients/${encodeURIComponent(id)}/verification`, r.signal);

// ── Interactions ────────────────────────────────────────────────────────────
export interface InteractionFilters extends PageParams {
  channel?: InteractionChannel;
  order?: 'asc' | 'desc';
}
export const listPatientInteractions = (patientId: string, f: InteractionFilters = {}, r: Req = {}) =>
  get<Page<Interaction>>(
    `/v1/crm/patients/${encodeURIComponent(patientId)}/interactions${qs({ channel: f.channel, order: f.order, ...paging(f) })}`,
    r.signal);

// ── Cases ───────────────────────────────────────────────────────────────────
export interface CaseFilters extends PageParams {
  status?: CaseStatus;
  priority?: Priority;
  patient_id?: string;
  unassigned?: boolean;
  sort?: 'created_at' | 'updated_at' | 'priority';
  order?: 'asc' | 'desc';
}
export const listCases = (f: CaseFilters = {}, r: Req = {}) =>
  get<Page<CrmCase>>(`/v1/crm/cases${qs({
    status: f.status, priority: f.priority, patient_id: f.patient_id,
    unassigned: f.unassigned ? true : undefined, sort: f.sort, order: f.order, ...paging(f),
  })}`, r.signal);
export const getCase = (id: string, r: Req = {}) =>
  get<CrmCaseDetail>(`/v1/crm/cases/${encodeURIComponent(id)}`, r.signal);

// ── Tasks ───────────────────────────────────────────────────────────────────
export interface TaskFilters extends PageParams {
  status?: TaskStatus;
  priority?: Priority;
  patient_id?: string;
  case_id?: string;
  unassigned?: boolean;
  sort?: 'created_at' | 'due_at' | 'priority';
  order?: 'asc' | 'desc';
}
export const listTasks = (f: TaskFilters = {}, r: Req = {}) =>
  get<Page<CrmTask>>(`/v1/crm/tasks${qs({
    status: f.status, priority: f.priority, patient_id: f.patient_id, case_id: f.case_id,
    unassigned: f.unassigned ? true : undefined, sort: f.sort, order: f.order, ...paging(f),
  })}`, r.signal);
export const getTask = (id: string, r: Req = {}) =>
  get<CrmTaskDetail>(`/v1/crm/tasks/${encodeURIComponent(id)}`, r.signal);

// ── Notes (builder+) ────────────────────────────────────────────────────────
export const listPatientNotes = (patientId: string, f: PageParams = {}, r: Req = {}) =>
  get<Page<PatientNote>>(
    `/v1/crm/patients/${encodeURIComponent(patientId)}/notes${qs({ ...paging(f) })}`, r.signal);
export const createPatientNote = (patientId: string, body: NoteCreate) =>
  api<PatientNote>(`/v1/crm/patients/${encodeURIComponent(patientId)}/notes`, { method: 'POST', body, sensitive: true });

// ── Consent ledger ──────────────────────────────────────────────────────────
export const listConsents = (patientId: string, f: PageParams = {}, r: Req = {}) =>
  get<Page<ConsentEvent>>(`/v1/crm/patients/${encodeURIComponent(patientId)}/consents${qs({ ...paging(f) })}`, r.signal);
export const listCurrentConsents = (patientId: string, r: Req = {}) =>
  get<ConsentState[]>(`/v1/crm/patients/${encodeURIComponent(patientId)}/consents/current`, r.signal);
/** owner/admin only. Appends one event (201); an idempotent replay returns the original event (200). */
export const recordConsent = (patientId: string, body: ConsentCreate) =>
  api<ConsentEvent>(`/v1/crm/patients/${encodeURIComponent(patientId)}/consents`, { method: 'POST', body, sensitive: true });

// ── Patient profile update (builder+) ───────────────────────────────────────
export const updatePatient = (id: string, body: PatientUpdate) =>
  api<PatientDetail>(`/v1/crm/patients/${encodeURIComponent(id)}`, { method: 'PATCH', body, sensitive: true });

// ── Case / task writes (builder+) ───────────────────────────────────────────
export const createCase = (body: CaseCreate) =>
  api<CrmCaseDetail>('/v1/crm/cases', { method: 'POST', body, sensitive: true });
export const updateCase = (id: string, body: CaseUpdate) =>
  api<CrmCaseDetail>(`/v1/crm/cases/${encodeURIComponent(id)}`, { method: 'PATCH', body, sensitive: true });
export const createTask = (body: TaskCreate) =>
  api<CrmTaskDetail>('/v1/crm/tasks', { method: 'POST', body, sensitive: true });
export const updateTask = (id: string, body: TaskUpdate) =>
  api<CrmTaskDetail>(`/v1/crm/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body, sensitive: true });

/**
 * Legal status moves, mirroring the backend (services/crm_service.py) so the UI only OFFERS legal choices.
 * Advisory only: the database trigger is the authority and answers 409 for anything else.
 */
export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  open: ['in_progress', 'resolved', 'closed'],
  in_progress: ['open', 'resolved', 'closed'],
  resolved: ['open', 'in_progress', 'closed'],
  closed: [],
};
export const TASK_TRANSITIONS: Record<TaskStatus, Exclude<TaskStatus, 'expired'>[]> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: [], cancelled: [], expired: [],
};

// ── Appointments & providers (read-only) ────────────────────────────────────
export interface AppointmentFilters extends PageParams {
  status?: AppointmentStatus;
  patient_id?: string;
  provider_id?: string;
  sort?: 'starts_at' | 'created_at';
  order?: 'asc' | 'desc';
}
export const listAppointments = (f: AppointmentFilters = {}, r: Req = {}) =>
  get<Page<Appointment>>(`/v1/crm/appointments${qs({
    status: f.status, patient_id: f.patient_id, provider_id: f.provider_id, sort: f.sort, order: f.order, ...paging(f),
  })}`, r.signal);
export const getAppointment = (id: string, r: Req = {}) =>
  get<Appointment>(`/v1/crm/appointments/${encodeURIComponent(id)}`, r.signal);

export interface ProviderFilters extends PageParams { is_active?: boolean }
export const listProviders = (f: ProviderFilters = {}, r: Req = {}) =>
  get<Page<Provider>>(`/v1/crm/providers${qs({ is_active: f.is_active, ...paging(f) })}`, r.signal);
export const getProvider = (id: string, r: Req = {}) =>
  get<Provider>(`/v1/crm/providers/${encodeURIComponent(id)}`, r.signal);
