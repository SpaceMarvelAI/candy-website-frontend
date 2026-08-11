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

    act(() => result.current.toggleTheme()); // toggle the other direction too
    expect(result.current.theme).toBe('dark');
  });

  it('setting the same theme is a no-op (no throw)', () => {
    themeStore.set('light');
    expect(() => themeStore.set('light')).not.toThrow();
    expect(themeStore.get()).toBe('light');
  });

  it('clears an in-flight transition timer when the theme changes again quickly', () => {
    themeStore.set('light');
    themeStore.set('dark'); // starts the 400ms transition timer
    expect(() => themeStore.set('light')).not.toThrow(); // hits the pending-timer branch
    expect(themeStore.get()).toBe('light');
  });

  it('removes the theme-transitioning class after the transition duration elapses', () => {
    vi.useFakeTimers();
    themeStore.set('light');
    themeStore.set('dark');
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(document.documentElement.classList.contains('theme-transitioning')).toBe(false);
    vi.useRealTimers();
  });

  it('skips DOM updates when document is unavailable (SSR-safe)', () => {
    themeStore.set('light');
    vi.stubGlobal('document', undefined);
    expect(() => themeStore.set('dark')).not.toThrow();
    vi.unstubAllGlobals();
    expect(themeStore.get()).toBe('dark');
    themeStore.set('light'); // reset for subsequent tests
  });
});

// ── getInitialTheme() — module-load-time branches ────────────────────────────
// getInitialTheme() only runs once, at module import, so exercising its other
// branches requires a fresh module instance via vi.resetModules() + dynamic
// import — the statically-imported `useTheme`/`themeStore` above are unaffected.
describe('getInitialTheme (module load)', () => {
  afterEach(() => {
    localStorage.removeItem('theme');
    vi.unstubAllGlobals();
  });

  it('picks up a valid "dark" theme saved before the module loads', async () => {
    vi.resetModules();
    localStorage.setItem('theme', 'dark');
    const mod = await import('../../../src/hooks/useTheme');
    expect(mod.themeStore.get()).toBe('dark');
  });

  it('picks up a valid "light" theme saved before the module loads', async () => {
    vi.resetModules();
    localStorage.setItem('theme', 'light');
    const mod = await import('../../../src/hooks/useTheme');
    expect(mod.themeStore.get()).toBe('light');
  });

  it('falls back to light when window is undefined (SSR)', async () => {
    vi.resetModules();
    vi.stubGlobal('window', undefined);
    const mod = await import('../../../src/hooks/useTheme');
    expect(mod.themeStore.get()).toBe('light');
  });

  it('does not touch the DOM at module load when document is unavailable (SSR)', async () => {
    vi.resetModules();
    vi.stubGlobal('document', undefined);
    await expect(import('../../../src/hooks/useTheme')).resolves.toBeDefined();
  });
});
