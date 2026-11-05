#!/usr/bin/env node
/**
 * scripts/run-lighthouse.mjs
 *
 * Real Lighthouse (headless Chrome) run against a deployed URL — LCP/CLS/INP(proxy)/
 * performance score. Added 2026-11-05, same design as ChatPlatform-frontend-new's
 * script of the same name. Runs post-deploy (nothing to check before a deploy exists).
 *
 * Prints ONE line of machine-parseable output on success:
 *   LIGHTHOUSE_RESULT lcp_ms=1850 cls=0.05 inp_ms=180 performance_score=94
 * so deploy-{dev,staging,prod}.sh can grab it with grep/awk and pass it straight through
 * to build_scorecard.py as --lcp-ms=/--cls=/--inp-ms=/--perf-score= flags. Never
 * fabricates a number — if Lighthouse itself fails or a metric is missing from its
 * report, this exits non-zero rather than printing a partial/guessed line.
 *
 * Usage:
 *   node scripts/run-lighthouse.mjs <url>
 *   node scripts/run-lighthouse.mjs https://candy.spacemarvel.ai
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/run-lighthouse.mjs <url>');
  process.exit(1);
}

const tmpDir = mkdtempSync(path.join(tmpdir(), 'lighthouse-'));
const outputPath = path.join(tmpDir, 'report.json');

try {
  execFileSync(
    'npx',
    [
      '--yes',
      'lighthouse',
      url,
      '--output=json',
      `--output-path=${outputPath}`,
      '--chrome-flags=--headless --no-sandbox --disable-gpu',
      '--only-categories=performance',
      '--quiet',
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );

  const report = JSON.parse(readFileSync(outputPath, 'utf8'));
  const audits = report.audits;

  const lcpMs = audits['largest-contentful-paint']?.numericValue;
  const cls = audits['cumulative-layout-shift']?.numericValue;
  // Lighthouse's lab-only INP proxy is Total Blocking Time (TBT) — real INP needs field
  // data (a real user's actual interactions). Recorded under the inp_ms key for schema
  // consistency, with this substitution called out rather than presented as true INP.
  const inpMs = audits['total-blocking-time']?.numericValue;
  const perfScore = report.categories?.performance?.score;

  if (lcpMs == null || cls == null || inpMs == null || perfScore == null) {
    console.error('Lighthouse report is missing one or more expected audits — not printing a partial result.');
    process.exit(1);
  }

  console.log(
    `LIGHTHOUSE_RESULT lcp_ms=${Math.round(lcpMs)} cls=${cls.toFixed(3)} inp_ms=${Math.round(inpMs)} performance_score=${Math.round(perfScore * 100)}`,
  );
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
