/**
 * Unit tests for api/healthcare.ts — healthcare use-case agent picker/creator.
 * MSW-mocked HTTP, matching the house convention used by tests/unit/api/crud.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import { listUseCaseAgents, createHealthcareAgent } from '../../../src/api/healthcare';
import type { HealthcareUseCase } from '../../../src/data/healthcareUseCases';
import type { Agent } from '../../../src/api/agents';

beforeEach(() => setToken('test-jwt-abc123'));

const B = API_BASE;

const uc: HealthcareUseCase = {
  key: 'patient_intake',
  title: 'Patient Intake',
  direction: 'both',
  purpose: 'Register a new patient',
  icon: 'patient',
  fields: [],
  skills: ['hc_patient_intake', 'verify_otp'],
};

function mockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent_1',
    company_id: 'co_1',
    name: 'Test Agent',
    use_case_slug: 'health',
    call_direction: 'both',
    agent_flow_status: 'draft',
    active_prompt_version_id: null,
    multilingual: false,
    supported_language_ids: [],
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('listUseCaseAgents', () => {
  it('returns only health-domain agents that have the use case skill active', async () => {
    server.use(
      http.get(`${B}/v1/agents`, () =>
        HttpResponse.json([
          mockAgent({ id: 'a1', use_case_slug: 'health' }),
          mockAgent({ id: 'a2', use_case_slug: 'health' }),
          mockAgent({ id: 'a3', use_case_slug: 'ecommerce' }), // wrong slug — excluded regardless of skills
        ])
      ),
      http.get(`${B}/v1/agents/a1/skills`, () =>
        HttpResponse.json([{ id: 's1', skill_slug: 'hc_patient_intake', is_active: true, config: {}, attached_at: '' }])
      ),
      http.get(`${B}/v1/agents/a2/skills`, () =>
        HttpResponse.json([{ id: 's2', skill_slug: 'hc_patient_intake', is_active: false, config: {}, attached_at: '' }])
      ),
    );

    const result = await listUseCaseAgents(uc);
    expect(result.map((a) => a.id)).toEqual(['a1']);
  });

  it('excludes an agent when its skills lookup fails', async () => {
    server.use(
      http.get(`${B}/v1/agents`, () => HttpResponse.json([mockAgent({ id: 'a1', use_case_slug: 'health' })])),
      http.get(`${B}/v1/agents/a1/skills`, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })),
    );

    const result = await listUseCaseAgents(uc);
    expect(result).toEqual([]);
  });

  it('returns an empty list when there are no health-domain agents', async () => {
    server.use(http.get(`${B}/v1/agents`, () => HttpResponse.json([mockAgent({ use_case_slug: 'ecommerce' })])));
    const result = await listUseCaseAgents(uc);
    expect(result).toEqual([]);
  });
});

describe('createHealthcareAgent', () => {
  it('creates a health-domain agent and attaches every use-case skill', async () => {
    let createdBody: any = null;
    server.use(
      http.post(`${B}/v1/agents`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json(mockAgent({ id: 'new_agent' }), { status: 201 });
      }),
      http.post(`${B}/v1/agents/new_agent/skills/hc_patient_intake`, () =>
        HttpResponse.json({ id: 's1', skill_slug: 'hc_patient_intake', is_active: true, config: {}, attached_at: '' })
      ),
      http.post(`${B}/v1/agents/new_agent/skills/verify_otp`, () =>
        HttpResponse.json({ id: 's2', skill_slug: 'verify_otp', is_active: true, config: {}, attached_at: '' })
      ),
    );

    const { agent, attached, failed } = await createHealthcareAgent(uc, 'My Intake Agent');

    expect(createdBody).toMatchObject({ use_case_slug: 'health', name: 'My Intake Agent', call_direction: 'both' });
    expect(agent.id).toBe('new_agent');
    expect(attached.sort()).toEqual(['hc_patient_intake', 'verify_otp'].sort());
    expect(failed).toEqual([]);
  });

  it('falls back to the use case title when no name is given', async () => {
    let createdBody: any = null;
    server.use(
      http.post(`${B}/v1/agents`, async ({ request }) => {
        createdBody = await request.json();
        return HttpResponse.json(mockAgent({ id: 'new_agent' }), { status: 201 });
      }),
      http.post(`${B}/v1/agents/new_agent/skills/:slug`, () =>
        HttpResponse.json({ id: 's', skill_slug: 'x', is_active: true, config: {}, attached_at: '' })
      ),
    );

    await createHealthcareAgent(uc, '   ');
    expect(createdBody.name).toBe('Patient Intake');
  });

  it('collects failed skill attaches instead of throwing — the agent is still created', async () => {
    server.use(
      http.post(`${B}/v1/agents`, () => HttpResponse.json(mockAgent({ id: 'new_agent' }), { status: 201 })),
      http.post(`${B}/v1/agents/new_agent/skills/hc_patient_intake`, () =>
        HttpResponse.json({ id: 's1', skill_slug: 'hc_patient_intake', is_active: true, config: {}, attached_at: '' })
      ),
      http.post(`${B}/v1/agents/new_agent/skills/verify_otp`, () => HttpResponse.json({ detail: 'no' }, { status: 500 })),
    );

    const { attached, failed } = await createHealthcareAgent(uc, 'Name');
    expect(attached).toEqual(['hc_patient_intake']);
    expect(failed).toEqual(['verify_otp']);
  });
});
