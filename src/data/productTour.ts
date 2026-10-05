/** Content for the nav product tour (Help → Product Tour). Compact on purpose: one entry per
 *  step, `anchor` is the `data-tour` value to spotlight, `null` only for the centered intro. A
 *  step whose anchor isn't in the DOM when the tour opens (e.g. "finish-setup" once onboarding
 *  is done) is dropped — see ProductTour.tsx. */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface TourStep {
  id: string;
  anchor: string | null;
  placement: TourPlacement;
  eyebrow: string;
  title: string;
  desc: string;
}

export const PRODUCT_TOUR_STEPS: TourStep[] = [
  { id: 'welcome', anchor: null, placement: 'center',
    eyebrow: 'PRODUCT TOUR', title: 'Welcome to Candy',
    desc: "A quick look at what's where: the product rail, your use-case agents, Live Calls, Analytics, Flows, Connectors, your company and plan, and voice control. Use Next, or the arrow keys, to move along." },
  { id: 'rail', anchor: 'rail', placement: 'right',
    eyebrow: 'SPACEMARVEL', title: 'More Products, One Sign-In',
    desc: "Jump to Home or Finixy from this rail. Your SpaceMarvel login carries over, so there's nothing to enter again, and Candy is always one click back." },
  { id: 'healthcare', anchor: 'nav-healthcare', placement: 'right',
    eyebrow: 'HEALTHCARE', title: 'Voice Agents Built for Clinics',
    desc: 'Pick a use case and Candy sets up an agent with the right skills, emergency escalation and medical speech recognition already in place. Then test it, add a number and go live.' },
  { id: 'live-calls', anchor: 'nav-live', placement: 'right',
    eyebrow: 'LIVE CALLS', title: 'Hear Exactly What Your Agents Said',
    desc: 'Every voice test lands here with its recording and transcript. Replay real conversations and fix what needs fixing before customers ever notice.' },
  { id: 'analytics', anchor: 'nav-analytics', placement: 'right',
    eyebrow: 'ANALYTICS', title: 'See How Your Agents Are Doing',
    desc: "Track sessions, ratings, response speed and the questions your agents couldn't answer. Seven views turn conversations into clear next steps." },
  { id: 'flows', anchor: 'nav-flows', placement: 'right',
    eyebrow: 'FLOWS', title: 'Turn Conversations Into Actions',
    desc: 'Connect your agents to your other tools on a visual canvas. When a conversation escalates or a demo gets booked, a flow can alert Slack, log a ticket or call your own endpoint.' },
  { id: 'connectors', anchor: 'rail-more', placement: 'right',
    eyebrow: 'CONNECTORS', title: 'Connect the Apps You Already Use',
    desc: 'Link your accounts once with OAuth or an API key. Connected apps show up in Flows, ready to drop in as action steps — open them from More on this rail.' },
  { id: 'company', anchor: 'company-switcher', placement: 'bottom',
    eyebrow: 'COMPANY', title: 'Switch Companies, Keep One Login',
    desc: 'Agents, calls and connections belong to a company. Pick a different one here and the whole workspace follows along, so nothing gets mixed up.' },
  { id: 'upgrade', anchor: 'upgrade-btn', placement: 'bottom',
    eyebrow: 'PLAN', title: 'Plans and Billing, One Click Away',
    desc: 'Ready for more? This takes you to your SpaceMarvel billing page, where you can review your plan and upgrade whenever you need to.' },
  { id: 'voice', anchor: 'voice-control', placement: 'left',
    eyebrow: 'VOICE CONTROL', title: 'Get Around Candy by Voice',
    desc: 'Hold this button, or hold Alt + Space, and say where to go: "open Analytics", "go back", "scroll down". Let go and Candy takes you there.' },
  { id: 'finish-setup', anchor: 'finish-setup', placement: 'left',
    eyebrow: 'GETTING STARTED', title: 'Finish Setting Up Your Workspace',
    desc: 'Three quick steps: tell us what you want to manage, add your number and invite your team. Skip any of them, and pick up right here whenever you like.' },
];
