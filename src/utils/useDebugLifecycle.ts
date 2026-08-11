/**
 * useDebugLifecycle — opt-in mount/unmount/dep-change logging for a component.
 *
 * Deliberately NOT applied blanket-wide (that creates noise that hides real
 * problems — see debug/AUDIT.md's own instructions). Apply only to components
 * flagged Critical/High in the audit: auth screens, data-mutation flows,
 * complex stateful components (WebSocket/MediaRecorder, race-prone effects).
 *
 * Fully additive — this hook only calls logger methods (all gated by the same
 * verbosity rules as everything else); it never reads/writes app state, so it
 * cannot change component behavior.
 *
 * Usage:
 *   useDebugLifecycle('TestPanel', [agentId, isRecording]);
 */
import { useEffect, useRef } from 'react';
import { logger } from './logger';

export function useDebugLifecycle(name: string, deps: React.DependencyList = []): void {
  const mountedAt = useRef<number>(0);
  const prevDeps = useRef<React.DependencyList | null>(null);
  const renderCount = useRef(0);

  renderCount.current += 1;

  useEffect(() => {
    mountedAt.current = performance.now();
    logger.debug(`[${name}] mount`, { deps });
    return () => {
      const lifespanMs = performance.now() - mountedAt.current;
      logger.debug(`[${name}] unmount`, { lifespanMs: lifespanMs.toFixed(1), renders: renderCount.current });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (prevDeps.current === null) {
      prevDeps.current = deps;
      return; // first run is the mount itself — already logged above
    }
    const changed = deps
      .map((dep, i) => ({ index: i, from: prevDeps.current![i], to: dep }))
      .filter((d) => !Object.is(d.from, d.to));
    if (changed.length > 0) {
      logger.debug(`[${name}] deps changed`, { changed, renderNumber: renderCount.current });
    }
    prevDeps.current = deps;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
