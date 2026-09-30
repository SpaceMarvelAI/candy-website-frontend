/**
 * The hosted chat / voice pages are served by the BACKEND, not by this SPA. The
 * app is a static site on a different host from the API, so building the link
 * from window.location pointed users at a page that does not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { hostedAgentUrl } from '../../../src/api/agents';
import { API_BASE } from '../../../src/api/client';

describe('hostedAgentUrl', () => {
  it('builds the chat page on the API host', () => {
    expect(hostedAgentUrl('abc-123')).toBe(`${API_BASE}/chat/abc-123`);
  });

  it('builds the voice page on the API host, under the backend voice route', () => {
    expect(hostedAgentUrl('abc-123', 'voice')).toBe(`${API_BASE}/voice-demo/abc-123`);
  });

  it('never depends on the page the user is looking at', () => {
    const url = hostedAgentUrl('abc-123');
    expect(url.startsWith(API_BASE)).toBe(true);
    expect(url).not.toContain(window.location.host + '/chat');
  });
});

describe('no call site rebuilds the URL from window.location', () => {
  it.each([
    'src/components/agent/ChatbotWorkspace.tsx',
    'src/components/agent/EntryPointBanner.tsx',
    'src/pages/flows/NodeEditDrawer.tsx',
  ])('%s', (file) => {
    const src = readFileSync(resolvePath(__dirname, '../../../', file), 'utf8');
    expect(src).toContain('hostedAgentUrl(');
    expect(src).not.toMatch(/window\.location\.host\}\/chat\//);
  });
});
