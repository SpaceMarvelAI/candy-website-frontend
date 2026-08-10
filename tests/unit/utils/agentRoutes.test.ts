/**
 * Unit tests for utils/agentRoutes.ts — use_case_slug + call_direction → route.
 * Pure logic, no mocking needed. The 'health' and 'hr' slugs are the
 * interesting cases: they're shared between a voice workspace and a chatbot
 * workspace, disambiguated only by call_direction.
 */
import { describe, it, expect } from 'vitest';
import { resolveAgentRoute, resolveAgentRouteFor } from '../../../src/utils/agentRoutes';
import type { MatchingAgent } from '../../../src/api/prompts';

describe('resolveAgentRoute', () => {
  it('resolves a voice-only slug regardless of call_direction', () => {
    expect(resolveAgentRoute('ecom', 'inbound')).toBe('/agents/ecommerce');
    expect(resolveAgentRoute('ecom', 'chat')).toBe('/agents/ecommerce'); // no chat route for 'ecom' — voice wins
  });

  it('resolves a chat-only slug', () => {
    expect(resolveAgentRoute('cs', 'chat')).toBe('/chatbots/cs');
    expect(resolveAgentRoute('cs', 'inbound')).toBe('/chatbots/cs'); // no voice route for 'cs' either
  });

  it('disambiguates "health" by call_direction: chat', () => {
    expect(resolveAgentRoute('health', 'chat')).toBe('/chatbots/health');
  });

  it('disambiguates "health" by call_direction: voice (default)', () => {
    expect(resolveAgentRoute('health', 'inbound')).toBe('/agents/healthcare');
    expect(resolveAgentRoute('health', 'outbound')).toBe('/agents/healthcare');
    expect(resolveAgentRoute('health')).toBe('/agents/healthcare'); // call_direction omitted
  });

  it('disambiguates "hr" the same way', () => {
    expect(resolveAgentRoute('hr', 'chat')).toBe('/chatbots/hr');
    expect(resolveAgentRoute('hr', 'both')).toBe('/agents/hr');
  });

  it('returns null for an unknown slug', () => {
    expect(resolveAgentRoute('nonexistent-slug', 'chat')).toBeNull();
    expect(resolveAgentRoute('nonexistent-slug')).toBeNull();
  });
});

describe('resolveAgentRouteFor', () => {
  function agent(overrides: Partial<MatchingAgent> = {}): MatchingAgent {
    return {
      id: 'a1', name: 'Agent', use_case_slug: 'health', call_direction: 'inbound',
      agent_flow_status: 'live', created_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('delegates to resolveAgentRoute using the agent\'s own fields', () => {
    expect(resolveAgentRouteFor(agent({ use_case_slug: 'health', call_direction: 'chat' }))).toBe('/chatbots/health');
    expect(resolveAgentRouteFor(agent({ use_case_slug: 'health', call_direction: 'inbound' }))).toBe('/agents/healthcare');
  });
});
