import { api } from './client';

// ── Summary ───────────────────────────────────────────────────────────────────
export interface AnalyticsSummary {
  // Core counts
  total_sessions?: number | null;
  total_messages?: number | null;
  total_agents?: number | null;
  completed?: number | null;
  abandoned?: number | null;
  escalated_proxy?: number | null;
  // Rates & scores
  success_rate?: number | null;
  escalation_rate?: number | null;
  avg_rating?: number | null;
  avg_turns?: number | null;
  // Latency
  avg_latency_ms?: number | null;
  latency_p50_ms?: number | null;
  latency_p95_ms?: number | null;
  latency_p99_ms?: number | null;
  // Misc
  window_days?: number | null;
  knowledge_gap_rate?: number | null;
  top_language?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  // Complex nested fields
  sessions_by_day?: unknown[] | null;
  top_failing_agents?: unknown[] | null;
  [key: string]: unknown;
}

export async function getAnalyticsSummary(params?: Record<string, string>): Promise<AnalyticsSummary> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsSummary>(`/v1/analytics/summary${qs}`);
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export interface AnalyticsSession {
  id: string;
  status: string | null;
  session_type: string | null;
  feedback_rating: number | null;
  feedback_notes: string | null;
  turn_count: number | null;
  started_at: string;
  ended_at: string | null;
  agent_name: string | null;
  use_case_id: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsSessions(params?: Record<string, string>): Promise<AnalyticsSession[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsSession[]>(`/v1/analytics/sessions${qs}`);
}

// ── Latency ───────────────────────────────────────────────────────────────────
export interface LatencyComponent {
  p50: number | null;
  p95: number | null;
}
export interface AnalyticsLatency {
  sample_size?: number | null;
  stt?: LatencyComponent | null;
  llm?: LatencyComponent | null;
  tts?: LatencyComponent | null;
  total?: LatencyComponent | null;
  targets?: Record<string, unknown> | null;
  note?: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsLatency(params?: Record<string, string>): Promise<AnalyticsLatency> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsLatency>(`/v1/analytics/latency${qs}`);
}

// ── Knowledge Gaps ────────────────────────────────────────────────────────────
export interface KnowledgeGap {
  utterance: string;
  occurrences: number;
  first_seen: string | null;
  last_seen: string | null;
  agent_name: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsKnowledgeGaps(params?: Record<string, string>): Promise<KnowledgeGap[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<KnowledgeGap[]>(`/v1/analytics/knowledge-gaps${qs}`);
}

// ── Languages ─────────────────────────────────────────────────────────────────
export interface LanguageStat {
  code: string;
  name: string | null;
  sessions: number;
  [key: string]: unknown;
}

export async function getAnalyticsLanguages(params?: Record<string, string>): Promise<LanguageStat[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<LanguageStat[]>(`/v1/analytics/languages${qs}`);
}

// ── Agents ────────────────────────────────────────────────────────────────────
export interface AgentStat {
  agent_id: string;
  name: string | null;
  use_case: string | null;
  call_direction: string | null;
  status: string | null;
  sessions: number;
  completed: number | null;
  abandoned: number | null;
  avg_rating: number | null;
  avg_turns: number | null;
  [key: string]: unknown;
}

export async function getAnalyticsAgents(params?: Record<string, string>): Promise<AgentStat[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AgentStat[]>(`/v1/analytics/agents${qs}`);
}

// ── Events ────────────────────────────────────────────────────────────────────
export interface AnalyticsEvent {
  id: string;
  event_type: string;
  agent_id: string | null;
  payload: unknown | null;
  occurred_at: string;
  [key: string]: unknown;
}

export async function getAnalyticsEvents(params?: Record<string, string>): Promise<AnalyticsEvent[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsEvent[]>(`/v1/analytics/events${qs}`);
}
