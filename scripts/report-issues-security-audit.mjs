#!/usr/bin/env node
/**
 * report-issues-security-audit.mjs
 *
 * The Report Issue feature (src/api/reportIssues.ts) talks to S3 directly from the
 * BROWSER, which means its AWS credentials ship inside the public Vite bundle —
 * anyone can extract them via devtools/view-source. That's an accepted tradeoff of
 * "no backend" for this feature, but it makes the credential's ACTUAL permission
 * scope a real security boundary, not just an implementation detail.
 *
 * This script empirically probes what the embedded key can actually do (IAM policies
 * aren't readable with this key — GetBucketCors/GetPublicAccessBlock/ListUserPolicies
 * all 403, confirmed by hand) and fails loudly if it can reach beyond report-issues/*.
 *
 * KNOWN FINDING (as of this script's authoring): the key is over-scoped — it can
 * read/write the ENTIRE spacemarvel-content-scrum bucket (Finixy's blog, SpaceMarvel's
 * blog, changelogs, pricing, personal-b2c), not just report-issues/*. That's a real
 * defacement/data-leak risk now that the key is public. Re-run this after tightening
 * the IAM policy (scope it to Resource: arn:aws:s3:::spacemarvel-content-scrum/report-issues/*)
 * to confirm the fix — every "should be DENIED" check below should then flip to PASS.
 *
 * Run: npm run audit:bucket-security
 */
import {
  S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, GetBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { loadReportIssuesEnv } from './lib/loadReportIssuesEnv.mjs';

const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const ok = (s) => `${c.green}${s}${c.reset}`;
const bad = (s) => `${c.red}${s}${c.reset}`;
const warn = (s) => `${c.yellow}${s}${c.reset}`;
const dim = (s) => `${c.dim}${s}${c.reset}`;

const { bucket: BUCKET, region: REGION, accessKeyId, secretAccessKey } = loadReportIssuesEnv();
const s3 = new S3Client({ region: REGION, credentials: { accessKeyId, secretAccessKey } });

const PROBE_STAMP = `_security-audit-probe-${Date.now()}.txt`;

async function canWrite(key) {
  // Always attempt cleanup, even if the write itself throws partway through.
  let wrote = false;
  try {
    await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: 'security-audit-probe — safe to delete', ContentType: 'text/plain' }));
    wrote = true;
  } catch {
    return false;
  } finally {
    if (wrote) {
      try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); } catch { /* best-effort cleanup */ }
    }
  }
  return true;
}

const findings = []; // { pass, severity: 'critical' | 'info', label, detail }

// 1. The feature NEEDS write access under report-issues/ — confirm it still has it.
{
  const wrote = await canWrite(`report-issues/${PROBE_STAMP}`);
  findings.push({
    pass: wrote,
    severity: wrote ? 'info' : 'critical',
    label: 'Write access to report-issues/* (required)',
    detail: wrote ? 'confirmed' : 'DENIED — the Report Issue feature will not work with this key at all',
  });
}

// 2. Blast-radius check: this key should NOT be able to touch anything else in the
//    shared content bucket. Each of these currently SUCCEEDS (confirmed by hand) —
//    that's the finding this script exists to catch and track.
const OTHER_PREFIXES = ['finixy-blog/', 'spacemarvel-blog/', 'spacemarvel-blog-posts/', 'Changelogs/', 'pricing/', 'personal-b2c/'];
for (const prefix of OTHER_PREFIXES) {
  const wrote = await canWrite(`${prefix}${PROBE_STAMP}`);
  findings.push({
    pass: !wrote,
    severity: wrote ? 'critical' : 'info',
    label: `Write access to ${prefix} (should be DENIED)`,
    detail: wrote
      ? 'ALLOWED — this key can overwrite/deface content here. Scope its IAM policy to report-issues/* only.'
      : 'denied, as expected',
  });
}

// 3. Bucket-root write (outside every known prefix) — should also be denied.
{
  const wrote = await canWrite(PROBE_STAMP);
  findings.push({
    pass: !wrote,
    severity: wrote ? 'critical' : 'info',
    label: 'Write access to bucket root (should be DENIED)',
    detail: wrote ? 'ALLOWED — this is bucket-wide access, not prefix-scoped.' : 'denied, as expected',
  });
}

// 4. Anonymous (no credentials at all) read — the bucket itself must not be public.
{
  let status = null;
  try {
    const resp = await fetch(`https://${BUCKET}.s3.${REGION}.amazonaws.com/report-issues/.keep`);
    status = resp.status;
  } catch { /* network error also counts as "not public" */ }
  const isPublic = status === 200;
  findings.push({
    pass: !isPublic,
    severity: isPublic ? 'critical' : 'info',
    label: 'Anonymous (unauthenticated) object read',
    detail: isPublic ? 'PUBLIC — objects are readable with zero credentials.' : `denied (HTTP ${status ?? 'network error'}), as expected`,
  });
}

// 5. CORS — informational. This key can't read the bucket's CORS config (confirmed
//    403 by hand), so this is verified out-of-band via a raw OPTIONS preflight instead.
{
  try {
    const resp = await s3.send(new GetBucketCorsCommand({ Bucket: BUCKET }));
    const origins = resp.CORSRules?.flatMap((r) => r.AllowedOrigins || []) ?? [];
    findings.push({ pass: true, severity: 'info', label: 'Bucket CORS config', detail: `origins: ${origins.join(', ') || '(none)'}` });
  } catch (e) {
    findings.push({
      pass: true, severity: 'info', label: 'Bucket CORS config',
      detail: `not readable with this key (${e.name}) — verify separately with a raw OPTIONS preflight against https://${BUCKET}.s3.${REGION}.amazonaws.com`,
    });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
const line = '═'.repeat(70);
console.log(`\n${c.bold}${c.cyan}${line}${c.reset}`);
console.log(`${c.bold}  REPORT-ISSUES S3 CREDENTIAL — SECURITY AUDIT${c.reset}`);
console.log(`  ${dim(`bucket: ${BUCKET}  region: ${REGION}`)}`);
console.log(`${c.cyan}${line}${c.reset}`);

const criticalFails = findings.filter((f) => !f.pass && f.severity === 'critical');
for (const f of findings) {
  const mark = f.pass ? ok('✓ PASS') : f.severity === 'critical' ? bad('✗ FAIL') : warn('· INFO');
  console.log(`  ${mark}  ${f.label}`);
  console.log(`         ${dim(f.detail)}`);
}

console.log(`${c.cyan}${line}${c.reset}`);
if (criticalFails.length === 0) {
  console.log(`  ${ok('✅ VERDICT: credential is correctly scoped to report-issues/* only.')}`);
} else {
  console.log(`  ${bad(`🛑 VERDICT: ${criticalFails.length} over-broad permission(s) found.`)}`);
  console.log(`  ${dim('This key ships inside the public JS bundle — anyone can extract it and use these')}`);
  console.log(`  ${dim('permissions. Scope the IAM policy to Resource: arn:aws:s3:::' + BUCKET + '/report-issues/* and re-run.')}`);
}
console.log(`${c.bold}${c.cyan}${line}${c.reset}\n`);

process.exit(criticalFails.length === 0 ? 0 : 1);
