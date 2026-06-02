import { API_BASE, getToken, ApiError } from './client';

/**
 * Build the STT WebSocket URL.
 *
 * language='multi' → /v1/stt/stream-whisper
 *   Whisper large-v3 on GPU. Handles Hinglish + mid-sentence code-switching
 *   natively. language=None auto-detects per utterance.
 *
 * language='hi'/'ta'/'te'/etc → /v1/stt/stream (Deepgram nova-2, single-lang)
 *   Used after language is confirmed for best single-language accuracy.
 */
export function streamUrl(language: string = 'multi'): string {
  const ws  = API_BASE.replace(/^http/, 'ws');
  const tok = getToken();

  if (language === 'multi' || language === 'auto' || language === '') {
    const qs = tok ? `?token=${encodeURIComponent(tok)}` : '';
    return `${ws}/v1/stt/stream-whisper${qs}`;
  }

  const qs = new URLSearchParams({ language });
  if (tok) qs.set('token', tok);
  return `${ws}/v1/stt/stream?${qs.toString()}`;
}

export interface TranscribeOut {
  transcript: string;
  detected_language: string | null;
  confidence: number | null;
  duration_ms: number;
}

/**
 * Send a recorded audio Blob to the backend for transcription. Uses
 * Deepgram with `detect_language=true` so the user can speak any
 * supported language and get the right transcript without pre-selecting.
 */
export async function transcribe(
  audio: Blob,
  language_code: string = 'multi',
): Promise<TranscribeOut> {
  const fd = new FormData();
  fd.append('audio', audio, 'utterance.webm');
  fd.append('language_code', language_code);

  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/v1/stt/transcribe`, {
    method:  'POST',
    headers,
    body:    fd,
  });

  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}
