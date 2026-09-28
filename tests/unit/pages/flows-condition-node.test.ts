/**
 * FlowsPage's Condition node — Phase 2 (multi-hop execution + branching).
 *
 * Same constraint as flows-apps-catalogue.test.ts: FlowsPage has no
 * component-render test harness, so the page source is used as the fixture
 * wherever the claim is about wiring (a draggable node exists, an edge gets
 * tagged with a branch, a picker is wired up) rather than about pure logic.
 * Pure logic (condition evaluation, template rendering) is already covered
 * by tests/test_services/test_workflow_context.py on the backend and by
 * tests/unit/api/workflow-save.test.ts's save-payload round-trip tests here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const indexSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');
const drawerSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/NodeEditDrawer.tsx'), 'utf8');

describe('Condition node — draggable onto the canvas', () => {
  it('defines a static Condition node template', () => {
    expect(indexSource()).toContain("CONDITION_TEMPLATE");
    expect(indexSource()).toContain("type: 'condition' as const");
  });

  it('adds a Logic tab distinct from the existing Agents/Apps/Webhooks tabs', () => {
    const src = indexSource();
    // The tab array also grew AI/Tools tabs in Phase 3 — check membership,
    // not the exact array literal, so unrelated later tabs don't break this.
    const tabArrayLine = src.split('\n').find(l => l.includes("useState<'agents'"));
    expect(tabArrayLine).toContain("'logic'");
    expect(src).toContain("leftTab === 'logic'");
  });

  it('the Logic tab drags/taps CONDITION_TEMPLATE onto the canvas, same mechanism as the other tabs', () => {
    const src = indexSource();
    // CONDITION_TEMPLATE is only ever referenced from within the Logic tab
    // body, so a whole-file check is unambiguous without fragile substring
    // slicing across nested JSX fragments.
    expect(src).toContain('onPanelDragStart(e, CONDITION_TEMPLATE)');
    expect(src).toContain('addNodeFromPanel(CONDITION_TEMPLATE)');
  });

  it('preserves the three existing tabs unchanged (Agents/Apps/Webhooks bodies still present)', () => {
    const src = indexSource();
    expect(src).toContain("leftTab === 'agents'");
    expect(src).toContain("leftTab === 'apps'");
    expect(src).toContain("leftTab === 'webhooks'");
  });
});

describe('Condition node — rendering', () => {
  it('gives the condition node its own color/icon/label branch, not falling through to the app default', () => {
    const src = indexSource();
    expect(src).toContain("node.type === 'condition') return 'var(--amber)'");
    expect(src).toContain("node.type === 'condition') return 'shuffle'");
  });

  it('a condition node can be both a source (two branch handles) and a target', () => {
    const src = indexSource();
    // Phase 3 reformatted these onto multiple lines (ai/tool added too) —
    // grab a small window after each declaration rather than one exact line.
    const isSourceStart = src.indexOf('const isSource =');
    const isSourceBlock = src.slice(isSourceStart, src.indexOf(';', isSourceStart));
    const isTargetStart = src.indexOf('const isTarget =');
    const isTargetBlock = src.slice(isTargetStart, src.indexOf(';', isTargetStart));
    expect(isSourceBlock).toContain("n.type === 'condition'");
    expect(isTargetBlock).toContain("n.type === 'condition'");
  });

  it("shows the configured operator/value, or a not-configured warning, on the node card", () => {
    const src = indexSource();
    expect(src).toContain("node.type==='condition'");
    expect(src).toContain('not configured');
  });
});

describe('Condition node — branch handles (edges)', () => {
  it('tryConnect caps a condition node at exactly two outgoing edges and assigns branch true then false', () => {
    const src = indexSource();
    const fnStart = src.indexOf('function tryConnect(');
    const fnEnd = src.indexOf('\n  }', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain("src.type === 'condition'");
    expect(fn).toContain('existing.length >= 2');
    expect(fn).toMatch(/branch/);
  });

  it('renders a distinct BranchPicker (not the trigger-type TriggerPicker) for a branch edge', () => {
    const src = indexSource();
    expect(src).toContain('function BranchPicker(');
    expect(src).toContain('<BranchPicker');
    // The picker choice must be conditional on edge.branch, not always TriggerPicker.
    expect(src).toContain("selectedEdge.edge.branch === true || selectedEdge.edge.branch === false");
  });

  it('gives branch edges their own TRUE/FALSE label and marker, distinct from triggerType edges', () => {
    const src = indexSource();
    expect(src).toContain("labelText = isBranch");
    expect(src).toContain("'TRUE'");
    expect(src).toContain("'FALSE'");
    expect(src).toContain('arr-branch_true');
    expect(src).toContain('arr-branch_false');
  });

  it('a branch edge is never shown as "never fires yet" (unlike an unsupported triggerType)', () => {
    const src = indexSource();
    expect(src).toContain('const inert = !isBranch');
  });
});

describe('Condition node — configuration (NodeEditDrawer)', () => {
  it('dispatches to a dedicated ConditionEditor', () => {
    const src = drawerSource();
    expect(src).toContain("node.type === 'condition'");
    expect(src).toContain('<ConditionEditor');
  });

  it('the editor exposes field, operator, and value inputs wired to the three condition data keys', () => {
    const src = drawerSource();
    const fnStart = src.indexOf('function ConditionEditor(');
    const fnEnd = src.indexOf('\nfunction WebhookEditor', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('conditionLeft');
    expect(fn).toContain('conditionOperator');
    expect(fn).toContain('conditionRight');
    expect(fn).toContain('CONDITION_OPERATORS.map');
  });

  it('hides the value input for exists/not_exists, which take no right-hand value', () => {
    const src = drawerSource();
    expect(src).toContain('needsRight');
    expect(src).toMatch(/operator !== 'exists' && operator !== 'not_exists'/);
  });
});
