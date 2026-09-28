/**
 * General app smoke test — the coarse "is the app completely broken?" check.
 * Seeds a signed-in session (bypassing the real OIDC flow, which needs live
 * SpaceMarvel credentials) and confirms the dashboard actually renders with
 * zero console errors. Not deep — that's what core-flows.spec.ts is for.
 */
import { test, expect } from '@playwright/test';

const TEST_API_BASE = 'http://localhost:8002'; // VITE_API_BASE_URL in .env.test

const SEEDED_USER = {
  user_id: '00000000-0000-0000-0000-e2e000000000',
  email: 'e2e-smoke@candy.internal',
  full_name: 'E2E Smoke Test',
  role: 'owner',
  company_id: '00000000-0000-0000-0000-e2e000000001',
  company_name: 'E2E Smoke Test Co',
};

test.beforeEach(async ({ context }) => {
  // Seed BEFORE any app script runs (addInitScript), so LandingPage's
  // "redirect to real OIDC login" effect never fires — see App.tsx RootRedirect.
  await context.addInitScript((user) => {
    sessionStorage.setItem('access_token', 'fake-e2e-token-not-verified-by-backend');
    sessionStorage.setItem('candy.user', JSON.stringify(user));
  }, SEEDED_USER);
});

test('dashboard renders for a signed-in user with no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    // No backend runs for this test (and a real one would reject the fake token
    // anyway), so failed calls to .env.test's API base are expected noise —
    // both the browser's own resource error and client.ts's status-0 log.
    const text = msg.text();
    if (msg.location().url.startsWith(TEST_API_BASE) || (text.includes(TEST_API_BASE) && text.includes('status: 0'))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

  await page.goto('/dashboard');
  await expect(page.getByText('Healthcare Domain', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(SEEDED_USER.email)).toBeVisible();

  expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
