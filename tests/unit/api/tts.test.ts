/**
 * TTS synthesis. The MediaSource streaming path is gone (Chrome reports
 * isTypeSupported('audio/mpeg') === false, so it could never run), leaving one
 * plain fetch-backed call — including the AbortSignal every caller now passes
 * so barge-in and teardown stop paying for audio nobody will hear.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import * as TTS from '../../../src/api/tts';

const B = API_BASE;

describe('api/tts — synthesize', () => {
  beforeEach(() => setToken('tok'));

  it('POSTs the text and returns the audio blob', async () => {
    server.use(http.post(`${B}/v1/tts/speak`, async ({ request }) => {
      expect(await request.json()).toEqual({ text: 'hello', language_code: 'en' });
      expect(request.headers.get('authorization')).toBe('Bearer tok');
      return new HttpResponse('audio-bytes', { headers: { 'Content-Type': 'audio/mpeg' } });
    }));
    const blob = await TTS.synthesize({ text: 'hello', language_code: 'en' });
    expect(blob.type).toBe('audio/mpeg');
    expect(typeof blob.size).toBe('number');
  });

  it('never sends the signal as part of the request body', async () => {
    server.use(http.post(`${B}/v1/tts/speak`, async ({ request }) => {
      expect(Object.keys((await request.json()) as object)).toEqual(['text']);
      return new HttpResponse('bytes');
    }));
    await TTS.synthesize({ text: 'hello', signal: new AbortController().signal });
  });

  it('omits the Authorization header when no token is set', async () => {
    setToken(null);
    server.use(http.post(`${B}/v1/tts/speak`, ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      return new HttpResponse('bytes');
    }));
    await TTS.synthesize({ text: 'hello' });
  });

  it('rejects once the caller aborts', async () => {
    server.use(http.post(`${B}/v1/tts/speak`, () => new HttpResponse('bytes')));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(TTS.synthesize({ text: 'hello', signal: ctrl.signal })).rejects.toThrow();
  });

  it('throws ApiError with the status on a failed response', async () => {
    server.use(http.post(`${B}/v1/tts/speak`, () =>
      HttpResponse.json({ detail: 'quota exceeded' }, { status: 429 })));
    await expect(TTS.synthesize({ text: 'hello' })).rejects.toMatchObject({ status: 429 });
  });

  it('falls back to res.text() when the error body is not JSON', async () => {
    server.use(http.post(`${B}/v1/tts/speak`, () =>
      new HttpResponse('gateway blew up', { status: 502 })));
    await expect(TTS.synthesize({ text: 'hello' })).rejects.toMatchObject({ status: 502 });
  });

  it('no longer exposes the MediaSource streaming path', () => {
    expect((TTS as Record<string, unknown>).synthesizeStreaming).toBeUndefined();
  });
});
