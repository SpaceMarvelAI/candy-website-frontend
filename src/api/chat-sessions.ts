import { api } from './client';

export interface ChatSessionRow {
  session_id:     string;
  agent_id:       string;
  agent_name:     string;
  use_case_slug:  string | null;
  use_case_label: string | null;
  status:         string;
  started_at:     string;
  ended_at:       string | null;
  message_count:  number;
  preview:        string | null;
}

export interface ChatTurn {
  role: 'user' | 'agent';
  text: string;
}

export interface ChatSessionDetail extends ChatSessionRow {
  turns: ChatTurn[];
}

export async function listChatSessions(params: { agent_id?: string; limit?: number } = {}): Promise<ChatSessionRow[]> {
  const q = new URLSearchParams();
  if (params.agent_id) q.set('agent_id', params.agent_id);
  if (params.limit)    q.set('limit', String(params.limit));
  const qs = q.toString();
  return api<ChatSessionRow[]>(`/v1/chat-sessions${qs ? `?${qs}` : ''}`);
}

export async function getChatSession(sessionId: string): Promise<ChatSessionDetail> {
  return api<ChatSessionDetail>(`/v1/chat-sessions/${sessionId}`);
}
