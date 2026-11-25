/**
 * Analytics Phase 5 — the reporting API client: which filters are sent to which endpoint, and how the
 * request is formed. Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { API_BASE } from '../../mocks/fixtures';
import {
  ENDPOINT_SUPPORTS_BUCKET, buildReportParams, getReport,
  type ReportEndpoint, type ReportFilters,
} from '../../../src/api/analyticsReports';

const ENDPOINTS: ReportEndpoint[] = [
  'volume', 'outcomes', 'agent-performance', 'tools', 'escalations', 'calls', 'knowledge-effectiveness',
];
const base: ReportFilters = { days: 7, traffic: 'production', agentId: null, compare: false, bucket: 'day' };

describe('buildReportParams', () => {
  it('always sends the period and traffic, and nothing else by default', () => {
    for (const e of ENDPOINTS) {
      const p = buildReportParams(base, e);
      expect(p.days, e).toBe('7');
      expect(p.traffic, e).toBe('production');
      expect('agent_id' in p, e).toBe(false);
      expect('compare' in p, e).toBe(false);
    }
  });

  it('sends agent_id only when an agent is chosen, and compare only as "true" when on', () => {
    for (const e of ENDPOINTS) {
      const p = buildReportParams({ ...base, agentId: 'a-1', compare: true }, e);
      expect(p.agent_id, e).toBe('a-1');
      expect(p.compare, e).toBe('true');
      expect('agent_id' in buildReportParams({ ...base, agentId: '' }, e), e).toBe(false);
      expect('compare' in buildReportParams({ ...base, compare: false }, e), e).toBe(false);
    }
  });

  it('sends bucket only to the endpoints that return a trend series', () => {
    expect(Object.entries(ENDPOINT_SUPPORTS_BUCKET).filter(([, v]) => v).map(([k]) => k).sort())
      .toEqual(['escalations', 'knowledge-effectiveness', 'volume']);
    for (const e of ENDPOINTS) {
      const p = buildReportParams({ ...base, bucket: 'week' }, e);
      if (ENDPOINT_SUPPORTS_BUCKET[e]) expect(p.bucket, e).toBe('week');
      else expect('bucket' in p, e).toBe(false);
    }
  });

  it('passes each traffic class through unchanged', () => {
    for (const t of ['production', 'demo', 'unclassified', 'all'] as const) {
      expect(buildReportParams({ ...base, traffic: t }, 'outcomes').traffic).toBe(t);
    }
  });
});

describe('getReport', () => {
  it('requests /v1/analytics/<endpoint> with the built query and returns the body untouched', async () => {
    let url: URL | null = null;
    server.use(http.get(`${API_BASE}/v1/analytics/knowledge-effectiveness`, ({ request }) => {
      url = new URL(request.url);
      return HttpResponse.json({ metrics: { answered_questions: 3 }, comparison: null });
    }));
    const body = await getReport<{ metrics: { answered_questions: number } }>(
      'knowledge-effectiveness', buildReportParams({ ...base, days: 30, agentId: 'a-9', compare: true, bucket: 'week' }, 'knowledge-effectiveness'));
    expect(body.metrics.answered_questions).toBe(3);
    expect(url!.pathname).toBe('/v1/analytics/knowledge-effectiveness');
    expect(Object.fromEntries(url!.searchParams)).toEqual(
      { days: '30', traffic: 'production', agent_id: 'a-9', compare: 'true', bucket: 'week' });
  });

  it('rejects on an HTTP error so the caller can show an error state', async () => {
    server.use(http.get(`${API_BASE}/v1/analytics/tools`, () => HttpResponse.json({ detail: 'boom' }, { status: 500 })));
    await expect(getReport('tools', buildReportParams(base, 'tools'))).rejects.toBeTruthy();
  });
});
