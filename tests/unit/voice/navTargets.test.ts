import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { GLOBAL_SEARCH, NAV_TARGETS } from '../../../src/voice/registry/navTargets';
import { normalize } from '../../../src/voice/match';
import { spokenName } from '../../../src/voice/resolve';

/**
 * The registry is hand-transcribed from src/App.tsx. Hand-transcribed things
 * drift, and a voice command that navigates to a route which no longer exists
 * fails at the worst possible moment — after the user has already spoken. So
 * the route table itself is the fixture: this reads App.tsx and fails if the
 * registry names a destination the router does not serve.
 */
function routePatterns(): RegExp[] {
  const src = readFileSync(resolvePath(__dirname, '../../../src/App.tsx'), 'utf8');
  const patterns: RegExp[] = [];
  for (const m of src.matchAll(/path="([^"]*)"/g)) {
    const raw = m[1];
    if (raw === '*') continue;
    patterns.push(new RegExp('^' + raw.replace(/:[^/]+/g, '[^/]+') + '$'));
  }
  return patterns;
}

const PATTERNS = routePatterns();

const servedByRouter = (path: string) => PATTERNS.some(re => re.test(path));

describe('navTargets — the route table is the source of truth', () => {
  it('found the real route table to check against', () => {
    expect(PATTERNS.length).toBeGreaterThan(20);
    expect(servedByRouter('/healthcare')).toBe(true);
    expect(servedByRouter('/analytics/summary')).toBe(true);
    // Guard the guard: a route this app does not have must not match.
    expect(servedByRouter('/settings')).toBe(false);
    expect(servedByRouter('/integrations')).toBe(false);
    expect(servedByRouter('/agents')).toBe(false);
  });

  it('never points at a route the router does not serve', () => {
    const invented = NAV_TARGETS
      .filter(t => t.path !== undefined)
      .filter(t => !servedByRouter(t.path as string))
      .map(t => `${t.id} -> ${t.path}`);
    expect(invented).toEqual([]);
  });

  it('has no target for the three commands with no destination', () => {
    const paths = NAV_TARGETS.map(t => t.path).filter(Boolean);
    expect(paths).not.toContain('/settings');
    expect(paths).not.toContain('/integrations');
    expect(paths).not.toContain('/agents');
  });
});

describe('navTargets — shape', () => {
  it('has unique ids', () => {
    const ids = NAV_TARGETS.map(t => t.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('gives every target either somewhere to go or a reason it cannot', () => {
    const stranded = NAV_TARGETS
      .filter(t => t.kind === 'nav' || t.kind === 'tab')
      .filter(t => !t.path && !t.unavailable)
      .map(t => t.id);
    expect(stranded).toEqual([]);
  });

  it('never marks a target unavailable while also giving it a path', () => {
    const contradictory = NAV_TARGETS.filter(t => t.unavailable && t.path).map(t => t.id);
    expect(contradictory).toEqual([]);
  });

  it('gives every tab a group and a position', () => {
    for (const t of NAV_TARGETS.filter(t => t.kind === 'tab')) {
      expect(t.group, t.id).toBeTruthy();
      expect(typeof t.index, t.id).toBe('number');
    }
  });

  it('numbers each tab group from zero without gaps or repeats', () => {
    const groups = new Map<string, number[]>();
    for (const t of NAV_TARGETS.filter(t => t.kind === 'tab')) {
      const list = groups.get(t.group as string) ?? [];
      list.push(t.index as number);
      groups.set(t.group as string, list);
    }
    for (const [group, indexes] of groups) {
      expect(indexes.sort((a, b) => a - b), group)
        .toEqual(indexes.map((_, i) => i));
    }
  });

  it('scopes every tab to a route and leaves nav targets global', () => {
    for (const t of NAV_TARGETS.filter(t => t.kind === 'tab')) {
      expect(t.scope, t.id).not.toBe('*');
    }
  });

  it('leaves the topbar search box out of the static registry', () => {
    // It is a DOM element, and it does not exist on every route: /agents/* and
    // /chatbots/:id render outside AppLayout, so there is no Topbar to search
    // in. Topbar registers it at mount, which is what makes `search` correctly
    // unavailable on those pages instead of silently failing.
    expect(GLOBAL_SEARCH.kind).toBe('input');
    expect(GLOBAL_SEARCH.scope).toBe('*');
    expect(NAV_TARGETS).not.toContain(GLOBAL_SEARCH);
  });

  it('gives every target a spoken name no other target shares', () => {
    // This is what makes "Do you mean Agents or Agents?" impossible to
    // reintroduce. Two tabs are genuinely both labelled "Agents", so the guard
    // cannot be uniqueness of labels — it has to be uniqueness of what gets
    // said out loud. Adding a colliding target fails here, not at the mic.
    // Normalised, so a collision that differs only in case is still caught.
    const byName = new Map<string, string[]>();
    for (const t of NAV_TARGETS) {
      const key = normalize(spokenName(t));
      byName.set(key, [...(byName.get(key) ?? []), t.id]);
    }
    const collisions = [...byName.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([name, ids]) => `${name}: ${ids.join(', ')}`);
    expect(collisions).toEqual([]);
  });

  it('gives every tab a section, so it can be told apart from its twin', () => {
    for (const t of NAV_TARGETS.filter(t => t.kind === 'tab')) {
      expect(t.section, t.id).toBeTruthy();
    }
  });

  it('names both Agents tabs distinctly when spoken', () => {
    const names = NAV_TARGETS
      .filter(t => normalize(t.label) === 'agents')
      .map(spokenName)
      .sort();
    expect(names).toEqual(['Agents in Analytics', 'Agents in Live Calls']);
  });

  it('contains nothing that needs the DOM to exist', () => {
    // Every static target must be reachable by navigate() alone.
    const domBound = NAV_TARGETS.filter(t => t.kind === 'input' || t.kind === 'select' || t.kind === 'button');
    expect(domBound.map(t => t.id)).toEqual([]);
  });
});

describe('navTargets — aliases', () => {
  it('has no alias that normalizes to nothing', () => {
    const empty: string[] = [];
    for (const t of NAV_TARGETS) {
      for (const a of t.aliases) if (!normalize(a)) empty.push(`${t.id}: "${a}"`);
    }
    expect(empty).toEqual([]);
  });

  it('has no alias duplicated within one target', () => {
    for (const t of NAV_TARGETS) {
      const norm = t.aliases.map(normalize);
      expect(norm.length, t.id).toBe(new Set(norm).size);
    }
  });

  it('routes the word people actually say for integrations to Connectors', () => {
    const connectors = NAV_TARGETS.find(t => t.id === 'nav.connectors');
    expect(connectors?.path).toBe('/connects');
    expect(connectors?.aliases).toContain('integrations');
  });

  it('answers Settings with an explanation rather than a destination', () => {
    const settings = NAV_TARGETS.find(t => t.id === 'ui.settings');
    expect(settings?.path).toBeUndefined();
    expect(settings?.unavailable).toMatch(/Appearance|Connectors/);
  });

  it('keeps both Agents tabs, so the tie that forces a question still exists', () => {
    const agents = NAV_TARGETS.filter(t => normalize(t.label) === 'agents');
    expect(agents.map(t => t.id).sort()).toEqual(['analytics.tab.agents', 'live.tab.agents']);
  });
});
