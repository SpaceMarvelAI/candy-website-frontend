#!/usr/bin/env node
/**
 * npm audit, with ONE accepted, documented exception — shared by `npm run audit`
 * and predeploy-check.mjs so deploy-prod.sh, CI, and local runs all agree.
 *
 * GHSA-qwww-vcr4-c8h2 (react-router CSRF in RSC/Framework Mode action handling)
 * is a known, verified-non-applicable finding:
 *   - No fixed version exists yet in the flagged range (>=7.12.0 <8.3.0) as of
 *     2026-07-26 (checked when this exception was added — see git blame on
 *     deploy-prod.sh's matching gate for the original investigation).
 *   - The suggested automated fix (downgrade to 7.11.0) was tested and found to
 *     REINTRODUCE 14+ other real, already-patched high-severity vulnerabilities —
 *     strictly worse than the finding it silences.
 *   - The advisory itself only affects Framework Mode/RSC/Server Actions. This
 *     app uses HashRouter (Declarative Mode), which is explicitly NOT affected.
 *
 * Any OTHER high/critical finding still fails this script — this only ignores
 * this one specific, named advisory ID.
 */
import { spawnSync } from 'node:child_process';

const ACCEPTED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
]);

const r = spawnSync('npm', ['audit', '--audit-level=high', '--json'], { encoding: 'utf8' });

let report;
try {
  report = JSON.parse(r.stdout);
} catch {
  console.error(r.stdout);
  console.error(r.stderr);
  console.error('npm audit output could not be parsed — investigate manually before deploying.');
  process.exit(1);
}

const otherFindings = [];
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object') continue; // a bare string `via` is just a dependency name, not a finding
    const id = via.url || via.title || 'unknown advisory';
    if (!ACCEPTED_ADVISORIES.has(via.url)) otherFindings.push(`${vuln.name}: ${id} (${via.severity})`);
  }
}

if (otherFindings.length > 0) {
  console.error('New high/critical vulnerabilities found (beyond the accepted GHSA-qwww-vcr4-c8h2 exception):');
  for (const f of [...new Set(otherFindings)]) console.error(`  - ${f}`);
  console.error('\nInvestigate before deploying — do not add these to the accepted-exception list without the same scrutiny GHSA-qwww-vcr4-c8h2 got.');
  process.exit(1);
}

console.log('✓ 0 vulnerabilities (beyond the accepted, verified-non-applicable GHSA-qwww-vcr4-c8h2 exception).');
process.exit(0);
