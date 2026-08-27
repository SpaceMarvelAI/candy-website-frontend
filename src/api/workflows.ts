/**
 * api/workflows.ts — visual flow graph CRUD.
 *
 * A Workflow is a JSON graph (nodes + edges) that the Flow Engine
 * executes when a trigger fires. The graph is saved to the backend
 * and re-loaded when the user opens the Flows page.
 */
import { api } from './client';

// ── Graph primitives ──────────────────────────────────────────────────────────

export type NodeType = 'agent' | 'app' | 'webhook';

export interface FlowNodeData {
  // Agent node
  agentId?:   string;
  agentName?: string;
  agentType?: 'chat' | 'voice';
  // App node
  appType?:       string;
  appLabel?:      string;
  appIcon?:       string;
  connectionId?:  string;  // linked AppConnection id
  webhookUrl?:    string;  // for custom_webhook
  triggerType?:   'escalation' | 'demo_booking' | 'both';
  /** Stored and round-tripped, but the flow engine never reads it — every
   *  branch of `_execute_action` keys off `appType` alone
   *  (backend api/v1/workflows.py:294-335). Purely informational for now. */
  actionType?:    'create_ticket' | 'send_message' | 'post_webhook' | string;
  /** The ONLY free-form field the backend node model declares
   *  (`actionConfig: dict = {}` — api/v1/workflows.py:54). Being an untyped
   *  dict, arbitrary keys inside it survive `model_dump()` persistence, so it
   *  is the one place extra per-node state can live. See webhookIdentity(). */
  actionConfig?:  Record<string, any>;
  // NOTE: there is deliberately no `webhookId` / `webhookSecret` here. The
  // backend FlowNodeData (api/v1/workflows.py:41-54) declares neither, Pydantic
  // v2 drops unknown extras, and the graph is persisted via model_dump() — so
  // any top-level webhook field is destroyed on every save. Use the
  // webhookIdentity()/withWebhookIdentity() helpers below, which stash the
  // identifiers inside `actionConfig` where they actually persist.
}

// ── Webhook node identity (persisted inside actionConfig — see note above) ────

/** Keys used inside `actionConfig`; snake_case to match the other config keys. */
const WEBHOOK_ID_KEY     = 'webhook_id';
const WEBHOOK_SECRET_KEY = 'webhook_secret';

/** Read an inbound-webhook node's persisted id + HMAC secret. */
export function webhookIdentity(data: FlowNodeData): { webhookId?: string; webhookSecret?: string } {
  return {
    webhookId:     data.actionConfig?.[WEBHOOK_ID_KEY],
    webhookSecret: data.actionConfig?.[WEBHOOK_SECRET_KEY],
  };
}

/** Return a copy of `data` with the webhook id + secret stored where they survive a save. */
export function withWebhookIdentity(
  data: FlowNodeData, webhookId: string, webhookSecret: string,
): FlowNodeData {
  return {
    ...data,
    actionConfig: {
      ...data.actionConfig,
      [WEBHOOK_ID_KEY]:     webhookId,
      [WEBHOOK_SECRET_KEY]: webhookSecret,
    },
  };
}

// ── What the backend flow engine can actually execute ─────────────────────────
// Single source of truth for the honesty checks in the flow builder UI. When the
// backend gains a new handler, update the matching list here.

/** App types `_execute_action` has a real branch for
 *  (backend api/v1/workflows.py:294-335). Everything else falls through to
 *  `{"status": "skip", "message": "Action for <app> not yet implemented"}`
 *  (workflows.py:333-334) — the flow saves and fires but does nothing. */
export const EXECUTABLE_APP_TYPES: readonly string[] =
  ['jira', 'slack', 'linear', 'custom_webhook'];

export const isExecutableApp = (appType?: string): boolean =>
  !!appType && EXECUTABLE_APP_TYPES.includes(appType);

/** Edge trigger types the engine matches. Mirrors the filter at
 *  backend api/v1/workflows.py:232 — `edge.triggerType not in (trigger_type,
 *  "both")`, where `trigger_type` is only ever 'escalation' | 'demo_booking'.
 *  'webhook_to_agent' is storable but can never match, so such an edge is
 *  inert: no inbound webhook ever drives an agent today. */
export const EXECUTABLE_TRIGGER_TYPES: readonly string[] =
  ['escalation', 'demo_booking', 'both'];

export const isExecutableTrigger = (triggerType?: string): boolean =>
  !!triggerType && EXECUTABLE_TRIGGER_TYPES.includes(triggerType);

export interface FlowNode {
  id:   string;
  type: NodeType;
  x:    number;
  y:    number;
  data: FlowNodeData;
}

export interface FlowEdge {
  id:          string;
  source:      string;   // node id
  target:      string;   // node id
  triggerType: 'escalation' | 'demo_booking' | 'both' | 'webhook_to_agent';
  label?:      string;
}

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ── API shapes ────────────────────────────────────────────────────────────────

export interface Workflow {
  id:           string;
  company_id:   string;
  name:         string;
  description?: string;
  graph:        WorkflowGraph;
  is_active:    boolean;
  created_at:   string;
  updated_at:   string;
}

export interface CreateWorkflowBody {
  name:         string;
  description?: string;
  graph:        WorkflowGraph;
  is_active?:   boolean;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const listWorkflows = () =>
  api<Workflow[]>('/v1/workflows');

export const createWorkflow = (body: CreateWorkflowBody) =>
  api<Workflow>('/v1/workflows', {
    method: 'POST',
    body,
  });

export const getWorkflow = (id: string) =>
  api<Workflow>(`/v1/workflows/${id}`);

/**
 * PUT /v1/workflows/{id} is a FULL-model replace, not a patch: the handler
 * writes name, description, graph and is_active unconditionally
 * (backend api/v1/workflows.py:142-155) from a `CreateWorkflowBody` whose
 * Pydantic defaults are `description=None` and `is_active=True`
 * (workflows.py:76-80). So any field left out of the request is not "kept" —
 * it is overwritten with that default: omitting `description` nulls it, and
 * omitting `is_active` silently re-activates a deactivated workflow.
 *
 * Every field is therefore REQUIRED here. Callers must read the current
 * workflow (list/get response) and pass its values through explicitly.
 */
export interface UpdateWorkflowBody {
  name:        string;
  description: string | null;
  graph:       WorkflowGraph;
  is_active:   boolean;
}

export const updateWorkflow = (id: string, body: UpdateWorkflowBody) =>
  api<Workflow>(`/v1/workflows/${id}`, {
    method: 'PUT',
    body,
  });

export const deleteWorkflow = (id: string) =>
  api<void>(`/v1/workflows/${id}`, { method: 'DELETE' });

export const testWorkflow = (id: string) =>
  api<{ triggered: boolean; steps: Array<{ node_id: string; status: string; message?: string }> }>(
    `/v1/workflows/${id}/test`,
    { method: 'POST' }
  );
