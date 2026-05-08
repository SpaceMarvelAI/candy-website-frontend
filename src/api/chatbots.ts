/**
 * Chatbot API client — wraps /api/v1/agent/chat (LangGraph pipeline).
 *
 * The backend runs the full 9-node LangGraph pipeline (planner → retrieve →
 * evaluate → repair) and returns after the pipeline finishes — expect 2–8 s.
 * All 6 use cases share the same endpoint; `agent_type` selects the graph.
 */
import { api } from './client';

export type AgentType =
  | 'customer_support'
  | 'technical_support'
  | 'healthcare_coaching'
  | 'banking_support'
  | 'appointment_booking'
  | 'hr_operations';

export interface ChatRequest {
  user_id:              string;
  session_id:           string;
  company_id:           string;
  agent_id:             string;
  agent_type:           AgentType;
  user_message:         string;
  language_code?:       string;
  multilingual_enabled?: boolean;
}

export interface ChatResponse {
  status:                  string;
  request_id:              string;
  final_answer:            string;
  final_answer_localized:  string;
  active_language:         string;
  language_switched:       boolean;
  switch_ack:              string | null;
  intent:                  string | null;
  evaluation_decision:     string | null;
}

export async function sendChatMessage(req: ChatRequest): Promise<ChatResponse> {
  return api<ChatResponse>('/api/v1/agent/chat', {
    method: 'POST',
    body: {
      ...req,
      language_code:       req.language_code       ?? 'en',
      multilingual_enabled: req.multilingual_enabled ?? false,
    },
  });
}
