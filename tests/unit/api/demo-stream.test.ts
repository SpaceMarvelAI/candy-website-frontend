/**
 * Regression tests for streamDemoTurn's SSE error handling.
 *
 * The bug: the try/catch guarding `JSON.parse` also wrapped the callback
 * invocations. TestPanel's `onError` deliberately rethrows so that send()'s
 * outer catch can render the message into the agent bubble — but that throw was
 * caught by the parse guard, logged as "bad SSE frame", and swallowed. The
 * `return` after it never ran, the stream drained, and the user was left looking
 * at an EMPTY agent bubble with the real error only in devtools.
 *
 * Reproduced live: the backend's LLM model had been decommissioned, so it sent
 * {"error": "...model_not_found..."} on every turn and the UI showed nothing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import { streamDemoTurn } from '../../../src/api/demo';

beforeEach(() => setToken('test-token'));

const sse = (body: string) =>
  new HttpResponse(body, { headers: { 'Content-Type': 'text/event-stream' } });

const STREAM = `${API_BASE}/v1/agents/a1/demo/s1/turn/stream`;

describe('streamDemoTurn — error frames', () => {
  it('reports an {"error"} frame via onError instead of swallowing it', async () => {
    server.use(http.post(STREAM, () =>
      sse(`data: ${JSON.stringify({ error: 'model_not_found: llama-3.1-8b-instant' })}\n\n`)));

    const onError = vi.fn();
    await streamDemoTurn('a1', 's1', 'hi', { onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toContain('model_not_found');
  });

  it('propagates a rethrowing onError to the caller, never as "bad SSE frame"', async () => {
    server.use(http.post(STREAM, () =>
      sse(`data: ${JSON.stringify({ error: 'boom' })}\n\n`)));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // This is TestPanel's real handler shape: rethrow so send()'s catch renders it.
    const onError = vi.fn((e: unknown) => { throw e; });

    await expect(streamDemoTurn('a1', 's1', 'hi', { onError })).rejects.toThrow('boom');

    // Reported exactly once, and never mislabelled as a malformed frame.
    expect(onError).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls.some(c => String(c[0]).includes('bad SSE frame'))).toBe(false);
    warn.mockRestore();
  });

  it('still logs a genuinely malformed frame and keeps reading the stream', async () => {
    server.use(http.post(STREAM, () =>
      sse('data: {not json\n\ndata: {"sentence":"hello"}\n\ndata: {"done":true}\n\n')));

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onSentence = vi.fn();
    const onDone = vi.fn();

    await streamDemoTurn('a1', 's1', 'hi', { onSentence, onDone });

    expect(warn.mock.calls.some(c => String(c[0]).includes('bad SSE frame'))).toBe(true);
    // A bad frame must not abort the rest of the stream.
    expect(onSentence).toHaveBeenCalledWith('hello', 'hello');
    expect(onDone).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('streams sentences then completes on {"done"}', async () => {
    server.use(http.post(STREAM, () =>
      sse('data: {"sentence":"one"}\n\ndata: {"sentence":"two"}\n\n'
        + 'data: {"done":true,"full_text":"one two","latency_ms":42}\n\n')));

    const onSentence = vi.fn();
    const onDone = vi.fn();
    await streamDemoTurn('a1', 's1', 'hi', { onSentence, onDone });

    expect(onSentence).toHaveBeenNthCalledWith(1, 'one', 'one');
    expect(onSentence).toHaveBeenNthCalledWith(2, 'two', 'one two');
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({
      full_text: 'one two', latency_ms: 42,
    }));
  });
});
