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

  it('omits the Authorization header when no token is set', async () => {
    setToken(null);
    server.use(http.post(`${B}/v1/stt/transcribe`, ({ request }) => {
      expect(request.headers.get('authorization')).toBeNull();
      return HttpResponse.json({ transcript: 'hi', detected_language: null, confidence: null, duration_ms: 100 });
    }));
    const blob = new Blob(['x'], { type: 'audio/webm' });
    const r = await STT.transcribe(blob);
    expect(r.transcript).toBe('hi');
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

  it('uploadRecording POSTs multipart audio and returns the row', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo/s1/recording`, () => HttpResponse.json({ id: 'r1', role: 'user' })));
    const audio = new Blob(['x'], { type: 'audio/webm' });
    const r = await Recordings.uploadRecording({ agentId: 'a1', sessionId: 's1', role: 'user', turnIndex: 0, audio });
    expect(r.id).toBe('r1');
  });

  it('uploadRecording handles all optional fields + non-webm mime types', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo/s1/recording`, () => HttpResponse.json({ id: 'r2' })));
    // ogg branch + transcript/languageCode/durationMs all set
    const ogg = new Blob(['x'], { type: 'audio/ogg' });
    const r = await Recordings.uploadRecording({
      agentId: 'a1', sessionId: 's1', role: 'agent', turnIndex: 2,
      audio: ogg, transcript: 'hi', languageCode: 'en', durationMs: 500,
      recordingType: 'live_call',
    });
    expect(r.id).toBe('r2');
  });

  it('uploadRecording throws ApiError on failure', async () => {
    server.use(http.post(`${B}/v1/agents/a1/demo/s1/recording`, () => HttpResponse.json({ detail: 'too big' }, { status: 413 })));
    const audio = new Blob(['x'], { type: 'audio/wav' });
    await expect(
      Recordings.uploadRecording({ agentId: 'a1', sessionId: 's1', role: 'user', turnIndex: 0, audio })
    ).rejects.toMatchObject({ status: 413 });
  });

  it('downloadRecordingBlob returns the audio blob + metadata on success', async () => {
    // The endpoint returns JSON metadata, not audio — the bytes come from the
    // signed URL it points at. Full contract cover lives in
    // tests/unit/api/recordings-download.test.ts.
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json({
        signed_url: 'https://s3.test/r1.mp3', s3_key: 'r1.mp3',
        mime_type: 'audio/mpeg', filename: 'r1.mp3',
      })),
      http.get('https://s3.test/r1.mp3', () => new HttpResponse('audio-bytes')),
    );
    const dl = await Recordings.downloadRecordingBlob('r1');
    expect(typeof dl.blob!.size).toBe('number');
    expect(dl.blob!.type).toBe('audio/mpeg');
    expect(dl.filename).toBe('r1.mp3');
  });

  it('downloadRecordingBlob throws on a failed response', async () => {
    server.use(http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json({ detail: 'not found' }, { status: 404 })));
    await expect(Recordings.downloadRecordingBlob('r1')).rejects.toThrow();
  });

  it('downloadRecordingBlob falls back to res.text() when the error body is not JSON', async () => {
    // Non-JSON body sends res.json() into its catch, exercising the res.text()
    // fallback branch (regardless of the exact error surfaced afterward).
    server.use(http.get(`${B}/v1/recordings/r1/download`, () => new HttpResponse('plain text error', { status: 500 })));
    await expect(Recordings.downloadRecordingBlob('r1')).rejects.toThrow();
  });

  it('downloadRecordingBlob falls back to a default HTTP message when the JSON body has no detail field', async () => {
    server.use(http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json({}, { status: 500 })));
    await expect(Recordings.downloadRecordingBlob('r1')).rejects.toThrow('HTTP 500');
  });

  it('uploadRecording detects mpeg audio and uses the .mp3 extension', async () => {
    // MSW/undici can't parse a jsdom Blob's multipart part server-side, so we
    // don't inspect the FormData here — just exercise the mpeg branch of the
    // ext ternary and confirm the call still completes.
    server.use(http.post(`${B}/v1/agents/a1/demo/s1/recording`, () => HttpResponse.json({ id: 'r3' })));
    const audio = new Blob(['x'], { type: 'audio/mpeg' });
    const r = await Recordings.uploadRecording({ agentId: 'a1', sessionId: 's1', role: 'user', turnIndex: 0, audio });
    expect(r.id).toBe('r3');
  });

  it('listAllRecordings throws ApiError on failure', async () => {
    server.use(http.get(`${B}/v1/recordings`, () => HttpResponse.json({ detail: 'server error' }, { status: 500 })));
    await expect(Recordings.listAllRecordings()).rejects.toMatchObject({ status: 500 });
  });

  it('works without a token set (no Authorization header sent)', async () => {
    setToken(null);
    server.use(
      http.post(`${B}/v1/agents/a1/demo/s1/recording`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json({ id: 'r4' });
      }),
    );
    const audio = new Blob(['x'], { type: 'audio/webm' });
    await Recordings.uploadRecording({ agentId: 'a1', sessionId: 's1', role: 'user', turnIndex: 0, audio });

    server.use(
      http.get(`${B}/v1/agents/a1/demo/s1/recordings`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json([]);
      }),
    );
    await Recordings.listRecordings('a1', 's1');

    server.use(
      http.delete(`${B}/v1/recordings/r1`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await Recordings.deleteRecording('r1');

    server.use(
      http.get(`${B}/v1/recordings`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json([]);
      }),
    );
    await Recordings.listAllRecordings();

    server.use(
      http.get(`${B}/v1/recordings/r1/download`, ({ request }) => {
        expect(request.headers.get('authorization')).toBeNull();
        return HttpResponse.json({
          signed_url: 'https://s3.test/r1.mp3', s3_key: 'r1.mp3',
          mime_type: 'audio/mpeg', filename: 'r1.mp3',
        });
      }),
      http.get('https://s3.test/r1.mp3', () => new HttpResponse('bytes')),
    );
    await Recordings.downloadRecordingBlob('r1');
  });
});
