/**
 * Integration tests for the useAgent hook.
 *
 * Tests cover:
 *  - Bootstrap: loads languages + agent list, auto-selects first agent
 *  - Bootstrap with empty list: sets loading:false, no selected agent
 *  - createNewAgent: calls POST /v1/agents, appends to list, selects new agent
 *  - No-token guard: bootstrap aborts immediately and sets error
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAgent } from '../../src/hooks/useAgent';
import { mockAgent, mockLanguages, API_BASE } from '../mocks/fixtures';
import { setToken } from '../../src/api/client';

// Provide a valid token for tests that need auth
beforeEach(() => setToken('test-jwt-abc123'));

describe('useAgent — bootstrap with agents present', () => {
  it('sets loading=false after bootstrap completes', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('populates the agents list with slug-matched agents', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].id).toBe('agent_001');
  });

  it('auto-selects the first agent', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_001');
  });

  it('loads languages', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.languages).toHaveLength(2);
  });

  it('does not include agents from other slugs', async () => {
    server.use(
      http.get(`${API_BASE}/v1/agents`, () =>
        HttpResponse.json([
          { ...mockAgent, id: 'a1', use_case_slug: 'ecommerce' },
          { ...mockAgent, id: 'a2', use_case_slug: 'financial' },
          { ...mockAgent, id: 'a3', use_case_slug: 'ecommerce' },
        ])
      )
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agents).toHaveLength(2);
    expect(result.current.agents.every(a => a.use_case_slug === 'ecommerce')).toBe(true);
  });
});

describe('useAgent — bootstrap with no existing agents', () => {
  beforeEach(() => {
    server.use(
      http.get(`${API_BASE}/v1/agents`, () => HttpResponse.json([]))
    );
  });

  it('sets loading=false when no agents are found', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('has no selected agent when the list is empty', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent).toBeNull();
    expect(result.current.agents).toHaveLength(0);
  });
});

describe('useAgent — bootstrap without a token', () => {
  beforeEach(() => setToken(null));

  it('sets error state immediately and does not call the API', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.agents).toHaveLength(0);
  });
});

describe('useAgent — createNewAgent()', () => {
  it('appends the new agent and selects it', async () => {
    const newAgent = { ...mockAgent, id: 'agent_new', name: 'Brand New' };
    server.use(
      http.post(`${API_BASE}/v1/agents`, () => HttpResponse.json(newAgent, { status: 201 }))
    );

    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.createNewAgent('Brand New');
    });

    expect(result.current.agents.find(a => a.id === 'agent_new')).toBeTruthy();
    expect(result.current.agent?.id).toBe('agent_new');
  });

  it('throws when the API returns an error', async () => {
    server.use(
      http.post(`${API_BASE}/v1/agents`, () =>
        HttpResponse.json({ detail: 'Quota exceeded' }, { status: 422 })
      )
    );

    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => { await result.current.createNewAgent('Failing Agent'); })
    ).rejects.toThrow();
  });
});

describe('useAgent — selectAgent()', () => {
  it('changes the selected agent', async () => {
    const second = { ...mockAgent, id: 'agent_002', name: 'Second Agent' };
    server.use(
      http.get(`${API_BASE}/v1/agents`, () => HttpResponse.json([mockAgent, second]))
    );

    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_001');

    act(() => result.current.selectAgent('agent_002'));
    expect(result.current.agent?.id).toBe('agent_002');
  });
});
