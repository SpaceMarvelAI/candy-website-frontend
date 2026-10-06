/** Content for the nav product tour (Help → Product Tour). Compact on purpose: one entry per
 *  step, `anchor` is the `data-tour` value to spotlight, `null` only for the centered intro. A
 *  step whose anchor isn't in the DOM when the tour opens (e.g. "finish-setup" once onboarding
 *  is done) is dropped — see ProductTour.tsx. */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

/** Where ProductTour navigates to once the last step's "Finish" is clicked. */
export const TOUR_END_PATH = '/healthcare';

export interface TourStep {
  id: string;
  anchor: string | null;
  placement: TourPlacement;
  eyebrow: string;
  title: string;
  desc: string;
  /** Route this step lives on — ProductTour navigates here (replace, not push) on entry. */
  path?: string;
  /** data-tour id to click once, right after landing on `path`, before looking for `anchor`
   *  (e.g. clicking a use-case card to open the modal this step spotlights). */
  clickAnchor?: string;
  /** Skip the blur/dim backdrop — for a step whose whole point is showing off the page it
   *  navigated to (e.g. Flows), not drawing attention away from everything but one control. */
  noBlur?: boolean;
}

export const PRODUCT_TOUR_STEPS: TourStep[] = [
  { id: 'welcome', anchor: null, placement: 'center',
    eyebrow: 'PRODUCT TOUR', title: 'Welcome to Candy',
    desc: "A quick look at what's where: the product rail, your use-case agents, Live Calls, Analytics, Flows and Connectors. Use Next, or the arrow keys, to move along." },
  { id: 'rail', anchor: 'rail', placement: 'right',
    eyebrow: 'SPACEMARVEL', title: 'More Products, One Sign-In',
    desc: "Jump to Home or Finixy from this rail. Your SpaceMarvel login carries over, so there's nothing to enter again, and Candy is always one click back." },
  { id: 'healthcare', anchor: 'nav-healthcare', path: '/healthcare', noBlur: true, placement: 'right',
    eyebrow: 'HEALTHCARE', title: 'Voice Agents Built for Clinics',
    desc: 'Pick a use case and Candy sets up an agent with the right skills, emergency escalation and medical speech recognition already in place. Then test it, add a number and go live.' },
  { id: 'live-calls', anchor: 'nav-live', path: '/live/demo', noBlur: true, placement: 'right',
    eyebrow: 'LIVE CALLS', title: 'Hear Exactly What Your Agents Said',
    desc: 'Every voice test lands here with its recording and transcript. Replay real conversations and fix what needs fixing before customers ever notice.' },
  { id: 'analytics', anchor: 'nav-analytics', path: '/analytics/summary', noBlur: true, placement: 'right',
    eyebrow: 'ANALYTICS', title: 'See How Your Agents Are Doing',
    desc: "Track sessions, ratings, response speed and the questions your agents couldn't answer. Seven views turn conversations into clear next steps." },
  { id: 'flows', anchor: 'nav-flows', path: '/flows', noBlur: true, placement: 'right',
    eyebrow: 'FLOWS', title: 'Turn Conversations Into Actions',
    desc: 'Connect your agents to your other tools on a visual canvas. When a conversation escalates or a demo gets booked, a flow can alert Slack, log a ticket or call your own endpoint.' },
  { id: 'connectors', anchor: 'rail-more', placement: 'right',
    eyebrow: 'CONNECTORS', title: 'Connect the Apps You Already Use',
    desc: 'Link your accounts once with OAuth or an API key. Connected apps show up in Flows, ready to drop in as action steps — open them from More on this rail.' },
  { id: 'finish-setup', anchor: 'finish-setup', placement: 'left',
    eyebrow: 'GETTING STARTED', title: 'Finish Setting Up Your Workspace',
    desc: 'Three quick steps: tell us what you want to manage, add your number and invite your team. Skip any of them, and pick up right here whenever you like.' },

  // ── Building an agent: Healthcare use case → create modal → agent workspace ──
  { id: 'usecase-card', anchor: 'usecase-card', path: '/healthcare', placement: 'bottom',
    eyebrow: '15 USE CASES', title: 'Start From a Ready-Made Use Case',
    desc: 'Each card shows what the agent collects and which skills come with it. Choose one, name your agent, and fine-tune it in the next step.' },
  { id: 'create-modal', anchor: 'create-modal', path: '/healthcare', clickAnchor: 'usecase-card', placement: 'bottom',
    eyebrow: 'NEW AGENT', title: 'Name It, Then Make It Yours',
    desc: "Choose a name and Candy attaches the use case's skills automatically. From here you can open it and fine-tune the instructions, knowledge and phone number whenever you're ready." },
];
