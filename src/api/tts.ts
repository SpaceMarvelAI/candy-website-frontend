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
    // Read the body once — res.json() consumes it, so the old
    // `catch { await res.text() }` fallback threw "Body is unusable" and the
    // caller lost the status it needs to pick the right message.
    const raw = await res.text().catch(() => '');
    let detail: any = raw;
    try { detail = JSON.parse(raw); } catch {}
    throw new ApiError(res.status, detail);
  }

  return res.blob();
}
