/**
 * Regression tests for the workflow-save data-loss bugs.
 *
 * Two backend behaviours drive everything here, neither of which the frontend
 * can change:
 *
 *  1. PUT /v1/workflows/{id} is a FULL-model replace — the handler writes
 *     name, description, graph and is_active unconditionally
 *     (api/v1/workflows.py:142-155) from a body whose Pydantic defaults are
 *     description=None / is_active=True (workflows.py:76-80). Any field the
 *     client omits is therefore overwritten with that default, not preserved.
 *
 *  2. FlowNodeData (api/v1/workflows.py:41-54) declares no webhookId /
 *     webhookSecret. Pydantic v2 drops unknown extras and the graph is
 *     persisted with model_dump(), so any top-level webhook field on a node is
 *     destroyed on save. Only `actionConfig` (an untyped dict) round-trips
 *     arbitrary keys.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';

import {
  updateWorkflow, withWebhookIdentity, webhookIdentity,
  EXECUTABLE_APP_TYPES, isExecutableApp,
  EXECUTABLE_TRIGGER_TYPES, isExecutableTrigger,
  type FlowNodeData, type WorkflowGraph,
} from '../../../src/api/workflows';
import {
  saveConnection, connectionSaveErrorMessage, type AppConnection,
} from '../../../src/api/connections';

beforeEach(() => setToken('test-token'));

const B = API_BASE;
const graph: WorkflowGraph = { nodes: [], edges: [] };

/** Captures the parsed request body of the next matching call. */
function capture(method: 'put' | 'post' | 'patch', path: string, response: unknown) {
  const seen: { body?: any } = {};
  server.use(http[method](`${B}${path}`, async ({ request }) => {
    seen.body = await request.json();
    return HttpResponse.json(response as any);
  }));
  return seen;
}

// ── Bug 1: every save must carry the full model ───────────────────────────────
describe('updateWorkflow sends a complete body (PUT is a full replace)', () => {
  it('transmits description and is_active, so a canvas save cannot wipe them', async () => {
    const seen = capture('put', '/v1/workflows/f1', { id: 'f1', name: 'Flow' });

    await updateWorkflow('f1', {
      name:        'Flow',
      graph,
      description: 'Handles angry customers',
      is_active:   false,          // the workflow was deactivated by the user
    });

    // The bug was sending only { name, graph }: the backend then nulled
    // description and forced is_active back to true on every canvas save.
    expect(seen.body).toEqual({
      name:        'Flow',
      graph,
      description: 'Handles angry customers',
      is_active:   false,
    });
  });

  it('keeps is_active=false present in the payload rather than omitting it', async () => {
    const seen = capture('put', '/v1/workflows/f1', { id: 'f1' });
    await updateWorkflow('f1', { name: 'F', graph, description: null, is_active: false });

    // Omission is not neutral here — the backend default is `True`.
    expect(Object.keys(seen.body)).toContain('is_active');
    expect(seen.body.is_active).toBe(false);
  });

  it('sends description explicitly even when it is null', async () => {
    const seen = capture('put', '/v1/workflows/f1', { id: 'f1' });
    await updateWorkflow('f1', { name: 'F', graph, description: null, is_active: true });

    expect(Object.keys(seen.body)).toContain('description');
    expect(seen.body.description).toBeNull();
  });
});

// ── Bug 2: webhook identifiers must survive the backend node model ────────────

/**
 * Mimics `FlowNodeData(**data).model_dump()` — keeps exactly the fields the
 * backend model declares (api/v1/workflows.py:41-54) and drops everything else,
 * which is what Pydantic v2 does with unknown extras.
 */
const BACKEND_NODE_DATA_FIELDS = [
  'agentId', 'agentName', 'agentType',
  'appType', 'appLabel', 'appIcon', 'connectionId', 'webhookUrl',
  'triggerType', 'actionType', 'actionConfig',
] as const;

function roundTripThroughBackend(data: FlowNodeData): FlowNodeData {
  const out: Record<string, any> = {};
  for (const key of BACKEND_NODE_DATA_FIELDS) {
    if (key in data) out[key] = (data as any)[key];
  }
  return out as FlowNodeData;
}

describe('webhook node identity survives a save round-trip', () => {
  it('stores the id and secret inside actionConfig, the one persisted free-form field', () => {
    const data = withWebhookIdentity(
      { appType: 'inbound_webhook', appLabel: 'Stripe' }, 'wh_abc', 'whsec_xyz',
    );

    expect(data.actionConfig).toMatchObject({ webhook_id: 'wh_abc', webhook_secret: 'whsec_xyz' });
    // Never at the top level — that is exactly what the backend model discards.
    expect(data).not.toHaveProperty('webhookId');
    expect(data).not.toHaveProperty('webhookSecret');
  });

  it('reads both back after the backend has dropped every undeclared field', () => {
    const saved = withWebhookIdentity({ appType: 'inbound_webhook' }, 'wh_abc', 'whsec_xyz');
    const reloaded = roundTripThroughBackend(saved);

    expect(webhookIdentity(reloaded)).toEqual({ webhookId: 'wh_abc', webhookSecret: 'whsec_xyz' });
  });

  it('proves the old top-level fields would NOT have survived', () => {
    const legacy = {
      appType: 'inbound_webhook',
      webhookId: 'wh_abc',
      webhookSecret: 'whsec_xyz',
    } as any;

    const reloaded = roundTripThroughBackend(legacy);
    expect(reloaded).not.toHaveProperty('webhookId');
    expect(reloaded).not.toHaveProperty('webhookSecret');
    expect(webhookIdentity(reloaded)).toEqual({ webhookId: undefined, webhookSecret: undefined });
  });

  it('preserves other actionConfig keys when writing the identity', () => {
    const data = withWebhookIdentity(
      { actionConfig: { event_filter: 'payment.completed' } }, 'wh_1', 'whsec_1',
    );
    expect(data.actionConfig).toEqual({
      event_filter:   'payment.completed',
      webhook_id:     'wh_1',
      webhook_secret: 'whsec_1',
    });
  });

  it('reports no identity for a node that never had one', () => {
    expect(webhookIdentity({})).toEqual({ webhookId: undefined, webhookSecret: undefined });
  });
});

// ── Bug 4: the UI's "supported" lists must mirror the engine ──────────────────
describe('executable app / trigger allowlists mirror the backend engine', () => {
  it('lists exactly the app types _execute_action handles', () => {
    // api/v1/workflows.py:294-335 — jira, slack, linear, custom_webhook.
    expect([...EXECUTABLE_APP_TYPES].sort())
      .toEqual(['custom_webhook', 'jira', 'linear', 'slack']);
  });

  it('flags catalogue apps the engine has no branch for', () => {
    expect(isExecutableApp('slack')).toBe(true);
    for (const skipped of ['asana', 'notion', 'github', 'zoho_desk', 'zoho_crm',
                           'calendly', 'gmail', 'google_sheets']) {
      expect(isExecutableApp(skipped)).toBe(false);
    }
    expect(isExecutableApp(undefined)).toBe(false);
  });

  it('treats webhook_to_agent edges as never firing', () => {
    // api/v1/workflows.py:232 only matches the firing trigger or "both".
    expect([...EXECUTABLE_TRIGGER_TYPES].sort()).toEqual(['both', 'demo_booking', 'escalation']);
    expect(isExecutableTrigger('escalation')).toBe(true);
    expect(isExecutableTrigger('webhook_to_agent')).toBe(false);
  });
});

// ── Bug 5: duplicate connection must not be attempted ────────────────────────
describe('saveConnection avoids the duplicate-insert 500', () => {
  const existing = { id: 'cn1', app_type: 'linear' } as AppConnection;

  it('PATCHes the existing connection instead of POSTing a duplicate', async () => {
    let posted = false;
    server.use(http.post(`${B}/v1/connections`, () => { posted = true; return HttpResponse.json({}); }));
    const seen = capture('patch', '/v1/connections/cn1', { id: 'cn1', app_type: 'linear' });

    const conn = await saveConnection(
      { app_type: 'linear', auth_scheme: 'api_key', credential: 'k' }, existing,
    );

    expect(conn.id).toBe('cn1');
    expect(seen.body).toMatchObject({ app_type: 'linear', credential: 'k' });
    expect(posted).toBe(false);   // UNIQUE (company_id, app_type) never touched
  });

  it('POSTs when there is genuinely no connection yet', async () => {
    const seen = capture('post', '/v1/connections', { id: 'cn2', app_type: 'notion' });
    const conn = await saveConnection({ app_type: 'notion', auth_scheme: 'oauth2' });

    expect(conn.id).toBe('cn2');
    expect(seen.body).toMatchObject({ app_type: 'notion' });
  });

  it('explains a raced duplicate rather than surfacing the raw 500', async () => {
    server.use(http.post(`${B}/v1/connections`, () =>
      HttpResponse.json({ detail: 'Internal Server Error' }, { status: 500 })));

    const err = await saveConnection({ app_type: 'notion', auth_scheme: 'oauth2' })
      .then(() => null, (e) => e);

    expect(err?.status).toBe(500);
    const msg = connectionSaveErrorMessage(err, 'Notion', false);
    expect(msg).toMatch(/already connected/i);
    // The backend does not return 409 — the message must not claim a conflict code.
    expect(msg).not.toMatch(/409/);
  });

  it('does not blame a duplicate when updating an existing connection', () => {
    const msg = connectionSaveErrorMessage({ status: 500, message: 'boom' }, 'Notion', true);
    expect(msg).not.toMatch(/already connected/i);
    expect(msg).toMatch(/boom/);
  });
});
