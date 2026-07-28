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
import { logger } from '../utils/logger';

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

export function useAgent(slug: string, defaultName: string, initialSelectedId?: string | null): UseAgentResult {
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
    logger.debug('[useAgent] refreshDocs', { agentId: selectedId });
    try {
      const list = await listKnowledge(selectedId);
      setDocs(list);
      logger.info('[useAgent] refreshDocs OK', { agentId: selectedId, count: list.length });
    } catch (e) {
      logger.warn('[useAgent] refreshDocs failed', { agentId: selectedId, error: e });
    }
  }, [selectedId]);

  const refreshRequirements = useCallback(async () => {
    if (!selectedId) return;
    logger.debug('[useAgent] refreshRequirements', { agentId: selectedId });
    try {
      const r = await getRequirements(selectedId);
      logger.info('[useAgent] refreshRequirements OK', { agentId: selectedId, requirements: r });
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
      logger.warn('[useAgent] refreshRequirements failed', { agentId: selectedId, error: e });
    }
  }, [selectedId, languages]);

  // Bootstrap: load languages + the agent list. If the list is empty for
  // this slug, auto-create a starter agent so the user has something to
  // edit on first visit.
  useEffect(() => {
    logger.info('[useAgent] Bootstrap starting', { slug, defaultName, hasToken: !!getToken() });

    if (!getToken()) {
      logger.warn('[useAgent] Bootstrap aborted — no auth token present', { slug });
      setError('Not signed in');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const t0 = performance.now();
    (async () => {
      try {
        // Fetch all agents and filter client-side. The backend's
        // ?use_case=<slug> filter currently misses some matches in this
        // build, so doing the filter in JS is more robust.
        const [langsRes, all] = await Promise.all([
          listLanguages().catch((e) => {
            logger.warn('[useAgent] listLanguages failed — falling back to empty list', { error: e });
            return [] as Language[];
          }),
          listAgents(),
        ]);
        if (cancelled) return;
        logger.info('[useAgent] Bootstrap data loaded', {
          slug,
          languages: langsRes.length,
          totalAgents: all.length,
          matchedAgents: all.filter(a => a.use_case_slug === slug).length,
          elapsed: `${(performance.now() - t0).toFixed(1)} ms`,
        });
        setLanguages(langsRes);
        const matched = all.filter(a => a.use_case_slug === slug);
        setAgents(matched);
        if (matched.length > 0) {
          // Two independent ways to preselect a specific agent on this page load:
          //  1. initialSelectedId — router location.state (Prompt Library agent picker).
          //  2. sessionStorage 'candy.select_agent' — set by the healthcare-domain
          //     use-case picker (doesn't rely on router state surviving the nav).
          // initialSelectedId wins when both are present — it's the more explicit
          // signal for this exact page load; the sessionStorage key is single-use either way.
          const pref = sessionStorage.getItem('candy.select_agent');
          if (pref) sessionStorage.removeItem('candy.select_agent');
          const wanted =
            initialSelectedId && matched.some(a => a.id === initialSelectedId) ? initialSelectedId
            : pref && matched.some(a => a.id === pref) ? pref
            : matched[0].id;
          setSelectedId(wanted);
        } else {
          logger.info('[useAgent] No existing agents for slug — UI will prompt creation', { slug });
          setLoading(false);
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e instanceof ApiError
          ? `${e.status}: ${typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message)}`
          : (e?.message || 'Failed to load agents');
        logger.error('[useAgent] Bootstrap failed', { slug, error: e, message: msg, stack: e?.stack });
        setError(msg);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [slug, defaultName]);

  // Whenever the selected agent changes, (re)load its reqs + KB.
  useEffect(() => {
    if (!selectedId) return;
    logger.info('[useAgent] Agent selected — loading requirements + KB', { agentId: selectedId });
    let cancelled = false;
    const t0 = performance.now();
    (async () => {
      setLoading(true);
      try {
        const [reqRes, kbRes] = await Promise.allSettled([
          getRequirements(selectedId),
          listKnowledge(selectedId),
        ]);
        if (cancelled) return;

        logger.info('[useAgent] Agent data loaded', {
          agentId: selectedId,
          requirementsStatus: reqRes.status,
          kbStatus:           kbRes.status,
          elapsed:            `${(performance.now() - t0).toFixed(1)} ms`,
        });

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
          logger.warn('[useAgent] getRequirements failed — resetting fields', {
            agentId: selectedId,
            reason:  (reqRes as PromiseRejectedResult).reason,
          });
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
          logger.warn('[useAgent] listKnowledge failed — showing empty KB', {
            agentId: selectedId,
            reason:  (kbRes as PromiseRejectedResult).reason,
          });
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
    logger.info('[useAgent] createNewAgent', { slug, name });
    try {
      const created = await createAgent({ use_case_slug: slug, name });
      logger.info('[useAgent] createNewAgent OK', { agentId: created.id, name });
      setAgents(prev => [created, ...prev]);
      setSelectedId(created.id);
    } catch (e: any) {
      logger.error('[useAgent] createNewAgent failed', { slug, name, error: e, stack: e?.stack });
      throw e;
    }
  }, [slug]);

  const removeAgent = useCallback(async (id: string) => {
    logger.info('[useAgent] removeAgent', { agentId: id });
    try {
      await deleteAgent(id);
      logger.info('[useAgent] removeAgent OK', { agentId: id });
      setAgents(prev => {
        const next = prev.filter(a => a.id !== id);
        // If we just deleted the selected one, fall back to whatever's first.
        setSelectedId(curr => {
          if (curr !== id) return curr;
          return next[0]?.id ?? null;
        });
        return next;
      });
    } catch (e: any) {
      logger.error('[useAgent] removeAgent failed', { agentId: id, error: e, stack: e?.stack });
      throw e;
    }
  }, []);

  const reloadAgents = useCallback(async () => {
    logger.info('[useAgent] reloadAgents', { slug });
    setError(null);
    setLoading(true);
    try {
      const all = await listAgents();
      const matched = all.filter(a => a.use_case_slug === slug);
      logger.info('[useAgent] reloadAgents OK', { slug, total: all.length, matched: matched.length });
      setAgents(matched);
      if (matched.length > 0 && !selectedId) {
        setSelectedId(matched[0].id);
      }
    } catch (e: any) {
      const msg = e instanceof ApiError
        ? `${e.status}: ${typeof e.detail === 'string' ? e.detail : (e.detail?.detail ?? e.message)}`
        : (e?.message || 'Failed to load agents');
      logger.error('[useAgent] reloadAgents failed', { slug, error: e, message: msg });
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
