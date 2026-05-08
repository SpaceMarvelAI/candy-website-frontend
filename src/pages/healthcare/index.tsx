import AgentWorkspace from '../../components/agent/AgentWorkspace';

const TINT = 'teal' as const;

// Plain-English brief — domain is appointment-booking, but the same
// pattern works for any service business that books slots (clinics,
// salons, repair shops, etc.). The user describes the actual business
// in the requirements and uploads the relevant intake / policy docs.
const DEFAULT_PROMPT = `Handle inbound calls about scheduling appointments
for our business. The knowledge base will contain our list of services,
hours, locations, intake / preparation instructions, and any
appointment-policy documents (cancellation, no-show, etc.).

You should:
  - Greet the caller warmly with the business name.
  - Ask what they're calling about and which service they need.
  - Use the knowledge base to confirm we offer that service, the
    available time windows, and any prep instructions.
  - Collect their preferred date/time, name, and call-back number.
  - Confirm the slot back to them clearly.
  - For reschedules / cancellations, follow the policy in the docs.

If the caller asks something outside the knowledge base — clinical
advice, pricing not in the docs, anything sensitive — say "I'm the AI
assistant — a member of our team will call you back shortly with
that." Don't make up information.

Tone: warm, calm, professional. Mirror the caller's language (English,
Hindi, Tamil) when they switch.`;

const PRESETS = [
  { label: 'Book appointment',  body: 'Walk a caller through booking: confirm service, ask preferred date/time, collect name + phone, read back the slot, send confirmation SMS.' },
  { label: 'Reschedule',        body: 'Caller wants to move an existing appointment. Confirm identity, find their slot, propose 2 alternatives from availability, lock the new one.' },
  { label: 'Pre-visit prep',    body: 'Remind a caller about prep instructions for their upcoming appointment (fasting, documents to bring, parking info — pulled from the KB).' },
];

export default function HealthcareAgent() {
  return (
    <AgentWorkspace
      slug="health"
      category="Appointment Booking"
      icon="health"
      tint={TINT}
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
