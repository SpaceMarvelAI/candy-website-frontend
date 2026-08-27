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

// ── Normalisation ─────────────────────────────────────────────────────────────
// `webhooks.event_types` is a Postgres `jsonb` column and the backend registers
// no asyncpg codec for it, so it arrives here as a RAW JSON STRING
// (`'["session.ended"]'`) rather than an array. Normalise at the boundary so no
// consumer ever sees anything but a real string[].
function normalizeEventTypes(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeWebhook(w: Webhook): Webhook {
  return { ...w, event_types: normalizeEventTypes(w?.event_types) };
}

// ── API functions ─────────────────────────────────────────────────────────────
export async function listWebhooks(): Promise<Webhook[]> {
  const data = await api<Webhook[]>('/v1/webhooks');
  return Array.isArray(data) ? data.map(normalizeWebhook) : [];
}

export async function createWebhook(body: WebhookCreate): Promise<Webhook> {
  return normalizeWebhook(await api<Webhook>('/v1/webhooks', { method: 'POST', body }));
}

export async function updateWebhook(webhookId: string, body: WebhookUpdate): Promise<Webhook> {
  return normalizeWebhook(await api<Webhook>(`/v1/webhooks/${webhookId}`, { method: 'PATCH', body }));
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  return api<void>(`/v1/webhooks/${webhookId}`, { method: 'DELETE' });
}

export async function listWebhookDeliveries(webhookId: string): Promise<WebhookDelivery[]> {
  return api<WebhookDelivery[]>(`/v1/webhooks/${webhookId}/deliveries`);
}

/**
 * Enqueues a `ping` event for the endpoint. The backend responds
 * `{"queued": true, "event_type": "ping"}` — there is no `ok` field, and the
 * response says nothing about whether the endpoint was actually reached (the
 * dispatcher does not treat `ping` as a deliverable event, so subscribed
 * endpoints will not receive it). Callers must not report this as a delivery.
 */
export async function pingWebhook(
  webhookId: string,
): Promise<{ queued: boolean; event_type?: string; [key: string]: unknown }> {
  return api(`/v1/webhooks/${webhookId}/ping`, { method: 'POST' });
}
