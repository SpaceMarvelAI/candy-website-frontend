/**
 * STT URL builder + transcribe, and the recordings list/delete/listAll calls.
 * (Streaming/MediaRecorder upload + blob download are browser-only and excluded
 *  from coverage; here we cover the plain fetch-backed functions.)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import * as STT from '../../../src/api/stt';
import * as Recordings from '../../../src/api/recordings';

const B = API_BASE;

describe('api/stt — streamUrl', () => {
  it('converts http base to ws and defaults language to multi', () => {
    setToken(null);
    const url = STT.streamUrl();
    expect(url.startsWith('ws://')).toBe(true);
    expect(url).toContain('/v1/stt/stream?');
    expect(url).toContain('language=multi');
  });

  it('includes the token query param when a token is present', () => {
    setToken('tok-123');
    expect(STT.streamUrl('en')).toContain('token=tok-123');
  });

  it('uses the language passed in', () => {
    setToken(null);
    expect(STT.streamUrl('hi')).toContain('language=hi');
  });
});

describe('api/stt — transcribe', () => {
  beforeEach(() => setToken('tok'));

  it('POSTs the audio blob and returns the transcript', async () => {
    server.use(http.post(`${B}/v1/stt/transcribe`, () =>
      HttpResponse.json({ transcript: 'hello world', detected_language: 'en', confidence: 0.9, duration_ms: 1200 })
    ));
    const blob = new Blob(['audio'], { type: 'audio/webm' });
    const r = await STT.transcribe(blob, 'en');
    expect(r.transcript).toBe('hello world');
  });

  it('throws ApiError on a non-OK response', async () => {
    server.use(http.post(`${B}/v1/stt/transcribe`, () => HttpResponse.json({ detail: 'bad audio' }, { status: 422 })));
    const blob = new Blob(['x'], { type: 'audio/webm' });
    await expect(STT.transcribe(blob)).rejects.toMatchObject({ status: 422 });
  });
});

describe('api/recordings', () => {
  beforeEach(() => setToken('tok'));

  it('listRecordings GETs the demo recordings path', async () => {
    server.use(http.get(`${B}/v1/agents/a1/demo/s1/recordings`, () => HttpResponse.json([{ id: 'r1' }])));
    expect((await Recordings.listRecordings('a1', 's1'))[0].id).toBe('r1');
  });

  it('listRecordings throws ApiError on failure', async () => {
    server.use(http.get(`${B}/v1/agents/a1/demo/s1/recordings`, () => HttpResponse.json({ detail: 'nope' }, { status: 403 })));
    await expect(Recordings.listRecordings('a1', 's1')).rejects.toMatchObject({ status: 403 });
  });

  it('deleteRecording resolves on 204', async () => {
    server.use(http.delete(`${B}/v1/recordings/r1`, () => new HttpResponse(null, { status: 204 })));
    await expect(Recordings.deleteRecording('r1')).resolves.toBeUndefined();
  });

  it('deleteRecording throws on a real error status', async () => {
    server.use(http.delete(`${B}/v1/recordings/r1`, () => HttpResponse.json({ detail: 'gone' }, { status: 500 })));
    await expect(Recordings.deleteRecording('r1')).rejects.toThrow();
  });

  it('listAllRecordings GETs /v1/recordings with filters', async () => {
    server.use(http.get(`${B}/v1/recordings`, ({ request }) => {
      const u = new URL(request.url);
      expect(u.searchParams.get('recording_type')).toBe('demo');
      expect(u.searchParams.get('limit')).toBe('10');
      return HttpResponse.json([{ id: 'r2' }]);
    }));
    expect((await Recordings.listAllRecordings({ recording_type: 'demo', limit: 10 }))[0].id).toBe('r2');
  });

  it('listAllRecordings works with no options', async () => {
    server.use(http.get(`${B}/v1/recordings`, () => HttpResponse.json([])));
    expect(await Recordings.listAllRecordings()).toEqual([]);
  });
});
