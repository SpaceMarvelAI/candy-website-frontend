/**
 * Tests for src/utils/agentRoutes.ts — resolves an agent's workspace route
 * from use_case_slug + call_direction. Covers the voice/chat disambiguation
 * for the two overlapping slugs ('health' and 'hr').
 */
import { describe, it, expect } from 'vitest';
import { resolveAgentRoute, resolveAgentRouteFor } from '../../../src/utils/agentRoutes';
import type { MatchingAgent } from '../../../src/api/prompts';

function agent(overrides: Partial<MatchingAgent>): MatchingAgent {
  return {
    id: 'a1', name: 'Agent', use_case_slug: 'ecom', call_direction: 'inbound',
    agent_flow_status: 'configured', created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolveAgentRoute', () => {
  it('resolves a voice-only slug regardless of call_direction', () => {
    expect(resolveAgentRoute('ecom')).toBe('/agents/ecommerce');
    expect(resolveAgentRoute('fin', 'inbound')).toBe('/agents/financial');
    expect(resolveAgentRoute('log', 'chat')).toBe('/agents/logistics');
  });

  it('resolves a chat-only slug', () => {
    expect(resolveAgentRoute('cs', 'chat')).toBe('/chatbots/cs');
    expect(resolveAgentRoute('bank')).toBe('/chatbots/bank');
  });

  it("disambiguates the overlapping 'health' slug by call_direction", () => {
    expect(resolveAgentRoute('health', 'chat')).toBe('/chatbots/health');
    expect(resolveAgentRoute('health', 'inbound')).toBe('/agents/healthcare');
    expect(resolveAgentRoute('health')).toBe('/agents/healthcare');
  });

  it("disambiguates the overlapping 'hr' slug by call_direction", () => {
    expect(resolveAgentRoute('hr', 'chat')).toBe('/chatbots/hr');
    expect(resolveAgentRoute('hr', 'outbound')).toBe('/agents/hr');
  });

  it('returns null for an unknown slug', () => {
    expect(resolveAgentRoute('made-up-slug')).toBeNull();
    expect(resolveAgentRoute('made-up-slug', 'chat')).toBeNull();
  });
});

describe('resolveAgentRouteFor', () => {
  it('delegates to resolveAgentRoute using the agent object fields', () => {
    expect(resolveAgentRouteFor(agent({ use_case_slug: 'tech', call_direction: 'chat' }))).toBe('/chatbots/tech');
    expect(resolveAgentRouteFor(agent({ use_case_slug: 'mkt', call_direction: 'outbound' }))).toBe('/agents/marketing');
  });

  it('returns null for an agent with an unresolvable slug', () => {
    expect(resolveAgentRouteFor(agent({ use_case_slug: 'nonexistent' }))).toBeNull();
  });
});
