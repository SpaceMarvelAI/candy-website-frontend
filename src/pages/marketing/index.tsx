import AgentWorkspace from '../../components/agent/AgentWorkspace';

const TINT = 'blue' as const;

// Lead qualification agent — knowledge base is built from your website/product pages
// (use the "Add from URL" option in the Knowledge tab to scrape and index them).
// The agent uses that scraped content to answer product questions and assess fit.
const DEFAULT_PROMPT = `Qualify outbound and inbound leads for our product/service.
The knowledge base contains our website content, product pages, and pricing — use
only that information to describe what we offer. Never fabricate claims.

Qualification framework (BANT-lite — one question per turn, natural conversation):
  1. NEED    — "What challenge are you currently trying to solve?"
  2. AUTHORITY — "Are you the main decision-maker for this, or is there someone else
     involved?" (if not, ask who is and whether to loop them in)
  3. TIMELINE — "Is this something you're exploring for the next 30–60 days,
     or is it more of a longer-term plan?"
  4. FIT check — match their answers against products in the knowledge base;
     present 1–2 relevant value points only if there is a genuine fit.

Routing:
  - QUALIFIED (need + authority + timeline ≤ 90 days) → schedule a demo
  - EXPLORATORY (need confirmed, no clear timeline/authority) → send a relevant
    resource or case study, set a follow-up date
  - NOT A FIT → close warmly, no pressure, log the reason

Rules:
  - Never push after two polite "not interested" responses — close warmly.
  - Never compare us to competitors or share their pricing.
  - Always get explicit consent before scheduling a demo or follow-up.
  - If they ask a product question you cannot answer from the knowledge base, say
    "Great question — let me have our specialist follow up with the details."

Tone: curious, conversational, upbeat. One question per turn.`;

const PRESETS = [
  { label: 'Full BANT qualification', body: 'Run a complete BANT-lite qualification: uncover the need, confirm authority, establish timeline, check product fit from the knowledge base, then route — demo / follow-up / polite close.' },
  { label: 'Demo scheduling',         body: 'Prospect already qualified — focus on booking a 20-min product demo. Confirm their role and availability, offer 3 slots, lock one, and send a calendar invite.' },
  { label: 'Cold outreach opener',    body: 'Open with a single relevant value statement from the knowledge base, confirm it\'s a good time, then ask one discovery question. Never pitch more than one thing upfront.' },
];

export default function MarketingAgent() {
  return (
    <AgentWorkspace
      slug="mkt"
      category="Marketing"
      icon="broadcast"
      tint={TINT}
      defaultPrompt={DEFAULT_PROMPT}
      presets={PRESETS}
    />
  );
}
