/**
 * Unit tests for useAgent — mocks the api/* modules directly (no MSW, no
 * network) so every bootstrap/selection/mutation branch can be forced
 * deterministically. See tests/integration/useAgent.test.tsx for the
 * MSW-backed happy-path coverage of the same hook.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgent } from '../../../src/hooks/useAgent';
import { ApiError } from '../../../src/api/client';
import { listAgents, createAgent, deleteAgent } from '../../../src/api/agents';
import { getRequirements } from '../../../src/api/requirements';
import { listKnowledge } from '../../../src/api/knowledge';
import { listLanguages } from '../../../src/api/languages';

vi.mock('../../../src/api/agents', () => ({
  listAgents: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
}));
vi.mock('../../../src/api/requirements', () => ({
  getRequirements: vi.fn(),
}));
vi.mock('../../../src/api/knowledge', () => ({
  listKnowledge: vi.fn(),
}));
vi.mock('../../../src/api/languages', () => ({
  listLanguages: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function agent(overrides: Record<string, any> = {}) {
  return {
    id: 'a1',
    company_id: 'c1',
    name: 'Agent One',
    use_case_slug: 'ecommerce',
    call_direction: 'inbound',
    agent_flow_status: 'draft',
    active_prompt_version_id: null,
    multilingual: false,
    supported_language_ids: [],
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  } as any;
}

function req(overrides: Record<string, any> = {}) {
  return {
    agent_id: 'a1',
    requirements_text: 'Prompt text',
    call_direction: 'inbound',
    persona_name: 'Aria',
    persona_style: 'professional',
    brand_name: 'Acme',
    multilingual: false,
    supported_language_ids: [],
    agent_flow_status: 'draft',
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.setItem('access_token', 'test-token');
  vi.mocked(listLanguages).mockResolvedValue([]);
  vi.mocked(listAgents).mockResolvedValue([]);
  vi.mocked(getRequirements).mockResolvedValue(req());
  vi.mocked(listKnowledge).mockResolvedValue([]);
  vi.mocked(createAgent).mockResolvedValue(agent());
  vi.mocked(deleteAgent).mockResolvedValue(undefined);
});

// ── Bootstrap: no token ─────────────────────────────────────────────────────
describe('useAgent — bootstrap without a token', () => {
  it('bails out immediately with "Not signed in" and never calls the APIs', async () => {
    sessionStorage.removeItem('access_token');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Not signed in');
    expect(listAgents).not.toHaveBeenCalled();
    expect(listLanguages).not.toHaveBeenCalled();
  });
});

// ── Bootstrap: listLanguages failure ────────────────────────────────────────
describe('useAgent — bootstrap listLanguages failure', () => {
  it('falls back to an empty languages array and still loads agents', async () => {
    vi.mocked(listLanguages).mockRejectedValue(new Error('lang service down'));
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.languages).toEqual([]);
    expect(result.current.agents).toHaveLength(1);
  });
});

// ── Bootstrap: listAgents failure — error message construction ─────────────
describe('useAgent — bootstrap listAgents failure', () => {
  it('masks a 5xx detail instead of leaking server internals', async () => {
    // 'Server exploded' is a server internal — client.ts maps every 5xx to a
    // fixed message so raw exception text can never reach the user.
    vi.mocked(listAgents).mockRejectedValue(new ApiError(500, 'Server exploded'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('500: Something went wrong on our end. Please try again.');
    expect(result.current.error).not.toContain('Server exploded');
  });

  it('formats an ApiError with an object detail using detail.detail', async () => {
    vi.mocked(listAgents).mockRejectedValue(new ApiError(422, { detail: 'Bad field' }));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('422: Bad field');
  });

  it('uses a plain Error message as-is', async () => {
    vi.mocked(listAgents).mockRejectedValue(new Error('Network down'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Network down');
  });

  it('falls back to a default message when the thrown value has no message', async () => {
    vi.mocked(listAgents).mockRejectedValue({});
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Failed to load agents');
  });

  it('falls back to the ApiError message when the object detail has no .detail key', async () => {
    vi.mocked(listAgents).mockRejectedValue(new ApiError(404, {}));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('404: HTTP 404');
  });
});

// ── Bootstrap: no agents for this slug ──────────────────────────────────────
describe('useAgent — bootstrap with no matching agents', () => {
  it('sets loading false with no selection', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'other', use_case_slug: 'financial' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent).toBeNull();
    expect(result.current.agents).toHaveLength(0);
  });
});

// ── Bootstrap: preselection precedence ──────────────────────────────────────
describe('useAgent — preselection precedence', () => {
  const a1 = agent({ id: 'a1' });
  const a2 = agent({ id: 'a2' });
  const a3 = agent({ id: 'a3' });

  beforeEach(() => {
    vi.mocked(listAgents).mockResolvedValue([a1, a2, a3]);
    sessionStorage.removeItem('candy.select_agent');
  });

  it('selects initialSelectedId when it matches', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'a2'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a2');
  });

  it('falls back to sessionStorage candy.select_agent when initialSelectedId is absent', async () => {
    sessionStorage.setItem('candy.select_agent', 'a3');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a3');
  });

  it('initialSelectedId wins over sessionStorage when both are present', async () => {
    sessionStorage.setItem('candy.select_agent', 'a3');
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'a2'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a2');
  });

  it('falls back to matched[0] when neither preference matches this slug', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent', 'not-in-list'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a1');
  });
});

// ── Per-selection effect: Promise.allSettled combinations ──────────────────
describe('useAgent — per-selection requirements + knowledge loading', () => {
  beforeEach(() => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
  });

  it('applies both requirements and knowledge when both resolve', async () => {
    vi.mocked(getRequirements).mockResolvedValue(req({ requirements_text: 'Hi there', persona_name: 'Bot' }));
    vi.mocked(listKnowledge).mockResolvedValue([{ id: 'k1', filename: 'doc.pdf' } as any]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('Hi there');
    expect(result.current.personaName).toBe('Bot');
    expect(result.current.docs).toHaveLength(1);
  });

  it('applies requirements and empties docs when knowledge rejects', async () => {
    vi.mocked(getRequirements).mockResolvedValue(req({ requirements_text: 'Hi there' }));
    vi.mocked(listKnowledge).mockRejectedValue(new Error('kb down'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('Hi there');
    expect(result.current.docs).toEqual([]);
  });

  it('resets requirement fields and applies knowledge when requirements rejects', async () => {
    vi.mocked(getRequirements).mockRejectedValue(new Error('reqs down'));
    vi.mocked(listKnowledge).mockResolvedValue([{ id: 'k2', filename: 'other.pdf' } as any]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('');
    expect(result.current.personaStyle).toBe('professional');
    expect(result.current.callDirection).toBe('inbound');
    expect(result.current.docs).toHaveLength(1);
  });

  it('resets requirement fields and empties docs when both reject', async () => {
    vi.mocked(getRequirements).mockRejectedValue(new Error('reqs down'));
    vi.mocked(listKnowledge).mockRejectedValue(new Error('kb down'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('');
    expect(result.current.docs).toEqual([]);
  });

  it('sets supportedCodes and primaryLang from supported_language_ids when languages are loaded', async () => {
    vi.mocked(listLanguages).mockResolvedValue([
      { id: 1, code: 'en', name: 'English', stt_provider: 'x', tts_provider: 'y' },
      { id: 2, code: 'fr', name: 'French', stt_provider: 'x', tts_provider: 'y' },
    ] as any);
    vi.mocked(getRequirements).mockResolvedValue(req({ supported_language_ids: [2] }));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supportedCodes).toEqual(['fr']);
    expect(result.current.primaryLang).toBe('fr');
  });

  it('leaves supportedCodes empty and primaryLang untouched when no languages are loaded', async () => {
    vi.mocked(getRequirements).mockResolvedValue(req({ supported_language_ids: [] }));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supportedCodes).toEqual([]);
    expect(result.current.primaryLang).toBe('en');
  });

  it('skips setting primaryLang when supported_language_ids do not resolve to any known language', async () => {
    vi.mocked(listLanguages).mockResolvedValue([
      { id: 1, code: 'en', name: 'English', stt_provider: 'x', tts_provider: 'y' },
    ] as any);
    vi.mocked(getRequirements).mockResolvedValue(req({ supported_language_ids: [999] }));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supportedCodes).toEqual([]);
    expect(result.current.primaryLang).toBe('en');
  });

  it('falls back to default field values when requirement fields are null', async () => {
    vi.mocked(getRequirements).mockResolvedValue(req({
      requirements_text: null, persona_name: null, persona_style: null,
      brand_name: null, call_direction: null, supported_language_ids: [],
    }));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.promptText).toBe('');
    expect(result.current.personaName).toBe('');
    expect(result.current.personaStyle).toBe('professional');
    expect(result.current.brandName).toBe('');
    expect(result.current.callDirection).toBe('inbound');
  });
});

// ── refreshRequirements(): same branch, no primaryLang side effect ─────────
describe('useAgent — refreshRequirements()', () => {
  it('sets supportedCodes but never touches primaryLang, even with matching languages', async () => {
    vi.mocked(listLanguages).mockResolvedValue([
      { id: 1, code: 'en', name: 'English', stt_provider: 'x', tts_provider: 'y' },
      { id: 5, code: 'de', name: 'German', stt_provider: 'x', tts_provider: 'y' },
    ] as any);
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getRequirements).mockResolvedValue(req({ supported_language_ids: [5] }));
    await act(async () => { await result.current.refreshRequirements(); });
    expect(result.current.supportedCodes).toEqual(['de']);
    expect(result.current.primaryLang).toBe('en');
  });

  it('resets supportedCodes to [] when no supported ids are present', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getRequirements).mockResolvedValue(req({ supported_language_ids: [] }));
    await act(async () => { await result.current.refreshRequirements(); });
    expect(result.current.supportedCodes).toEqual([]);
  });

  it('is a no-op when there is no selected agent', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshRequirements(); });
    expect(getRequirements).not.toHaveBeenCalled();
  });

  it('falls back to default field values when requirement fields are null', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(getRequirements).mockResolvedValue(req({
      requirements_text: null, persona_name: null, persona_style: null,
      brand_name: null, call_direction: null, supported_language_ids: [],
    }));
    await act(async () => { await result.current.refreshRequirements(); });
    expect(result.current.promptText).toBe('');
    expect(result.current.personaName).toBe('');
    expect(result.current.personaStyle).toBe('professional');
    expect(result.current.brandName).toBe('');
    expect(result.current.callDirection).toBe('inbound');
  });
});

// ── refreshDocs() ────────────────────────────────────────────────────────────
describe('useAgent — refreshDocs()', () => {
  it('reloads the knowledge list', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listKnowledge).mockResolvedValue([{ id: 'k9', filename: 'new.pdf' } as any]);
    await act(async () => { await result.current.refreshDocs(); });
    expect(result.current.docs.find(d => d.id === 'k9')).toBeTruthy();
  });

  it('swallows errors without throwing', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listKnowledge).mockRejectedValue(new Error('boom'));
    await expect(act(async () => { await result.current.refreshDocs(); })).resolves.toBeUndefined();
  });

  it('is a no-op when there is no selected agent', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refreshDocs(); });
    expect(listKnowledge).not.toHaveBeenCalled();
  });
});

// ── selectAgent() ────────────────────────────────────────────────────────────
describe('useAgent — selectAgent()', () => {
  it('changes the selected agent', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' }), agent({ id: 'a2' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a1');

    act(() => result.current.selectAgent('a2'));
    await waitFor(() => expect(result.current.agent?.id).toBe('a2'));
  });
});

// ── createNewAgent() ─────────────────────────────────────────────────────────
describe('useAgent — createNewAgent()', () => {
  it('prepends the created agent and selects it', async () => {
    const created = agent({ id: 'new1', name: 'Brand New' });
    vi.mocked(createAgent).mockResolvedValue(created);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.createNewAgent('Brand New'); });
    expect(result.current.agents[0].id).toBe('new1');
    expect(result.current.agent?.id).toBe('new1');
  });

  it('rethrows on failure without adding an agent', async () => {
    vi.mocked(createAgent).mockRejectedValue(new Error('quota exceeded'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => { await result.current.createNewAgent('Failing'); })
    ).rejects.toThrow('quota exceeded');
    expect(result.current.agents).toHaveLength(0);
  });
});

// ── removeAgent() ────────────────────────────────────────────────────────────
describe('useAgent — removeAgent()', () => {
  it('removing a non-selected agent leaves the current selection unchanged', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' }), agent({ id: 'a2' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a1');

    await act(async () => { await result.current.removeAgent('a2'); });
    expect(result.current.agents.find(a => a.id === 'a2')).toBeUndefined();
    expect(result.current.agent?.id).toBe('a1');
  });

  it('removing the selected agent falls back to the next remaining one', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' }), agent({ id: 'a2' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a1');

    await act(async () => { await result.current.removeAgent('a1'); });
    expect(result.current.agent?.id).toBe('a2');
  });

  it('removing the last remaining selected agent clears the selection', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.removeAgent('a1'); });
    expect(result.current.agent).toBeNull();
    expect(result.current.agents).toHaveLength(0);
  });

  it('rethrows on failure without mutating the list', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' })]);
    vi.mocked(deleteAgent).mockRejectedValue(new Error('no permission'));
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      act(async () => { await result.current.removeAgent('a1'); })
    ).rejects.toThrow('no permission');
    expect(result.current.agents).toHaveLength(1);
  });
});

// ── reloadAgents() ───────────────────────────────────────────────────────────
describe('useAgent — reloadAgents()', () => {
  it('selects the first matched agent when nothing was previously selected', async () => {
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent).toBeNull();

    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' })]);
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.agent?.id).toBe('a1');
  });

  it('leaves an existing selection alone even if it is no longer first in the list', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a1' }), agent({ id: 'a2' })]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.agent?.id).toBe('a1');

    vi.mocked(listAgents).mockResolvedValue([agent({ id: 'a2' }), agent({ id: 'a1' })]);
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.agent?.id).toBe('a1');
  });

  it('formats an ApiError message on failure', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listAgents).mockRejectedValue(new ApiError(503, 'down'));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBe('503: Something went wrong on our end. Please try again.');
  });

  it('uses a plain Error message on failure', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listAgents).mockRejectedValue(new Error('offline'));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBe('offline');
  });

  it('formats an ApiError with an object detail using detail.detail', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listAgents).mockRejectedValue(new ApiError(422, { detail: 'Bad field' }));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBe('422: Bad field');
  });

  it('falls back to the ApiError message when the object detail has no .detail key', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listAgents).mockRejectedValue(new ApiError(404, {}));
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBe('404: HTTP 404');
  });

  it('falls back to a default message when the thrown value has no message', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const { result } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(listAgents).mockRejectedValue({});
    await act(async () => { await result.current.reloadAgents(); });
    expect(result.current.error).toBe('Failed to load agents');
  });
});

// ── Cancellation guards — effect cleanup ignores late results after unmount ─
describe('useAgent — cancellation guards on unmount', () => {
  it('ignores a successful bootstrap result that resolves after unmount', async () => {
    const gate = deferred<any[]>();
    vi.mocked(listAgents).mockReturnValue(gate.promise as any);
    const { unmount } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    unmount();
    gate.resolve([agent()]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('ignores a failed bootstrap result that rejects after unmount', async () => {
    const gate = deferred<any[]>();
    vi.mocked(listAgents).mockReturnValue(gate.promise as any);
    const { unmount } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    unmount();
    gate.reject(new Error('too late'));
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  it('ignores a per-selection effect result that resolves after unmount', async () => {
    vi.mocked(listAgents).mockResolvedValue([agent()]);
    const reqGate = deferred<any>();
    const kbGate = deferred<any>();
    vi.mocked(getRequirements).mockReturnValue(reqGate.promise as any);
    vi.mocked(listKnowledge).mockReturnValue(kbGate.promise as any);

    const { result, unmount } = renderHook(() => useAgent('ecommerce', 'My Agent'));
    await waitFor(() => expect(result.current.agent?.id).toBe('a1'));
    unmount();
    reqGate.resolve(req());
    kbGate.resolve([]);
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});
