import type { MatchingAgent } from '../api/prompts';

/**
 * Every agent workspace lives at a fixed route keyed by use_case_slug (see
 * VIEW_TO_PATH in context/AppContext.tsx and the slug= props in src/pages/*).
 * There is no generic /agents/:id route — landing "on an agent's page" means
 * landing on its use-case's workspace route, which then auto-selects the
 * agent by id (see the `state.selectAgentId` handling added to
 * AgentWorkspace / ChatbotWorkspace).
 *
 * `health` and `hr` are used by BOTH a voice-agent workspace and a chatbot
 * workspace, so those two are disambiguated by call_direction — chat agents
 * are always created with call_direction: 'chat' (see ChatbotWorkspace).
 */
const VOICE_ROUTES: Record<string, string> = {
  ecom: '/agents/ecommerce',
  fin: '/agents/financial',
  log: '/agents/logistics',
  health: '/agents/healthcare',
  mkt: '/agents/marketing',
  hr: '/agents/hr',
};

const CHAT_ROUTES: Record<string, string> = {
  cs: '/chatbots/cs',
  tech: '/chatbots/tech',
  health: '/chatbots/health',
  bank: '/chatbots/bank',
  appt: '/chatbots/appt',
  hr: '/chatbots/hr',
};

/** Resolve the workspace route for a given use_case_slug + call_direction. */
export function resolveAgentRoute(useCaseSlug: string, callDirection?: string): string | null {
  if (callDirection === 'chat' && CHAT_ROUTES[useCaseSlug]) return CHAT_ROUTES[useCaseSlug];
  if (VOICE_ROUTES[useCaseSlug]) return VOICE_ROUTES[useCaseSlug];
  return CHAT_ROUTES[useCaseSlug] ?? null;
}

export function resolveAgentRouteFor(agent: MatchingAgent): string | null {
  return resolveAgentRoute(agent.use_case_slug, agent.call_direction);
}
