#!/usr/bin/env node
/**
 * scripts/check-audit.mjs
 *
 * npm audit gate with scoped, documented exceptions (see ACCEPTED_ADVISORIES).
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
  // 2026-10-06: two DOMPurify lows — no fixed release exists (npm reports fix:
  // None). This app never imports DOMPurify directly (only transitively via
  // posthog-js's product-tours bundles); both CVEs require explicit IN_PLACE
  // opt-in plus attacker-influenced hooks, which nothing here configures.
  // Severity low; accepted until an upstream patch lands.
  'https://github.com/advisories/GHSA-p98j-92pf-mc4p',
  'https://github.com/advisories/GHSA-6688-9rhm-gjv2',
  // 2026-10-06: source-map-js high (event-loop DoS via crafted source-map
  // offsets) — no fixed release exists (fix: None). Dev/build-time only
  // (@vitest/coverage-v8, jsdom, vite/postcss chain): never ships to browsers
  // and only ever processes this repo's own build output, never untrusted
  // input. Accepted until upstream ships a patch.
  'https://github.com/advisories/GHSA-68fv-2mgg-jv7q',
]);

const levelArg = process.argv.find((a) => a.startsWith('--audit-level='));
const level = levelArg ? levelArg.split('=')[1] : 'moderate';

// nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true -- shell only on win32, fixed argv
const result = spawnSync('npm', ['audit', `--audit-level=${level}`, '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
  // Windows resolves `npm` as npm.cmd, which spawnSync can only exec through
  // a shell — without this it fails with ENOENT before npm ever runs. Other
  // platforms exec npm directly, no shell.
  shell: process.platform === 'win32',
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
