import { describe, it, expect } from 'vitest';
import { parseLocal, stripLeadingVerb } from '../../../src/voice/parseLocal';
import { GLOBAL_SEARCH, NAV_TARGETS } from '../../../src/voice/registry/navTargets';
import type { LocalParse, VoiceAction, VoiceTarget } from '../../../src/voice/types';

/** A realistic snapshot: the static registry plus what a page registers. */
const TARGETS: VoiceTarget[] = [...NAV_TARGETS, GLOBAL_SEARCH];

const at = (route: string, targets: VoiceTarget[] = TARGETS) =>
  (utterance: string) => parseLocal(utterance, { route, targets });

function expectAction(r: LocalParse): VoiceAction {
  if (r.kind !== 'action') throw new Error(`expected an action, got ${r.kind}: ${JSON.stringify(r)}`);
  return r.action;
}

describe('stripLeadingVerb', () => {
  it('removes a single-word verb', () => {
    expect(stripLeadingVerb('open analytics')).toEqual({ category: 'navigate', phrase: 'open', rest: 'analytics' });
  });

  it('removes a multi-word verb, longest first', () => {
    expect(stripLeadingVerb('show me the flows')).toEqual({ category: 'navigate', phrase: 'show me', rest: 'the flows' });
    expect(stripLeadingVerb('take me to analytics')).toEqual({ category: 'navigate', phrase: 'take me to', rest: 'analytics' });
  });

  it('reports the category so non-navigation verbs can be told apart', () => {
    expect(stripLeadingVerb('click save').category).toBe('click');
    expect(stripLeadingVerb('type hello').category).toBe('type');
    expect(stripLeadingVerb('scroll down').category).toBe('scroll');
  });

  it('leaves a bare verb alone, because it may be a target name', () => {
    // "Search" is the label of the topbar box, not a command missing its object.
    expect(stripLeadingVerb('search')).toEqual({ category: null, phrase: null, rest: 'search' });
  });

  it('never strips mid-phrase, so alias text survives', () => {
    // "connect apps" is a real alias of Connectors.
    expect(stripLeadingVerb('connect apps')).toEqual({ category: null, phrase: null, rest: 'connect apps' });
    expect(stripLeadingVerb('the open flows')).toEqual({ category: null, phrase: null, rest: 'the open flows' });
  });

  it('tidies punctuation and casing', () => {
    expect(stripLeadingVerb('  Open   Analytics.  ')).toEqual({ category: 'navigate', phrase: 'open', rest: 'analytics' });
  });
});

describe('parseLocal — navigation', () => {
  const fromHealthcare = at('/healthcare');

  it('handles the canonical command without touching the network', () => {
    expect(expectAction(fromHealthcare('go to Analytics')))
      .toEqual({ kind: 'navigate', targetId: 'nav.analytics' });
  });

  it('resolves the utterance that is ambiguous without verb stripping', () => {
    // The whole reason stripLeadingVerb exists — resolve.test.ts pins the
    // un-stripped form coming back ambiguous.
    expect(expectAction(fromHealthcare('open the healthcare agent')))
      .toEqual({ kind: 'navigate', targetId: 'nav.agent.healthcare' });
  });

  it('accepts a bare target name with no verb at all', () => {
    expect(expectAction(fromHealthcare('flows')))
      .toEqual({ kind: 'navigate', targetId: 'nav.flows' });
  });

  it('sends a tab through openTab rather than navigate', () => {
    expect(expectAction(fromHealthcare('show me sessions')))
      .toEqual({ kind: 'openTab', targetId: 'analytics.tab.sessions' });
  });

  it('maps the Integrations wording onto Connectors', () => {
    expect(expectAction(fromHealthcare('open the integrations tab')))
      .toEqual({ kind: 'navigate', targetId: 'nav.connectors' });
  });
});

describe('parseLocal — history', () => {
  it('understands back and forward', () => {
    expect(expectAction(at('/flows')('go back'))).toEqual({ kind: 'back' });
    expect(expectAction(at('/flows')('back'))).toEqual({ kind: 'back' });
    expect(expectAction(at('/flows')('previous page'))).toEqual({ kind: 'back' });
    expect(expectAction(at('/flows')('go forward'))).toEqual({ kind: 'forward' });
  });

  it('does not mistake "go back to X" for history', () => {
    expect(expectAction(at('/flows')('go back to analytics')))
      .toEqual({ kind: 'navigate', targetId: 'nav.analytics' });
  });
});

describe('parseLocal — tabs by position', () => {
  it('counts ordinals within the current route', () => {
    expect(expectAction(at('/analytics/summary')('open the third tab')))
      .toEqual({ kind: 'openTab', targetId: 'analytics.tab.latency' });
  });

  it('accepts a digit', () => {
    expect(expectAction(at('/live/demo')('tab 2')))
      .toEqual({ kind: 'openTab', targetId: 'live.tab.live' });
    expect(expectAction(at('/live/demo')('open the 4th tab')))
      .toEqual({ kind: 'openTab', targetId: 'live.tab.agents' });
  });

  it('misses rather than guessing when the position does not exist', () => {
    expect(at('/analytics/summary')('open the ninth tab').kind).toBe('miss');
    expect(at('/healthcare')('open the first tab').kind).toBe('miss');
  });
});

describe('parseLocal — answers that are not actions', () => {
  it('reports Settings as unavailable without a round trip', () => {
    const r = at('/healthcare')('open settings');
    if (r.kind !== 'unavailable') throw new Error(`expected unavailable, got ${r.kind}`);
    expect(r.message).toMatch(/no Settings page/i);
  });

  it('reports a coming-soon entry as unavailable', () => {
    expect(at('/healthcare')('open prompt library').kind).toBe('unavailable');
  });

  it('keeps an ambiguity local instead of asking the model to break the tie', () => {
    const r = at('/healthcare')('open agents');
    if (r.kind !== 'ambiguous') throw new Error(`expected ambiguous, got ${r.kind}`);
    expect(r.candidates.map(c => c.id).sort()).toEqual(['analytics.tab.agents', 'live.tab.agents']);
  });

  it('resolves the same phrase once the route disambiguates it', () => {
    expect(expectAction(at('/analytics/summary')('open agents')))
      .toEqual({ kind: 'openTab', targetId: 'analytics.tab.agents' });
    expect(expectAction(at('/live/demo')('open agents')))
      .toEqual({ kind: 'openTab', targetId: 'live.tab.agents' });
  });
});

describe('parseLocal — deferring to the server', () => {
  it('misses on an utterance it has no grammar for', () => {
    expect(at('/healthcare')('what happened to my refunds last quarter').kind).toBe('miss');
  });

  it('misses on the empty string', () => {
    expect(at('/healthcare')('').kind).toBe('miss');
    expect(at('/healthcare')('   ').kind).toBe('miss');
  });

  it('lets a click verb through and resolves it by what the target is', () => {
    /**
     * Slice 4 opened the category gate to `click` as well as `navigate`, and
     * actionFor() then decides by the target's kind rather than by the verb. So
     * "click analytics" reaches a nav entry and navigates — clicking a sidebar
     * link and going to the route are the same intent, and routing is the one
     * that works whether or not the link happens to be rendered.
     *
     * The verb still cannot invent a kind: it selects which utterances are
     * considered, not what happens to them once a target is in hand.
     */
    expect(expectAction(at('/healthcare')('click analytics')))
      .toEqual({ kind: 'navigate', targetId: 'nav.analytics' });
  });

  it('misses a type with no field named, rather than picking one', () => {
    // "type analytics" says what, not where. Choosing the only visible input
    // would be a guess that silently goes wrong the moment a page has two, so
    // it goes to the server, which sees the same snapshot and can decide.
    expect(at('/healthcare')('type analytics').kind).toBe('miss');
  });

  it('still refuses a verb no slice has built yet', () => {
    expect(at('/healthcare')('scroll analytics').kind).toBe('miss');
    expect(at('/healthcare')('choose newest').kind).toBe('miss');
  });

  it('tells a target whose name starts with a verb from a command', () => {
    /**
     * The case this file's header predicted. stripLeadingVerb takes "search"
     * off both of these, so on the stripped fragment alone they are
     * indistinguishable — "box" and "refunds" are equally meaningless. Slice 5
     * settles it by retrying the WHOLE utterance against the registry first:
     * "search box" scores 1.0 against that target's own alias, "search for
     * refunds" scores 0.53 against a 0.72 threshold. Evidence, not a special
     * case for the word "box".
     */
    expect(expectAction(at('/healthcare')('search box')))
      .toEqual({ kind: 'click', targetId: GLOBAL_SEARCH.id });

    // ...and the command form is not mistaken for the box.
    const command = at('/healthcare')('search for refunds');
    expect(command.kind).toBe('unavailable');
  });
});


/**
 * Slice 5. Typing is real — Flows' workflow-name field is a controlled input —
 * while searching is not, because the topbar box reads nothing back. The
 * grammar has to keep those apart, and keep both apart from a target that
 * merely happens to be NAMED after a verb.
 */
describe('parseLocal — typing', () => {
  const FIELD: VoiceTarget = {
    id: 'flows.name', kind: 'input', label: 'Workflow name',
    scope: ['/flows'], section: 'Flows', aliases: ['flow name', 'workflow title'],
  };
  const onFlows = at('/flows', [...NAV_TARGETS, GLOBAL_SEARCH, FIELD]);

  it('types a value into a field named with a preposition', () => {
    expect(expectAction(onFlows('type onboarding into the workflow name')))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'onboarding' });
  });

  it.each(['into the', 'into', 'in the', 'in'])('accepts "%s" as the preposition', (prep) => {
    expect(expectAction(onFlows(`type onboarding ${prep} workflow name`)))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'onboarding' });
  });

  it('accepts the other type verbs', () => {
    expect(expectAction(onFlows('enter onboarding into the workflow name')))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'onboarding' });
    expect(expectAction(onFlows('write onboarding into the flow name')))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'onboarding' });
  });

  it('keeps a multi-word value whole', () => {
    expect(expectAction(onFlows('type q4 refund escalation into the workflow name')))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'q4 refund escalation' });
  });

  it('splits on the last preposition, so a value containing one survives', () => {
    expect(expectAction(onFlows('type sign in flow into the workflow name')))
      .toEqual({ kind: 'type', targetId: 'flows.name', value: 'sign in flow' });
  });

  it('misses when the named field is not on this screen', () => {
    // /healthcare has no workflow-name field. Nothing is typed anywhere.
    expect(at('/healthcare')('type onboarding into the workflow name').kind).toBe('miss');
  });

  it('will not type into something that is not a field', () => {
    // Restricted to kinds:['input'], so a button never becomes a type target
    // and validate.ts never has to catch a wrong_kind here.
    const withButton: VoiceTarget = {
      id: 'flows.save', kind: 'button', label: 'Save', scope: ['/flows'], aliases: [],
    };
    expect(at('/flows', [...NAV_TARGETS, withButton])('type hello into save').kind).toBe('miss');
  });
});

describe('parseLocal — searching is recognised but not connected', () => {
  it('refuses to search, and says why, without a round trip', () => {
    /**
     * The topbar box has no value, no onChange and no reader anywhere in src/.
     * Typing the words in and announcing a search would be a confident false
     * success — the user waits for results that cannot come. `unavailable`
     * keeps it off the network too, so it costs nothing to say so.
     */
    const r = at('/healthcare')('search for refunds');
    if (r.kind !== 'unavailable') throw new Error(`expected unavailable, got ${r.kind}`);
    expect(r.message).toMatch(/not connected yet/i);
    expect(r.message).not.toMatch(/searching/i);
  });

  it.each(['search for refunds', 'look for refunds', 'find refunds', 'search refunds'])(
    'refuses %p the same way', (phrase) => {
      expect(at('/healthcare')(phrase).kind).toBe('unavailable');
    });

  it('still focuses the box when it is named rather than commanded', () => {
    // The half that genuinely works: this is the Cmd-K shortcut, by voice.
    for (const phrase of ['search box', 'search bar', 'search']) {
      expect(expectAction(at('/healthcare')(phrase)))
        .toEqual({ kind: 'click', targetId: GLOBAL_SEARCH.id });
    }
  });

  it('never asks the server about either form', () => {
    // Both are answered locally, so neither costs a tool call.
    for (const phrase of ['search box', 'search for refunds']) {
      expect(at('/healthcare')(phrase).kind).not.toBe('miss');
    }
  });
});

/**
 * Scrolling is the one command that names no target, so the grammar has only
 * one thing to get right: which way. Everything else after the verb is a miss
 * rather than a guessed direction.
 */
describe('parseLocal — scrolling', () => {
  const dir = (utterance: string) => expectAction(at('/healthcare')(utterance));

  it('reads the four directions', () => {
    expect(dir('scroll down')).toEqual({ kind: 'scroll', direction: 'down' });
    expect(dir('scroll up')).toEqual({ kind: 'scroll', direction: 'up' });
    expect(dir('scroll to the top')).toEqual({ kind: 'scroll', direction: 'top' });
    expect(dir('scroll to the bottom')).toEqual({ kind: 'scroll', direction: 'bottom' });
  });

  it('accepts the shorter and longer ways people say the ends', () => {
    expect(dir('scroll top')).toEqual({ kind: 'scroll', direction: 'top' });
    expect(dir('scroll bottom')).toEqual({ kind: 'scroll', direction: 'bottom' });
    expect(dir('scroll all the way down')).toEqual({ kind: 'scroll', direction: 'bottom' });
    expect(dir('scroll all the way up')).toEqual({ kind: 'scroll', direction: 'top' });
    expect(dir('scroll to the end')).toEqual({ kind: 'scroll', direction: 'bottom' });
  });

  it('reads an end jump as an end, not as one page', () => {
    // "all the way down" contains "down". Ordered wrongly, the page branch
    // would claim it and the user would get one screen instead of the bottom.
    expect(dir('scroll all the way down')).toEqual({ kind: 'scroll', direction: 'bottom' });
    expect(dir('scroll down')).toEqual({ kind: 'scroll', direction: 'down' });
  });

  it('asks the server rather than guessing a direction it has no unit for', () => {
    // "a bit" is a real thing people say and the grammar has no length for it.
    // The server can answer with an explicit pixel amount, which is a better
    // answer than silently treating it as a full page.
    expect(at('/healthcare')('scroll down a bit').kind).toBe('miss');
    expect(at('/healthcare')('scroll sideways').kind).toBe('miss');
    expect(at('/healthcare')('scroll to the middle').kind).toBe('miss');
  });

  it('does not read a bare "scroll" as a command', () => {
    // stripLeadingVerb needs a non-empty remainder, so this stays a name-shaped
    // utterance rather than a direction-less scroll.
    expect(at('/healthcare')('scroll').kind).toBe('miss');
  });
});
