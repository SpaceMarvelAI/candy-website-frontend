import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from '../../../src/hooks/useMediaQuery';
import { useTheme, themeStore } from '../../../src/hooks/useTheme';
import { useDialogA11y } from '../../../src/hooks/useDialogA11y';
import { useTourActive, tourActiveStore } from '../../../src/hooks/useTourActive';

vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));
import posthog from 'posthog-js';
import { addToast, toastStore, useToasts } from '../../../src/hooks/useToast';

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

// ── useDialogA11y ─────────────────────────────────────────────────────────────
describe('useDialogA11y', () => {
  function makeDialog(count = 3) {
    const dialog = document.createElement('div');
    const buttons = Array.from({ length: count }, () => document.createElement('button'));
    buttons.forEach((b) => {
      dialog.appendChild(b);
      // jsdom never lays out elements, so offsetParent is always null — fake "visible"
      // so the hook's visible-focusable filter actually has something to work with.
      Object.defineProperty(b, 'offsetParent', { get: () => document.body, configurable: true });
    });
    document.body.appendChild(dialog);
    return { dialog, buttons };
  }

  afterEach(() => { document.body.innerHTML = ''; });

  it('focuses the dialog on mount and restores focus to the opener on unmount', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const { dialog } = makeDialog(1);
    Object.defineProperty(dialog, 'focus', { value: vi.fn(), configurable: true });
    const openerFocusSpy = vi.spyOn(opener, 'focus');

    const { unmount } = renderHook(() => useDialogA11y({ current: dialog }, vi.fn()));
    expect(dialog.focus).toHaveBeenCalled();

    unmount();
    expect(openerFocusSpy).toHaveBeenCalled();
  });

  it('calls onClose on Escape', () => {
    const { dialog } = makeDialog(1);
    const onClose = vi.fn();
    renderHook(() => useDialogA11y({ current: dialog }, onClose));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('leaves Tab alone when trapFocus is false (the default)', () => {
    const { dialog, buttons } = makeDialog(2);
    renderHook(() => useDialogA11y({ current: dialog }, vi.fn()));
    buttons[1].focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('wraps Tab from the last focusable element back to the first when trapFocus is true', () => {
    const { dialog, buttons } = makeDialog(3);
    renderHook(() => useDialogA11y({ current: dialog }, vi.fn(), true));
    buttons[2].focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[0]);
  });

  it('wraps Shift+Tab from the first focusable element back to the last when trapFocus is true', () => {
    const { dialog, buttons } = makeDialog(3);
    renderHook(() => useDialogA11y({ current: dialog }, vi.fn(), true));
    buttons[0].focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(buttons[2]);
  });

  it('ignores Tab on an element in the middle of the list (neither first nor last)', () => {
    const { dialog, buttons } = makeDialog(3);
    renderHook(() => useDialogA11y({ current: dialog }, vi.fn(), true));
    buttons[1].focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('does nothing on Tab when the dialog has no focusable elements', () => {
    const dialog = document.createElement('div');
    document.body.appendChild(dialog);
    renderHook(() => useDialogA11y({ current: dialog }, vi.fn(), true));
    const evt = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    expect(() => document.dispatchEvent(evt)).not.toThrow();
    expect(evt.defaultPrevented).toBe(false);
  });
});

// ── useToast / toastStore ─────────────────────────────────────────────────────
describe('useToast / toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    toastStore.reset();
    vi.clearAllMocks();
  });
  afterEach(() => {
    toastStore.reset();
    vi.useRealTimers();
  });

  it('addToast enqueues a toast and useToasts reflects it', () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current).toHaveLength(0);
    act(() => addToast('Saved', 'success'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].msg).toBe('Saved');
    expect(result.current[0].kind).toBe('success');
  });

  it('fires posthog error_toast_shown for an error toast by default', () => {
    act(() => addToast('Oops', 'error'));
    expect(posthog.capture).toHaveBeenCalledWith('error_toast_shown', { message: 'Oops' });
  });

  it('skips the posthog capture when skipCapture is set', () => {
    act(() => addToast('Oops', 'error', { skipCapture: true }));
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('does not capture for non-error kinds', () => {
    act(() => addToast('Hi', 'info'));
    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('auto-dismisses a toast after DISMISS_MS', () => {
    const { result } = renderHook(() => useToasts());
    act(() => addToast('bye'));
    expect(result.current).toHaveLength(1);
    act(() => { vi.advanceTimersByTime(3100); });
    expect(result.current).toHaveLength(0);
  });

  it('toastStore.dismiss removes one toast by id and clears its timer', () => {
    const { result } = renderHook(() => useToasts());
    act(() => addToast('one'));
    const id = result.current[0].id;
    act(() => toastStore.dismiss(id));
    expect(result.current).toHaveLength(0);
    expect(() => vi.advanceTimersByTime(3100)).not.toThrow();
  });

  it('dismissing an id that is not queued is a no-op', () => {
    const { result } = renderHook(() => useToasts());
    act(() => addToast('one'));
    act(() => toastStore.dismiss(999999));
    expect(result.current).toHaveLength(1);
  });

  it('toastStore.reset clears every queued toast/timer, and is a no-op when already empty', () => {
    act(() => addToast('one'));
    act(() => addToast('two'));
    act(() => toastStore.reset());
    expect(toastStore.get()).toHaveLength(0);
    expect(() => toastStore.reset()).not.toThrow();
  });
});

// ── useTourActive / tourActiveStore ───────────────────────────────────────────
describe('useTourActive / tourActiveStore', () => {
  afterEach(() => tourActiveStore.set(false));

  it('defaults to false', () => {
    const { result } = renderHook(() => useTourActive());
    expect(result.current).toBe(false);
  });

  it('reflects tourActiveStore.set(true/false)', () => {
    const { result } = renderHook(() => useTourActive());
    act(() => tourActiveStore.set(true));
    expect(result.current).toBe(true);
    act(() => tourActiveStore.set(false));
    expect(result.current).toBe(false);
  });

  it('setting the same value again is a no-op (no throw)', () => {
    tourActiveStore.set(true);
    expect(() => tourActiveStore.set(true)).not.toThrow();
    tourActiveStore.set(false);
  });
});
