import { API_BASE, getToken, ApiError } from './client';

export type RecordingType = 'demo_session' | 'demo_turn' | 'live_call';
export type RecordingRole = 'user' | 'agent' | 'mixed';

export interface RecordingOut {
  recording_id: string;
  s3_key: string;
  role: RecordingRole;
  turn_index: number;
  recording_type: RecordingType;
  signed_url?: string | null;
}

export interface RecordingRow {
  recording_id: string;
  role: RecordingRole;
  turn_index: number;
  recording_type?: RecordingType;
  mime_type: string;
  size_bytes: number | null;
  duration_ms: number | null;
  transcript: string | null;
  language_code: string | null;
  session_id?: string;
  agent_id?: string;
  agent_name?: string;
  use_case_slug?: string;
  created_at: string;
  signed_url: string | null;
  s3_key: string;
}

/**
 * Upload a single audio capture (user mic or agent TTS) for a turn.
 * The backend writes it to S3 (or local fallback) and inserts a
 * `candy.demo_recordings` row tying it to the demo session.
 */
export async function uploadRecording(args: {
  agentId: string;
  sessionId: string;
  role: RecordingRole;
  turnIndex: number;
  audio: Blob;
  transcript?: string;
  languageCode?: string;
  durationMs?: number;
  recordingType?: RecordingType;
}): Promise<RecordingOut> {
  const fd = new FormData();
  const ext =
    args.audio.type.includes('mpeg') ? 'mp3' :
    args.audio.type.includes('ogg')  ? 'ogg' :
    args.audio.type.includes('wav')  ? 'wav' : 'webm';
  const kind = args.recordingType || 'demo_session';
  fd.append('audio', args.audio, `${kind}_${args.role}_${args.turnIndex}.${ext}`);
  fd.append('role', args.role);
  fd.append('turn_index', String(args.turnIndex));
  fd.append('recording_type', kind);
  if (args.transcript)   fd.append('transcript',   args.transcript);
  if (args.languageCode) fd.append('language_code', args.languageCode);
  if (args.durationMs != null) fd.append('duration_ms', String(args.durationMs));

  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;

  const res = await fetch(
    `${API_BASE}/v1/agents/${args.agentId}/demo/${args.sessionId}/recording`,
    { method: 'POST', headers, body: fd },
  );

  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export async function listRecordings(agentId: string, sessionId: string): Promise<RecordingRow[]> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(
    `${API_BASE}/v1/agents/${agentId}/demo/${sessionId}/recordings`,
    { headers },
  );
  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

/**
 * Permanently delete a recording — drops the DB row and the underlying
 * audio object (S3 or local file).
 */
export async function deleteRecording(recordingId: string): Promise<void> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(
    `${API_BASE}/v1/recordings/${encodeURIComponent(recordingId)}`,
    { method: 'DELETE', headers },
  );
  if (!res.ok && res.status !== 204) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }
}

/**
 * Cross-agent listing. Used by the dashboard's Live Call Logs page to show
 * every recording on the company, optionally filtered to demo or live.
 */
export async function listAllRecordings(opts: {
  recording_type?: RecordingType;
  limit?: number;
} = {}): Promise<RecordingRow[]> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const qs = new URLSearchParams();
  if (opts.recording_type) qs.set('recording_type', opts.recording_type);
  if (opts.limit) qs.set('limit', String(opts.limit));
  const url = `${API_BASE}/v1/recordings${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

/**
 * Download a recording blob via the backend proxy.
 * The backend fetches the S3 object server-side and streams it back with
 * `Content-Disposition: attachment`, bypassing any S3 CORS restrictions.
 *
 * Backend must expose:
 *   GET /v1/recordings/{recording_id}/download
 *   → 200 with audio/* body + Content-Disposition: attachment; filename="..."
 */
export async function downloadRecordingBlob(recordingId: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const res = await fetch(
    `${API_BASE}/v1/recordings/${encodeURIComponent(recordingId)}/download`,
    { headers },
  );
  if (!res.ok) {
    let detail: any;
    try { detail = await res.json(); } catch { detail = await res.text(); }
    throw new Error(typeof detail === 'string' ? detail : (detail?.detail ?? `HTTP ${res.status}`));
  }
  return res.blob();
}
