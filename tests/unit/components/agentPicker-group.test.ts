/**
 * Ordering and search rules for the agent switcher.
 *
 * The old picker rendered a wrapping row of pills in whatever order the API
 * returned, so an agent changed position between refreshes, the status badge was
 * repeated on every pill, and there was no way to search 17+ agents. These are
 * the rules that replaced it.
 */
import { describe, it, expect } from 'vitest';
import { groupAgents } from '../../../src/components/agent/AgentPicker';
import type { Agent } from '../../../src/api/agents';

const a = (name: string, status: string, id = name.toLowerCase().replace(/\W/g, '')): Agent =>
  ({ id, name, agent_flow_status: status, use_case_slug: 'health' } as unknown as Agent);

describe('groupAgents — grouping', () => {
  it('orders groups most-actionable first', () => {
    const out = groupAgents([
      a('Archived One', 'archived'),
      a('Draft One', 'not_designed'),
      a('Live One', 'published'),
      a('Ready One', 'ready_to_test'),
    ], '');
    expect(out.map(g => g.status)).toEqual([
      'published', 'ready_to_test', 'not_designed', 'archived',
    ]);
  });

  it('sorts an unrecognised status to the end rather than dropping it', () => {
    const out = groupAgents([a('Weird', 'some_new_status'), a('Live', 'published')], '');
    expect(out.map(g => g.status)).toEqual(['published', 'some_new_status']);
  });

  it('treats a missing status as not_designed', () => {
    const out = groupAgents([a('No Status', '')], '');
    expect(out[0].status).toBe('not_designed');
  });

  it('sorts by name inside each group, so position is stable across refreshes', () => {
    const out = groupAgents([
      a('Zebra Agent', 'ready_to_test'),
      a('Alpha Agent', 'ready_to_test'),
      a('Middle Agent', 'ready_to_test'),
    ], '');
    expect(out[0].list.map(x => x.name)).toEqual(['Alpha Agent', 'Middle Agent', 'Zebra Agent']);
  });

  it('returns no groups for an empty list', () => {
    expect(groupAgents([], '')).toEqual([]);
  });
});

describe('groupAgents — search', () => {
  const list = [
    a('Patient Intake Agent', 'ready_to_test', '44aecc2e'),
    a('Patient Intake Agent', 'ready_to_test', '3eac5c16'),
    a('Referral Intake Agent', 'ready_to_test', '1867353e'),
    a('Trilife Hospital', 'not_designed', 'd2b686a4'),
  ];

  it('matches a name substring, case-insensitively', () => {
    expect(groupAgents(list, 'INTAKE').flatMap(g => g.list)).toHaveLength(3);
  });

  it('matches an id by prefix — the only way to separate same-named agents', () => {
    const hits = groupAgents(list, '44aecc').flatMap(g => g.list);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('44aecc2e');
  });

  it('does not match an id mid-string, which would be noise', () => {
    expect(groupAgents(list, 'aecc2e').flatMap(g => g.list)).toHaveLength(0);
  });

  it('drops groups that end up empty', () => {
    const out = groupAgents(list, 'trilife');
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe('not_designed');
  });

  it('ignores surrounding whitespace and returns everything for a blank query', () => {
    expect(groupAgents(list, '   ').flatMap(g => g.list)).toHaveLength(4);
  });

  it('returns nothing for a query that matches nothing', () => {
    expect(groupAgents(list, 'zzzz')).toEqual([]);
  });
});
