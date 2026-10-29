import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyCrmError, isAbort, type CrmErrorInfo } from '../../utils/crmErrors';

export interface CrmQuery<T> {
  data: T | null;
  loading: boolean;
  error: CrmErrorInfo | null;
  reload: () => void;
}

/**
 * Runs `fetcher` whenever `deps` change, cancelling the previous request. Errors are reduced to a
 * fixed-copy CrmErrorInfo and are deliberately NOT logged — an error object can carry patient data.
 */
export function useCrmQuery<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): CrmQuery<T> {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: CrmErrorInfo | null }>(
    { data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const ctl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcherRef.current(ctl.signal).then(
      (data) => { if (!ctl.signal.aborted) setState({ data, loading: false, error: null }); },
      (e) => { if (!ctl.signal.aborted && !isAbort(e)) setState({ data: null, loading: false, error: classifyCrmError(e) }); },
    );
    return () => ctl.abort();
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
