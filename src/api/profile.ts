/**
 * profile.ts — client for Candy's own GET/PATCH /v1/profile (api/v1/profile.py on the backend).
 *
 * Candy's own local copy of the profile (name/phone/address/bio/avatar), so the app works
 * self-hosted without the spacemarvel-dashboard IDP too. When dashboard IS the IDP, it wins on
 * every login (backend persists it then); an edit made here is pushed back to the dashboard by
 * the backend, best-effort — this client has no part in that, it only talks to Candy's own API.
 */
import { api } from './client';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  bio: string | null;
  // Free-text employer name (e.g. from a LinkedIn data-export import) — global like bio, synced
  // with the dashboard. NOT a reference to any real company entity.
  employer?: string | null;
  title?: string | null;
  avatar_url: string | null;
}

interface ProfileResponse {
  status: string;
  data: UserProfile;
}

export async function getProfile(): Promise<UserProfile> {
  const res = await api<ProfileResponse>('/v1/profile');
  return res.data;
}

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  address?: string;
  bio?: string;
  employer?: string;
  title?: string;
  avatarFile?: File | null;
}

export async function updateProfile(input: UpdateProfileInput): Promise<UserProfile> {
  const form = new FormData();
  if (input.name !== undefined) form.append('name', input.name);
  if (input.phone !== undefined) form.append('phone', input.phone);
  if (input.address !== undefined) form.append('address', input.address);
  if (input.bio !== undefined) form.append('bio', input.bio);
  if (input.employer !== undefined) form.append('employer', input.employer);
  if (input.title !== undefined) form.append('title', input.title);
  if (input.avatarFile) form.append('avatar', input.avatarFile);

  const res = await api<ProfileResponse>('/v1/profile', { method: 'PATCH', body: form });
  return res.data;
}

export async function deleteAvatar(): Promise<UserProfile> {
  const res = await api<ProfileResponse>('/v1/profile/avatar', { method: 'DELETE' });
  return res.data;
}

/** Whatever a LinkedIn data-export ZIP contained — any key may be absent, never null (see
 *  docs/user-profiling-onboarding/linkedin-zip-upload.md). Does NOT save anything; the caller
 *  pre-fills its own form/draft and saves via updateProfile() once the user confirms. */
export interface LinkedInZipData {
  name?: string;
  bio?: string;
  title?: string;
  company?: string;
}

export async function uploadLinkedInZip(file: File): Promise<LinkedInZipData> {
  const form = new FormData();
  form.append('file', file);
  const res = await api<{ status: string; data: LinkedInZipData }>('/v1/profile/linkedin-zip', { method: 'POST', body: form });
  return res.data;
}
