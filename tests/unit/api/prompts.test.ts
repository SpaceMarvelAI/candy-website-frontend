/**
 * Tests for src/api/prompts.ts — Prompt Library handoff (claim ticket → prompt).
 */
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import { claimPromptTicket } from '../../../src/api/prompts';

describe('claimPromptTicket', () => {
  it('GETs /v1/prompts/claim with the ticket query param', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${API_BASE}/v1/prompts/claim`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          prompt_id: 'p1',
          title: 'Welcome script',
          content: 'Hello, how can I help?',
          action_spec: null,
          platform_meta: {},
          use_case_slug: 'ecommerce',
          matching_agents: [],
        });
      }),
    );
    const result = await claimPromptTicket('tick-123');
    expect(capturedUrl).toContain('ticket=tick-123');
    expect(result.prompt_id).toBe('p1');
    expect(result.use_case_slug).toBe('ecommerce');
  });

  it('URL-encodes special characters in the ticket', async () => {
    let capturedUrl = '';
    server.use(
      http.get(`${API_BASE}/v1/prompts/claim`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({
          prompt_id: 'p1', title: 't', content: 'c', action_spec: null,
          platform_meta: {}, use_case_slug: null, matching_agents: [],
        });
      }),
    );
    await claimPromptTicket('a b&c');
    expect(capturedUrl).toContain('ticket=a%20b%26c');
  });

  it('returns matching_agents when the backend includes them', async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts/claim`, () =>
        HttpResponse.json({
          prompt_id: 'p1', title: 't', content: 'c', action_spec: { steps: [] },
          platform_meta: { source: 'chat' }, use_case_slug: 'cs',
          matching_agents: [
            { id: 'a1', name: 'Agent One', use_case_slug: 'cs', call_direction: 'chat', agent_flow_status: 'configured', created_at: '2026-01-01T00:00:00Z' },
          ],
        }),
      ),
    );
    const result = await claimPromptTicket('tick-456');
    expect(result.matching_agents).toHaveLength(1);
    expect(result.matching_agents[0].id).toBe('a1');
  });

  it('throws when the ticket is rejected', async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts/claim`, () =>
        HttpResponse.json({ detail: 'Ticket not found or expired' }, { status: 404 }),
      ),
    );
    await expect(claimPromptTicket('expired-ticket')).rejects.toThrow();
  });
});
