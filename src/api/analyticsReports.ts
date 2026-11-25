import { api } from './client';
import type { TrafficFilter } from './analytics';

/**
 * Phase 4 reporting endpoints (backend: api/v1/analytics_reports.py, services/analytics_metrics.py).
 *
 * Every report returns the same envelope:
 *   { window, traffic, definitions, metrics, previous, comparison, ...breakdowns }
 * `previous` / `comparison` are null unless `compare=true`. A metric that has no source data is null,
 * never 0; a percentage change is null when it is undefined (previous 0 or missing).
 */

// ── Shared filters ────────────────────────────────────────────────────────────
export type TrendBucket = 'day' | 'week';

export interface ReportFilters {
  days: number;
  traffic: TrafficFilter;
  /** Only sent when set. */
  agentId?: string | null;
  /** Only sent as `compare=true`; never sent when off. */
  compare: boolean;
  bucket: TrendBucket;
}

export type ReportEndpoint =
  | 'volume' | 'outcomes' | 'agent-performance' | 'tools' | 'escalations' | 'calls' | 'knowledge-effectiveness';

/**
 * Which optional filter each endpoint accepts. `days`, `traffic`, `agent_id` and `compare` are accepted by
 * all seven; `bucket` only by the ones that return a trend series. Unsupported filters are never sent.
 */
export const ENDPOINT_SUPPORTS_BUCKET: Record<ReportEndpoint, boolean> = {
  volume: true,
  outcomes: false,
  'agent-performance': false,
  tools: false,
  escalations: true,
  calls: false,
  'knowledge-effectiveness': true,
};

export function buildReportParams(f: ReportFilters, endpoint: ReportEndpoint): Record<string, string> {
  const p: Record<string, string> = { days: String(f.days), traffic: f.traffic };
  if (f.agentId) p.agent_id = f.agentId;
  if (f.compare) p.compare = 'true';
  if (ENDPOINT_SUPPORTS_BUCKET[endpoint]) p.bucket = f.bucket;
  return p;
}

// ── Envelope ──────────────────────────────────────────────────────────────────
export interface ReportWindow {
  days: number;
  start: string;
  end: string;
  timezone: string; // always "UTC"
  interval: string; // "[start, end)"
}

export interface ComparisonEntry {
  current: number | null;
  previous: number | null;
  /** Absolute change; null when either side is missing. */
  change: number | null;
  /** Percentage change; null when previous is 0/missing. */
  change_pct: number | null;
}
export type Comparison = Record<string, ComparisonEntry>;

export interface ReportEnvelope<M> {
  window: ReportWindow;
  traffic: TrafficFilter;
  definitions?: Record<string, string>;
  /** null when the report is unavailable (see `available`). */
  metrics: M | null;
  previous?: M | null;
  comparison?: Comparison | null;
  /** Set to false (with `reason`) by the event-based reports when migration 089 is not applied. */
  available?: boolean;
  reason?: string;
  note?: string;
}

// ── volume ────────────────────────────────────────────────────────────────────
export interface VolumeMetrics {
  sessions: number;
  new_conversations: number | null;
  continuation_sessions: number | null;
  distinct_conversations: number | null;
  continuation_share: number | null;
}
export interface VolumeReport extends ReportEnvelope<VolumeMetrics> {
  bucket?: TrendBucket;
  by_channel?: { channel: string; sessions: number }[];
  traffic_breakdown?: { production: number; demo: number; unclassified: number };
  series?: { date: string; sessions: number; new_conversations: number | null; continuation_sessions: number | null }[];
}

// ── outcomes ──────────────────────────────────────────────────────────────────
export interface OutcomeMetrics {
  sessions: number;
  active_sessions: number;
  terminal_sessions: number;
  completed: number;
  abandoned: number;
  timed_out: number;
  disconnected: number;
  completion_rate: number | null;
  abandonment_rate: number | null;
  timed_out_rate: number | null;
  disconnect_rate: number | null;
  avg_duration_seconds: number | null;
  median_duration_seconds: number | null;
  completed_avg_duration_seconds: number | null;
  duration_sample_size: number;
}
export type OutcomesReport = ReportEnvelope<OutcomeMetrics>;

// ── agent performance ─────────────────────────────────────────────────────────
export interface AgentPerformanceRow {
  agent_id: string;
  name: string | null;
  sessions: number;
  completed: number;
  abandoned: number;
  timed_out: number;
  disconnected: number;
  terminal_sessions: number;
  completion_rate: number | null;
  escalated_sessions: number | null;
  escalation_rate: number | null;
  chat_turns: number;
  voice_turns: number | null;
  /** Event-derived: null when the agent has no Phase 3 events in the window. */
  turns_failed: number | null;
  turn_failure_rate: number | null;
  response_time_avg_ms: number | null;
  response_time_median_ms: number | null;
  response_time_sample_size: number;
  tool_invocations: number | null;
  tool_success_rate: number | null;
}
export interface AgentPerformanceMetrics {
  agents: number;
  sessions: number;
  terminal_sessions: number;
  completion_rate: number | null;
}
export interface AgentPerformanceReport extends ReportEnvelope<AgentPerformanceMetrics> {
  agents?: AgentPerformanceRow[];
}

// ── tools ─────────────────────────────────────────────────────────────────────
export interface ToolMetrics {
  invocations: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
  latency_avg_ms: number | null;
  latency_p50_ms: number | null;
  latency_p95_ms: number | null;
  latency_sample_size: number;
}
export interface ToolsReport extends ReportEnvelope<ToolMetrics> {
  by_tool?: {
    tool: string; invocations: number; succeeded: number; failed: number; success_rate: number | null;
    latency_avg_ms: number | null; latency_sample_size: number;
  }[];
  by_agent?: {
    agent_id: string | null; agent_name: string | null; invocations: number; succeeded: number; failed: number;
    success_rate: number | null;
  }[];
  failure_categories?: { category: string; failed: number }[];
}

// ── escalations ───────────────────────────────────────────────────────────────
export interface EscalationMetrics {
  triggered: number;
  delivered: number;
  failed: number;
  delivery_success_rate: number | null;
}
export interface EscalationsReport extends ReportEnvelope<EscalationMetrics> {
  bucket?: TrendBucket;
  by_reason?: { reason: string; triggered: number }[];
  series?: { date: string; triggered: number; delivered: number; failed: number }[];
}

// ── calls ─────────────────────────────────────────────────────────────────────
export interface CallMetrics {
  initiated: number;
  completed: number;
  disconnected: number;
  failed: number;
  no_answer: number;
  open: number;
  terminal: number;
  completion_rate: number | null;
  avg_duration_ms: number | null;
  median_duration_ms: number | null;
  duration_sample_size: number;
}
export interface CallStage { sample_size: number; avg_ms: number | null; p50_ms: number | null; p95_ms?: number | null }
/** `metrics` is `{}` (not null) when the traffic filter excludes calls: calls are production-only. */
export interface CallsReport extends ReportEnvelope<CallMetrics | Record<string, never>> {
  by_channel?: {
    channel: string; initiated: number; completed: number; disconnected: number; failed: number; no_answer: number;
    completion_rate: number | null; avg_duration_ms: number | null;
  }[];
  latency?: { llm: CallStage; stt: CallStage; tts: CallStage; note?: string };
  events?: null | {
    counts: Record<string, number>;
    coverage: string;
    failure_categories: { category: string; failed: number }[];
  };
  unsupported?: string[];
}

// ── knowledge effectiveness ───────────────────────────────────────────────────
export interface KnowledgeMetrics {
  answered_questions: number;
  known_retrieval: number;
  unknown_retrieval: number;
  knowledge_gaps: number;
  covered: number;
  knowledge_gap_rate: number | null;
  retrieval_coverage: number | null;
}
interface KnowledgeBreakdownRow {
  answered_questions: number;
  known_retrieval: number;
  knowledge_gaps: number;
  knowledge_gap_rate: number | null;
}
export interface KnowledgeReport extends ReportEnvelope<KnowledgeMetrics> {
  bucket?: TrendBucket;
  by_agent?: (KnowledgeBreakdownRow & { agent_id: string | null; agent_name: string | null })[];
  by_channel?: (KnowledgeBreakdownRow & { channel: string })[];
  series?: (KnowledgeBreakdownRow & { date: string })[];
}

// ── Fetcher ───────────────────────────────────────────────────────────────────
export async function getReport<T>(endpoint: ReportEndpoint, params: Record<string, string>): Promise<T> {
  return api<T>(`/v1/analytics/${endpoint}?${new URLSearchParams(params)}`);
}
