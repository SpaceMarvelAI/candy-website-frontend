/**
 * Core-flow e2e suite — turns what was manually verified with ad-hoc scripts
 * during development into a real, repeatable test: seeded sign-in, dashboard
 * render, sidebar navigation, and the full Report Issue flow (list → create
 * → appears → Issue Details stacked panel → image lightbox).
 *
 * Uses a RESERVED test user_id (never a real signed-in user) so it can never
 * show up in any real user's "Reported Issues" list even if cleanup fails,
 * and cleans up its own S3 objects in afterEach regardless of pass/fail.
 */
import { test, expect } from '@playwright/test';
import {
  S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { loadReportIssuesEnv } from '../../scripts/lib/loadReportIssuesEnv.mjs';

const SEEDED_USER = {
  user_id: '00000000-0000-0000-0000-e2ec0f10ec00',
  email: 'e2e-core-flows@candy.internal',
  full_name: 'E2E Core Flows',
  role: 'owner',
  company_id: '00000000-0000-0000-0000-e2ec0f10ec01',
  company_name: 'E2E Core Flows Co',
};

const { bucket: BUCKET, region: REGION, accessKeyId, secretAccessKey } = loadReportIssuesEnv();
const s3 = new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });

async function deleteTicketsForTestUser() {
  const resp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: 'report-issues/' }));
  const issueKeys = (resp.Contents ?? []).map((o) => o.Key!).filter((k) => k.endsWith('/issue.json'));
  for (const key of issueKeys) {
    try {
      const resp2 = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
      const body = await resp2.Body!.transformToString();
      const data = JSON.parse(body);
      if (data.client_context?.user_id !== SEEDED_USER.user_id) continue;
      const ticketId = data.id as string;
      const prefixResp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `report-issues/${ticketId}/` }));
      for (const obj of prefixResp.Contents ?? []) {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key! }));
      }
    } catch {
      // best-effort cleanup — don't fail the test run over a cleanup hiccup
    }
  }
}

test.beforeEach(async ({ context }) => {
  await context.addInitScript((user) => {
    localStorage.setItem('access_token', 'fake-e2e-token-not-verified-by-backend');
    localStorage.setItem('candy.user', JSON.stringify(user));
  }, SEEDED_USER);
});

test.afterEach(async () => {
  await deleteTicketsForTestUser();
});

test('sign-in, dashboard, sidebar navigation', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Healthcare Domain', { exact: false })).toBeVisible({ timeout: 15_000 });

  // Sidebar nav to a page with no live-backend dependency, and back.
  // (Nav items are <button>s, not <a> — no client-side link semantics here.)
  await page.getByRole('button', { name: 'Connectors' }).click();
  await expect(page).toHaveURL(/\/connects/);

  await page.goto('/dashboard');
  await expect(page.getByText('Healthcare Domain', { exact: false })).toBeVisible();
});

test('Report Issue: create, list, detail panel, image lightbox', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Healthcare Domain', { exact: false })).toBeVisible({ timeout: 15_000 });

  // Open profile menu → Help → Report issue
  await page.getByText(SEEDED_USER.email).click();
  const helpBtn = page.getByRole('button', { name: 'Help' });
  await expect(helpBtn).toBeVisible();
  await helpBtn.click();
  const reportIssueBtn = page.getByRole('button', { name: 'Report issue' });
  await expect(reportIssueBtn).toBeVisible();
  await reportIssueBtn.click();

  await expect(page.getByText('Reported Issues')).toBeVisible();
  await expect(page.getByText('No issues reported yet.')).toBeVisible({ timeout: 15_000 });

  // New Report
  await page.getByRole('button', { name: 'New Report' }).click();
  await expect(page.getByText('Report an Issue')).toBeVisible();

  const title = `E2E core-flows ${Date.now()}`;
  await page.getByPlaceholder('Brief summary of the issue').fill(title);
  await page.getByPlaceholder(/What happened/).fill('Created by the automated core-flows e2e test. Self-cleaning.');

  // Attach a tiny generated PNG via the hidden file input.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  await page.locator('input[type=file]').setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer: png });

  await page.getByRole('button', { name: 'Submit Report' }).click();
  await expect(page.getByText('Reported Issues')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByText('Candy', { exact: true }).first()).toBeVisible();

  // Open it → Issue Details stacked panel (list stays visible behind it)
  await page.getByText(title).click();
  await expect(page.getByText('Issue Details')).toBeVisible();
  await expect(page.getByText('Reported Issues')).toBeVisible(); // still there, underneath

  // Open the attachment → in-page lightbox, same tab. Scoped to the Issue Details
  // panel itself — an unscoped `button:has(img)` also matches sidebar product nav
  // buttons (Meta Space/Finixy icons), which sit earlier in the DOM and win .first().
  const issueDetailPanel = page.locator('#issue-detail-backdrop');
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 1000 }).catch(() => null),
    issueDetailPanel.locator('button:has(img)').first().click(),
  ]);
  expect(popup).toBeNull(); // must NOT open a new tab
  await expect(page.locator('#image-lightbox-backdrop')).toBeVisible({ timeout: 10_000 });

  // Close lightbox → back → Issue Details closes → list still open
  await page.keyboard.press('Escape');
  await expect(page.locator('#image-lightbox-backdrop')).toBeHidden();
});
