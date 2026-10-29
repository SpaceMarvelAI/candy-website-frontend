/**
 * Shapes of the /v1/crm/* responses, mirroring the backend contract exactly.
 *
 * Role-redacted fields are modelled as OPTIONAL, not nullable: for a viewer the backend omits
 * the key entirely (or substitutes a `*_masked` twin), and the UI renders only what is present.
 * Nothing here is ever reconstructed client-side.
 */

export interface Page<T> {
  items: T[];
  limit: number;
  offset: number;
  has_more: boolean;
}

// ── Patients ────────────────────────────────────────────────────────────────
export type LifecycleStage = 'enquiry' | 'patient';
export type PatientStatus = 'active' | 'inactive' | 'merged';

export interface PatientListItem {
  id: string;
  full_name: string | null;
  phone_masked: string | null;
  lifecycle_stage: LifecycleStage;
  status: PatientStatus;
  preferred_provider: string | null;
  preferred_language_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientDetail {
  id: string;
  full_name: string | null;
  /** Working roles only. */
  phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  /** Viewers only. */
  phone_masked?: string | null;
  email_masked?: string | null;
  preferred_language_id: string | null;
  preferred_provider: string | null;
  external_ref: string | null;
  lifecycle_stage: LifecycleStage;
  status: PatientStatus;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
}

export type PatientSearchKind = 'phone' | 'email' | 'mrn' | 'uhid' | 'external';
export interface PatientSearchBody {
  kind?: PatientSearchKind;
  value?: string;
  name?: string;
}

// ── Verification ────────────────────────────────────────────────────────────
export type VerificationStatus = 'pending' | 'verified' | 'failed' | 'revoked';
export interface VerificationEpisode {
  id: string;
  session_kind: string;
  status: VerificationStatus;
  attempts: number;
  verified_at: string | null;
  failed_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
export interface PatientVerification {
  patient_id: string;
  latest_status: VerificationStatus | null;
  episodes: VerificationEpisode[];
}

// ── Interactions ────────────────────────────────────────────────────────────
export type InteractionChannel = 'phone' | 'whatsapp' | 'embed' | 'dashboard' | 'api' | 'demo';
export type InteractionSourceKind = 'call' | 'chat_session' | 'demo_session';
export interface Interaction {
  id: string;
  patient_id: string | null;
  channel: InteractionChannel;
  origin: string | null;
  direction: string | null;
  started_at: string;
  source_kind: InteractionSourceKind | null;
  source_id: string | null;
}

// ── Cases ───────────────────────────────────────────────────────────────────
export type CaseStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export interface CrmCase {
  id: string;
  patient_id: string | null;
  reference: string;
  case_type: string;
  category: string | null;
  priority: Priority;
  status: CaseStatus;
  subject: string;
  assigned_to_user_id: string | null;
  interaction_id: string | null;
  source: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CrmCaseDetail extends CrmCase {
  /** Working roles only — the keys are absent for viewers. */
  description?: string | null;
  resolution_note?: string | null;
}

// ── Tasks ───────────────────────────────────────────────────────────────────
export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled' | 'expired';
export interface CrmTask {
  id: string;
  patient_id: string | null;
  case_id: string | null;
  task_type: string;
  priority: Priority;
  status: TaskStatus;
  title: string;
  due_at: string | null;
  assigned_to_user_id: string | null;
  interaction_id: string | null;
  source: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface CrmTaskDetail extends CrmTask {
  /** Working roles only. */
  details?: string | null;
  outcome?: string | null;
  contact_phone?: string | null;
  /** Viewers only. */
  contact_phone_masked?: string | null;
}

// ── Notes (builder+; append-only — no update or delete exists) ──────────────
export type NoteType = 'staff' | 'intake' | 'follow_up' | 'operational';
export interface PatientNote {
  id: string;
  patient_id: string;
  case_id: string | null;
  task_id: string | null;
  interaction_id: string | null;
  note_type: NoteType;
  body: string;
  author_type: 'staff' | 'agent' | 'system';
  author_user_id: string | null;
  source: string;
  created_at: string;
}
/** No author, source, patient or company: those come from the principal and the URL. */
export interface NoteCreate {
  body: string;
  note_type?: NoteType;
  case_id?: string;
  task_id?: string;
}

// ── Case / task writes (builder+) ───────────────────────────────────────────
export type CaseType = 'complaint' | 'medication_refill' | 'red_flag' | 'intake' | 'service_request' | 'other';
export type TaskType = 'callback' | 'waitlist_followup' | 'document_followup' | 'reminder' | 'outreach' | 'other';

export interface CaseCreate {
  subject: string;
  case_type?: CaseType;
  category?: string;
  priority?: Priority;
  description?: string;
  patient_id?: string;
  assigned_to_user_id?: string;
}
/** PATCH semantics: send only the fields that changed. `null` unassigns / clears where the backend allows it. */
export interface CaseUpdate {
  status?: CaseStatus;
  priority?: Priority;
  category?: string | null;
  subject?: string;
  description?: string | null;
  assigned_to_user_id?: string | null;
  resolution_note?: string | null;
}

export interface TaskCreate {
  title: string;
  task_type?: TaskType;
  priority?: Priority;
  details?: string;
  due_at?: string;
  patient_id?: string;
  case_id?: string;
  assigned_to_user_id?: string;
}
/** `expired` is system-only and cannot be set. */
export interface TaskUpdate {
  status?: Exclude<TaskStatus, 'expired'>;
  due_at?: string | null;
  assigned_to_user_id?: string | null;
  priority?: Priority;
  title?: string;
  details?: string | null;
  outcome?: string | null;
}

// ── Consent ledger (append-only; reads: any role, writes: owner/admin) ──────
export type ConsentAction = 'granted' | 'denied' | 'withdrawn';
export type ConsentChannel = 'staff' | 'phone' | 'whatsapp' | 'dashboard';
export interface ConsentEvent {
  id: string;
  patient_id: string | null;
  consent_type: string;
  action: ConsentAction;
  granted: boolean;
  channel: string;
  source: string;
  language: string | null;
  captured_at: string;
  expires_at: string | null;
  expired: boolean;
}
/** The state DERIVED from the ledger, one per consent type. It reports; it does not enforce or imply consent. */
export interface ConsentState {
  consent_type: string;
  action: ConsentAction;
  granted: boolean;
  expired: boolean;
  channel: string;
  captured_at: string;
  expires_at: string | null;
}
export interface ConsentCreate {
  /** Open vocabulary, format-checked by the backend: ^[a-z][a-z0-9_]{1,63}$ */
  consent_type: string;
  action: ConsentAction;
  channel?: ConsentChannel;
  language?: string;
  /** Must be in the future. */
  expires_at?: string;
  /** <=128 chars; makes a retried submit a no-op replay instead of a duplicate entry. */
  idempotency_key?: string;
}

// ── Patient profile update (builder+) ───────────────────────────────────────
/** The ONLY writable patient fields. Identity (phone, email, DOB, external ref) and merge state are not. */
export interface PatientUpdate {
  full_name?: string;
  preferred_language_id?: number | null;
  preferred_provider?: string | null;
  lifecycle_stage?: LifecycleStage;
  /** `merged` is not settable through the API. */
  status?: Exclude<PatientStatus, 'merged'>;
}

// ── Appointments & providers ────────────────────────────────────────────────
export type AppointmentStatus = 'booked' | 'rescheduled' | 'cancelled' | 'completed' | 'no_show';
export interface Appointment {
  id: string;
  patient_id: string | null;
  provider_id: string | null;
  provider_name: string | null;
  department: string | null;
  starts_at: string;
  ends_at: string | null;
  status: AppointmentStatus;
  external_source: string | null;
  created_at: string;
  updated_at: string;
}
export interface Provider {
  id: string;
  name: string;
  department: string | null;
  slot_minutes: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
