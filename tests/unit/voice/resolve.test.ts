import { describe, it, expect } from 'vitest';
import { isInScope, resolveTabByOrdinal, resolveTarget } from '../../../src/voice/resolve';
import { GLOBAL_SEARCH, NAV_TARGETS } from '../../../src/voice/registry/navTargets';
import type { Resolution, VoiceTarget } from '../../../src/voice/types';

/** Narrow a Resolution to `ok` with a readable failure if it is not. */
function expectOk(r: Resolution): VoiceTarget {
  if (r.status !== 'ok') throw new Error(`expected ok, got ${r.status}: ${JSON.stringify(r)}`);
  return r.target;
}

const at = (route: string) => (phrase: string) => resolveTarget(phrase, NAV_TARGETS, { route });

describe('isInScope', () => {
  const scoped: VoiceTarget = { id: 's', kind: 'tab', label: 'S', aliases: [], scope: ['/live'] };
  const global: VoiceTarget = { id: 'g', kind: 'nav', label: 'G', aliases: [], scope: '*' };

  it('puts a * target in scope everywhere', () => {
    expect(isInScope(global, '/healthcare')).toBe(true);
  });

  it('matches a scoped target on its own route and children', () => {
    expect(isInScope(scoped, '/live')).toBe(true);
    expect(isInScope(scoped, '/live/demo')).toBe(true);
  });

  it('does not match a route that merely starts with the same letters', () => {
    expect(isInScope(scoped, '/livestream')).toBe(false);
    expect(isInScope(scoped, '/healthcare')).toBe(false);
  });
});

describe('resolveTarget — navigation', () => {
  const fromHealthcare = at('/healthcare');

  it('resolves a sidebar name', () => {
    expect(expectOk(fromHealthcare('analytics')).path).toBe('/analytics/summary');
  });

  it('resolves a misheard sidebar name', () => {
    expect(expectOk(fromHealthcare('analitics')).id).toBe('nav.analytics');
  });

  it('resolves a name STT ran together into one word', () => {
    expect(expectOk(fromHealthcare('knowledgegaps')).path).toBe('/analytics/knowledge-gaps');
    expect(expectOk(fromHealthcare('livecalls')).id).toBe('nav.live');
  });

  it('resolves through an alias', () => {
    expect(expectOk(fromHealthcare('integrations')).path).toBe('/connects');
  });

  it('reaches a tab on another route, because tabs are routes here', () => {
    expect(expectOk(fromHealthcare('sessions')).path).toBe('/analytics/sessions');
  });

  it('prefers the section over a tab inside it when you are outside that section', () => {
    // "Live calls" names both the sidebar entry and the /live/live tab.
    expect(expectOk(fromHealthcare('live calls')).id).toBe('nav.live');
  });

  it('prefers the tab once you are inside the section', () => {
    expect(expectOk(at('/live/demo')('live calls')).id).toBe('live.tab.live');
  });

  it('does not confuse the healthcare domain page with the healthcare agent', () => {
    expect(expectOk(fromHealthcare('healthcare')).path).toBe('/healthcare');
    expect(expectOk(fromHealthcare('healthcare agent')).path).toBe('/agents/healthcare');
  });
});

describe('resolveTarget — "Open Agents" is scoped to the current route', () => {
  it('goes to the analytics tab when already in analytics', () => {
    expect(expectOk(at('/analytics/summary')('agents')).path).toBe('/analytics/agents');
  });

  it('goes to the live tab when already in live calls', () => {
    expect(expectOk(at('/live/demo')('agents')).path).toBe('/live/agents');
  });

  it('asks which one when in neither section', () => {
    const r = at('/healthcare')('agents');
    if (r.status !== 'ambiguous') throw new Error(`expected ambiguous, got ${r.status}`);
    expect(r.candidates.map(c => c.id).sort())
      .toEqual(['analytics.tab.agents', 'live.tab.agents']);
  });

  it('still asks from a third section rather than picking one', () => {
    expect(at('/flows')('agents').status).toBe('ambiguous');
  });
});

describe('resolveTarget — nowhere to go', () => {
  it('names the alternatives for Settings instead of navigating', () => {
    const r = at('/healthcare')('settings');
    if (r.status !== 'unavailable') throw new Error(`expected unavailable, got ${r.status}`);
    expect(r.target.id).toBe('ui.settings');
    expect(r.target.path).toBeUndefined();
    expect(r.target.unavailable).toMatch(/no Settings page/i);
  });

  it('reports a coming-soon sidebar entry as unavailable, not missing', () => {
    const r = at('/healthcare')('prompt library');
    if (r.status !== 'unavailable') throw new Error(`expected unavailable, got ${r.status}`);
    expect(r.target.unavailable).toMatch(/coming soon/i);
  });

  it('returns not_found for a phrase the app has no word for', () => {
    const r = at('/healthcare')('quarterly tax return');
    expect(r.status).toBe('not_found');
  });

  it('returns not_found for an empty phrase', () => {
    expect(at('/healthcare')('').status).toBe('not_found');
    expect(at('/healthcare')('   ').status).toBe('not_found');
  });
});

describe('resolveTarget — kind filtering', () => {
  // The search box is live-registered by Topbar rather than static, so a
  // realistic snapshot is the static registry plus whatever the page added.
  const WITH_SEARCH = [...NAV_TARGETS, GLOBAL_SEARCH];

  it('finds the search box when only inputs are allowed', () => {
    const r = resolveTarget('search', WITH_SEARCH, { route: '/healthcare', kinds: ['input'] });
    expect(expectOk(r).id).toBe('global.search');
  });

  it('finds nothing when the wanted kind is not present', () => {
    const r = resolveTarget('analytics', WITH_SEARCH, { route: '/healthcare', kinds: ['select'] });
    expect(r.status).toBe('not_found');
  });

  it('will not return a nav target to a request for an input', () => {
    const r = resolveTarget('analytics', WITH_SEARCH, { route: '/healthcare', kinds: ['input'] });
    expect(r.status).toBe('not_found');
  });
});

describe('resolveTabByOrdinal', () => {
  it('counts tabs of the current route in registry order', () => {
    const r = resolveTabByOrdinal(3, NAV_TARGETS, '/analytics/summary');
    expect(expectOk(r).id).toBe('analytics.tab.latency');
  });

  it('counts the live tabs when on live', () => {
    expect(expectOk(resolveTabByOrdinal(4, NAV_TARGETS, '/live/demo')).id).toBe('live.tab.agents');
  });

  it('returns not_found past the end of the group', () => {
    expect(resolveTabByOrdinal(99, NAV_TARGETS, '/analytics/summary').status).toBe('not_found');
  });

  it('returns not_found on a route with no tabs', () => {
    expect(resolveTabByOrdinal(1, NAV_TARGETS, '/healthcare').status).toBe('not_found');
  });
});

describe('resolveTarget — the verb-stripped-fragment precondition', () => {
  // These tests exist so the coupling between parseLocal and this resolver is
  // enforced by CI rather than by a comment. If someone later "fixes" verb
  // handling by adding verbs to FILLER in match.ts, the last two break — which
  // is the point, because that fix would also delete the "Search" label and the
  // "connect apps" alias.
  const fromHealthcare = (p: string) => resolveTarget(p, NAV_TARGETS, { route: '/healthcare' });

  it('fails outright when a verb survives, instead of matching quietly', () => {
    // "open" is a spoken word no target accounts for, so the comparison lands
    // on the over-specified rung (0.44 here) and nothing clears ACCEPT.
    expect(fromHealthcare('open the analytics page').status).toBe('not_found');
  });

  it('fails loudly on the utterance that used to resolve to the wrong thing', () => {
    // History of this line, which is why it is worth a test: a flat 0.88 subset
    // rung first made this silently pick a target, then tied Healthcare against
    // Healthcare Agent. Both were quiet failures. not_found is the honest
    // answer for a whole utterance that was never meant to reach this function.
    expect(fromHealthcare('open the healthcare agent').status).toBe('not_found');
  });

  it('will not open a page because one alias matched half a phrase', () => {
    // "dashboard" is a real alias of Healthcare — /dashboard redirects there —
    // but "billing" is unaccounted for, so this must not navigate.
    expect(fromHealthcare('the billing dashboard').status).toBe('not_found');
  });

  it('resolves cleanly once the verb is gone', () => {
    expect(expectOk(fromHealthcare('the healthcare agent')).path).toBe('/agents/healthcare');
  });
});
