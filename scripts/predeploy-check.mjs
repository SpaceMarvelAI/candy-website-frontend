#!/usr/bin/env node
/**
 * predeploy-check orchestrator.
 *
 * Runs all deployment gates, collects the results of ALL of them (it does not
 * stop at the first failure — we want a complete picture), then prints a
 * single summary report with a SAFE / NOT SAFE verdict.
 *
 *   1. Type safety   — tsc --noEmit
 *   2. Test suite    — vitest run --coverage  (writes coverage-summary.json)
 *   3. Build         — vite build
 *   4. Bundle size   — scripts/lib/bundle-size.mjs (reads dist/assets/ after
 *      the build gate)
 *   5. Smoke test    — npm run test:smoke   (Playwright, boots the dev server)
 *   6. E2E test      — npm run test:e2e     (Playwright, core user flows)
 *   7. NPM audit     — scripts/check-audit.mjs (one documented exception, see that file)
 *   8. Bucket audit  — npm run audit:bucket-security  (S3 credential blast-radius check)
 *
 * Exit code: 0 when safe to deploy, 1 when any hard gate fails.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { checkBundleSize } from './lib/bundle-size.mjs';

// ── ANSI helpers ──────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  cyan: '\x1b[36m', gray: '\x1b[90m',
};
const ok   = (s) => `${c.green}${s}${c.reset}`;
const bad  = (s) => `${c.red}${s}${c.reset}`;
const warn = (s) => `${c.yellow}${s}${c.reset}`;
const dim  = (s) => `${c.dim}${s}${c.reset}`;

const RESULTS_DIR = '.predeploy';
const TEST_JSON   = `${RESULTS_DIR}/test-results.json`;
const COV_JSON    = 'coverage/coverage-summary.json';
const COVERAGE_TARGET = 90; // % lines — below this is a warning, not a blocker

// Composite-score → letter-grade bands (used for the deployment grade).
function gradeFor(score) {
  if (score >= 95) return { letter: 'A+', label: 'Exceptional' };
  if (score >= 90) return { letter: 'A',  label: 'Excellent' };
  if (score >= 85) return { letter: 'A-', label: 'Very good' };
  if (score >= 80) return { letter: 'B+', label: 'Good' };
  if (score >= 70) return { letter: 'B',  label: 'Solid' };
  if (score >= 60) return { letter: 'C',  label: 'Acceptable' };
  if (score >= 50) return { letter: 'D',  label: 'Weak' };
  return { letter: 'E', label: 'Poor' };
}

function run(label, cmd) {
  process.stdout.write(`${c.cyan}▶${c.reset} ${label}…\n`);
  // shell: true is required because every caller passes a single command
  // STRING with flags (e.g. 'vitest run --coverage ...'), which spawnSync
  // can only parse via a shell. Not a shell-injection risk: every call site
  // below passes a hardcoded literal string, never external/user input.
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8' }); // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
  return { code: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}

// Ensure a clean results dir.
if (existsSync(RESULTS_DIR)) rmSync(RESULTS_DIR, { recursive: true, force: true });
mkdirSync(RESULTS_DIR, { recursive: true });

const report = { warnings: [] };

// ── 1. Type safety ────────────────────────────────────────────────────────────
{
  const r = run('[1/8] Type-checking (tsc --noEmit)', 'tsc --noEmit');
  const out = r.stdout + r.stderr;
  const errors = (out.match(/error TS\d+/g) || []).length;
  report.types = { pass: r.code === 0, errors, raw: out.trim() };
}

// ── 2. Test suite + coverage ───────────────────────────────────────────────────
{
  const r = run(
    '[2/8] Running tests + coverage (vitest run --coverage)',
    `vitest run --coverage --reporter=json --outputFile=${TEST_JSON}`
  );
  let total = 0, passed = 0, failed = 0, suites = 0, runOk = false;
  try {
    const j = JSON.parse(readFileSync(TEST_JSON, 'utf8'));
    total   = j.numTotalTests ?? 0;
    passed  = j.numPassedTests ?? 0;
    failed  = j.numFailedTests ?? 0;
    suites  = j.testResults?.length ?? j.numTotalTestSuites ?? 0;
    runOk   = j.success === true && failed === 0;
  } catch {
    // JSON missing → the run crashed before writing results.
    runOk = false;
  }
  // Fall back to exit code if JSON parse failed.
  const pass = runOk && r.code === 0 ? true : (failed === 0 && r.code === 0);
  report.tests = { pass: failed === 0 && (runOk || r.code === 0), total, passed, failed, suites };
}

// ── Coverage numbers ────────────────────────────────────────────────────────────
{
  try {
    const cov = JSON.parse(readFileSync(COV_JSON, 'utf8')).total;
    report.coverage = {
      lines:     cov.lines.pct,
      functions: cov.functions.pct,
      branches:  cov.branches.pct,
      statements: cov.statements.pct,
    };
    if (cov.lines.pct < COVERAGE_TARGET) {
      report.warnings.push(
        `Line coverage ${cov.lines.pct}% is below the ${COVERAGE_TARGET}% target — add tests for untested modules.`
      );
    }
  } catch {
    report.coverage = null;
    report.warnings.push('Coverage report not found — coverage numbers unavailable.');
  }
}

// ── 3. Production build ───────────────────────────────────────────────────────────
{
  const r = run('[3/8] Production build (vite build)', 'vite build');
  const out = r.stdout + r.stderr;
  const modules = Number((out.match(/(\d+)\s+modules transformed/) || [])[1] || 0);
  const buildWarnings = (out.match(/\(!\)|\bwarning\b/gi) || []).length;
  if (buildWarnings > 0) {
    report.warnings.push(`Build emitted ${buildWarnings} warning(s) — review the build output above.`);
  }
  report.build = { pass: r.code === 0, modules };
}

// ── 4. Bundle size budget ────────────────────────────────────────────────────────
// Runs after the build gate — reads the dist/assets/ output that build just produced.
{
  process.stdout.write(`${c.cyan}▶${c.reset} [4/8] Bundle size budget (dist/assets/*.js)…\n`);
  const bundle = checkBundleSize(process.cwd());
  if (bundle.status === 'warn') {
    report.warnings.push(`Bundle size: ${bundle.detail}`);
  }
  report.bundle = { pass: bundle.status !== 'fail', status: bundle.status, detail: bundle.detail };
}

// ── 5. Smoke test (Playwright) ──────────────────────────────────────────────────
{
  const r = run('[5/8] Smoke test (npm run test:smoke)', 'npm run test:smoke');
  const out = r.stdout + r.stderr;
  const passedMatch = out.match(/(\d+)\s+passed/);
  const failedMatch = out.match(/(\d+)\s+failed/);
  report.smoke = {
    pass: r.code === 0,
    passed: Number(passedMatch?.[1] || 0),
    failed: Number(failedMatch?.[1] || 0),
  };
}

// ── 6. E2E test (Playwright) ────────────────────────────────────────────────────
{
  const r = run('[6/8] E2E test (npm run test:e2e)', 'npm run test:e2e');
  const out = r.stdout + r.stderr;
  const passedMatch = out.match(/(\d+)\s+passed/);
  const failedMatch = out.match(/(\d+)\s+failed/);
  report.e2e = {
    pass: r.code === 0,
    passed: Number(passedMatch?.[1] || 0),
    failed: Number(failedMatch?.[1] || 0),
  };
}

// ── 7. NPM audit (dependency vulnerabilities) ───────────────────────────────────
{
  const r = run('[7/8] NPM audit (scripts/check-audit.mjs)', 'node scripts/check-audit.mjs --audit-level=moderate');
  const out = r.stdout + r.stderr;
  const unacceptedMatch = out.match(/Found (\d+) vulnerability finding/i);
  report.npmAudit = {
    pass: r.code === 0,
    unaccepted: Number(unacceptedMatch?.[1] || 0),
  };
}

// ── 8. S3 bucket credential audit ───────────────────────────────────────────────
{
  const r = run('[8/8] Bucket security (npm run audit:bucket-security)', 'npm run audit:bucket-security');
  const out = r.stdout + r.stderr;
  const overBroadMatch = out.match(/VERDICT:\s*(\d+)\s+over-broad permission/i);
  report.bucketAudit = {
    pass: r.code === 0,
    overBroad: Number(overBroadMatch?.[1] || 0),
  };
}

// ── Grade ───────────────────────────────────────────────────────────────────
// Composite score (0-100): gates are pass/fail signals, coverage is the
// graded dimension. Each failed hard gate is a heavy penalty.
const hardFail = !report.types.pass || !report.tests.pass || !report.build.pass || !report.bundle.pass
  || !report.smoke.pass || !report.e2e.pass || !report.npmAudit.pass || !report.bucketAudit.pass;
let grade, score;
if (hardFail) {
  grade = { letter: 'F', label: 'Not deployable' };
  score = 0;
} else if (report.coverage) {
  const cov = report.coverage;
  // Weighted blend of the four coverage dimensions, lines weighted highest.
  score = Math.round(
    cov.lines * 0.4 + cov.statements * 0.2 + cov.functions * 0.2 + cov.branches * 0.2
  );
  grade = gradeFor(score);
} else {
  // Gates pass but no coverage data — cap the grade since we can't measure it.
  score = null;
  grade = { letter: 'B-', label: 'Gates pass, coverage unknown' };
}

// ── Verdict ───────────────────────────────────────────────────────────────────
const line = '═'.repeat(60);
const sub  = '─'.repeat(60);
const mark = (b) => (b ? ok('✓ PASS') : bad('✗ FAIL'));
const pct  = (n) => (n == null ? dim('  n/a') : `${n >= COVERAGE_TARGET ? ok(n + '%') : warn(n + '%')}`);

console.log(`\n${c.bold}${c.cyan}${line}${c.reset}`);
console.log(`${c.bold}  PREDEPLOY CHECK SUMMARY${c.reset}`);
console.log(`${c.cyan}${line}${c.reset}`);

console.log(`  1. Type Safety  (tsc)      ${mark(report.types.pass)}   ${dim(report.types.errors + ' type error(s)')}`);
console.log(`  2. Test Suite   (vitest)   ${mark(report.tests.pass)}   ${dim(`${report.tests.passed}/${report.tests.total} passed across ${report.tests.suites} file(s)`)}`);
if (report.tests.failed > 0) console.log(`     ${bad(`${report.tests.failed} test(s) failing`)}`);
console.log(`  3. Build        (vite)     ${mark(report.build.pass)}   ${dim(report.build.modules + ' modules transformed')}`);
console.log(`  4. Bundle Size  (dist/)    ${mark(report.bundle.pass)}   ${dim(report.bundle.detail)}`);
console.log(`  5. Smoke Test   (e2e)      ${mark(report.smoke.pass)}   ${dim(`${report.smoke.passed} passed, ${report.smoke.failed} failed`)}`);
console.log(`  6. E2E Test     (e2e)      ${mark(report.e2e.pass)}   ${dim(`${report.e2e.passed} passed, ${report.e2e.failed} failed`)}`);
console.log(`  7. NPM Audit    (deps)     ${mark(report.npmAudit.pass)}   ${dim(report.npmAudit.pass ? '0 vulnerabilities' : `${report.npmAudit.unaccepted} unaccepted high/critical vuln(s)`)}`);
console.log(`  8. Bucket Audit (S3 creds) ${mark(report.bucketAudit.pass)}   ${dim(report.bucketAudit.pass ? 'credential correctly scoped' : `${report.bucketAudit.overBroad} over-broad permission(s)`)}`);

console.log(sub);
console.log(`  ${c.bold}Coverage${c.reset} ${dim(`(target ${COVERAGE_TARGET}% lines)`)}`);
console.log(`     Lines:      ${pct(report.coverage?.lines)}`);
console.log(`     Functions:  ${pct(report.coverage?.functions)}`);
console.log(`     Branches:   ${pct(report.coverage?.branches)}`);
console.log(`     Statements: ${pct(report.coverage?.statements)}`);

console.log(sub);
if (report.warnings.length === 0) {
  console.log(`  ${c.bold}Warnings${c.reset}     ${ok('none')}`);
} else {
  console.log(`  ${c.bold}Warnings${c.reset}     ${warn(report.warnings.length + ' issue(s)')}`);
  report.warnings.forEach((w) => console.log(`     ${warn('•')} ${w}`));
}

// ── Grade ────────────────────────────────────────────────────────────────────
console.log(sub);
const gradeColor = grade.letter.startsWith('A') ? ok
  : grade.letter.startsWith('B') ? ok
  : grade.letter === 'C' ? warn
  : bad;
const scoreText = score == null ? '' : dim(`  (score ${score}/100)`);
console.log(`  ${c.bold}Deployment Grade${c.reset}   ${c.bold}${gradeColor(grade.letter)}${c.reset} ${dim('· ' + grade.label)}${scoreText}`);

console.log(`${c.cyan}${line}${c.reset}`);
if (hardFail) {
  const broken = [
    !report.types.pass && 'type errors',
    !report.tests.pass && 'failing tests',
    !report.build.pass && 'build failure',
    !report.bundle.pass && 'bundle size over budget',
    !report.smoke.pass && 'smoke test failure',
    !report.e2e.pass && 'e2e test failure',
    !report.npmAudit.pass && 'npm audit findings',
    !report.bucketAudit.pass && 'bucket credential over-scoped',
  ].filter(Boolean).join(', ');
  console.log(`  ${c.bold}VERDICT: ${bad('🛑 NOT SAFE TO DEPLOY')}${c.reset}`);
  console.log(`  ${dim('Blocked by: ' + broken)}`);
} else if (report.warnings.length > 0) {
  console.log(`  ${c.bold}VERDICT: ${warn('⚠️  SAFE TO DEPLOY — with warnings')}${c.reset}`);
  console.log(`  ${dim('All hard gates pass. Review warnings above before shipping.')}`);
} else {
  console.log(`  ${c.bold}VERDICT: ${ok('✅ SAFE TO DEPLOY')}${c.reset}`);
  console.log(`  ${dim('Types clean · all tests pass · build succeeded.')}`);
}
console.log(`${c.bold}${c.cyan}${line}${c.reset}\n`);

process.exit(hardFail ? 1 : 0);
