/**
 * voice/registry/flowsTargets.ts — what voice can do on /flows.
 *
 * The first page to register buttons at all. Two groups, and the split is not
 * cosmetic:
 *
 *   · SAFE — real controls, DOM-registered at mount by src/pages/flows/index.tsx
 *     and clicked through a real event. Declared here rather than inline at the
 *     call site for the same reason GLOBAL_SEARCH is declared in navTargets.ts:
 *     one place to read every name and alias voice answers to.
 *
 *   · FLOWS_STATIC — the destructive controls, carrying `unavailable` instead of
 *     `destructive: true`, and deliberately NOT DOM-registered.
 *
 * Why the destructive ones are static and elementless
 * ───────────────────────────────────────────────────
 * `unavailable` is resolved before anything is ever executed (actionFor() in
 * parseLocal.ts checks it first), so these targets never need an element to
 * click — they exist only so voice can give an honest answer instead of
 * "I could not find that", which is false when the button is right there and
 * only invites the user to repeat themselves. That is the same shape
 * COMING_SOON and SETTINGS already use in navTargets.ts.
 *
 * It also sidesteps a real constraint: the delete buttons on this page are
 * rendered inside .map() calls, one per workflow and one per node, and
 * useVoiceTarget is a hook that cannot be called in a loop. Registering them
 * would have meant hand-rolled ref callbacks churning on every canvas
 * re-render during a node drag. Nothing is lost by not having them — there is
 * no element to click while deleting by voice is switched off.
 *
 * They are generic ("Delete workflow"), not per-instance ("Delete Onboarding"),
 * because voice cannot delete ANY of them yet. Naming which one would imply a
 * precision the answer does not have.
 *
 * Slice 6 turns this around: it builds the pending-action state, adds
 * confirm/cancel to the grammar and to the executor, and then `destructive:
 * true` replaces `unavailable` on these same targets — at which point they do
 * need elements, and the .map() problem above becomes real work.
 */
import type { VoiceTarget } from '../types';

/**
 * Said out loud when voice recognises a destructive control but will not run
 * it. Names the limit AND the way round it, so the user does not simply say it
 * again louder.
 */
const CANNOT_DELETE = "I cannot delete things by voice yet — use the button.";
const CANNOT_CLEAR  = "I cannot clear the canvas by voice yet — use the button.";

/** Everything here belongs to this page; none of it exists elsewhere. */
const ON_FLOWS = ['/flows'] as const;

// ── Safe controls, registered against real elements ──────────────────────────

export const FLOWS_SAVE: VoiceTarget = {
  id: 'flows.save', kind: 'button', label: 'Save', scope: ON_FLOWS, section: 'Flows',
  aliases: ['save workflow', 'save flow', 'save changes', 'save this'],
};

export const FLOWS_WORKFLOW_PICKER: VoiceTarget = {
  id: 'flows.workflowPicker', kind: 'button', label: 'Switch workflow',
  scope: ON_FLOWS, section: 'Flows',
  // No bare "workflows" alias: that is nav.flows' own territory ("go to
  // workflows" has to keep reaching the page), and a tie between a nav entry
  // and a button on the page you are already looking at is not worth creating.
  //
  // "open workflow" was here in slice 4 and was dead vocabulary: stripLeadingVerb
  // removes the leading "open", and the remaining "workflow" exact-matches
  // nav.flows' own alias, which beats this target's subset match every time.
  // Removed rather than left in looking supported.
  aliases: ['workflow picker', 'switch flow', 'saved workflows', 'change workflow'],
};

/**
 * The workflow-name field in the toolbar.
 *
 * A real controlled input (`value={flowName} onChange={…}` at index.tsx:984), so
 * unlike the topbar search box there is genuinely something behind it: typing
 * here renames the workflow and Save persists it. That is what makes it the one
 * honest `type` target in slice 5.
 */
export const FLOWS_NAME: VoiceTarget = {
  id: 'flows.name', kind: 'input', label: 'Workflow name',
  scope: ON_FLOWS, section: 'Flows',
  // No bare "name": too generic to win a scoring contest honestly, and it would
  // collide with anything else ever labelled Name on this page.
  aliases: ['flow name', 'workflow title', 'name field', 'title field'],
};

export const FLOWS_NEW_WORKFLOW: VoiceTarget = {
  id: 'flows.newWorkflow', kind: 'button', label: 'New workflow',
  scope: ON_FLOWS, section: 'Flows',
  aliases: ['new flow', 'create workflow', 'create a flow', 'blank workflow', 'start a new flow'],
};

/** The three the page wires up, in the order the toolbar renders them. */
export const FLOWS_SAFE_TARGETS: readonly VoiceTarget[] = [
  FLOWS_WORKFLOW_PICKER,
  FLOWS_NEW_WORKFLOW,
  FLOWS_SAVE,
];

// ── Destructive controls, recognised but switched off ────────────────────────

export const FLOWS_STATIC: readonly VoiceTarget[] = [
  {
    id: 'flows.deleteWorkflow', kind: 'button', label: 'Delete workflow',
    scope: ON_FLOWS, section: 'Flows',
    aliases: [
      'delete flow', 'delete this workflow', 'delete this flow', 'remove workflow',
      'remove flow', 'delete all flows', 'delete all workflows', 'delete workflows',
    ],
    unavailable: CANNOT_DELETE,
  },
  {
    id: 'flows.deleteNode', kind: 'button', label: 'Delete node',
    scope: ON_FLOWS, section: 'Flows',
    aliases: ['remove node', 'delete this node', 'remove this node', 'delete block', 'remove block'],
    unavailable: CANNOT_DELETE,
  },
  {
    // Clear only empties the canvas in local state — the saved workflow is
    // untouched until Save. It still destroys unsaved work with no undo and no
    // confirmation dialog, which is enough to keep it off the voice path with
    // the deletes rather than in with Save.
    id: 'flows.clear', kind: 'button', label: 'Clear canvas',
    scope: ON_FLOWS, section: 'Flows',
    aliases: ['clear', 'clear canvas', 'clear the board', 'empty the canvas', 'remove all nodes'],
    unavailable: CANNOT_CLEAR,
  },
];
