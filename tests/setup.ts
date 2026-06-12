import '@testing-library/jest-dom';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './mocks/server';

// React 18 re-throws caught errors as window ErrorEvents in dev mode.
// Suppress them so error-boundary tests don't flood the test output with
// stack traces from intentional crashes.
window.addEventListener('error', (e) => e.preventDefault());

// jsdom does not implement matchMedia — stub it so useMediaQuery and
// useTheme (system-preference detection) can run in tests.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));

afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});

afterAll(() => server.close());
