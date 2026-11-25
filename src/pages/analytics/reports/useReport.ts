import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildReportParams, getReport,
  type ReportEndpoint, type ReportFilters,
} from '../../../api/analyticsReports';

export interface ReportState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads one report. It reloads when the endpoint's parameters change, and:
 *  • the data of a previous filter is CLEARED the moment the filters change, so a section never shows
 *    numbers under a filter they do not belong to;
 *  • only the newest request may write state — a slow response for an old filter is ignored;
 *  • the effect is keyed on the request, not on mount, so React StrictMode's dev-only second effect run
 *    does not issue the request twice (same approach as the page's own loader).
 * `nonce` lets the page's Refresh button force a reload.
 */
export function useReport<T>(endpoint: ReportEndpoint, filters: ReportFilters, nonce = 0): ReportState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const loadedKey = useRef<string | null>(null);
  const [retry, setRetry] = useState(0);

  const params = buildReportParams(filters, endpoint);
  const key = JSON.stringify([endpoint, params, nonce, retry]);

  useEffect(() => {
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const request = ++latest.current;
    setData(null);
    setError(null);
    setLoading(true);
    getReport<T>(endpoint, params)
      .then(body => { if (request === latest.current) setData(body); })
      .catch(e => { if (request === latest.current) setError(e instanceof Error ? e.message : 'Request failed'); })
      .finally(() => { if (request === latest.current) setLoading(false); });
    // `params` is derived from `key`; depending on the key is what we mean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setRetry(n => n + 1), []);
  return { data, loading, error, reload };
}
