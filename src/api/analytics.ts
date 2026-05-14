import { api } from './client';

// ── Summary ───────────────────────────────────────────────────────────────────
export interface AnalyticsSummary {
  total_sessions: number;
  total_messages: number;
  total_agents: number;
  avg_latency_ms: number | null;
  knowledge_gap_rate: number | null;
  top_language: string | null;
  period_start: string | null;
  period_end: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsSummary(params?: Record<string, string>): Promise<AnalyticsSummary> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsSummary>(`/v1/analytics/summary${qs}`);
}

// ── Sessions ──────────────────────────────────────────────────────────────────
export interface AnalyticsSession {
  session_id: string;
  agent_id: string | null;
  agent_name: string | null;
  use_case_slug: string | null;
  language: string | null;
  message_count: number;
  duration_ms: number | null;
  started_at: string;
  ended_at: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsSessions(params?: Record<string, string>): Promise<AnalyticsSession[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsSession[]>(`/v1/analytics/sessions${qs}`);
}

// ── Latency ───────────────────────────────────────────────────────────────────
export interface AnalyticsLatency {
  avg_ms: number | null;
  p50_ms: number | null;
  p95_ms: number | null;
  p99_ms: number | null;
  min_ms: number | null;
  max_ms: number | null;
  sample_count: number;
  buckets: { label: string; count: number }[];
  [key: string]: unknown;
}

export async function getAnalyticsLatency(params?: Record<string, string>): Promise<AnalyticsLatency> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsLatency>(`/v1/analytics/latency${qs}`);
}

// ── Knowledge Gaps ────────────────────────────────────────────────────────────
export interface KnowledgeGap {
  gap_id: string;
  question: string;
  frequency: number;
  agent_id: string | null;
  agent_name: string | null;
  last_seen_at: string | null;
  [key: string]: unknown;
}

export async function getAnalyticsKnowledgeGaps(params?: Record<string, string>): Promise<KnowledgeGap[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<KnowledgeGap[]>(`/v1/analytics/knowledge-gaps${qs}`);
}

// ── Languages ─────────────────────────────────────────────────────────────────
export interface LanguageStat {
  language_code: string;
  language_name: string | null;
  session_count: number;
  percentage: number | null;
  [key: string]: unknown;
}

export async function getAnalyticsLanguages(params?: Record<string, string>): Promise<LanguageStat[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<LanguageStat[]>(`/v1/analytics/languages${qs}`);
}

// ── Agents ────────────────────────────────────────────────────────────────────
export interface AgentStat {
  agent_id: string;
  agent_name: string | null;
  use_case_slug: string | null;
  total_sessions: number;
  avg_latency_ms: number | null;
  avg_messages: number | null;
  knowledge_gap_rate: number | null;
  [key: string]: unknown;
}

export async function getAnalyticsAgents(params?: Record<string, string>): Promise<AgentStat[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AgentStat[]>(`/v1/analytics/agents${qs}`);
}

// ── Events ────────────────────────────────────────────────────────────────────
export interface AnalyticsEvent {
  event_id: string;
  event_type: string;
  agent_id: string | null;
  agent_name: string | null;
  session_id: string | null;
  detail: string | null;
  occurred_at: string;
  [key: string]: unknown;
}

export async function getAnalyticsEvents(params?: Record<string, string>): Promise<AnalyticsEvent[]> {
  const qs = params ? `?${new URLSearchParams(params)}` : '';
  return api<AnalyticsEvent[]>(`/v1/analytics/events${qs}`);
}
