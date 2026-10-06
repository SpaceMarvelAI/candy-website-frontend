/**
 * Coverage tests for the thin account/workspace API modules — onboarding.ts, profile.ts,
 * whatsapp.ts, workspaces.ts. Same convention as crud.test.ts: MSW intercepts every call
 * against API_BASE, each function is checked for the right method + path + unwrapped body.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';

import * as Onboarding from '../../../src/api/onboarding';
import * as Profile from '../../../src/api/profile';
import * as WhatsApp from '../../../src/api/whatsapp';
import * as Workspaces from '../../../src/api/workspaces';

beforeEach(() => setToken('test-token'));

const B = API_BASE;
const json = (data: unknown, status = 200) => () => HttpResponse.json(data as any, { status });

// ── onboarding ──────────────────────────────────────────────────────────────────
describe('api/onboarding', () => {
  const state: Onboarding.OnboardingState = {
    current_step: 'choose',
    steps: ['choose', 'number', 'invite'],
    selections: {},
    skipped_steps: [],
    completed: false,
    completed_at: null,
    dismissed: false,
    dismissed_at: null,
    steps_done: 0,
    steps_total: 3,
    auto_open: true,
  };

  it('getOnboarding GETs /v1/onboarding?product=candy and unwraps .data', async () => {
    server.use(http.get(`${B}/v1/onboarding`, ({ request }) => {
      expect(new URL(request.url).searchParams.get('product')).toBe('candy');
      return HttpResponse.json({ status: 'ok', data: state });
    }));
    const r = await Onboarding.getOnboarding();
    expect(r.current_step).toBe('choose');
  });

  it('saveOnboardingStep PATCHes {step, value}', async () => {
    server.use(http.patch(`${B}/v1/onboarding`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ step: 'number', value: '+911234567890' });
      return HttpResponse.json({ status: 'ok', data: { ...state, current_step: 'invite' } });
    }));
    const r = await Onboarding.saveOnboardingStep('number', '+911234567890');
    expect(r.current_step).toBe('invite');
  });

  it('skipOnboardingStep PATCHes {step, skip: true}', async () => {
    server.use(http.patch(`${B}/v1/onboarding`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ step: 'invite', skip: true });
      return HttpResponse.json({ status: 'ok', data: { ...state, completed: false } });
    }));
    const r = await Onboarding.skipOnboardingStep('invite');
    expect(r.completed).toBe(false);
  });

  it('dismissOnboarding POSTs { action: "dismiss" }', async () => {
    server.use(http.post(`${B}/v1/onboarding`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ action: 'dismiss' });
      return HttpResponse.json({ status: 'ok', data: { ...state, dismissed: true } });
    }));
    const r = await Onboarding.dismissOnboarding();
    expect(r.dismissed).toBe(true);
  });

  it('completeOnboarding POSTs { action: "complete" }', async () => {
    server.use(http.post(`${B}/v1/onboarding`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ action: 'complete' });
      return HttpResponse.json({ status: 'ok', data: { ...state, completed: true } });
    }));
    const r = await Onboarding.completeOnboarding();
    expect(r.completed).toBe(true);
  });
});

// ── profile ───────────────────────────────────────────────────────────────────
describe('api/profile', () => {
  const profile: Profile.UserProfile = {
    id: 'u1', email: 'a@candy.internal', name: 'Alice',
    phone: '+911234567890', address: '221B', bio: 'hi', avatar_url: null,
  };

  it('getProfile GETs /v1/profile', async () => {
    server.use(http.get(`${B}/v1/profile`, json({ status: 'ok', data: profile })));
    const r = await Profile.getProfile();
    expect(r.name).toBe('Alice');
  });

  it('updateProfile appends every provided field (name/phone/address/bio/avatarFile)', async () => {
    // jsdom's File isn't brand-compatible with undici's multipart parser, so this checks the
    // envelope (multipart content-type went out, i.e. the FormData path was taken) rather than
    // parsing the body — the string-only test below already verifies individual field values.
    const file = new File(['x'], 'avatar.png', { type: 'image/png' });
    server.use(http.patch(`${B}/v1/profile`, ({ request }) => {
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data/);
      return HttpResponse.json({ status: 'ok', data: profile });
    }));
    const r = await Profile.updateProfile({
      name: 'Alice', phone: '+911234567890', address: '221B', bio: 'hi', avatarFile: file,
    });
    expect(r.name).toBe('Alice');
  });

  it('updateProfile appends only the string fields when avatarFile is omitted', async () => {
    server.use(http.patch(`${B}/v1/profile`, async ({ request }) => {
      const form = await request.formData();
      expect(form.get('name')).toBe('Bob');
      expect(form.get('phone')).toBe('+10000000000');
      expect(form.get('address')).toBe('Baker St');
      expect(form.get('bio')).toBe('yo');
      expect(form.has('avatar')).toBe(false);
      return HttpResponse.json({ status: 'ok', data: profile });
    }));
    await Profile.updateProfile({ name: 'Bob', phone: '+10000000000', address: 'Baker St', bio: 'yo' });
  });

  it('updateProfile with no fields sends an empty form (every optional field skipped)', async () => {
    server.use(http.patch(`${B}/v1/profile`, async ({ request }) => {
      const form = await request.formData();
      expect(Array.from(form.keys())).toEqual([]);
      return HttpResponse.json({ status: 'ok', data: profile });
    }));
    const r = await Profile.updateProfile({});
    expect(r.id).toBe('u1');
  });

  it('updateProfile skips the avatar field when avatarFile is null', async () => {
    server.use(http.patch(`${B}/v1/profile`, async ({ request }) => {
      const form = await request.formData();
      expect(form.has('avatar')).toBe(false);
      return HttpResponse.json({ status: 'ok', data: profile });
    }));
    await Profile.updateProfile({ avatarFile: null });
  });

  it('deleteAvatar DELETEs /v1/profile/avatar', async () => {
    server.use(http.delete(`${B}/v1/profile/avatar`, json({ status: 'ok', data: { ...profile, avatar_url: null } })));
    const r = await Profile.deleteAvatar();
    expect(r.avatar_url).toBeNull();
  });
});

// ── whatsapp ──────────────────────────────────────────────────────────────────
describe('api/whatsapp', () => {
  const account: WhatsApp.WhatsAppAccount = {
    id: 'wa1', agent_id: 'a1', phone_number_id: 'pn1',
    display_phone_number: '+1 555', waba_id: 'waba1', is_active: true,
  };

  it('listWhatsAppAccounts GETs the agent-scoped list', async () => {
    server.use(http.get(`${B}/v1/agents/a1/whatsapp-accounts`, json([account])));
    const r = await WhatsApp.listWhatsAppAccounts('a1');
    expect(r).toEqual([account]);
  });

  it('connectWhatsAppAccount POSTs the connect body', async () => {
    server.use(http.post(`${B}/v1/agents/a1/whatsapp-accounts`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ phone_number_id: 'pn1', access_token: 'tok' });
      return HttpResponse.json(account);
    }));
    const r = await WhatsApp.connectWhatsAppAccount('a1', { phone_number_id: 'pn1', access_token: 'tok' });
    expect(r.id).toBe('wa1');
  });

  it('disconnectWhatsAppAccount DELETEs the account path and resolves with no value', async () => {
    server.use(http.delete(`${B}/v1/agents/a1/whatsapp-accounts/wa1`, () => new HttpResponse(null, { status: 204 })));
    await expect(WhatsApp.disconnectWhatsAppAccount('a1', 'wa1')).resolves.toBeUndefined();
  });
});

// ── workspaces ────────────────────────────────────────────────────────────────
describe('api/workspaces', () => {
  const ws: Workspaces.MyWorkspace = {
    org_id: 'org1', org_name: 'Acme', workspace_type: 'business', plan: 'pro', your_role: 'admin',
  };

  it('listMyWorkspaces GETs the SSO workspaces list and returns .data', async () => {
    server.use(http.get(`${B}/v1/auth/sso/oidc/workspaces`, json({ status: 'ok', count: 1, data: [ws] })));
    const r = await Workspaces.listMyWorkspaces();
    expect(r).toEqual([ws]);
  });

  it('listMyWorkspaces falls back to [] when the server omits data', async () => {
    server.use(http.get(`${B}/v1/auth/sso/oidc/workspaces`, json({ status: 'ok', count: 0 })));
    const r = await Workspaces.listMyWorkspaces();
    expect(r).toEqual([]);
  });

  it('switchWorkspace POSTs { workspace_id } and returns the new token bundle', async () => {
    server.use(http.post(`${B}/v1/auth/sso/oidc/switch-workspace`, async ({ request }) => {
      const body = await request.json() as any;
      expect(body).toEqual({ workspace_id: 'org1' });
      return HttpResponse.json({
        status: 'ok', workspace_id: 'org1', org_id: 'org1', workspace_name: 'Acme',
        workspace_type: 'business', plan: 'pro', role: 'admin', access_token: 'new-tok',
      });
    }));
    const r = await Workspaces.switchWorkspace('org1');
    expect(r.access_token).toBe('new-tok');
  });
});
