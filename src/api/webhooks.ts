import { api } from './client';

// ── Webhook ───────────────────────────────────────────────────────────────────
export interface Webhook {
  id: string;
  url: string;
  event_types: string[];
  description: string | null;
  is_active: boolean;
  total_delivered: number | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  [key: string]: unknown;
}

export interface WebhookCreate {
  url: string;
  event_types: string[];
  description?: string;
}

export interface WebhookUpdate {
  url?: string;
  event_types?: string[];
  is_active?: boolean;
  description?: string;
}

// ── Delivery ──────────────────────────────────────────────────────────────────
export interface WebhookDelivery {
  id: string;
  event_type: string;
  http_status: number | null;
  status: 'success' | 'failed' | 'pending' | string;
  duration_ms: number | null;
  attempt: number | null;
  delivered_at: string | null;
  created_at: string;
  response_body: string | null;
  [key: string]: unknown;
}

// ── API functions ─────────────────────────────────────────────────────────────
export async function listWebhooks(): Promise<Webhook[]> {
  return api<Webhook[]>('/v1/webhooks');
}

export async function createWebhook(body: WebhookCreate): Promise<Webhook> {
  return api<Webhook>('/v1/webhooks', { method: 'POST', body });
}

export async function updateWebhook(webhookId: string, body: WebhookUpdate): Promise<Webhook> {
  return api<Webhook>(`/v1/webhooks/${webhookId}`, { method: 'PATCH', body });
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  return api<void>(`/v1/webhooks/${webhookId}`, { method: 'DELETE' });
}

export async function listWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  return api<WebhookDelivery[]>(`/v1/webhooks/${webhookId}/deliveries`);
}

export async function pingWebhook(webhookId: string): Promise<{ ok: boolean; [key: string]: unknown }> {
  return api(`/v1/webhooks/${webhookId}/ping`, { method: 'POST' });
}
