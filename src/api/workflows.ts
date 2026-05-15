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
  actionType?:    'create_ticket' | 'send_message' | 'post_webhook' | string;
  actionConfig?:  Record<string, any>;
  // Webhook (inbound) node
  webhookId?:     string;  // unique ID for inbound webhook URL
  webhookSecret?: string;  // HMAC signing secret
}

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

export const updateWorkflow = (id: string, body: Partial<CreateWorkflowBody>) =>
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
