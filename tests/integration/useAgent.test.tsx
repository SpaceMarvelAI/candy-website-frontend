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

describe('useAgent — selection effect loads requirements + KB', () => {
  it('populates prompt/persona/brand from requirements on selection', async () => {
    server.use(
      http.get(`${API_BASE}/v1/agents/:id/requirements`, () =>
        HttpResponse.json({
          requirements_text: 'Be helpful',
          persona_name: 'Aria',
          persona_style: 'warm',
          brand_name: 'Acme',
          multilingual: true,
          call_direction: 'both',
          supported_language_ids: [1],
        })
      ),
      http.get(`${API_BASE}/v1/agents/:id/knowledge`, () => HttpResponse.json([{ id: 'k1', filename: 'doc.pdf' }])),
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.promptText).toBe('Be helpful'));
    expect(result.current.personaName).toBe('Aria');
    expect(result.current.personaStyle).toBe('warm');
    expect(result.current.brandName).toBe('Acme');
    expect(result.current.multilingual).toBe(true);
    expect(result.current.callDirection).toBe('both');
    expect(result.current.docs).toHaveLength(1);
  });

  it('resets fields when requirements fail to load', async () => {
    server.use(
      http.get(`${API_BASE}/v1/agents/:id/requirements`, () =>
        HttpResponse.json({ detail: 'not found' }, { status: 404 })
      ),
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('');
    expect(result.current.personaStyle).toBe('professional');
    expect(result.current.callDirection).toBe('inbound');
  });

  it('shows empty KB when knowledge fails to load', async () => {
    server.use(
      http.get(`${API_BASE}/v1/agents/:id/knowledge`, () => HttpResponse.json({ detail: 'err' }, { status: 500 })),
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.docs).toEqual([]);
  });
});

describe('useAgent — refreshDocs / refreshRequirements', () => {
  it('refreshDocs reloads the knowledge list', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.use(http.get(`${API_BASE}/v1/agents/:id/knowledge`, () => HttpResponse.json([{ id: 'k9', filename: 'new.pdf' }])));
    await act(async () => { await result.current.refreshDocs(); });
    expect(result.current.docs.find(d => d.id === 'k9')).toBeTruthy();
  });

  it('refreshRequirements reloads the prompt text', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.use(http.get(`${API_BASE}/v1/agents/:id/requirements`, () =>
      HttpResponse.json({ requirements_text: 'Refreshed text', persona_style: 'concise' })
    ));
    await act(async () => { await result.current.refreshRequirements(); });
    expect(result.current.promptText).toBe('Refreshed text');
  });

  it('refreshDocs swallows errors without throwing', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    server.use(http.get(`${API_BASE}/v1/agents/:id/knowledge`, () => HttpResponse.json({ detail: 'x' }, { status: 500 })));
    await expect(act(async () => { await result.current.refreshDocs(); })).resolves.toBeUndefined();
  });
});

describe('useAgent — removeAgent()', () => {
  it('removes the agent and falls back to the next one', async () => {
    const second = { ...mockAgent, id: 'agent_002', name: 'Second' };
    server.use(
      http.get(`${API_BASE}/v1/agents`, () => HttpResponse.json([mockAgent, second])),
      http.delete(`${API_BASE}/v1/agents/agent_001`, () => new HttpResponse(null, { status: 204 })),
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_001');

    await act(async () => { await result.current.removeAgent('agent_001'); });
    expect(result.current.agents.find(a => a.id === 'agent_001')).toBeUndefined();
    expect(result.current.agent?.id).toBe('agent_002');
  });

  it('throws when delete fails', async () => {
    server.use(
      http.delete(`${API_BASE}/v1/agents/agent_001`, () => HttpResponse.json({ detail: 'no' }, { status: 500 })),
    );
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(act(async () => { await result.current.removeAgent('agent_001'); })).rejects.toThrow();
  });
});

describe('useAgent — reloadAgents()', () => {
  it('refetches and re-filters by slug', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.use(http.get(`${API_BASE}/v1/agents`, () =>
      HttpResponse.json([
        { ...mockAgent, id: 'r1', use_case_slug: 'ecommerce' },
        { ...mockAgent, id: 'r2', use_case_slug: 'financial' },
      ])
    ));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.agents).toHaveLength(1);
    expect(result.current.agents[0].id).toBe('r1');
  });

  it('sets error state when reload fails', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    server.use(http.get(`${API_BASE}/v1/agents`, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBeTruthy();
  });
});

describe('useAgent — agent preselection precedence', () => {
  // Two independent ways to preselect an agent on bootstrap: initialSelectedId
  // (router location.state, from the Prompt Library picker) and sessionStorage
  // 'candy.select_agent' (set by the healthcare-domain use-case picker). Added
  // when merging the healthcare branch into DEV — both must keep working, with
  // initialSelectedId taking precedence when both are present.
  const second = { ...mockAgent, id: 'agent_002', use_case_slug: 'ecommerce', name: 'Second Agent' };
  const third  = { ...mockAgent, id: 'agent_003', use_case_slug: 'ecommerce', name: 'Third Agent' };

  beforeEach(() => {
    server.use(http.get(`${API_BASE}/v1/agents`, () => HttpResponse.json([mockAgent, second, third])));
    sessionStorage.removeItem('candy.select_agent');
  });

  it('selects initialSelectedId when it matches an agent in this slug', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'agent_002'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_002');
  });

  it('falls back to sessionStorage candy.select_agent when initialSelectedId is absent', async () => {
    sessionStorage.setItem('candy.select_agent', 'agent_003');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_003');
  });

  it('consumes the sessionStorage pref (single-use — removed after read)', async () => {
    sessionStorage.setItem('candy.select_agent', 'agent_003');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(sessionStorage.getItem('candy.select_agent')).toBeNull();
  });

  it('initialSelectedId wins when both initialSelectedId and sessionStorage pref are present', async () => {
    sessionStorage.setItem('candy.select_agent', 'agent_003');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'agent_002'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_002');
  });

  it('falls back to the first agent when neither preference matches this slug', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'agent_from_another_slug'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('agent_001');
  });
});

describe('useAgent — field setters', () => {
  it('exposes working setters for editable fields', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPromptText('new prompt'));
    expect(result.current.promptText).toBe('new prompt');
    act(() => result.current.setPersonaName('Bob'));
    expect(result.current.personaName).toBe('Bob');
    act(() => result.current.setBrandName('BrandX'));
    expect(result.current.brandName).toBe('BrandX');
    act(() => result.current.setMultilingual(true));
    expect(result.current.multilingual).toBe(true);
    act(() => result.current.setCallDirection('outbound'));
    expect(result.current.callDirection).toBe('outbound');
    act(() => result.current.setSupportedCodes(['en', 'es']));
    expect(result.current.supportedCodes).toEqual(['en', 'es']);
    act(() => result.current.setPrimaryLang('es'));
    expect(result.current.primaryLang).toBe('es');
  });
});
