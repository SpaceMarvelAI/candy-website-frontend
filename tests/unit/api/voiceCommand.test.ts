/**
 * api/voiceCommand — the request that leaves the browser, and what is done
 * with the answer.
 *
 * The assertions worth having here are about what is NOT sent (no route
 * strings, no destructive flags) and about failing to an honest null rather
 * than to an exception or a half-trusted object, since the caller is a voice
 * turn that has to say something either way.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { setToken } from '../../../src/api/client';
import { API_BASE } from '../../mocks/fixtures';
import { parseCommand } from '../../../src/api/voiceCommand';
import type { ScreenSnapshot, VoiceTarget } from '../../../src/voice/types';

const URL = `${API_BASE}/v1/voice-command/parse`;

const FLOWS: VoiceTarget = {
  id: 'nav.flows', kind: 'nav', label: 'Flows',
  aliases: ['workflows'], scope: '*', path: '/flows',
};

const PURGE: VoiceTarget = {
  id: 'flows.purge', kind: 'button', label: 'Delete all flows',
  aliases: [], scope: ['/flows'], destructive: true, section: 'Flows',
};

const SNAPSHOT: ScreenSnapshot = {
  route: '/flows', routeId: 'flows', title: 'Flows', targets: [FLOWS, PURGE],
};

describe('api/voiceCommand — parseCommand', () => {
  beforeEach(() => setToken('tok'));

  it('sends the transcript, the screen and the target ids', async () => {
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      expect(request.headers.get('authorization')).toBe('Bearer tok');
      return HttpResponse.json({ kind: 'navigate', targetId: 'nav.flows' });
    }));

    await parseCommand('take me to workflows', SNAPSHOT);

    expect(body.transcript).toBe('take me to workflows');
    expect(body.route).toBe('/flows');
    expect(body.route_id).toBe('flows');
    expect(body.title).toBe('Flows');
    expect(body.targets.map((t: any) => t.id)).toEqual(['nav.flows', 'flows.purge']);
  });

  it('never sends a path', async () => {
    /**
     * Invariant 1 of voice/types.ts, held across the network. The server cannot
     * put a route in an answer if it was never told one — the destination is
     * read off the local registry by execute.ts, from the id alone.
     */
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'navigate', targetId: 'nav.flows' });
    }));

    await parseCommand('go to flows', SNAPSHOT);

    for (const t of body.targets) expect(t).not.toHaveProperty('path');
  });

  it('never sends the destructive flag', async () => {
    // Confirmation is validate.ts's call. Telling the model which targets are
    // dangerous only invites it to reason about whether to skip the prompt.
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'reject', reason: 'unsupported' });
    }));

    await parseCommand('delete everything', SNAPSHOT);

    expect(JSON.stringify(body)).not.toContain('destructive');
  });

  it('sends only the five fields the server needs', async () => {
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'back' });
    }));

    await parseCommand('go back', SNAPSHOT);

    expect(Object.keys(body.targets[0]).sort())
      .toEqual(['aliases', 'id', 'kind', 'label', 'section']);
  });

  it('sends a missing section as null rather than dropping the key', async () => {
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'back' });
    }));

    await parseCommand('go back', SNAPSHOT);

    expect(body.targets[0].section).toBeNull();
    expect(body.targets[1].section).toBe('Flows');
  });

  it('returns the action when the server answers with one', async () => {
    server.use(http.post(URL, () =>
      HttpResponse.json({ kind: 'navigate', targetId: 'nav.flows' })));

    expect(await parseCommand('go', SNAPSHOT))
      .toEqual({ kind: 'navigate', targetId: 'nav.flows' });
  });

  it('passes a reject straight through', async () => {
    // A reject is a real answer — the server telling us this cannot be done —
    // and must stay distinct from the null that means "could not answer".
    server.use(http.post(URL, () =>
      HttpResponse.json({ kind: 'reject', reason: 'unknown_target' })));

    expect(await parseCommand('open billing', SNAPSHOT))
      .toEqual({ kind: 'reject', reason: 'unknown_target' });
  });

  it('returns null rather than throwing when the model is unreachable', async () => {
    server.use(http.post(URL, () =>
      HttpResponse.json({ detail: 'Could not parse that just now.' }, { status: 503 })));

    await expect(parseCommand('something', SNAPSHOT)).resolves.toBeNull();
  });

  it('returns null on a network failure', async () => {
    server.use(http.post(URL, () => HttpResponse.error()));

    await expect(parseCommand('something', SNAPSHOT)).resolves.toBeNull();
  });

  it('refuses a response whose kind is not in the union', async () => {
    /**
     * validateAction()'s switch is exhaustive over VoiceAction with no default
     * branch — a compile-time guarantee about our own code, not about bytes off
     * the network. An unknown kind reaching it would return undefined and the
     * hook would then read .status of undefined.
     */
    server.use(http.post(URL, () =>
      HttpResponse.json({ kind: 'exec', command: 'rm -rf /' })));

    await expect(parseCommand('do it', SNAPSHOT)).resolves.toBeNull();
  });

  it.each([null, 'navigate', 42, [], {}])('refuses the non-action %p', async (payload) => {
    server.use(http.post(URL, () => HttpResponse.json(payload)));
    await expect(parseCommand('do it', SNAPSHOT)).resolves.toBeNull();
  });

  it('sends an empty target list for a screen with nothing on it', async () => {
    let body: any;
    server.use(http.post(URL, async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({ kind: 'reject', reason: 'unknown_target' });
    }));

    await parseCommand('do something', { ...SNAPSHOT, targets: [] });

    expect(body.targets).toEqual([]);
  });
});
