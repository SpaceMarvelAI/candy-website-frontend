/**
 * useAgent(slug) — manage all the agents that belong to a given industry
 * use-case slug ('ecom' / 'fin' / 'log' / 'health' / 'hr' / 'mkt'):
 *
 *   • Loads the list of agents (createing one if there's none yet).
 *   • Tracks which agent is currently selected and exposes
 *     `selectAgent(id)` + `createNewAgent(name)` so the page can show a
 *     picker / "+ New" button.
 *   • Re-fetches requirements + knowledge docs whenever the selected
 *     agent changes.
 *   • Loads the language catalog so the LanguagePicker can render.
 */
import { useEffect, useState, useCallback } from 'react';
import { listAgents, createAgent, deleteAgent, type Agent } from '../api/agents';
import { getRequirements } from '../api/requirements';
import { listKnowledge, type KnowledgeDoc } from '../api/knowledge';
import { listLanguages, type Language } from '../api/languages';
import { ApiError, getToken } from '../api/client';

export interface UseAgentResult {
  // Agent set
  agents: Agent[];
  agent: Agent | null;
  selectAgent: (id: string) => void;
  createNewAgent: (name: string) => Promise<void>;
  removeAgent: (id: string) => Promise<void>;
  reloadAgents: () => Promise<void>;
  loading: boolean;
  error: string | null;

  // Requirements / KB
  promptText: string;
  setPromptText: (s: string) => void;
  personaName: string;
  setPersonaName: (s: string) => void;
  personaStyle: string;
  setPersonaStyle: (s: string) => void;
  brandName: string;
  setBrandName: (s: string) => void;
  docs: KnowledgeDoc[];
  refreshDocs: () => Promise<void>;
  refreshRequirements: () => Promise<void>;

  // Languages
  languages: Language[];
  primaryLang: string;
  setPrimaryLang: (s: string) => void;
  supportedCodes: string[];
  setSupportedCodes: (s: string[]) => void;
  multilingual: boolean;
  setMultilingual: (b: boolean) => void;
  callDirection: 'inbound' | 'outbound' | 'both';
  setCallDirection: (d: 'inbound' | 'outbound' | 'both') => void;
}

export function useAgent(slug: string, defaultName: string): UseAgentResult {
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [promptText, setPrompt]         = useState('');
  const [personaName, setPersonaName]   = useState('');
  const [personaStyle, setPersonaStyle] = useState('professional');
  const [brandName, setBrandName]       = useState('');
  const [docs, setDocs]                 = useState<KnowledgeDoc[]>([]);

  const [languages, setLanguages]           = useState<Language[]>([]);
  const [primaryLang, setPrimaryLang]       = useState('en');
  const [supportedCodes, setSupportedCodes] = useState<string[]>([]);
  const [multilingual, setMultilingual]     = useState(false);
  const [callDirection, setCallDirection]   = useState<'inbound' | 'outbound' | 'both'>('inbound');

  const agent = agents.find(a => a.id === selectedId) ?? null;

  const refreshDocs = useCallback(async () => {
    if (!selectedId) return;
    try {
      const list = await listKnowledge(selectedId);
      setDocs(list);
    } catch (e) {
      console.warn('listKnowledge failed', e);
    }
  }, [selectedId]);

  const refreshRequirements = useCallback(async () => {
    if (!selectedId) return;
    try {
      const r = await getRequirements(selectedId);
      setPrompt(r.requirements_text ?? '');
      setPersonaName(r.persona_name ?? '');
      setPersonaStyle(r.persona_style ?? 'professional');
      setBrandName(r.brand_name ?? '');
      setMultilingual(!!r.multilingual);
      setCallDirection((r.call_direction as 'inbound' | 'outbound' | 'both') ?? 'inbound');
      if (languages.length > 0 && r.supported_language_ids?.length) {
        const codes = r.supported_language_ids
          .map(id => languages.find(l => l.id === id)?.code)
          .filter((c): c is string => !!c);
        setSupportedCodes(codes);
      } else {
        setSupportedCodes([]);
      }
    } catch (e) {
      console.warn('getRequirements failed', e);
    }
  }, [selectedId, languages]);

  // Bootstrap: load languages + the agent list. If the list is empty for
  // this slug, auto-create a starter agent so the user has something to
  // edit on first visit.
  useEffect(() => {
    if (!getToken()) {
      setError('Not signed in');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // Fetch voice agents (call_direction != 'chat') and filter
        // client-side by slug. Backend's ?use_case=<slug> filter has
        // historically missed some matches in this build, so the JS
        // slug filter is kept as a safety net.
        const [langsRes, all] = await Promise.all([
          listLanguages().catch(() => [] as Language[]),
          listAgents({ modality: 'voice' }),
        ]);
        if (cancelled) return;
        setLanguages(langsRes);
        const matched = all.filter(a => a.use_case_slug === slug);
        setAgents(matched);
        if (matched.length > 0) {
          setSelectedId(matched[0].id);
        } else {
          setLoading(false);
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e instanceof ApiError
          ? `${e.status}: ${typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message)}`
          : (e?.message || 'Failed to load agents');
        setError(msg);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [slug, defaultName]);

  // Whenever the selected agent changes, (re)load its reqs + KB.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [reqRes, kbRes] = await Promise.allSettled([
          getRequirements(selectedId),
          listKnowledge(selectedId),
        ]);
        if (cancelled) return;

        if (reqRes.status === 'fulfilled') {
          const r = reqRes.value;
          setPrompt(r.requirements_text ?? '');
          setPersonaName(r.persona_name ?? '');
          setPersonaStyle(r.persona_style ?? 'professional');
          setBrandName(r.brand_name ?? '');
          setMultilingual(!!r.multilingual);
          setCallDirection((r.call_direction as 'inbound' | 'outbound' | 'both') ?? 'inbound');
          if (languages.length > 0 && r.supported_language_ids?.length) {
            const codes = r.supported_language_ids
              .map(id => languages.find(l => l.id === id)?.code)
              .filter((c): c is string => !!c);
            setSupportedCodes(codes);
            if (codes[0]) setPrimaryLang(codes[0]);
          } else {
            setSupportedCodes([]);
          }
        } else {
          setPrompt('');
          setPersonaName('');
          setPersonaStyle('professional');
          setBrandName('');
          setSupportedCodes([]);
          setCallDirection('inbound');
        }

        if (kbRes.status === 'fulfilled') {
          setDocs(kbRes.value);
        } else {
          setDocs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, languages]);

  const selectAgent = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const createNewAgent = useCallback(async (name: string) => {
    const created = await createAgent({ use_case_slug: slug, name });
    setAgents(prev => [created, ...prev]);
    setSelectedId(created.id);
  }, [slug]);

  const removeAgent = useCallback(async (id: string) => {
    await deleteAgent(id);
    setAgents(prev => {
      const next = prev.filter(a => a.id !== id);
      // If we just deleted the selected one, fall back to whatever's first.
      setSelectedId(curr => {
        if (curr !== id) return curr;
        return next[0]?.id ?? null;
      });
      return next;
    });
  }, []);

  const reloadAgents = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const all = await listAgents({ modality: 'voice' });
      const matched = all.filter(a => a.use_case_slug === slug);
      setAgents(matched);
      if (matched.length > 0 && !selectedId) {
        setSelectedId(matched[0].id);
      }
    } catch (e: any) {
      const msg = e instanceof ApiError
        ? `${e.status}: ${typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message)}`
        : (e?.message || 'Failed to load agents');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [slug, selectedId]);

  return {
    agents, agent, selectAgent, createNewAgent, removeAgent, reloadAgents,
    loading, error,
    promptText, setPromptText: setPrompt,
    personaName, setPersonaName,
    personaStyle, setPersonaStyle,
    brandName, setBrandName,
    docs, refreshDocs, refreshRequirements,
    languages,
    primaryLang, setPrimaryLang,
    supportedCodes, setSupportedCodes,
    multilingual, setMultilingual,
    callDirection, setCallDirection,
  };
}
