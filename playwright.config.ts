import { defineConfig, devices } from '@playwright/test';

// e2e/smoke suites drive the real dev server in a real browser — separate from
// vitest's unit/integration tests (which run in jsdom, no server, no browser).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // `npm run dev` (scripts/select-env.mjs) is an interactive arrow-key menu
    // as of the "select Vite environment mode" change — it calls
    // process.stdin.setRawMode(true), which throws when spawned without a
    // TTY (exactly how Playwright launches this). dev:vite runs Vite
    // directly; --mode test loads .env.test, the file this repo already
    // ships specifically for this kind of automated run.
    command: 'npm run dev:vite -- --mode test',
    url: 'http://localhost:3000',
    // Never reuse: a developer's own `npm run dev` on :3000 runs in a
    // different mode (development → remote dev API, which rejects the fake
    // e2e token and bounces to sign-up) and lacks VITE_E2E_TEST below, so
    // reusing it fails every test in a misleading way. Stop it first; the
    // port can't move because the Report Issue S3 bucket's CORS only allows
    // http://localhost:3000.
    reuseExistingServer: false,
    timeout: 30_000,
    // src/utils/devAuth.ts unconditionally re-seeds sessionStorage with
    // .env.local's dev user on every localhost boot, which always wins the
    // race against a test's own addInitScript-seeded session. This flag
    // tells devAuth to skip that reseed so the test's own session sticks.
    env: { VITE_E2E_TEST: '1' },
  },
});
