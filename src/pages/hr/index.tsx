import AgentWorkspace from '../../components/agent/AgentWorkspace';

const TINT = 'purple' as const;

// Plain-English brief — the backend's compile_agent_prompt expands this
// into a structured agent prompt at save time.
const DEFAULT_PROMPT = `Conduct technical + HR screening interviews for our hiring team.

The knowledge base for each candidate contains TWO documents:
  - Resume / CV — the candidate's experience, skills, and projects.
  - Job Description (JD) — the role's required skills and seniority.

The interview must:
  - Ask only questions grounded in the candidate's resume and the JD.
    Don't pull random questions from the internet.
  - Match difficulty to the candidate's level (junior / mid / senior).
  - Cover both: technical depth on the resume's claimed skills, plus
    behavioural / situational HR questions.
  - Listen to the answer and ask one focused follow-up before moving on.
  - Keep it conversational, never an interrogation. One question per turn.
  - NEVER discuss salary, comp, equity, or notice period. If the
    candidate asks, say "Our recruiter will share compensation details
    after this round" and move on.

If the candidate goes off-topic, gently bring them back. If they ask
something you can't answer confidently from the resume + JD, say
"I'm the AI screener — a recruiter from our team will follow up on
that." Don't make up answers.`;

const PRESETS = [
  { label: 'Technical screen',  body: 'Run a 6-question technical screen pulled from the resume\'s top 3 skills + the JD\'s must-haves. One question per turn, follow-up on the weakest answer.' },
  { label: 'Behavioural round', body: 'Ask 4 behavioural questions tied to the JD (collaboration, conflict, ownership). Use STAR format guidance only when the candidate stalls.' },
  { label: 'System design',     body: 'Senior candidate only. Pose one open-ended design problem from the JD\'s domain. Ask follow-ups on trade-offs, not implementation details.' },
];

export default function HRAgent() {
  return (
    <AgentWorkspace
      slug="hr"
      category="HR & Hiring"
      icon="hr"
      tint={TINT}
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
