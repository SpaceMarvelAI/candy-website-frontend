/**
 * Unit tests for utils/useDebugLifecycle.ts — opt-in mount/unmount/dep-change
 * logging. logger.debug is mocked so we can assert exactly what gets logged
 * without depending on the verbosity-gating rules in utils/logger.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { createElement, StrictMode } from 'react';
import { useDebugLifecycle } from '../../../src/utils/useDebugLifecycle';
import { logger } from '../../../src/utils/logger';

vi.mock('../../../src/utils/logger', () => ({
  logger: { debug: vi.fn() },
}));

beforeEach(() => {
  vi.mocked(logger.debug).mockClear();
});

describe('useDebugLifecycle', () => {
  it('logs once on mount with the initial deps', () => {
    renderHook(() => useDebugLifecycle('TestPanel', [1, 'a']));
    expect(logger.debug).toHaveBeenCalledTimes(1);
    expect(logger.debug).toHaveBeenCalledWith('[TestPanel] mount', { deps: [1, 'a'] });
  });

  it('logs on unmount with a lifespan and the render count', () => {
    const { unmount } = renderHook(() => useDebugLifecycle('TestPanel', [1]));
    unmount();
    expect(logger.debug).toHaveBeenCalledWith(
      '[TestPanel] unmount',
      expect.objectContaining({ lifespanMs: expect.any(String), renders: 1 }),
    );
  });

  it('does not log "deps changed" when a rerender keeps the same deps', () => {
    const { rerender } = renderHook(({ deps }) => useDebugLifecycle('TestPanel', deps), {
      initialProps: { deps: [1, 'a'] as Array<number | string> },
    });
    vi.mocked(logger.debug).mockClear();

    rerender({ deps: [1, 'a'] });

    expect(logger.debug).not.toHaveBeenCalledWith('[TestPanel] deps changed', expect.anything());
  });

  it('logs "deps changed" with the changed index when a rerender changes a dep', () => {
    const { rerender } = renderHook(({ deps }) => useDebugLifecycle('TestPanel', deps), {
      initialProps: { deps: [1, 'a'] as Array<number | string> },
    });
    vi.mocked(logger.debug).mockClear();

    rerender({ deps: [2, 'a'] });

    expect(logger.debug).toHaveBeenCalledWith(
      '[TestPanel] deps changed',
      expect.objectContaining({
        changed: [{ index: 0, from: 1, to: 2 }],
      }),
    );
  });

  it('does not log "deps changed" on the StrictMode double-invoke of the initial mount', () => {
    // React 18 StrictMode re-runs every effect once on mount (setup → cleanup → setup)
    // to surface effects that aren't idempotent. The deps-effect's second invocation
    // compares the same deps against themselves, so it must not log a false change.
    renderHook(() => useDebugLifecycle('TestPanel', [1, 'a']), {
      wrapper: ({ children }) => createElement(StrictMode, null, children),
    });
    expect(logger.debug).not.toHaveBeenCalledWith('[TestPanel] deps changed', expect.anything());
  });
});
