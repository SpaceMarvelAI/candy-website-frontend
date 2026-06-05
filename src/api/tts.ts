import { API_BASE, getToken, ApiError } from './client';

/**
 * Server-side TTS — returns an MP3 Blob the browser can play via a normal
 * <audio> element or `new Audio(blobUrl)`.
 */
export async function synthesize(args: {
  text: string;
  language_code?: string;
  voice_id?: string;
  provider?: 'elevenlabs' | 'deepgram';
  signal?: AbortSignal;
}): Promise<Blob> {
  const { signal, ...body } = args;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/v1/tts/speak`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }

  return res.blob();
}

/**
 * Streaming TTS — pipes MP3 bytes directly from the server into a
 * MediaSource so the browser starts playing as soon as the first chunk
 * arrives rather than waiting for the full audio download.
 *
 * Returns an object-URL string pointing at the MediaSource. The caller
 * must revoke it when done (or when barge-in cancels playback).
 *
 * Falls back to the blob approach if MediaSource is unavailable (Safari 15-).
 */
export async function synthesizeStreaming(
  audio: HTMLAudioElement,
  args: { text: string; language_code?: string; signal?: AbortSignal },
): Promise<void> {
  const { signal, ...body } = args;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/v1/tts/speak`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }

  // ── MediaSource streaming path ──────────────────────────────────────────────
  const MS = window.MediaSource as typeof MediaSource | undefined;
  if (MS && MS.isTypeSupported('audio/mpeg') && res.body) {
    await new Promise<void>((resolve, reject) => {
      const ms  = new MS();
      const url = URL.createObjectURL(ms);
      audio.src = url;

      ms.addEventListener('sourceopen', async () => {
        const sb = ms.addSourceBuffer('audio/mpeg');
        const reader = res.body!.getReader();

        const append = (value: Uint8Array) => new Promise<void>((ok, fail) => {
          const done = () => { sb.removeEventListener('updateend', done); ok(); };
          const err  = (e: Event) => { sb.removeEventListener('error', err); fail(e); };
          sb.addEventListener('updateend', done, { once: true });
          sb.addEventListener('error', err, { once: true });
          try { sb.appendBuffer(value); } catch (e) { fail(e); }
        });

        try {
          // Read stream and feed into SourceBuffer
          // eslint-disable-next-line no-constant-condition
          while (true) {
            if (signal?.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              await append(value);
              // Start playback as soon as we have the first chunk
              if (audio.paused && audio.readyState >= 2) {
                try { await audio.play(); } catch {}
              }
            }
          }
          if (!ms.readyState.includes('ended')) ms.endOfStream();
          resolve();
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(url);
        }
      }, { once: true });

      ms.addEventListener('sourceended', resolve, { once: true });
      ms.addEventListener('error', reject, { once: true });

      // Kick off playback
      audio.play().catch(() => {});
    });
    return;
  }

  // ── Fallback: full blob (Safari / MediaSource not supported) ────────────────
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  audio.src  = url;
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
}
