/**
 * Loads the VITE_REPORT_ISSUES_* vars from .env for plain Node scripts (Vite only
 * inlines them for the browser build — a script running under `node` doesn't get
 * import.meta.env, so we read the .env file directly). process.env wins if already set.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../..');

export function loadReportIssuesEnv() {
  const vars = {};
  try {
    const raw = readFileSync(path.join(ROOT, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]] = m[2];
    }
  } catch {
    // no .env file — rely on process.env alone
  }

  const get = (key) => process.env[key] ?? vars[key];
  const config = {
    bucket: get('VITE_REPORT_ISSUES_BUCKET'),
    region: get('VITE_REPORT_ISSUES_REGION'),
    accessKeyId: get('VITE_REPORT_ISSUES_ACCESS_KEY_ID'),
    secretAccessKey: get('VITE_REPORT_ISSUES_SECRET_ACCESS_KEY'),
  };

  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    throw new Error(`Missing report-issues S3 config: ${missing.join(', ')} (checked process.env and .env)`);
  }
  return config;
}
