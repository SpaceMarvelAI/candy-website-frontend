/**
 * flowsTargets — the first page to put buttons on the voice registry.
 *
 * The split between the safe controls and the destructive ones is the whole
 * point of that file, and it is a split that is easy to erode by accident: one
 * `destructive: true` in place of an `unavailable`, or one delete button given
 * an element, and voice can suddenly destroy something. These pin it.
 *
 * Following navTargets.test.ts, the page source is used as the fixture wherever
 * a claim is really about the page rather than about the registry.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import {
  FLOWS_NEW_WORKFLOW, FLOWS_SAFE_TARGETS, FLOWS_SAVE, FLOWS_STATIC, FLOWS_WORKFLOW_PICKER,
} from '../../../src/voice/registry/flowsTargets';
import { NAV_TARGETS } from '../../../src/voice/registry/navTargets';
import { spokenName } from '../../../src/voice/resolve';
import { parseLocal } from '../../../src/voice/parseLocal';

const pageSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');

const ALL_TARGETS = [...NAV_TARGETS, ...FLOWS_STATIC, ...FLOWS_SAFE_TARGETS];

/** Parse on /flows against everything addressable there. */
const onFlows = (utterance: string) =>
  parseLocal(utterance, { route: '/flows', targets: ALL_TARGETS });

describe('flowsTargets — the safe/destructive split', () => {
  it('marks every destructive control unavailable, not destructive', () => {
    /**
     * `destructive: true` would route these through validate.ts's
     * needs_confirmation, which nothing can currently answer — confirm/cancel
     * are in neither parseLocal's grammar nor the executor. That is a dead end
     * on the one path where a dead end is worst. Slice 6 flips this, and this
     * assertion with it.
     */
    for (const t of FLOWS_STATIC) {
      expect(t.unavailable, `${t.id} must carry an unavailable sentence`).toBeTruthy();
      expect(t.destructive, `${t.id} must not be destructive before slice 6`).toBeFalsy();
    }
  });

  it('gives every destructive control a sentence naming the way round it', () => {
    // "I could not find that" invites the user to repeat themselves. Naming the
    // limit and the alternative does not.
    for (const t of FLOWS_STATIC) {
      expect(t.unavailable).toMatch(/use the button/i);
      expect(t.unavailable!.length).toBeLessThan(120);
    }
  });

  it('leaves the safe controls actionable', () => {
    for (const t of FLOWS_SAFE_TARGETS) {
      expect(t.unavailable, `${t.id} should be clickable`).toBeUndefined();
      expect(t.destructive).toBeFalsy();
      expect(t.kind).toBe('button');
    }
  });

  it('scopes everything to /flows', () => {
    for (const t of [...FLOWS_STATIC, ...FLOWS_SAFE_TARGETS]) {
      expect(t.scope, `${t.id} must not be app-wide`).not.toBe('*');
      expect(t.scope).toEqual(['/flows']);
    }
  });

  it('namespaces every id under the page', () => {
    for (const t of [...FLOWS_STATIC, ...FLOWS_SAFE_TARGETS]) {
      expect(t.id.startsWith('flows.')).toBe(true);
    }
  });

  it('does not collide with any nav target id', () => {
    const navIds = new Set(NAV_TARGETS.map(t => t.id));
    for (const t of [...FLOWS_STATIC, ...FLOWS_SAFE_TARGETS]) {
      expect(navIds.has(t.id)).toBe(false);
    }
  });

  it('keeps every spoken name distinct across the whole registry', () => {
    // The invariant navTargets.test.ts already enforces for nav: two targets
    // that sound identical make "Do you mean X or X?", a question with no
    // answer. Adding a page's buttons must not break it.
    const names = ALL_TARGETS.map(spokenName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('flowsTargets — what the page actually wires up', () => {
  it('registers each safe target against a real element', () => {
    /**
     * A safe target with no element resolves fine and then fails at execution
     * with "no longer on screen", which reads as a bug. The page source is the
     * fixture here because the claim is about the page, not the registry.
     */
    const src = pageSource();
    const constFor: Record<string, string> = {
      'flows.save':           'FLOWS_SAVE',
      'flows.workflowPicker': 'FLOWS_WORKFLOW_PICKER',
      'flows.newWorkflow':    'FLOWS_NEW_WORKFLOW',
    };
    for (const t of FLOWS_SAFE_TARGETS) {
      expect(src, `${t.id} is not passed to useVoiceTarget`)
        .toContain(`useVoiceTarget<HTMLButtonElement>(${constFor[t.id]})`);
    }
    // And the refs are attached, not merely created.
    expect(src).toContain('ref={saveRef}');
    expect(src).toContain('ref={pickerRef}');
    expect(src).toContain('ref={newWorkflowRef}');
  });

  it('registers no element for any destructive target', () => {
    // The counterpart. An unavailable target needs no node, and giving one a
    // node is how a delete button becomes clickable ahead of slice 6.
    const src = pageSource();
    for (const t of FLOWS_STATIC) {
      expect(src, `${t.id} should not be referenced by the page`).not.toContain(t.id);
    }
  });

  it('does not add a confirmation dialog to this page', () => {
    // Flows' delete paths are genuinely unconfirmed — removeWorkflow and
    // deleteNode both act immediately — but wiring useConfirm in is a product
    // change to this page, not part of putting voice on it. Backlog, not here.
    expect(pageSource()).not.toContain('useConfirm');
  });
});

describe('flowsTargets — how it answers out loud', () => {
  it('answers "delete all flows" with the limit rather than not_found', () => {
    const parsed = onFlows('delete all flows');
    expect(parsed.kind).toBe('unavailable');
    if (parsed.kind !== 'unavailable') throw new Error('unreachable');
    expect(parsed.message).toBe("I cannot delete things by voice yet — use the button.");
  });

  it('does not let "delete all flows" reach the Flows nav entry', () => {
    // "flows" is also nav.flows' own name. Resolving there would navigate to
    // the page the user is already on and silently drop the word "delete".
    expect(JSON.stringify(onFlows('delete all flows'))).not.toContain('nav.flows');
  });

  it.each([
    'delete this workflow', 'remove workflow', 'delete flow',
    'delete this node', 'remove node',
    'clear canvas', 'empty the canvas',
  ])('answers %p without acting', (phrase) => {
    expect(onFlows(phrase).kind).toBe('unavailable');
  });

  it('never sends a destructive phrase to the server', () => {
    /**
     * The load-bearing consequence. `miss` is the only outcome that costs a
     * round trip, and a destructive phrase that missed would come back from the
     * endpoint as reject/unsupported — a dead end carrying none of the useful
     * wording. actionFor() checks `unavailable` first precisely so this cannot
     * happen.
     */
    for (const phrase of ['delete all flows', 'remove node', 'clear canvas']) {
      expect(onFlows(phrase).kind, phrase).not.toBe('miss');
    }
  });

  it('still clicks the safe controls', () => {
    expect(onFlows('save')).toEqual({
      kind: 'action', action: { kind: 'click', targetId: FLOWS_SAVE.id },
    });
    expect(onFlows('click save workflow')).toEqual({
      kind: 'action', action: { kind: 'click', targetId: FLOWS_SAVE.id },
    });
    expect(onFlows('new workflow')).toEqual({
      kind: 'action', action: { kind: 'click', targetId: FLOWS_NEW_WORKFLOW.id },
    });
    expect(onFlows('switch workflow')).toEqual({
      kind: 'action', action: { kind: 'click', targetId: FLOWS_WORKFLOW_PICKER.id },
    });
  });

  it('keeps "go to flows" pointing at the page, not at a button', () => {
    // The picker deliberately has no bare "workflows" alias for this reason.
    expect(parseLocal('go to workflows', { route: '/healthcare', targets: ALL_TARGETS }))
      .toEqual({ kind: 'action', action: { kind: 'navigate', targetId: 'nav.flows' } });
  });
});
