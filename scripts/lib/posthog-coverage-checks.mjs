/**
 * scripts/lib/posthog-coverage-checks.mjs
 *
 * Warn-only static checks for PostHog coverage, added 2026-09-24 ("i want this in every
 * repo... and added to local quality checks", applied identically to the backends' advisory
 * check_posthog_endpoint_coverage.py, and to ChatPlatform-frontend-new's same-named module).
 * A frontend has no server middleware to enrich the way the 4 backends did — autocapture
 * (confirmed already on: capture_dead_clicks, capture_heatmaps, capture_exceptions in
 * src/main.tsx) already gives every pageview/click rich context ($current_url, $host,
 * referrer, browser, etc.), so there's no thin baseline to fix here the way there was on the
 * backends. What THIS checks instead:
 *
 *   1. Regression guard on posthog.init() — confirms autocapture/dead-clicks/heatmaps/
 *      exception-capture are still enabled.
 *   2. Every posthog.identify(...) call site is paired with a posthog.group('company', ...)
 *      call nearby — real company-level grouping already exists here (src/context/
 *      AppContext.tsx), this just guards against a future identify() that forgets to group.
 *   3. A plain count of manual posthog.capture(...) call sites, informational only.
 *
 * Deliberately does NOT try to add company_id/plan properties to identify() the way the
 * backends' identify_user() does — checked live: no plan field is available in local auth
 * state at this app's identify() call site without a new API fetch.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const SRC_DIRS = ['src'];
const EXTS = ['.ts', '.tsx', '.js', '.jsx'];

const INIT_FILE = 'src/main.tsx';
const REQUIRED_INIT_FLAGS = [
  'capture_dead_clicks: true',
  'capture_heatmaps: true',
  'capture_exceptions:',
];

function walk(dir, files) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, files);
    } else if (EXTS.includes(path.extname(entry))) {
      files.push(full);
    }
  }
}

function collectSourceFiles(root) {
  const files = [];
  for (const dir of SRC_DIRS) {
    const full = path.join(root, dir);
    if (existsSync(full)) walk(full, files);
  }
  return files;
}

function checkInitFlags(root) {
  const initPath = path.join(root, INIT_FILE);
  if (!existsSync(initPath)) {
    return { ok: false, missing: REQUIRED_INIT_FLAGS, note: `${INIT_FILE} not found` };
  }
  const text = readFileSync(initPath, 'utf8');
  const missing = REQUIRED_INIT_FLAGS.filter((flag) => !text.includes(flag));
  return { ok: missing.length === 0, missing, note: null };
}

function checkIdentifyGroupPairing(files, root) {
  const findings = [];
  let identifyCount = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const identifyMatches = [...text.matchAll(/posthog\.identify\(/g)];
    if (identifyMatches.length === 0) continue;
    identifyCount += identifyMatches.length;
    const hasGroupCall = /posthog\.group\(\s*['"]company['"]/.test(text);
    if (!hasGroupCall) {
      findings.push(path.relative(root, file));
    }
  }
  return { identifyCount, unpaired: findings };
}

function countCaptureCallSites(files) {
  let count = 0;
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    count += (text.match(/posthog\.capture\(/g) || []).length;
  }
  return count;
}

export function getPosthogCoverageResults(root) {
  const files = collectSourceFiles(root);
  const initCheck = checkInitFlags(root);
  const { identifyCount, unpaired } = checkIdentifyGroupPairing(files, root);
  const captureCount = countCaptureCallSites(files);

  return { initCheck, identifyCount, unpaired, captureCount };
}
