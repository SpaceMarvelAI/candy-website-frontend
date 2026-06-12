import { http, HttpResponse } from 'msw';
import { mockTokenResponse, mockUser, mockAgent, mockLanguages, API_BASE } from './fixtures';

export const handlers = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  http.post(`${API_BASE}/v1/auth/login`,  () => HttpResponse.json(mockTokenResponse)),
  http.post(`${API_BASE}/v1/auth/signup`, () => HttpResponse.json(mockTokenResponse)),
  http.get(`${API_BASE}/v1/auth/me`,      () => HttpResponse.json(mockUser)),
  http.get(`${API_BASE}/v1/auth/sso/callback`, () => HttpResponse.json(mockTokenResponse)),

  // ── Agents ────────────────────────────────────────────────────────────────
  http.get(`${API_BASE}/v1/agents`,      () => HttpResponse.json([mockAgent])),
  http.post(`${API_BASE}/v1/agents`,     () => HttpResponse.json(mockAgent, { status: 201 })),
  http.delete(`${API_BASE}/v1/agents/:id`, () => new HttpResponse(null, { status: 204 })),

  // ── Requirements ─────────────────────────────────────────────────────────
  http.get(`${API_BASE}/v1/agents/:id/requirements`, () =>
    HttpResponse.json({ requirements_text: 'Handle enquiries.', agent_flow_status: 'configured', prompt_compile: 'compiled' })
  ),
  http.post(`${API_BASE}/v1/agents/:id/requirements`, () =>
    HttpResponse.json({ agent_flow_status: 'configured', prompt_compile: 'compiled' })
  ),

  // ── Knowledge ─────────────────────────────────────────────────────────────
  http.get(`${API_BASE}/v1/agents/:id/knowledge`, () => HttpResponse.json([])),

  // ── Languages ─────────────────────────────────────────────────────────────
  http.get(`${API_BASE}/v1/languages`, () => HttpResponse.json(mockLanguages)),
];
