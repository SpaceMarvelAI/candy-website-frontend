import { api } from './client';

/**
 * Prompt Library handoff (Open in Candy). Mirrors the shape returned by
 * Candy-Agents' GET /v1/prompts/claim — see api/v1/prompts.py.
 */
export interface MatchingAgent {
  id: string;
  name: string;
  use_case_slug: string;
  call_direction: string;
  agent_flow_status: string;
  created_at: string;
}

export interface ClaimedPrompt {
  prompt_id: string;
  title: string;
  content: string;
  action_spec: unknown;
  platform_meta: Record<string, unknown>;
  use_case_slug: string | null;
  matching_agents: MatchingAgent[];
}

export async function claimPromptTicket(ticket: string): Promise<ClaimedPrompt> {
  return api<ClaimedPrompt>(`/v1/prompts/claim?ticket=${encodeURIComponent(ticket)}`);
}
