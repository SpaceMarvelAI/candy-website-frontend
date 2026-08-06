#!/usr/bin/env node
/**
 * scripts/check-audit.mjs
 *
 * npm audit gate with one scoped, documented exception.
 *
 * GHSA-qwww-vcr4-c8h2 (react-router CSRF bypass in RSC Mode / Framework Mode
 * server actions) is accepted as non-applicable: this app uses HashRouter
 * (Declarative Mode, src/main.tsx) — no RSC, no server actions, no framework
 * mode anywhere in the codebase. No fixed release exists yet in the flagged
 * range (7.12.0-8.2.0, which is every current release including latest,
 * checked 2026-08-06). The suggested automated fix (downgrade to 7.11.0) was
 * tested during the equivalent deploy-prod.sh gate (commit ef5ac29) and found
 * to reintroduce 14+ other real, already-patched high-severity vulnerabilities
 * — rejected as strictly worse.
 *
 * Any OTHER finding at/above the configured level still fails this gate. This
 * mirrors the logic already in deploy-prod.sh, extracted so buildspec.yml and
 * every deploy script share one implementation instead of three copies.
 *
 * Usage: node scripts/check-audit.mjs [--audit-level=moderate]
 * Exit code: 0 = clean (or only the accepted exception), 1 = new finding(s).
 */
import { spawnSync } from 'node:child_process';

const ACCEPTED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-qwww-vcr4-c8h2',
]);

const levelArg = process.argv.find((a) => a.startsWith('--audit-level='));
const level = levelArg ? levelArg.split('=')[1] : 'moderate';

const result = spawnSync('npm', ['audit', `--audit-level=${level}`, '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error('npm audit output could not be parsed as JSON — investigate manually.');
  console.error(result.stdout || result.stderr);
  process.exit(1);
}

const unaccepted = [];
for (const vuln of Object.values(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object') continue; // string entries are just dependency names
    const url = via.url ?? '';
    if (!ACCEPTED_ADVISORIES.has(url)) {
      unaccepted.push({ package: vuln.name, severity: vuln.severity, title: via.title, url });
    }
  }
}

if (unaccepted.length > 0) {
  console.error(`Found ${unaccepted.length} vulnerability finding(s) not covered by an accepted exception:\n`);
  for (const f of unaccepted) {
    console.error(`  [${f.severity}] ${f.package} — ${f.title}\n    ${f.url}`);
  }
  process.exit(1);
}

const totalFindings = Object.keys(report.vulnerabilities ?? {}).length;
if (totalFindings > 0) {
  console.log(
    `npm audit: ${totalFindings} finding(s), all covered by the accepted GHSA-qwww-vcr4-c8h2 exception (react-router RSC-mode CSRF — not applicable, this app uses HashRouter).`,
  );
} else {
  console.log('npm audit: no vulnerabilities found.');
}
process.exit(0);
