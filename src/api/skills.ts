import { api } from './client';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Skill {
  slug:                  string;
  title:                 string;
  description:           string;
  category:              SkillCategory;
  channel:               'voice' | 'chat' | 'both';
  compatible_use_cases:  string[];
  is_premium:            boolean;
  is_active:             boolean;
  version:               number;
}

export type SkillCategory =
  | 'verification'
  | 'payment'
  | 'scheduling'
  | 'communication'
  | 'analytics'
  | 'escalation'
  | 'general';

export interface AgentSkill {
  id:          string;
  skill_slug:  string;
  config:      Record<string, unknown>;
  is_active:   boolean;
  attached_at: string;
}

// ── API calls ──────────────────────────────────────────────────────────────────

/** List all available platform skills. */
export async function listSkills(): Promise<Skill[]> {
  return api<Skill[]>('/v1/skills');
}

/** Get all skills currently attached to an agent. */
export async function getAgentSkills(agentId: string): Promise<AgentSkill[]> {
  return api<AgentSkill[]>(`/v1/agents/${agentId}/skills`);
}

/** Attach a skill to an agent (with optional per-agent config overrides). */
export async function attachSkill(
  agentId:   string,
  skillSlug: string,
  config?:   Record<string, unknown>,
): Promise<AgentSkill> {
  return api<AgentSkill>(`/v1/agents/${agentId}/skills/${skillSlug}`, {
    method: 'POST',
    body:   { config: config ?? {} },
  });
}

/** Detach (soft-delete) a skill from an agent. */
export async function detachSkill(agentId: string, skillSlug: string): Promise<void> {
  await api(`/v1/agents/${agentId}/skills/${skillSlug}`, { method: 'DELETE' });
}
