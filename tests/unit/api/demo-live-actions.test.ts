/**
 * streamDemoTurn only asks the backend for REAL tool execution when `liveActions` is
 * explicitly true. The default request must stay byte-identical to before, so the Test panel
 * keeps using the canned mock unless an owner/admin flips the "Live actions" switch.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import * as Demo from '../../../src/api/demo';

beforeEach(() => setToken('test-token'));

function capture() {
  const seen: any[] = [];
  server.use(http.post(`${API_BASE}/v1/agents/a1/demo/d1/turn/stream`, async ({ request }) => {
    seen.push(await request.json());
    const enc = new TextEncoder();
    return new HttpResponse(
      new ReadableStream({
        start(c) {
          c.enqueue(enc.encode('data: {"done":true,"full_text":"ok","latency_ms":1}\n\n'));
          c.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }));
  return seen;
}

describe('streamDemoTurn live_actions flag', () => {
  it('omits live_actions by default', async () => {
    const seen = capture();
    await Demo.streamDemoTurn('a1', 'd1', 'hi', {});
    expect(seen).toHaveLength(1);
    expect('live_actions' in seen[0]).toBe(false);
  });

  it('omits live_actions when liveActions is false', async () => {
    const seen = capture();
    await Demo.streamDemoTurn('a1', 'd1', 'hi', {}, undefined, 'en', false);
    expect('live_actions' in seen[0]).toBe(false);
  });

  it('sends live_actions: true only when opted in', async () => {
    const seen = capture();
    await Demo.streamDemoTurn('a1', 'd1', 'hi', {}, undefined, 'en', true);
    expect(seen[0].live_actions).toBe(true);
    expect(seen[0].utterance).toBe('hi');
  });
});
