import { api } from './client';

export interface Agent {
  id: string;
  company_id: string;
  name: string;
  use_case_slug: string;
  call_direction: string;
  agent_flow_status: string;
  active_prompt_version_id: string | null;
  multilingual: boolean;
  supported_language_ids: number[];
  created_at: string;
}

export async function listAgents(
  params: { use_case?: string; status?: string; modality?: 'voice' | 'chat' } = {},
): Promise<Agent[]> {
  const q = new URLSearchParams();
  if (params.use_case) q.set('use_case', params.use_case);
  if (params.status) q.set('status', params.status);
  if (params.modality) q.set('modality', params.modality);
  const qs = q.toString();
  return api<Agent[]>(`/v1/agents${qs ? `?${qs}` : ''}`);
}

export async function createAgent(body: {
  use_case_slug: string;
  name: string;
  language_code?: string;
  voice_id?: number;
  call_direction?: 'inbound' | 'outbound' | 'both' | 'chat';
}): Promise<Agent> {
  return api<Agent>('/v1/agents', {
    method: 'POST',
    body: { language_code: 'en', voice_id: 1, call_direction: 'outbound', ...body },
  });
}

export async function getAgent(id: string): Promise<Agent> {
  return api<Agent>(`/v1/agents/${id}`);
}

export async function publishAgent(id: string): Promise<{ status: string; agent_id: string }> {
  return api(`/v1/agents/${id}/publish`, { method: 'POST' });
}

/**
 * Permanently delete an agent. Cascades to its knowledge base, demo
 * sessions, recordings, embed installations, etc. The backend requires
 * admin/owner role.
 */
export async function deleteAgent(id: string): Promise<void> {
  await api(`/v1/agents/${id}`, { method: 'DELETE' });
}

/**
 * Find an existing agent for the given use-case slug, or null if none exists.
 * The caller is responsible for creating one explicitly — we don't auto-create
 * on page load any more so backend errors aren't swallowed.
 */
export async function findAgentForSlug(slug: string): Promise<Agent | null> {
  const list = await listAgents({ use_case: slug });
  return list[0] ?? null;
}
