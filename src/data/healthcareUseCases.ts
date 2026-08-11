// The 15 healthcare use cases — mirrors the backend
// (services/healthcare_use_cases.py). Each is a `health`-domain agent
// distinguished by the hc_<key> skill it collects with. Clicking a card
// creates an agent and attaches `skills` automatically; the user then
// customises in the builder.

export type Direction = 'inbound' | 'outbound' | 'both';

export interface UseCaseField {
  name: string;
  ask: string;
  type: 'text' | 'phone' | 'date' | 'number' | 'choice';
  required: boolean;
  choices?: string[];
}

export interface HealthcareUseCase {
  key: string;            // backend key; skill slug is hc_<key>
  title: string;
  direction: Direction;
  purpose: string;
  icon: string;           // name in src/assets/icons.tsx
  fields: UseCaseField[];
  /** Platform skill slugs auto-attached on create (includes hc_<key>). */
  skills: string[];
}

const hc = (key: string): string => `hc_${key}`;

export const HEALTHCARE_USE_CASES: HealthcareUseCase[] = [
  {
    key: 'patient_intake', title: 'Patient Intake', direction: 'both', icon: 'team',
    purpose: 'Register a new patient and capture the details the clinic needs before a visit.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'date_of_birth', ask: 'Date of birth', type: 'date', required: true },
      { name: 'phone', ask: 'Phone number', type: 'phone', required: true },
      { name: 'reason_for_visit', ask: 'Reason for visit', type: 'text', required: true },
      { name: 'insurer', ask: 'Insurance provider', type: 'text', required: false },
    ],
    skills: [hc('patient_intake'), 'appointment_booking', 'red_flag_alert'],
  },
  {
    key: 'insurance_verification', title: 'Insurance Verification', direction: 'both', icon: 'lock',
    purpose: 'Collect insurance details so staff can verify coverage before the visit.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'date_of_birth', ask: 'Date of birth', type: 'date', required: true },
      { name: 'insurer', ask: 'Insurance company', type: 'text', required: true },
      { name: 'policy_number', ask: 'Policy / member ID', type: 'text', required: true },
    ],
    skills: [hc('insurance_verification'), 'red_flag_alert'],
  },
  {
    key: 'referral_intake', title: 'Referral Intake', direction: 'both', icon: 'shuffle',
    purpose: 'Capture a referral so the clinic can schedule the right specialist.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'phone', ask: 'Phone number', type: 'phone', required: true },
      { name: 'referring_doctor', ask: 'Referring doctor', type: 'text', required: false },
      { name: 'specialty', ask: 'Specialty / department', type: 'text', required: true },
      { name: 'reason', ask: 'Reason for referral', type: 'text', required: true },
    ],
    skills: [hc('referral_intake'), 'appointment_booking', 'red_flag_alert'],
  },
  {
    key: 'prescription_refill', title: 'Prescription Refill', direction: 'both', icon: 'box',
    purpose: 'Log a medication refill request for staff to review. Never approves or dispenses.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'phone', ask: 'Phone number', type: 'phone', required: true },
      { name: 'medication_name', ask: 'Medication name', type: 'text', required: true },
      { name: 'prescribing_doctor', ask: 'Prescribing doctor', type: 'text', required: false },
      { name: 'pharmacy', ask: 'Preferred pharmacy', type: 'text', required: false },
    ],
    skills: [hc('prescription_refill'), 'ticket_management', 'red_flag_alert'],
  },
  {
    key: 'lab_result_request', title: 'Lab Result Request', direction: 'both', icon: 'file',
    purpose: 'Take a request for lab/test results. Verifies identity; results are released by staff.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'date_of_birth', ask: 'Date of birth (verification)', type: 'date', required: true },
      { name: 'test_name', ask: 'Test / report', type: 'text', required: true },
      { name: 'callback_phone', ask: 'Callback number', type: 'phone', required: true },
    ],
    skills: [hc('lab_result_request'), 'ticket_management', 'red_flag_alert'],
  },
  {
    key: 'telehealth_request', title: 'Telehealth Coordination', direction: 'both', icon: 'mic',
    purpose: 'Set up a telehealth (video/phone) consult request.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'phone', ask: 'Phone number', type: 'phone', required: true },
      { name: 'preferred_mode', ask: 'Video or phone', type: 'choice', required: true, choices: ['video', 'phone'] },
      { name: 'preferred_time', ask: 'Preferred day/time', type: 'text', required: true },
      { name: 'reason', ask: 'Reason for consult', type: 'text', required: true },
    ],
    skills: [hc('telehealth_request'), 'appointment_booking', 'red_flag_alert'],
  },
  {
    key: 'payment_query', title: 'Payment / Billing', direction: 'both', icon: 'card',
    purpose: 'Capture a billing question for the accounts team. Quotes only documented fees.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'phone', ask: 'Phone number', type: 'phone', required: true },
      { name: 'query', ask: 'Billing question', type: 'text', required: true },
      { name: 'invoice_ref', ask: 'Invoice reference', type: 'text', required: false },
    ],
    skills: [hc('payment_query'), 'ticket_management'],
  },
  {
    key: 'after_hours_message', title: 'After-Hours Message', direction: 'inbound', icon: 'mail',
    purpose: 'Take a message when the clinic is closed and route by urgency. Emergencies → 108/112.',
    fields: [
      { name: 'full_name', ask: 'Name', type: 'text', required: true },
      { name: 'phone', ask: 'Callback number', type: 'phone', required: true },
      { name: 'message', ask: 'Message', type: 'text', required: true },
      { name: 'urgency', ask: 'Urgency', type: 'choice', required: true, choices: ['routine', 'same_day', 'urgent'] },
    ],
    skills: [hc('after_hours_message'), 'red_flag_alert'],
  },
  {
    key: 'medical_records_request', title: 'Medical Records', direction: 'both', icon: 'book',
    purpose: 'Take a request for records/certificates. Verifies identity; documents released by staff.',
    fields: [
      { name: 'full_name', ask: 'Full name', type: 'text', required: true },
      { name: 'date_of_birth', ask: 'Date of birth (verification)', type: 'date', required: true },
      { name: 'record_type', ask: 'Record / certificate', type: 'text', required: true },
      { name: 'delivery', ask: 'Delivery method', type: 'choice', required: true, choices: ['email', 'pickup', 'post'] },
    ],
    skills: [hc('medical_records_request'), 'ticket_management'],
  },
  {
    key: 'feedback_intake', title: 'Feedback / Complaint', direction: 'both', icon: 'star',
    purpose: 'Capture patient feedback or a complaint for the quality team.',
    fields: [
      { name: 'full_name', ask: 'Name', type: 'text', required: false },
      { name: 'phone', ask: 'Callback number', type: 'phone', required: false },
      { name: 'feedback', ask: 'Feedback / concern', type: 'text', required: true },
    ],
    skills: [hc('feedback_intake')],
  },
  {
    key: 'appointment_reminder_confirm', title: 'Appointment Reminder', direction: 'outbound', icon: 'calendar',
    purpose: 'Remind the patient of their upcoming appointment and capture whether they will attend.',
    fields: [
      { name: 'attending', ask: 'Attending?', type: 'choice', required: true, choices: ['yes', 'no', 'reschedule'] },
    ],
    skills: [hc('appointment_reminder_confirm'), 'appointment_booking'],
  },
  {
    key: 'care_plan_followup', title: 'Care-Plan Follow-up', direction: 'outbound', icon: 'bulb',
    purpose: "Check in on a patient's recovery and flag concerns for the care team.",
    fields: [
      { name: 'recovery_status', ask: 'Recovery status', type: 'choice', required: true, choices: ['improving', 'same', 'worse'] },
      { name: 'concerns', ask: 'New symptoms / concerns', type: 'text', required: false },
    ],
    skills: [hc('care_plan_followup'), 'red_flag_alert'],
  },
  {
    key: 'medication_adherence', title: 'Medication Reminder', direction: 'outbound', icon: 'box',
    purpose: 'Remind the patient to continue their medication and check adherence.',
    fields: [
      { name: 'still_taking', ask: 'Still taking it?', type: 'choice', required: true, choices: ['yes', 'no', 'ran_out'] },
      { name: 'notes', ask: 'Notes for the clinic', type: 'text', required: false },
    ],
    skills: [hc('medication_adherence')],
  },
  {
    key: 'satisfaction_survey', title: 'Satisfaction Survey', direction: 'outbound', icon: 'star',
    purpose: 'Collect a short satisfaction rating and comments after a visit.',
    fields: [
      { name: 'rating', ask: 'Rating (1–5)', type: 'number', required: true },
      { name: 'comments', ask: 'Comments', type: 'text', required: false },
    ],
    skills: [hc('satisfaction_survey')],
  },
  {
    key: 'patient_reactivation', title: 'Patient Reactivation', direction: 'outbound', icon: 'broadcast',
    purpose: "Reach out to a lapsed patient and capture whether they'd like to book a visit.",
    fields: [
      { name: 'interested', ask: 'Interested in a visit?', type: 'choice', required: true, choices: ['yes', 'no', 'later'] },
      { name: 'preferred_time', ask: 'Preferred time', type: 'text', required: false },
    ],
    skills: [hc('patient_reactivation'), 'appointment_booking'],
  },
];

/** Friendly labels for the platform skill slugs shown on the cards/modal. */
export const SKILL_LABELS: Record<string, string> = {
  appointment_booking: 'Appointment booking',
  red_flag_alert: 'Emergency escalation',
  ticket_management: 'Staff task queue',
  hc_patient_intake: 'Patient intake',
  hc_insurance_verification: 'Insurance verification',
  hc_referral_intake: 'Referral intake',
  hc_prescription_refill: 'Prescription refill',
  hc_lab_result_request: 'Lab result request',
  hc_telehealth_request: 'Telehealth coordination',
  hc_payment_query: 'Payment / billing',
  hc_after_hours_message: 'After-hours message',
  hc_medical_records_request: 'Medical records',
  hc_feedback_intake: 'Feedback / complaint',
  hc_appointment_reminder_confirm: 'Appointment reminder',
  hc_care_plan_followup: 'Care-plan follow-up',
  hc_medication_adherence: 'Medication reminder',
  hc_satisfaction_survey: 'Satisfaction survey',
  hc_patient_reactivation: 'Patient reactivation',
};

export function skillLabel(slug: string): string {
  return SKILL_LABELS[slug] ?? slug.replace(/^hc_/, '').replace(/_/g, ' ');
}
