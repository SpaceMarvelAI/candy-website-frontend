import { useCallback, useEffect, useRef, useState } from 'react';
import { classifyCrmError, type CrmErrorInfo } from '../../utils/crmErrors';

/**
 * Wraps one CRM write. Guarantees: a second call while one is in flight is ignored (no double submit);
 * failures become fixed-copy CrmErrorInfo (never the backend's text); nothing is logged — an error object
 * can carry patient data; state is not touched after unmount.
 */
export function useCrmMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<CrmErrorInfo | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const run = useCallback(async (...args: A): Promise<R | null> => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      if (alive.current) setError(classifyCrmError(e));
      return null;
    } finally {
      busy.current = false;
      if (alive.current) setSaving(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { run, saving, error, clearError };
}
