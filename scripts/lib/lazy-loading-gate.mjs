/**
 * scripts/lib/lazy-loading-gate.mjs
 *
 * Lazy-loading regression gate for checklist item 1.2 ("Routes and heavy
 * components are lazy-loaded"). Real `React.lazy(`/`lazy(` usage was already
 * genuine and plentiful (38 call sites across 2 files) — the gap was that
 * nothing stopped it from silently regressing if someone later inlined one
 * of those imports. This gate fails predeploy-check.mjs if real usage drops
 * below today's known-good floor, so a real fix (adding this gate) is what
 * pushes the item past "verified once in code, never re-checked" into
 * "continuously enforced".
 *
 * Floor is today's real, measured count (2 files, 38+ call sites) — not a
 * guess. Ratchet it up deliberately if more lazy-loading is added later;
 * never lower it to make a regression pass.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIN_FILES = 2;
const MIN_CALL_SITES = 38;
const PATTERN = /React\.lazy\(|\blazy\(/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function walk(dir, hits) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, hits);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    const text = readFileSync(full, 'utf8');
    const matches = text.match(new RegExp(PATTERN, 'g'));
    if (matches) hits.push({ file: full, count: matches.length });
  }
}

/**
 * @param {string} root — project root (expects a src/ directory)
 * @returns {{ status: 'pass'|'fail', fileCount: number, callSiteCount: number, detail: string }}
 */
export function checkLazyLoading(root) {
  const srcDir = path.join(root, 'src');
  const hits = [];
  walk(srcDir, hits);
  const fileCount = hits.length;
  const callSiteCount = hits.reduce((sum, h) => sum + h.count, 0);

  const reasons = [];
  if (fileCount < MIN_FILES) reasons.push(`only ${fileCount} file(s) use React.lazy/lazy — floor is ${MIN_FILES}`);
  if (callSiteCount < MIN_CALL_SITES) reasons.push(`only ${callSiteCount} call site(s) found — floor is ${MIN_CALL_SITES}`);

  const status = reasons.length > 0 ? 'fail' : 'pass';
  const detail = reasons.length > 0
    ? reasons.join('; ')
    : `${fileCount} file(s), ${callSiteCount} call site(s) use React.lazy/lazy — at or above the real floor (${MIN_FILES} files, ${MIN_CALL_SITES} call sites)`;

  return { status, fileCount, callSiteCount, detail };
}
