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
  CONDITION_OPERATORS,
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
    expect([...EXECUTABLE_TRIGGER_TYPES].sort()).toEqual(['both', 'demo_booking', 'escalation', 'incoming_call']);
    expect(isExecutableTrigger('escalation')).toBe(true);
    expect(isExecutableTrigger('webhook_to_agent')).toBe(false);
  });
});

// ── Phase 2: condition node / branch edge fields survive save ────────────────
// Additive backend fields (api/v1/workflows.py FlowNodeData.conditionLeft/
// conditionOperator/conditionRight, FlowEdge.branch) — unlike the webhook id/
// secret bug above, these ARE declared on the backend model (not stuffed into
// actionConfig), so a plain model_dump() keeps them. These tests pin that the
// frontend layer sends them and that they'd survive the backend round-trip.

const BACKEND_NODE_DATA_FIELDS_PHASE_2 = [
  ...BACKEND_NODE_DATA_FIELDS,
  'conditionLeft', 'conditionOperator', 'conditionRight',
] as const;

function roundTripThroughBackendPhase2(data: FlowNodeData): FlowNodeData {
  const out: Record<string, any> = {};
  for (const key of BACKEND_NODE_DATA_FIELDS_PHASE_2) {
    if (key in data) out[key] = (data as any)[key];
  }
  return out as FlowNodeData;
}

describe('condition node data survives a save round-trip', () => {
  it('a fully configured condition node keeps all three fields', () => {
    const data: FlowNodeData = {
      conditionLeft: 'contact.type', conditionOperator: 'equals', conditionRight: 'patient',
    };
    const reloaded = roundTripThroughBackendPhase2(data);
    expect(reloaded).toEqual(data);
  });

  it('an exists/not_exists condition has no meaningful right-hand value but still round-trips', () => {
    const data: FlowNodeData = { conditionLeft: 'tool_results.n1', conditionOperator: 'exists' };
    const reloaded = roundTripThroughBackendPhase2(data);
    expect(reloaded).toEqual(data);
    expect(reloaded).not.toHaveProperty('conditionRight');
  });

  it('an unconfigured condition node (no fields set) round-trips to nothing extra', () => {
    const reloaded = roundTripThroughBackendPhase2({});
    expect(reloaded).toEqual({});
  });

  it('condition fields sent in an updateWorkflow payload are transmitted, not stripped', async () => {
    const conditionGraph: WorkflowGraph = {
      nodes: [
        { id: 'a', type: 'agent', x: 0, y: 0, data: { agentId: 'ag1', agentName: 'Agent' } },
        {
          id: 'cond', type: 'condition', x: 100, y: 0,
          data: { conditionLeft: 'contact.type', conditionOperator: 'equals', conditionRight: 'patient' },
        },
        { id: 't', type: 'app', x: 200, y: 0, data: { appType: 'jira', appLabel: 'Jira' } },
        { id: 'f', type: 'app', x: 200, y: 100, data: { appType: 'slack', appLabel: 'Slack' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'cond', triggerType: 'escalation' },
        { id: 'e2', source: 'cond', target: 't', triggerType: 'escalation', branch: true },
        { id: 'e3', source: 'cond', target: 'f', triggerType: 'escalation', branch: false },
      ],
    };
    const seen = capture('put', '/v1/workflows/wf1', { id: 'wf1' });
    await updateWorkflow('wf1', {
      name: 'Branching flow', graph: conditionGraph, description: null, is_active: true,
    });

    expect(seen.body.graph.nodes[1].data).toMatchObject({
      conditionLeft: 'contact.type', conditionOperator: 'equals', conditionRight: 'patient',
    });
    expect(seen.body.graph.edges[1]).toMatchObject({ branch: true });
    expect(seen.body.graph.edges[2]).toMatchObject({ branch: false });
    // The trigger edge into the condition node carries no branch at all.
    expect(seen.body.graph.edges[0]).not.toHaveProperty('branch');
  });

  it('adding a condition node to an existing graph does not alter the other nodes', async () => {
    const existingAgent = { id: 'a', type: 'agent' as const, x: 0, y: 0, data: { agentId: 'ag1', agentName: 'Agent' } };
    const existingApp = { id: 'j', type: 'app' as const, x: 200, y: 0, data: { appType: 'jira', appLabel: 'Jira', connectionId: 'conn-1' } };
    const graphWithNewCondition: WorkflowGraph = {
      nodes: [
        existingAgent,
        existingApp,
        { id: 'cond', type: 'condition', x: 100, y: 0, data: { conditionLeft: 'x', conditionOperator: 'exists' } },
      ],
      edges: [
        { id: 'e1', source: 'a', target: 'j', triggerType: 'escalation' },
      ],
    };
    const seen = capture('put', '/v1/workflows/wf2', { id: 'wf2' });
    await updateWorkflow('wf2', {
      name: 'Existing plus condition', graph: graphWithNewCondition, description: null, is_active: true,
    });

    expect(seen.body.graph.nodes[0]).toEqual(existingAgent);
    expect(seen.body.graph.nodes[1]).toEqual(existingApp);
    expect(seen.body.graph.edges[0]).toEqual({ id: 'e1', source: 'a', target: 'j', triggerType: 'escalation' });
  });

  it('CONDITION_OPERATORS matches the backend allowlist exactly', () => {
    // services/workflow_context.py CONDITION_OPERATORS — kept in sync by hand;
    // this test is the tripwire if one side changes without the other.
    expect([...CONDITION_OPERATORS].sort()).toEqual(
      ['contains', 'equals', 'exists', 'greater_than', 'less_than', 'not_equals', 'not_exists'].sort(),
    );
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
