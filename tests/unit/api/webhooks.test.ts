/**
 * Regression tests for the webhooks API layer.
 *
 * `webhooks.event_types` is a Postgres `jsonb` column and the backend registers
 * no asyncpg codec, so it comes over the wire as a RAW JSON STRING
 * (`'["session.ended"]'`). The UI calls `.slice().map()` / `.join()` on it, so
 * anything but a real string[] white-screens the page — normalisation therefore
 * happens once, in the API layer, for every function that returns a Webhook.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';

import { listWebhooks, createWebhook, updateWebhook, pingWebhook } from '../../../src/api/webhooks';

beforeEach(() => setToken('test-token'));

const B = API_BASE;
const json = (data: unknown, status = 200) => () => HttpResponse.json(data as any, { status });

describe('api/webhooks — event_types normalisation', () => {
  it('listWebhooks parses a raw jsonb string into a string[]', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json([
      { id: 'w1', url: 'https://x', event_types: '["session.ended","turn.completed"]' },
    ])));
    const [w] = await listWebhooks();
    expect(Array.isArray(w.event_types)).toBe(true);
    expect(w.event_types).toEqual(['session.ended', 'turn.completed']);
  });

  it('listWebhooks leaves an already-decoded array untouched', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json([
      { id: 'w1', url: 'https://x', event_types: ['session.started'] },
    ])));
    expect((await listWebhooks())[0].event_types).toEqual(['session.started']);
  });

  it('listWebhooks maps null / missing event_types to an empty array', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json([
      { id: 'w1', url: 'https://x', event_types: null },
      { id: 'w2', url: 'https://y' },
    ])));
    const list = await listWebhooks();
    expect(list[0].event_types).toEqual([]);
    expect(list[1].event_types).toEqual([]);
  });

  it('listWebhooks degrades to an empty array on malformed JSON instead of throwing', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json([
      { id: 'w1', url: 'https://x', event_types: '{not json' },
      { id: 'w2', url: 'https://y', event_types: '"session.ended"' }, // valid JSON, not an array
    ])));
    const list = await listWebhooks();
    expect(list[0].event_types).toEqual([]);
    expect(list[1].event_types).toEqual([]);
  });

  it('listWebhooks returns [] when the payload is not an array', async () => {
    server.use(http.get(`${B}/v1/webhooks`, json({ detail: 'nope' })));
    await expect(listWebhooks()).resolves.toEqual([]);
  });

  it('createWebhook normalises the created webhook', async () => {
    server.use(http.post(`${B}/v1/webhooks`, json({
      id: 'w2', url: 'https://y', event_types: '["agent.published"]',
    })));
    const w = await createWebhook({ url: 'https://y', event_types: ['agent.published'] });
    expect(w.event_types).toEqual(['agent.published']);
  });

  it('updateWebhook normalises the patched webhook', async () => {
    server.use(http.patch(`${B}/v1/webhooks/w1`, json({
      id: 'w1', url: 'https://x', is_active: false, event_types: '["session.escalated"]',
    })));
    const w = await updateWebhook('w1', { is_active: false });
    expect(w.event_types).toEqual(['session.escalated']);
  });
});

describe('api/webhooks — ping', () => {
  it('pingWebhook returns the backend {queued, event_type} shape (there is no `ok` field)', async () => {
    server.use(http.post(`${B}/v1/webhooks/w1/ping`, json({ queued: true, event_type: 'ping' })));
    const r = await pingWebhook('w1');
    expect(r.queued).toBe(true);
    expect(r.event_type).toBe('ping');
    expect('ok' in r).toBe(false);
  });
});
