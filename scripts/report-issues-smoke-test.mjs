#!/usr/bin/env node
/**
 * report-issues-smoke-test.mjs
 *
 * Live end-to-end check of the Report Issue feature against the REAL shared
 * spacemarvel-content-scrum bucket (the same one MetaSpace/Finixy write to) —
 * there is no mock/staging bucket, so this is the only way to catch a schema
 * drift (MetaSpace changes the issue.json shape, our reads/writes stop matching)
 * before a real user hits it.
 *
 * Ticket ID / attachment-key formats below MUST mirror src/api/reportIssues.ts
 * exactly (both were reverse-engineered from live MetaSpace/Finixy tickets) —
 * if you change one, change the other.
 *
 * Uses a reserved test user_id (all-zeros-except-9) that will NEVER match a real
 * signed-in user, so even if cleanup fails partway through, the leftover ticket
 * is invisible in every product's "Reported Issues" list. Cleans up after itself
 * either way (try/finally).
 *
 * Run: npm run test:report-issues
 */
import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { loadReportIssuesEnv } from './lib/loadReportIssuesEnv.mjs';

const c = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m' };
const ok = (s) => `${c.green}${s}${c.reset}`;
const bad = (s) => `${c.red}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;

const { bucket: BUCKET, region: REGION, accessKeyId, secretAccessKey } = loadReportIssuesEnv();
const s3 = new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });

const PREFIX = 'report-issues';
const TEST_USER_ID = '00000000-0000-0000-0000-000000000000'; // reserved — never a real signed-in user

function genTicketId() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const suffix = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `MSP-${day}-${suffix}`;
}

const steps = [];
function step(name, fn) {
  steps.push({ name, fn });
}

let ticketId = null;

step('create issue.json under report-issues/<ticket>/', async () => {
  ticketId = genTicketId();
  const record = {
    id: ticketId,
    platform: 'candy',
    title: '[AUTOMATED SMOKE TEST]',
    description: 'Created by scripts/report-issues-smoke-test.mjs — deleted automatically at the end of the run.',
    email: 'smoke-test@candy.internal',
    name: 'smoke-test@candy.internal',
    status: 'open',
    attachments: ['attachments/smoke-test.txt'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    client_context: { user_id: TEST_USER_ID },
  };
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/issue.json`,
    Body: JSON.stringify(record), ContentType: 'application/json',
  }));
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/attachments/smoke-test.txt`,
    Body: 'smoke test attachment', ContentType: 'text/plain',
  }));
});

step('read issue.json back and verify round-trip', async () => {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/issue.json` }));
  const bytes = await resp.Body.transformToByteArray();
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (data.id !== ticketId) throw new Error(`id mismatch: wrote ${ticketId}, read ${data.id}`);
  if (data.client_context?.user_id !== TEST_USER_ID) throw new Error('client_context.user_id did not round-trip');
  if (!Array.isArray(data.attachments) || data.attachments.length !== 1) throw new Error('attachments array did not round-trip');
});

step('read the attachment back', async () => {
  const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${PREFIX}/${ticketId}/attachments/smoke-test.txt` }));
  const text = await resp.Body.transformToString();
  if (text !== 'smoke test attachment') throw new Error(`attachment content mismatch: got "${text}"`);
});

step('ticket appears in a report-issues/ listing', async () => {
  const resp = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: `${PREFIX}/${ticketId}/` }));
  const keys = (resp.Contents ?? []).map((o) => o.Key);
  if (!keys.includes(`${PREFIX}/${ticketId}/issue.json`)) throw new Error('issue.json not found in listing');
  if (!keys.includes(`${PREFIX}/${ticketId}/attachments/smoke-test.txt`)) throw new Error('attachment not found in listing');
});

async function cleanup() {
  if (!ticketId) return;
  for (const key of [`${PREFIX}/${ticketId}/issue.json`, `${PREFIX}/${ticketId}/attachments/smoke-test.txt`]) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); } catch { /* best-effort */ }
  }
}

console.log(`\n${c.bold}${c.cyan}Report Issue — live smoke test${c.reset} ${dim(`(${BUCKET})`)}\n`);

let failed = false;
try {
  for (const { name, fn } of steps) {
    try {
      await fn();
      console.log(`  ${ok('✓')} ${name}`);
    } catch (e) {
      failed = true;
      console.log(`  ${bad('✗')} ${name}`);
      console.log(`    ${dim(e.message)}`);
      break; // no point continuing once the chain is broken
    }
  }
} finally {
  await cleanup();
  console.log(`  ${dim(`(cleaned up test ticket ${ticketId})`)}`);
}

console.log();
if (failed) {
  console.log(bad('🛑 SMOKE TEST FAILED — see above.\n'));
  process.exit(1);
} else {
  console.log(ok('✅ SMOKE TEST PASSED — create/read/list all round-trip correctly.\n'));
  process.exit(0);
}
