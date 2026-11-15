import { api, API_BASE, getToken, ApiError } from './client';

export interface DemoStartOut {
  demo_session_id: string;
  agent_id: string;
  auto_prep?: { reclassified: number; recompiled: boolean };
  tip?: string;
}

export interface DemoTurnOut {
  agent_response:    string;
  agent_type:        string;
  chunks_retrieved:  number;
  language:          string;
  language_switched: boolean;
  active_language?:  string;    // confirmed active language from backend
  switch_ack?:       string | null;  // pre-built ACK sentence in the new language
  mode: 'fast' | 'slow';
  latency_ms: number;
  debug?: any;
}

export async function startDemo(agentId: string): Promise<DemoStartOut> {
  return api<DemoStartOut>(`/v1/agents/${agentId}/demo`, { method: 'POST' });
}

/**
 * Speculative RAG prefetch. The frontend fires this on STT partials so
 * by the time the user actually finishes speaking the chunks are
 * already cached on the backend. The endpoint returns immediately —
 * the actual retrieval happens in a background task.
 */
export async function prefetchDemoRag(
  agentId: string,
  sessionId: string,
  utterance: string,
): Promise<void> {
  try {
    await api(`/v1/agents/${agentId}/demo/${sessionId}/prefetch`, {
      method: 'POST',
      body: { utterance },
    });
  } catch {
    // Prefetch is best-effort; never let it fail the user-visible flow.
  }
}

export async function sendDemoTurn(
  agentId: string,
  sessionId: string,
  utterance: string,
  fast: boolean = true,
): Promise<DemoTurnOut> {
  return api<DemoTurnOut>(
    `/v1/agents/${agentId}/demo/${sessionId}/turn?fast=${fast ? 1 : 0}`,
    { method: 'POST', body: { utterance } },
  );
}

export interface StreamCallbacks {
  /** Called for each sentence as it streams from the model. */
  onSentence?: (sentence: string, fullSoFar: string) => void;
  /** Called once when the stream finishes successfully. */
  onDone?: (info: {
    full_text:        string;
    latency_ms:       number;
    active_language?: string;
    language_switched?: boolean;
    switch_ack?:      string | null;
  }) => void;
  /** Called on transport / parse / server errors. */
  onError?: (err: Error) => void;
}

/**
 * Streaming version of sendDemoTurn. Reads the SSE stream from
 * /v1/agents/{id}/demo/{sid}/turn/stream and dispatches a callback per
 * sentence. The caller can fire TTS for each sentence so audio starts
 * playing while the model is still generating later ones.
 */
export async function streamDemoTurn(
  agentId: string,
  sessionId: string,
  utterance: string,
  cb: StreamCallbacks = {},
  signal?: AbortSignal,
  languageCode: string = 'en',
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept':       'text/event-stream',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE}/v1/agents/${agentId}/demo/${sessionId}/turn/stream`,
      { method: 'POST', headers, body: JSON.stringify({ utterance, language_code: languageCode }), signal },
    );
  } catch (e: any) {
    cb.onError?.(e);
    return;
  }

  if (!res.ok || !res.body) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    cb.onError?.(new ApiError(res.status, detail));
    return;
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  // Set once we've handed an error to cb.onError. Because onError is allowed to
  // rethrow (TestPanel does, so send()'s catch renders it in the bubble), that
  // throw lands in the outer catch below — which must NOT report the same error
  // a second time.
  let reportedError = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames end with a blank line.
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data) continue;
          // ONLY the parse is guarded here. This try used to wrap the callbacks
          // too, so an exception thrown by a callback — including the `onError`
          // handler that deliberately rethrows so send()'s catch can render it —
          // was logged as "bad SSE frame" and swallowed. The `return` below never
          // ran, the stream just drained, and the user was left looking at an
          // empty agent bubble with the real error only in the console. Seen live
          // with a decommissioned LLM model: the backend sent
          // {"error": "...model_not_found"} and the UI showed nothing at all.
          let evt: any;
          try {
            evt = JSON.parse(data);
          } catch (e) {
            console.warn('[demo] bad SSE frame', data, e);
            continue;
          }

          if (evt.error) {
            reportedError = true;
            cb.onError?.(new Error(evt.error));
            return;
          }
          if (evt.sentence) {
            fullText += (fullText ? ' ' : '') + evt.sentence;
            cb.onSentence?.(evt.sentence, fullText);
          }
          if (evt.done) {
            cb.onDone?.({
              full_text:         evt.full_text || fullText,
              latency_ms:        evt.latency_ms ?? 0,
              active_language:   evt.active_language,
              language_switched: evt.language_switched,
              switch_ack:        evt.switch_ack,
            });
            return;
          }
        }
      }
    }
  } catch (e: any) {
    // Already surfaced above (and onError rethrew) — let it propagate untouched
    // to the caller rather than reporting it twice.
    if (reportedError) throw e;
    cb.onError?.(e);
  }
}
