import { api } from './client';

export interface AvatarSession {
  session_token:      string;
  face_id:            string;
  max_session_length: number;
  max_idle_time:      number;
}

/**
 * Mint a Simli session token for the given agent. The session_token is
 * what the frontend SDK uses to open a WebRTC stream — the underlying
 * Simli API key stays server-side.
 *
 * Returns null if the backend signals 503 ("avatar service not
 * configured" — e.g. SIMLI_API_KEY is unset in dev). Callers should
 * treat null as "no avatar available, fall back to TestPanel".
 */
export async function createAvatarSession(
  agentId: string,
  opts: { face_id?: string } = {},
): Promise<AvatarSession | null> {
  try {
    return await api<AvatarSession>(`/v1/agents/${agentId}/avatar-session`, {
      method: 'POST',
      body:   opts,
    });
  } catch (e: any) {
    if (e?.status === 503) return null;
    throw e;
  }
}
