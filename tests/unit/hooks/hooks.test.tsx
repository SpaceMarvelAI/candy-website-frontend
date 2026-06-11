import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../../../src/hooks/useMediaQuery';
import { useTheme, themeStore } from '../../../src/hooks/useTheme';

// ── useMediaQuery ───────────────────────────────────────────────────────────
describe('useMediaQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the initial matches value from matchMedia', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

    const { result } = renderHook(() => useMediaQuery('(max-width: 600px)'));
    expect(result.current).toBe(true);
  });

  it('subscribes and unsubscribes to the change event', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.spyOn(window, 'matchMedia').mockImplementation((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener, removeEventListener,
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    }) as unknown as MediaQueryList);

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'));
    expect(addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});

// ── useTheme / themeStore ─────────────────────────────────────────────────────
describe('useTheme + themeStore', () => {
  it('themeStore.get returns a valid theme', () => {
    expect(['dark', 'light']).toContain(themeStore.get());
  });

  it('themeStore.set updates the current theme', () => {
    themeStore.set('dark');
    expect(themeStore.get()).toBe('dark');
    themeStore.set('light');
    expect(themeStore.get()).toBe('light');
  });

  it('themeStore.toggle flips the theme', () => {
    themeStore.set('light');
    themeStore.toggle();
    expect(themeStore.get()).toBe('dark');
    themeStore.toggle();
    expect(themeStore.get()).toBe('light');
  });

  it('useTheme exposes theme + setTheme + toggleTheme and reacts to changes', () => {
    themeStore.set('light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');

    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');

    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('light');
  });

  it('setting the same theme is a no-op (no throw)', () => {
    themeStore.set('light');
    expect(() => themeStore.set('light')).not.toThrow();
    expect(themeStore.get()).toBe('light');
  });
});
