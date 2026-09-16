/**
 * voice/registry/navTargets.ts — every place voice can send you.
 *
 * Transcribed by hand from the two sources of truth and nowhere else:
 *   · the route table in src/App.tsx
 *   · NAV_SECTIONS in src/components/Sidebar.tsx
 *
 * Nothing here is invented. If a phrase has no destination in this app it is
 * either absent (and resolves to `not_found`) or carries `unavailable` with the
 * sentence voice should say instead — see SETTINGS below, which is the honest
 * answer to "open settings" in an app that has no settings page.
 *
 * Tabs are listed here rather than registered by their pages because in this
 * app a tab *is* a route (/analytics/:tab, /live/:tab), so they are reachable
 * from anywhere. Page-level controls that are not routes — the healthcare
 * direction filter, buttons, inputs — register themselves at mount instead.
 */
import type { VoiceTarget } from '../types';

/** Redirect-only paths resolve to their real destination, as App.tsx does. */
const LIVE_DEFAULT      = '/live/demo';
const ANALYTICS_DEFAULT = '/analytics/summary';

const SIDEBAR: VoiceTarget[] = [
  { id: 'nav.healthcare', kind: 'nav', label: 'Healthcare', scope: '*', path: '/healthcare',
    aliases: ['healthcare use cases', 'health care', 'use case', 'use cases', 'home', 'dashboard'] },
  { id: 'nav.live', kind: 'nav', label: 'Live Calls', scope: '*', path: LIVE_DEFAULT,
    aliases: ['live', 'calls', 'voice bots', 'call log', 'recordings'] },
  { id: 'nav.analytics', kind: 'nav', label: 'Analytics', scope: '*', path: ANALYTICS_DEFAULT,
    aliases: ['reports', 'stats', 'statistics', 'metrics'] },
  { id: 'nav.flows', kind: 'nav', label: 'Flows', scope: '*', path: '/flows',
    aliases: ['flow', 'workflows', 'workflow', 'canvas'] },
  { id: 'nav.connectors', kind: 'nav', label: 'Connectors', scope: '*', path: '/connects',
    // "Integrations" is the word people reach for; /connects is where it lives.
    aliases: ['connects', 'connect apps', 'integrations', 'integration', 'apps', 'app catalogue'] },
  { id: 'nav.webhooks', kind: 'nav', label: 'Webhooks', scope: '*', path: '/webhooks',
    aliases: ['webhook', 'web hooks'] },
  { id: 'nav.chatbots', kind: 'nav', label: 'Chatbots', scope: '*', path: '/chatbots',
    aliases: ['chat bots', 'chatbot use cases'] },
  { id: 'nav.hrchat', kind: 'nav', label: 'HR Chat', scope: '*', path: '/hrchat',
    aliases: ['hr flow', 'candidate screening', 'hiring'] },
];

/**
 * Sidebar entries with `path: null` or `soon: true`. They are real product
 * vocabulary, so voice must recognise them — it just has nowhere to go.
 */
const COMING_SOON: VoiceTarget[] = [
  { id: 'nav.promptLibrary', kind: 'nav', label: 'Prompt Library', scope: '*', aliases: ['prompts'],
    unavailable: 'Prompt Library is coming soon.' },
  // No "my agents" alias: "my" is a filler word, so that alias would collapse to
  // exactly "agents" and score a perfect match against a coming-soon entry,
  // beating the two real Agents tabs.
  { id: 'nav.workspaceAgents', kind: 'nav', label: 'Workspace Agents', scope: '*', aliases: [],
    unavailable: 'Workspace Agents is coming soon.' },
  { id: 'nav.usecase.finance', kind: 'nav', label: 'Finance use case', scope: '*', aliases: ['finance'],
    unavailable: 'The Finance use case is coming soon.' },
  { id: 'nav.usecase.legal', kind: 'nav', label: 'Legal use case', scope: '*', aliases: ['legal'],
    unavailable: 'The Legal use case is coming soon.' },
  { id: 'nav.usecase.customerSupport', kind: 'nav', label: 'Customer Support use case', scope: '*',
    aliases: [], unavailable: 'The Customer Support use case is coming soon.' },
];

/**
 * There is no settings page anywhere in this app. Rather than silently sending
 * the user to something adjacent, voice names the two things people actually
 * mean by it.
 */
const SETTINGS: VoiceTarget = {
  id: 'ui.settings', kind: 'nav', label: 'Settings', scope: '*',
  aliases: ['setting', 'preferences', 'options', 'configuration'],
  unavailable: 'There is no Settings page — did you mean Appearance, or Connectors?',
};

const tab = (
  id: string, label: string, path: string, scopePrefix: string, section: string,
  group: string, index: number, aliases: readonly string[] = [],
): VoiceTarget => ({
  id, kind: 'tab', label, path, scope: [scopePrefix], section, group, index, aliases,
});

/** src/pages/analytics/index.tsx — TABS. */
const ANALYTICS_TABS: VoiceTarget[] = [
  tab('analytics.tab.summary',       'Summary',        '/analytics/summary',        '/analytics', 'Analytics', 'analytics.tabs', 0, ['overview']),
  tab('analytics.tab.sessions',      'Sessions',       '/analytics/sessions',       '/analytics', 'Analytics', 'analytics.tabs', 1),
  tab('analytics.tab.latency',       'Latency',        '/analytics/latency',        '/analytics', 'Analytics', 'analytics.tabs', 2, ['speed', 'response time']),
  tab('analytics.tab.knowledgeGaps', 'Knowledge Gaps', '/analytics/knowledge-gaps', '/analytics', 'Analytics', 'analytics.tabs', 3, ['gaps']),
  tab('analytics.tab.languages',     'Languages',      '/analytics/languages',      '/analytics', 'Analytics', 'analytics.tabs', 4),
  tab('analytics.tab.agents',        'Agents',         '/analytics/agents',         '/analytics', 'Analytics', 'analytics.tabs', 5),
  tab('analytics.tab.events',        'Events',         '/analytics/events',         '/analytics', 'Analytics', 'analytics.tabs', 6),
];

/** src/pages/live/index.tsx — VALID_TABS and their rendered labels. */
const LIVE_TABS: VoiceTarget[] = [
  tab('live.tab.demo',   'Demo recordings', '/live/demo',   '/live', 'Live Calls', 'live.tabs', 0, ['demos', 'test sessions']),
  tab('live.tab.live',   'Live calls',      '/live/live',   '/live', 'Live Calls', 'live.tabs', 1, ['telephony']),
  tab('live.tab.chat',   'Chat sessions',   '/live/chat',   '/live', 'Live Calls', 'live.tabs', 2, ['chats']),
  tab('live.tab.agents', 'Agents',          '/live/agents', '/live', 'Live Calls', 'live.tabs', 3),
];

/** src/pages/chatbots/index.tsx — id → title, routed at /chatbots/:id. */
const CHATBOT_WORKSPACES: VoiceTarget[] = [
  { id: 'nav.chatbot.cs',     kind: 'nav', label: 'Customer Support',    scope: '*', path: '/chatbots/cs',     aliases: ['support chatbot'] },
  { id: 'nav.chatbot.tech',   kind: 'nav', label: 'Technical Support',   scope: '*', path: '/chatbots/tech',   aliases: ['tech support'] },
  { id: 'nav.chatbot.health', kind: 'nav', label: 'Healthcare Coaching', scope: '*', path: '/chatbots/health', aliases: ['health coaching'] },
  { id: 'nav.chatbot.bank',   kind: 'nav', label: 'Banking Support',     scope: '*', path: '/chatbots/bank',   aliases: ['banking'] },
  { id: 'nav.chatbot.appt',   kind: 'nav', label: 'Appointment Booking', scope: '*', path: '/chatbots/appt',   aliases: ['appointments', 'booking'] },
  { id: 'nav.chatbot.hr',     kind: 'nav', label: 'HR Operations',       scope: '*', path: '/chatbots/hr',     aliases: ['hr ops'] },
];

/** Full-screen voice-agent workspaces — App.tsx /agents/*. */
const AGENT_WORKSPACES: VoiceTarget[] = [
  { id: 'nav.agent.ecommerce',  kind: 'nav', label: 'E-commerce Agent', scope: '*', path: '/agents/ecommerce',  aliases: ['ecommerce agent', 'e commerce agent', 'retail agent'] },
  { id: 'nav.agent.financial',  kind: 'nav', label: 'Financial Agent',  scope: '*', path: '/agents/financial',  aliases: ['finance agent', 'banking agent'] },
  { id: 'nav.agent.logistics',  kind: 'nav', label: 'Logistics Agent',  scope: '*', path: '/agents/logistics',  aliases: ['shipping agent'] },
  { id: 'nav.agent.healthcare', kind: 'nav', label: 'Healthcare Agent', scope: '*', path: '/agents/healthcare', aliases: ['clinic agent'] },
  { id: 'nav.agent.marketing',  kind: 'nav', label: 'Marketing Agent',  scope: '*', path: '/agents/marketing',  aliases: [] },
  { id: 'nav.agent.hr',         kind: 'nav', label: 'HR Agent',         scope: '*', path: '/agents/hr',         aliases: ['recruitment agent'] },
];

/**
 * The topbar search box (.topbar-search-input).
 *
 * Declared here so validate.ts and the executor have one id to agree on, but
 * deliberately NOT part of NAV_TARGETS — Topbar registers it at mount instead.
 *
 * The line this file draws is between targets reachable without the DOM and
 * targets that are not. A route can be navigated to whether or not its link is
 * rendered, so nav entries are static. A text box has to exist to be typed
 * into, and this one does not always exist: /agents/* and /chatbots/:id render
 * outside AppLayout, with no Topbar at all. Listing it statically would tell
 * voice there is a search box on those pages when there is not.
 */
export const GLOBAL_SEARCH: VoiceTarget = {
  id: 'global.search', kind: 'input', label: 'Search', scope: '*',
  aliases: ['search box', 'search bar', 'ask ai', 'search or ask ai'],
};

/**
 * Said when someone asks voice to search FOR something.
 *
 * The box at Topbar.tsx:134 is decoration: className, placeholder and styles,
 * and nothing else — no value, no onChange, no form, and nothing anywhere in
 * src/ reads it. The only behaviour attached to it is the ⌘K handler that
 * focuses it. So there is no search to perform, and putting the words into the
 * box while announcing "Searching for refunds" would be a confident false
 * success: worse than saying nothing, because the user then waits for results
 * that cannot arrive.
 *
 * GLOBAL_SEARCH itself is deliberately NOT marked `unavailable`. The target is
 * genuinely usable — focusing it is exactly what ⌘K does, and reaching that by
 * voice is worth more to a voice user than to anyone else. It is the search
 * COMMAND that has nowhere to go, which is a fact about the verb rather than
 * about the target, and why this sits beside it rather than on it.
 *
 * Phrased about the app rather than about voice: it stops being true the day
 * the box gets a consumer, and then only this string and one grammar branch in
 * parseLocal.ts need to change.
 */
export const SEARCH_NOT_CONNECTED =
  'Search is not connected yet — say search box and I will put the cursor there.';

export const NAV_TARGETS: readonly VoiceTarget[] = [
  ...SIDEBAR,
  ...COMING_SOON,
  SETTINGS,
  ...ANALYTICS_TABS,
  ...LIVE_TABS,
  ...CHATBOT_WORKSPACES,
  ...AGENT_WORKSPACES,
];
