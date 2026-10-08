/**
 * Keeps CRM record identifiers out of analytics.
 *
 * CRM routes carry record ids by design (`#/crm/patients/<uuid>`, `?patient_id=<uuid>`), and PostHog attaches the
 * page URL to events that autocapture's `ph-no-capture` does not cover (page views, page-leave, sidebar clicks,
 * heatmap batches, exceptions). An id alone names no one, but it is a patient-record identifier, so it is replaced
 * with `:id` before an event leaves the browser — everywhere a URL can appear in the event, including person
 * properties (`$set`, `$set_once`) and heatmap payloads, whose URL is an object KEY.
 *
 * Session-replay snapshots (`$snapshot`) are deliberately skipped: they are large and compressed, and walking
 * them would be costly and fragile. Replay is protected by masking (`.ph-mask`), not by this scrub.
 */
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CRM_PATH = new RegExp(`(/crm/(?:patients|cases|tasks|appointments|providers)/)${UUID}`, 'gi');
const CRM_QUERY = new RegExp(`((?:patient|provider|case|task)_id=)${UUID}`, 'gi');

export function redactCrmIdentifiers(value: string): string {
  if (!value.includes('/crm') && !value.includes('_id=')) return value;     // cheap exit for the common case
  return value.replace(CRM_PATH, '$1:id').replace(CRM_QUERY, '$1:id');
}

function walk(v: unknown, depth: number): unknown {
  if (typeof v === 'string') return redactCrmIdentifiers(v);
  if (depth <= 0 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => walk(x, depth - 1));
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[redactCrmIdentifiers(k)] = walk(val, depth - 1);
  return out;
}

interface AnalyticsEvent {
  event?: string;
  properties?: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** For PostHog's `before_send`. Returns the event with CRM ids redacted (or untouched if there is nothing to do). */
export function scrubAnalyticsEvent<T extends AnalyticsEvent>(cr: T): T {
  if (!cr || cr.event === '$snapshot') return cr;
  const next: T = { ...cr };
  if (cr.properties) next.properties = walk(cr.properties, 4) as Record<string, unknown>;
  if (cr.$set) next.$set = walk(cr.$set, 3) as Record<string, unknown>;
  if (cr.$set_once) next.$set_once = walk(cr.$set_once, 3) as Record<string, unknown>;
  return next;
}
