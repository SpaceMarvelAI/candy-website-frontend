/**
 * FlowsPage's Test/preview panel — brings the UI in line with the rewritten
 * /v1/workflows/{id}/test endpoint (multi-hop + branching dry-run).
 *
 * Same constraint as the other flows-*.test.ts files: FlowsPage has no
 * component-render harness, so the page source is used as the fixture for
 * wiring claims. The endpoint's own step semantics (executed/would_execute/
 * skipped/blocked/error, branch reporting, no real side effects) are already
 * covered by tests/test_api/test_workflows.py's test_preview_* suite on the
 * backend.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const indexSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');

describe('Test/preview button', () => {
  it('imports testWorkflow and the WorkflowTestStep type from the API layer', () => {
    const src = indexSource();
    expect(src).toContain('testWorkflow');
    expect(src).toContain('WorkflowTestStep');
  });

  it('is disabled until the workflow has been saved (testWorkflow needs a real id)', () => {
    const src = indexSource();
    const btnStart = src.indexOf('onClick={runTest}');
    const btnEnd = src.indexOf('</button>', btnStart);
    const btn = src.slice(btnStart, btnEnd);
    expect(btn).toContain('disabled={testing || !savedFlow}');
  });

  it('runTest calls testWorkflow with the saved workflow id and stores the result', () => {
    const src = indexSource();
    const fnStart = src.indexOf('async function runTest()');
    const fnEnd = src.indexOf('\n  }', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('testWorkflow(savedFlow.id)');
    expect(fn).toContain('setTestResults(result)');
  });
});

describe('Test/preview results panel', () => {
  it('renders only when there are results, and can be closed', () => {
    const src = indexSource();
    expect(src).toContain('{testResults && (');
    expect(src).toContain('setTestResults(null)');
  });

  it('makes clear no real actions were sent when the run actually triggered something', () => {
    const src = indexSource();
    expect(src).toContain('no real actions were sent');
  });

  it('surfaces the no-trigger-nodes message when the workflow has nothing to preview', () => {
    const src = indexSource();
    expect(src).toContain('!testResults.triggered');
    expect(src).toContain("testResults.message ?? 'Nothing to preview.'");
  });

  it('shows node target/id, node_type, status label, branch, and message for each step', () => {
    const src = indexSource();
    const panelStart = src.indexOf('Test/preview results');
    const panelEnd = src.indexOf('{/* Legend', panelStart);
    const panel = src.slice(panelStart, panelEnd);
    expect(panel).toContain('step.target ?? step.node_id');
    expect(panel).toContain('step.node_type');
    expect(panel).toContain('step.branch');
    expect(panel).toContain('step.message');
  });

  it('gives every backend status (executed/would_execute/skipped/blocked/error) its own color+icon+label', () => {
    const src = indexSource();
    const fnStart = src.indexOf('function testStepStyle(');
    const fnEnd = src.indexOf('\n  }', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    for (const status of ['executed', 'would_execute', 'skipped', 'blocked', 'error']) {
      expect(fn).toContain(`case '${status}':`);
    }
  });
});
