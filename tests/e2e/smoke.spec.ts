/**
 * General app smoke test — the coarse "is the app completely broken?" check.
 * Seeds a signed-in session (bypassing the real OIDC flow, which needs live
 * SpaceMarvel credentials) and confirms the dashboard actually renders with
 * zero console errors. Not deep — that's what core-flows.spec.ts is for.
 */
import { test, expect } from '@playwright/test';

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
    localStorage.setItem('access_token', 'fake-e2e-token-not-verified-by-backend');
    localStorage.setItem('candy.user', JSON.stringify(user));
  }, SEEDED_USER);
});

test('dashboard renders for a signed-in user with no console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`));

  await page.goto('/dashboard');
  await expect(page.getByText('Healthcare Domain', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(SEEDED_USER.email)).toBeVisible();

  expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join('\n')}`).toEqual([]);
});
