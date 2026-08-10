/**
 * scripts/lib/bundle-size.mjs
 *
 * JS bundle-size budget gate for the Vite build output (dist/assets/*.js).
 * Must run AFTER `vite build` has produced a fresh dist/ — reads file sizes
 * on disk, does not build anything itself.
 *
 * Two things are measured (uncompressed, on-disk JS — gzip is smaller but
 * this stays honest about what actually ships):
 *   - Largest single chunk: WARN > 500 KB, FAIL > 900 KB. Vite's own build
 *     already warns at 500 KB (build.chunkSizeWarningLimit default) — this
 *     gate turns "some chunk is big" into an enforceable number, and adds a
 *     hard fail ceiling Vite doesn't have on its own.
 *   - Total JS across all chunks: WARN > 2 MB, FAIL > 4 MB, a coarser
 *     backstop against overall growth. Baseline measured: ~1.1 MB total,
 *     largest chunk ~709 KB (the index bundle).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const CHUNK_WARN_BYTES = 500 * 1024;
const CHUNK_FAIL_BYTES = 900 * 1024;
const TOTAL_WARN_BYTES = 2 * 1024 * 1024;
const TOTAL_FAIL_BYTES = 4 * 1024 * 1024;

function fmtKB(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * @param {string} root — project root (contains dist/)
 * @returns {{
 *   status: 'pass'|'warn'|'fail',
 *   totalBytes: number,
 *   largestChunk: { file: string, bytes: number } | null,
 *   detail: string,
 * }}
 */
export function checkBundleSize(root) {
  const assetsDir = path.join(root, 'dist', 'assets');

  if (!existsSync(assetsDir)) {
    return {
      status: 'fail',
      totalBytes: 0,
      largestChunk: null,
      detail: 'dist/assets not found — run `vite build` before this gate',
    };
  }

  const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
  if (jsFiles.length === 0) {
    return {
      status: 'fail',
      totalBytes: 0,
      largestChunk: null,
      detail: 'no .js files found in dist/assets — build output looks empty/broken',
    };
  }

  let totalBytes = 0;
  let largestChunk = { file: '', bytes: 0 };
  for (const f of jsFiles) {
    const bytes = statSync(path.join(assetsDir, f)).size;
    totalBytes += bytes;
    if (bytes > largestChunk.bytes) largestChunk = { file: f, bytes };
  }

  const reasons = [];
  let status = 'pass';

  if (largestChunk.bytes > CHUNK_FAIL_BYTES) {
    reasons.push(`largest chunk ${largestChunk.file} (${fmtKB(largestChunk.bytes)}) exceeds the ${fmtKB(CHUNK_FAIL_BYTES)} budget`);
    status = 'fail';
  } else if (largestChunk.bytes > CHUNK_WARN_BYTES) {
    reasons.push(`largest chunk ${largestChunk.file} (${fmtKB(largestChunk.bytes)}) exceeds the ${fmtKB(CHUNK_WARN_BYTES)} warn threshold`);
    if (status === 'pass') status = 'warn';
  }

  if (totalBytes > TOTAL_FAIL_BYTES) {
    reasons.push(`total JS ${fmtKB(totalBytes)} exceeds the ${fmtKB(TOTAL_FAIL_BYTES)} budget`);
    status = 'fail';
  } else if (totalBytes > TOTAL_WARN_BYTES) {
    reasons.push(`total JS ${fmtKB(totalBytes)} exceeds the ${fmtKB(TOTAL_WARN_BYTES)} warn threshold`);
    if (status === 'pass') status = 'warn';
  }

  const detail =
    reasons.length > 0
      ? reasons.join('; ')
      : `largest chunk ${fmtKB(largestChunk.bytes)} (${largestChunk.file}) / total JS ${fmtKB(totalBytes)} — within budget`;

  return { status, totalBytes, largestChunk, detail };
}
