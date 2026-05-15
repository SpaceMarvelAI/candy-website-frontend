import { api } from './client';

// ── Webhook ───────────────────────────────────────────────────────────────────
export interface Webhook {
  webhook_id: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string | null;
  created_at: string;
  updated_at: string | null;
  [key: string]: unknown;
}

export interface WebhookCreate {
  url: string;
  events: string[];
  is_active?: boolean;
  secret?: string;
}

export interface WebhookUpdate {
  url?: string;
  events?: string[];
  is_active?: boolean;
  secret?: string;
}

// ── Delivery ──────────────────────────────────────────────────────────────────
export interface WebhookDelivery {
  delivery_id: string;
  webhook_id: string;
  event_type: string;
  status: 'success' | 'failed' | 'pending' | string;
  http_status: number | null;
  response_body: string | null;
  payload: string | null;
  created_at: string;
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
