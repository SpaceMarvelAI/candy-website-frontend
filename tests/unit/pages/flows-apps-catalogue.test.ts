/**
 * FlowsPage's Apps tab error handling.
 *
 * FlowsPage has no component-render test harness (it pulls in voice targets,
 * the canvas, drag/drop, and several independently-loaded panels), so — same
 * approach as tests/unit/voice/flowsTargets.test.ts — the page source is used
 * as the fixture wherever the claim is about wiring rather than about pure
 * logic. The actual COMPOSIO_UNAUTHORIZED-vs-real-failure distinction is
 * already covered at the data layer by tests/unit/api/composio.test.ts; this
 * file only pins that FlowsPage actually *consumes* that distinction instead
 * of collapsing both into one generic "Couldn't load" message (the bug this
 * fixes — see api/v1 composio audit).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const pageSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');

describe('FlowsPage — apps catalogue error differentiation', () => {
  it('catches COMPOSIO_UNAUTHORIZED separately from a generic load failure', () => {
    const src = pageSource();
    expect(src).toContain("setAppsUnauthorized(false)");
    expect(src).toContain("(err as Error).message === 'COMPOSIO_UNAUTHORIZED'");
    expect(src).toContain('setAppsUnauthorized(true)');
  });

  it('renders a distinct message for the unauthorized case, not the generic LoadError', () => {
    const src = pageSource();
    // The unauthorized branch must come before the generic loadFailed.apps
    // branch and must not itself route through <LoadError>, which offers a
    // Retry that can never succeed for a missing dashboard token.
    const unauthorizedIdx = src.indexOf('appsUnauthorized ?');
    const loadFailedIdx = src.indexOf('loadFailed.apps ?');
    expect(unauthorizedIdx).toBeGreaterThan(-1);
    expect(loadFailedIdx).toBeGreaterThan(-1);
    expect(unauthorizedIdx).toBeLessThan(loadFailedIdx);

    const branchSlice = src.slice(unauthorizedIdx, loadFailedIdx);
    expect(branchSlice).toContain('Sign in via SSO');
    expect(branchSlice).not.toContain('<LoadError');
  });

  it('still shows the generic retryable LoadError for a real backend failure', () => {
    const src = pageSource();
    expect(src).toContain('<LoadError what="the app catalogue" onRetry={() => runLoad(\'apps\')} />');
  });
});
