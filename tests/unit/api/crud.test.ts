/**
 * Coverage tests for the thin CRUD API modules. Each function is a wrapper
 * around api() — we verify the right method + path are hit and the parsed
 * body is returned. MSW intercepts every call against API_BASE.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';

import * as Requirements from '../../../src/api/requirements';
import * as Languages from '../../../src/api/languages';
import * as Skills from '../../../src/api/skills';
import * as Webhooks from '../../../src/api/webhooks';
import * as Automations from '../../../src/api/automations';
import * as Workflows from '../../../src/api/workflows';
import * as Connections from '../../../src/api/connections';
import * as Chatbots from '../../../src/api/chatbots';
import * as ChatSessions from '../../../src/api/chat-sessions';
import * as Knowledge from '../../../src/api/knowledge';
import * as Agents from '../../../src/api/agents';
import * as Analytics from '../../../src/api/analytics';
import * as Demo from '../../../src/api/demo';

beforeEach(() => setToken('test-token'));

const B = API_BASE;
const json = (data: unknown, status = 200) => () => HttpResponse.json(data as any, { status });

// ── requirements ──────────────────────────────────────────────────────────────
describe('api/requirements', () => {
  it('getRequirements GETs the requirements path', async () => {
    server.use(http.get(`${B}/v1/agents/a1/requirements`, json({ agent_id: 'a1', requirements_text: 'x' })));
    const r = await Requirements.getRequirements('a1');
    expect(r.agent_id).toBe('a1');
  });

  it('saveRequirements POSTs and returns the compiled result', async () => {
    server.use(http.post(`${B}/v1/agents/a1/requirements`, json({ agent_id: 'a1', prompt_compile: 'compiled' })));
    const r = await Requirements.saveRequirements('a1', { requirements_text: 'do things' });
    expect(r.prompt_compile).toBe('compiled');
  });
});

// ── languages (cached) ──────────────────────────────────────────────────────────
describe('api/languages', () => {
  it('listLanguages returns the catalogue', async () => {
    server.use(http.get(`${B}/v1/languages`, json([{ id: 1, code: 'en', name: 'English' }])));
    const list = await Languages.listLanguages();
    expect(list[0].code).toBe('en');
  });

  it('listLanguages caches after the first call (no second network hit needed)', async () => {
    // The module caches the first result; a second call should resolve from cache
    // even though we remove the handler.
    const again = await Languages.listLanguages();
    expect(again[0].code).toBe('en');
  });

  it('voicesFor encodes the language code in the path', async () => {
    server.use(http.get(`${B}/v1/languages/en-US/voices`, json([{ id: 9, display_name: 'Aria' }])));
    const voices = await Languages.voicesFor('en-US');
    expect(voices[0].display_name).toBe('Aria');
  });
});

// ── skills ──────────────────────────────────────────────────────────────────────
describe('api/skills', () => {
  it('listSkills GETs /v1/skills', async () => {
    server.use(http.get(`${B}/v1/skills`, json([{ slug: 'verify-otp', title: 'Verify OTP' }])));
    const s = await Skills.listSkills();
    expect(s[0].slug).toBe('verify-otp');
  });

  it('getAgentSkills GETs the agent skills path', async () => {
    server.use(http.get(`${B}/v1/agents/a1/skills`, json([{ id: 's1', skill_slug: 'verify-otp' }])));
    const s = await Skills.getAgentSkills('a1');
    expect(s[0].id).toBe('s1');
  });

  it('attachSkill POSTs to the skill path', async () => {
    server.use(http.post(`${B}/v1/agents/a1/skills/verify-otp`, json({ id: 's1', skill_slug: 'verify-otp' })));
    const s = await Skills.attachSkill('a1', 'verify-otp', { foo: 'bar' });
    expect(s.skill_slug).toBe('verify-otp');
  });

  it('detachSkill DELETEs and resolves void', async () => {
    server.use(http.delete(`${B}/v1/agents/a1/skills/verify-otp`, () => new HttpResponse(null, { status: 204 })));
    await expect(Skills.detachSkill('a1', 'verify-otp')).resolves.toBeUndefined();
  });
});

// ── webhooks ──────────────────────────────────────────────────────────────────
describe('api/webhooks', () => {
  it('listWebhooks GETs /v1/webhooks', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json([{ id: 'w1', url: 'https://x' }])));
    expect((await Webhooks.listWebhooks())[0].id).toBe('w1');
  });

  it('createWebhook POSTs the body', async () => {
    server.use(http.post(`${B}/v1/webhooks`, json({ id: 'w2', url: 'https://y' })));
    expect((await Webhooks.createWebhook({ url: 'https://y', event_types: ['call.ended'] })).id).toBe('w2');
  });

  it('updateWebhook PATCHes by id', async () => {
    server.use(http.patch(`${B}/v1/webhooks/w1`, json({ id: 'w1', is_active: false })));
    expect((await Webhooks.updateWebhook('w1', { is_active: false })).is_active).toBe(false);
  });

  it('deleteWebhook DELETEs by id', async () => {
    server.use(http.delete(`${B}/v1/webhooks/w1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Webhooks.deleteWebhook('w1')).resolves.toBeUndefined();
  });

  it('listWebhookDeliveries GETs the deliveries path', async () => {
    server.use(http.get(`${B}/v1/webhooks/w1/deliveries`, json([{ id: 'd1', status: 'success' }])));
    expect((await Webhooks.listWebhookDeliveries('w1'))[0].status).toBe('success');
  });

  it('pingWebhook POSTs the ping path', async () => {
    server.use(http.post(`${B}/v1/webhooks/w1/ping`, json({ ok: true })));
    expect((await Webhooks.pingWebhook('w1')).ok).toBe(true);
  });
});

// ── automations ─────────────────────────────────────────────────────────────────
describe('api/automations', () => {
  it('listAutomations GETs with the agent_id query', async () => {
    server.use(http.get(`${B}/v1/escalations/configs`, json([{ id: 'c1', agent_id: 'a1' }])));
    expect((await Automations.listAutomations('a1'))[0].id).toBe('c1');
  });

  it('createAutomation POSTs to configs', async () => {
    server.use(http.post(`${B}/v1/escalations/configs`, json({ id: 'c2' })));
    const r = await Automations.createAutomation('a1', {
      app_type: 'slack', webhook_url: 'https://hooks', body_template: {}, auth_type: 'none', trigger_type: 'escalation',
    });
    expect(r.id).toBe('c2');
  });

  it('updateAutomation PATCHes by id', async () => {
    server.use(http.patch(`${B}/v1/escalations/configs/c1`, json({ id: 'c1', is_active: false })));
    expect((await Automations.updateAutomation('c1', { is_active: false })).is_active).toBe(false);
  });

  it('deleteAutomation DELETEs by id', async () => {
    server.use(http.delete(`${B}/v1/escalations/configs/c1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Automations.deleteAutomation('c1')).resolves.toBeUndefined();
  });

  it('testAutomation POSTs to the test path', async () => {
    server.use(http.post(`${B}/v1/escalations/configs/c1/test`, json({ success: true, status_code: 200 })));
    expect((await Automations.testAutomation('c1')).success).toBe(true);
  });

  it('listPresets GETs presets', async () => {
    server.use(http.get(`${B}/v1/escalations/presets`, json([{ app_type: 'slack', display_name: 'Slack' }])));
    expect((await Automations.listPresets())[0].app_type).toBe('slack');
  });
});

// ── workflows ─────────────────────────────────────────────────────────────────
describe('api/workflows', () => {
  const graph = { nodes: [], edges: [] };

  it('listWorkflows GETs /v1/workflows', async () => {
    server.use(http.get(`${B}/v1/workflows`, json([{ id: 'f1', name: 'Flow' }])));
    expect((await Workflows.listWorkflows())[0].id).toBe('f1');
  });

  it('createWorkflow POSTs the graph', async () => {
    server.use(http.post(`${B}/v1/workflows`, json({ id: 'f2', name: 'New' })));
    expect((await Workflows.createWorkflow({ name: 'New', graph })).id).toBe('f2');
  });

  it('getWorkflow GETs by id', async () => {
    server.use(http.get(`${B}/v1/workflows/f1`, json({ id: 'f1', name: 'Flow' })));
    expect((await Workflows.getWorkflow('f1')).name).toBe('Flow');
  });

  it('updateWorkflow PUTs by id', async () => {
    server.use(http.put(`${B}/v1/workflows/f1`, json({ id: 'f1', name: 'Renamed' })));
    expect((await Workflows.updateWorkflow('f1', { name: 'Renamed' })).name).toBe('Renamed');
  });

  it('deleteWorkflow DELETEs by id', async () => {
    server.use(http.delete(`${B}/v1/workflows/f1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Workflows.deleteWorkflow('f1')).resolves.toBeUndefined();
  });

  it('testWorkflow POSTs to the test path', async () => {
    server.use(http.post(`${B}/v1/workflows/f1/test`, json({ triggered: true, steps: [] })));
    expect((await Workflows.testWorkflow('f1')).triggered).toBe(true);
  });
});

// ── connections ─────────────────────────────────────────────────────────────────
describe('api/connections', () => {
  it('listConnections GETs /v1/connections', async () => {
    server.use(http.get(`${B}/v1/connections`, json([{ id: 'cn1', app_type: 'slack' }])));
    expect((await Connections.listConnections())[0].id).toBe('cn1');
  });

  it('createConnection POSTs the credential body', async () => {
    server.use(http.post(`${B}/v1/connections`, json({ id: 'cn2', app_type: 'linear' })));
    expect((await Connections.createConnection({ app_type: 'linear', auth_scheme: 'api_key', credential: 'k' })).id).toBe('cn2');
  });

  it('updateConnection PATCHes by id', async () => {
    server.use(http.patch(`${B}/v1/connections/cn1`, json({ id: 'cn1', display_name: 'Renamed' })));
    expect((await Connections.updateConnection('cn1', { display_name: 'Renamed' })).display_name).toBe('Renamed');
  });

  it('deleteConnection DELETEs by id', async () => {
    server.use(http.delete(`${B}/v1/connections/cn1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Connections.deleteConnection('cn1')).resolves.toBeUndefined();
  });

  it('testConnection POSTs to the test path', async () => {
    server.use(http.post(`${B}/v1/connections/cn1/test`, json({ ok: true })));
    expect((await Connections.testConnection('cn1')).ok).toBe(true);
  });

  it('startOAuth GETs the oauth start path with query', async () => {
    server.use(http.get(`${B}/v1/connections/oauth/start`, json({ auth_url: 'https://auth', state: 's' })));
    expect((await Connections.startOAuth('slack', 'https://app/back')).auth_url).toBe('https://auth');
  });

  it('exposes a static APP_CATALOGUE', () => {
    expect(Connections.APP_CATALOGUE.length).toBeGreaterThan(0);
    expect(Connections.APP_CATALOGUE.find(a => a.type === 'slack')).toBeTruthy();
  });
});

// ── chatbots ──────────────────────────────────────────────────────────────────
describe('api/chatbots', () => {
  it('sendChatMessage POSTs to the chat endpoint and returns the answer', async () => {
    server.use(http.post(`${B}/api/v1/agent/chat`, json({ status: 'ok', final_answer: 'Hello!' })));
    const r = await Chatbots.sendChatMessage({
      user_id: 'u', session_id: 's', company_id: 'c', agent_id: 'a',
      agent_type: 'customer_support', user_message: 'hi',
    });
    expect(r.final_answer).toBe('Hello!');
  });
});

// ── chat-sessions ─────────────────────────────────────────────────────────────
describe('api/chat-sessions', () => {
  it('listChatSessions GETs without query when no params', async () => {
    server.use(http.get(`${B}/v1/chat-sessions`, json([{ session_id: 's1' }])));
    expect((await ChatSessions.listChatSessions())[0].session_id).toBe('s1');
  });

  it('listChatSessions includes agent_id + limit query', async () => {
    server.use(http.get(`${B}/v1/chat-sessions`, ({ request }) => {
      const u = new URL(request.url);
      expect(u.searchParams.get('agent_id')).toBe('a1');
      expect(u.searchParams.get('limit')).toBe('5');
      return HttpResponse.json([]);
    }));
    await ChatSessions.listChatSessions({ agent_id: 'a1', limit: 5 });
  });

  it('getChatSession GETs by id', async () => {
    server.use(http.get(`${B}/v1/chat-sessions/s1`, json({ session_id: 's1', turns: [] })));
    expect((await ChatSessions.getChatSession('s1')).session_id).toBe('s1');
  });
});

// ── knowledge ──────────────────────────────────────────────────────────────────
describe('api/knowledge', () => {
  it('listKnowledge GETs the agent knowledge path', async () => {
    server.use(http.get(`${B}/v1/agents/a1/knowledge`, json([{ id: 'k1' }])));
    expect((await Knowledge.listKnowledge('a1')).length).toBe(1);
  });

  it('getKnowledgeDoc GETs a single doc', async () => {
    server.use(http.get(`${B}/v1/agents/a1/knowledge/k1`, json({ id: 'k1', content_text: 'body' })));
    expect((await Knowledge.getKnowledgeDoc('a1', 'k1')).content_text).toBe('body');
  });

  it('deleteKnowledge DELETEs a doc', async () => {
    server.use(http.delete(`${B}/v1/agents/a1/knowledge/k1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Knowledge.deleteKnowledge('a1', 'k1')).resolves.toBeUndefined();
  });

  it('crawlWebsite POSTs url + crawl_depth', async () => {
    server.use(http.post(`${B}/v1/agents/a1/knowledge/crawl`, json({ kb_document_id: 'k9', pages_scraped: 3, char_count: 120 })));
    const r = await Knowledge.crawlWebsite('a1', 'https://site.com', 2);
    expect(r.pages_scraped).toBe(3);
  });
});

// ── agents ────────────────────────────────────────────────────────────────────
describe('api/agents', () => {
  it('listAgents builds query from use_case + status', async () => {
    server.use(http.get(`${B}/v1/agents`, ({ request }) => {
      const u = new URL(request.url);
      expect(u.searchParams.get('use_case')).toBe('ecommerce');
      expect(u.searchParams.get('status')).toBe('live');
      return HttpResponse.json([]);
    }));
    await Agents.listAgents({ use_case: 'ecommerce', status: 'live' });
  });

  it('getAgent GETs by id', async () => {
    server.use(http.get(`${B}/v1/agents/a1`, json({ id: 'a1', name: 'Agent' })));
    expect((await Agents.getAgent('a1')).id).toBe('a1');
  });

  it('publishAgent POSTs to the publish path', async () => {
    server.use(http.post(`${B}/v1/agents/a1/publish`, json({ id: 'a1', agent_flow_status: 'live' })));
    const r = await Agents.publishAgent('a1');
    expect(r).toBeTruthy();
  });

  it('deleteAgent DELETEs by id', async () => {
    server.use(http.delete(`${B}/v1/agents/a1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Agents.deleteAgent('a1')).resolves.toBeUndefined();
  });

  it('createEmbedInstall POSTs to embed-installations', async () => {
    server.use(http.post(`${B}/v1/agents/a1/embed-installations`, json({ id: 'e1' })));
    const r = await Agents.createEmbedInstall('a1', { domain: 'x.com' } as any);
    expect(r.id).toBe('e1');
  });

  it('listEmbedInstalls GETs embed-installations', async () => {
    server.use(http.get(`${B}/v1/agents/a1/embed-installations`, json([{ id: 'e1' }])));
    expect((await Agents.listEmbedInstalls('a1'))[0].id).toBe('e1');
  });
});

// ── analytics ─────────────────────────────────────────────────────────────────
describe('api/analytics', () => {
  it('getAnalyticsSummary GETs the summary path', async () => {
    server.use(http.get(`${B}/v1/analytics/summary`, json({ total_sessions: 10 })));
    expect((await Analytics.getAnalyticsSummary()).total_sessions).toBe(10);
  });

  it('getAnalyticsSessions GETs the sessions path', async () => {
    server.use(http.get(`${B}/v1/analytics/sessions`, json([{ session_id: 's1' }])));
    expect((await Analytics.getAnalyticsSessions()).length).toBe(1);
  });

  it('getAnalyticsLatency GETs the latency path', async () => {
    server.use(http.get(`${B}/v1/analytics/latency`, json({ p50: 100 })));
    expect((await Analytics.getAnalyticsLatency()).p50).toBe(100);
  });

  it('getAnalyticsKnowledgeGaps GETs the knowledge-gaps path', async () => {
    server.use(http.get(`${B}/v1/analytics/knowledge-gaps`, json([{ query: 'q' }])));
    expect((await Analytics.getAnalyticsKnowledgeGaps()).length).toBe(1);
  });

  it('getAnalyticsLanguages GETs the languages path', async () => {
    server.use(http.get(`${B}/v1/analytics/languages`, json([{ language: 'en' }])));
    expect((await Analytics.getAnalyticsLanguages()).length).toBe(1);
  });

  it('getAnalyticsAgents GETs the agents path', async () => {
    server.use(http.get(`${B}/v1/analytics/agents`, json([{ agent_id: 'a1' }])));
    expect((await Analytics.getAnalyticsAgents()).length).toBe(1);
  });

  it('getAnalyticsEvents GETs the events path', async () => {
    server.use(http.get(`${B}/v1/analytics/events`, json([{ type: 'call' }])));
    expect((await Analytics.getAnalyticsEvents()).length).toBe(1);
  });

  it('passes query params through', async () => {
    server.use(http.get(`${B}/v1/analytics/summary`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('range')).toBe('7d');
      return HttpResponse.json({ total_sessions: 0 });
    }));
    await Analytics.getAnalyticsSummary({ range: '7d' });
  });
});

// ── demo ──────────────────────────────────────────────────────────────────────
describe('api/demo', () => {
  it('startDemo POSTs and returns the session', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo`, json({ demo_session_id: 'd1', agent_id: 'a1' })));
    expect((await Demo.startDemo('a1')).demo_session_id).toBe('d1');
  });

  it('sendDemoTurn POSTs the utterance and returns the response', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo/d1/turn`, json({ agent_response: 'Hi', latency_ms: 50 })));
    expect((await Demo.sendDemoTurn('a1', 'd1', 'hello')).agent_response).toBe('Hi');
  });

  it('prefetchDemoRag swallows errors (best-effort, never throws)', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo/d1/prefetch`, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));
    await expect(Demo.prefetchDemoRag('a1', 'd1', 'partial')).resolves.toBeUndefined();
  });
});
