/**
 * Regression cover for the download contract.
 *
 * `GET /v1/recordings/{id}/download` returns JSON metadata
 * ({signed_url, s3_key, mime_type, filename}) — NOT audio bytes. The old
 * implementation did `res.blob()` on it, so the user saved a JSON file named
 * `*.mp3`. These tests pin the real contract, including what happens when the
 * signed-URL fetch itself fails (S3 CORS / expiry), which is the whole reason
 * this fallback tier exists.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import * as Recordings from '../../../src/api/recordings';

const B = API_BASE;
const SIGNED = 'https://s3.test/bucket/turn_000_user_abc.mp3?sig=fresh';

const META = {
  signed_url: SIGNED,
  s3_key: 'recordings/turn_000_user_abc.mp3',
  mime_type: 'audio/mpeg',
  filename: 'turn_000_user_abc.mp3',
};

describe('api/recordings — downloadRecordingBlob JSON contract', () => {
  beforeEach(() => setToken('tok'));

  it('parses the metadata JSON and fetches the signed URL for the real bytes', async () => {
    const hits: string[] = [];
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, ({ request }) => {
        hits.push('meta');
        expect(request.headers.get('authorization')).toBe('Bearer tok');
        return HttpResponse.json(META);
      }),
      http.get(SIGNED.split('?')[0], ({ request }) => {
        hits.push('s3');
        // The bearer token must never be forwarded to S3 — the URL is already signed.
        expect(request.headers.get('authorization')).toBeNull();
        return new HttpResponse('audio-bytes', { headers: { 'Content-Type': 'application/octet-stream' } });
      }),
    );

    const dl = await Recordings.downloadRecordingBlob('r1');

    expect(hits).toEqual(['meta', 's3']);
    expect(dl.filename).toBe('turn_000_user_abc.mp3');
    expect(dl.signed_url).toBe(SIGNED);
    expect(dl.blob).not.toBeNull();
    // The bytes are the audio, not the JSON envelope.
    expect(await dl.blob!.text()).toBe('audio-bytes');
    // …and carry the backend's mime type, not S3's application/octet-stream.
    expect(dl.blob!.type).toBe('audio/mpeg');
  });

  it('never hands back the JSON envelope as the audio blob', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json(META)),
      http.get(SIGNED.split('?')[0], () => new HttpResponse('ID3-real-audio')),
    );
    const dl = await Recordings.downloadRecordingBlob('r1');
    const text = await dl.blob!.text();
    expect(text).not.toContain('signed_url');
    expect(text).not.toContain('s3_key');
  });

  it('returns a null blob (and the fresh URL) when the signed URL fetch is refused', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json(META)),
      // Stands in for an S3 CORS rejection: the fetch itself throws.
      http.get(SIGNED.split('?')[0], () => HttpResponse.error()),
    );

    const dl = await Recordings.downloadRecordingBlob('r1');

    expect(dl.blob).toBeNull();
    // The caller needs the fresh URL to fall through to "open in new tab".
    expect(dl.signed_url).toBe(SIGNED);
    expect(dl.filename).toBe('turn_000_user_abc.mp3');
  });

  it('returns a null blob when the signed URL has expired (403)', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json(META)),
      http.get(SIGNED.split('?')[0], () => new HttpResponse('<Error>AccessDenied</Error>', { status: 403 })),
    );
    const dl = await Recordings.downloadRecordingBlob('r1');
    expect(dl.blob).toBeNull();
  });

  it('falls back to a default mime type when the backend omits one', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () => HttpResponse.json({ ...META, mime_type: '' })),
      http.get(SIGNED.split('?')[0], () => new HttpResponse('bytes')),
    );
    const dl = await Recordings.downloadRecordingBlob('r1');
    expect(dl.blob!.type).toBe('audio/mpeg');
  });

  it('throws when the metadata JSON carries no signed_url', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () =>
        HttpResponse.json({ s3_key: 'k', mime_type: 'audio/mpeg', filename: 'a.mp3' })),
    );
    await expect(Recordings.downloadRecordingBlob('r1')).rejects.toThrow(/signed_url/);
  });

  it('throws the backend detail when the download endpoint fails', async () => {
    server.use(
      http.get(`${B}/v1/recordings/r1/download`, () =>
        HttpResponse.json({ detail: 'Recording not found' }, { status: 404 })),
    );
    await expect(Recordings.downloadRecordingBlob('r1')).rejects.toThrow('Recording not found');
  });

  it('percent-encodes the recording id in the path', async () => {
    server.use(
      http.get(`${B}/v1/recordings/a%2Fb/download`, () => HttpResponse.json(META)),
      http.get(SIGNED.split('?')[0], () => new HttpResponse('bytes')),
    );
    const dl = await Recordings.downloadRecordingBlob('a/b');
    expect(dl.blob).not.toBeNull();
  });
});
