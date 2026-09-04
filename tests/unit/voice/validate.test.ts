import { describe, it, expect } from 'vitest';
import { validateAction } from '../../../src/voice/validate';
import { GLOBAL_SEARCH } from '../../../src/voice/registry/navTargets';
import type { ScreenSnapshot, VoiceAction, VoiceTarget } from '../../../src/voice/types';

const t = (over: Partial<VoiceTarget> & Pick<VoiceTarget, 'id' | 'kind'>): VoiceTarget => ({
  label: over.id, aliases: [], scope: '*', ...over,
});

const NAV      = t({ id: 'nav.analytics', kind: 'nav',    label: 'Analytics', path: '/analytics/summary' });
const TAB      = t({ id: 'live.tab.chat', kind: 'tab',    label: 'Chat sessions', path: '/live/chat' });
const PANEL    = t({ id: 'hc.filter.all', kind: 'tab',    label: 'All' });
const BUTTON   = t({ id: 'flows.save',    kind: 'button', label: 'Save workflow' });
const INPUT    = t({ id: 'flows.name',    kind: 'input',  label: 'Workflow name' });
const SELECT   = t({ id: 'hc.direction',  kind: 'select', label: 'Direction' });
const DELETE   = t({ id: 'flows.delete',  kind: 'button', label: 'Delete workflow', destructive: true });
const SETTINGS = t({ id: 'ui.settings',   kind: 'nav',    label: 'Settings',
  unavailable: 'There is no Settings page — did you mean Appearance, or Connectors?' });

const snapshot = (targets: VoiceTarget[]): ScreenSnapshot => ({
  route: '/flows', routeId: 'flows', title: 'Flows', targets,
});

const ALL = snapshot([NAV, TAB, PANEL, BUTTON, INPUT, SELECT, DELETE, SETTINGS, GLOBAL_SEARCH]);

describe('validateAction — actions with no target', () => {
  const bare: VoiceAction[] = [{ kind: 'back' }, { kind: 'forward' }, { kind: 'confirm' }, { kind: 'cancel' }];

  it('accepts every targetless action', () => {
    for (const action of bare) {
      expect(validateAction(action, ALL).status).toBe('ok');
    }
  });

  it('accepts a known scroll direction', () => {
    expect(validateAction({ kind: 'scroll', direction: 'down' }, ALL).status).toBe('ok');
  });

  it('rejects an unknown scroll direction', () => {
    const bad = { kind: 'scroll', direction: 'sideways' } as unknown as VoiceAction;
    expect(validateAction(bad, ALL)).toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });

  it('rejects a nonsensical scroll amount', () => {
    expect(validateAction({ kind: 'scroll', direction: 'down', amount: -5 }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });
});

describe('validateAction — the target must be on screen', () => {
  it('rejects a target that is not in the snapshot', () => {
    expect(validateAction({ kind: 'click', targetId: 'flows.save' }, snapshot([NAV])))
      .toMatchObject({ status: 'rejected', reason: 'unknown_target' });
  });

  it('rejects an id the model could only have invented', () => {
    expect(validateAction({ kind: 'navigate', targetId: 'nav.billing' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'unknown_target' });
  });

  it('rejects an id shaped like a path, because a path is not an id', () => {
    // The executor reads destinations off the registry, so spoken text can
    // never become a route. This asserts the id lookup is the only door in.
    expect(validateAction({ kind: 'navigate', targetId: '/admin/delete-everything' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'unknown_target' });
  });

  it('rejects an id shaped like a selector', () => {
    expect(validateAction({ kind: 'click', targetId: 'button.danger' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'unknown_target' });
  });

  it('accepts a target that is present', () => {
    expect(validateAction({ kind: 'navigate', targetId: 'nav.analytics' }, ALL).status).toBe('ok');
  });
});

describe('validateAction — kinds have to line up', () => {
  it('will not type into a button', () => {
    expect(validateAction({ kind: 'type', targetId: 'flows.save', value: 'hello' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'wrong_kind' });
  });

  it('will not select on a nav item', () => {
    expect(validateAction({ kind: 'select', targetId: 'nav.analytics', option: 'x' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'wrong_kind' });
  });

  it('will not open a button as a tab', () => {
    expect(validateAction({ kind: 'openTab', targetId: 'flows.save' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'wrong_kind' });
  });

  it('will not navigate to a tab that is not a route', () => {
    expect(validateAction({ kind: 'navigate', targetId: 'hc.filter.all' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'wrong_kind' });
  });

  it('will open an in-page tab that has no route', () => {
    expect(validateAction({ kind: 'openTab', targetId: 'hc.filter.all' }, ALL).status).toBe('ok');
  });

  it('accepts typing into an input and selecting on a select', () => {
    expect(validateAction({ kind: 'type', targetId: 'flows.name', value: 'Weekly' }, ALL).status).toBe('ok');
    expect(validateAction({ kind: 'select', targetId: 'hc.direction', option: 'Inbound' }, ALL).status).toBe('ok');
  });
});

describe('validateAction — values', () => {
  it('rejects an empty or whitespace value', () => {
    expect(validateAction({ kind: 'type', targetId: 'flows.name', value: '   ' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });

  it('rejects an absurdly long value', () => {
    expect(validateAction({ kind: 'type', targetId: 'flows.name', value: 'x'.repeat(501) }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });

  it('rejects an empty select option', () => {
    expect(validateAction({ kind: 'select', targetId: 'hc.direction', option: '' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });
});

describe('validateAction — search', () => {
  it('accepts a search when the box is on screen', () => {
    expect(validateAction({ kind: 'search', query: 'refunds' }, ALL).status).toBe('ok');
  });

  it('rejects a search when there is no search box', () => {
    expect(validateAction({ kind: 'search', query: 'refunds' }, snapshot([NAV])))
      .toMatchObject({ status: 'rejected', reason: 'not_visible' });
  });

  it('rejects an empty query', () => {
    expect(validateAction({ kind: 'search', query: '  ' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'invalid_value' });
  });

  it('validates against the real registered search id', () => {
    expect(GLOBAL_SEARCH.id).toBe('global.search');
  });
});

describe('validateAction — destructive targets', () => {
  it('asks before deleting', () => {
    const r = validateAction({ kind: 'click', targetId: 'flows.delete' }, ALL);
    if (r.status !== 'needs_confirmation') throw new Error(`expected needs_confirmation, got ${r.status}`);
    expect(r.target.id).toBe('flows.delete');
    expect(r.prompt).toMatch(/confirm/i);
  });

  it('runs once confirmation has been spoken', () => {
    expect(validateAction({ kind: 'click', targetId: 'flows.delete' }, ALL, { confirmed: true }).status)
      .toBe('ok');
  });

  it('does not ask for a harmless target', () => {
    expect(validateAction({ kind: 'click', targetId: 'flows.save' }, ALL).status).toBe('ok');
  });
});

describe('validateAction — unavailable and non-executable', () => {
  it('refuses an unavailable target with its own sentence', () => {
    const r = validateAction({ kind: 'navigate', targetId: 'ui.settings' }, ALL);
    if (r.status !== 'rejected') throw new Error(`expected rejected, got ${r.status}`);
    expect(r.reason).toBe('unavailable');
    expect(r.message).toMatch(/no Settings page/i);
  });

  it('refuses to execute a clarify', () => {
    expect(validateAction({ kind: 'clarify', reason: 'which one?', candidates: ['a', 'b'] }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'not_executable' });
  });

  it('refuses to execute a reject', () => {
    expect(validateAction({ kind: 'reject', reason: 'unknown_target' }, ALL))
      .toMatchObject({ status: 'rejected', reason: 'not_executable' });
  });
});
