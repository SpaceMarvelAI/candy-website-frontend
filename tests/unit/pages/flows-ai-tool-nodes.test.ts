/**
 * FlowsPage's AI and Tool/Skill nodes (Phase 3) — orchestrates Candy's
 * existing LLM/tool infrastructure server-side; this file only pins the
 * frontend wiring (palette, editors, save/load, preview rendering), same
 * source-fixture approach as every other Flows UI test in this project.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const indexSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');
const drawerSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/NodeEditDrawer.tsx'), 'utf8');
const apiSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/api/workflows.ts'), 'utf8');

describe('1. AI node can be added', () => {
  it('has three draggable AI templates in a dedicated AI tab', () => {
    const src = indexSource();
    expect(src).toContain("leftTab === 'ai'");
    expect(src).toContain('AI_GENERATE_TEMPLATE');
    expect(src).toContain('AI_CLASSIFY_TEMPLATE');
    expect(src).toContain('AI_EXTRACT_TEMPLATE');
    expect(src).toContain("aiOperation: 'generate'");
    expect(src).toContain("aiOperation: 'classify'");
    expect(src).toContain("aiOperation: 'extract'");
  });

  it('gives the AI node its own appearance branch', () => {
    const src = indexSource();
    expect(src).toContain("node.type === 'ai')        return 'var(--purple-hi)'");
    expect(src).toContain("node.type === 'ai'");
  });
});

describe('2. Tool node can be added', () => {
  it('has one draggable Tool template in a dedicated Tools tab', () => {
    const src = indexSource();
    expect(src).toContain("leftTab === 'tools'");
    expect(src).toContain("TOOL_TEMPLATE = { type: 'tool' as const");
  });

  it('AI and Tool nodes are both valid sources and targets (chainable)', () => {
    const src = indexSource();
    const isSourceStart = src.indexOf('const isSource =');
    const isSourceBlock = src.slice(isSourceStart, src.indexOf(';', isSourceStart));
    expect(isSourceBlock).toContain("n.type === 'ai'");
    expect(isSourceBlock).toContain("n.type === 'tool'");
    const isTargetStart = src.indexOf('const isTarget =');
    const isTargetBlock = src.slice(isTargetStart, src.indexOf(';', isTargetStart));
    expect(isTargetBlock).toContain("n.type === 'ai'");
    expect(isTargetBlock).toContain("n.type === 'tool'");
  });
});

describe('3. AI editor saves configuration', () => {
  it('AIEditor commits operation, instruction, input, output variable, categories/fields, and RAG toggle', () => {
    const src = drawerSource();
    const fnStart = src.indexOf('function AIEditor(');
    const fnEnd = src.indexOf('\n// ── Tool/Skill node editor', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('aiOperation');
    expect(fn).toContain('aiInstruction');
    expect(fn).toContain('aiInput');
    expect(fn).toContain('aiOutputVariable');
    expect(fn).toContain('aiCategories');
    expect(fn).toContain('aiExtractFields');
    expect(fn).toContain('aiUseKnowledgeBase');
    expect(fn).toContain('AI_OPERATIONS.map');
  });

  it('only shows categories for classify and fields for extract', () => {
    const src = drawerSource();
    expect(src).toContain("operation === 'classify' && (");
    expect(src).toContain("operation === 'extract' && (");
    expect(src).toContain("operation === 'generate' && (");
  });
});

describe('4. Tool editor saves configuration', () => {
  it('ToolEditor commits toolName and a resolved key/value toolArgs map', () => {
    const src = drawerSource();
    const fnStart = src.indexOf('function ToolEditor(');
    const fnEnd = src.indexOf('\nfunction WebhookEditor', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('toolName');
    expect(fn).toContain('toolArgs');
    expect(fn).toContain('onUpdate({ toolName');
  });
});

describe('5. Tool metadata/arguments display correctly', () => {
  it('lets the user add/remove argument rows, each with a key and a templated value', () => {
    const src = drawerSource();
    const fnStart = src.indexOf('function ToolEditor(');
    const fnEnd = src.indexOf('\nfunction WebhookEditor', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    expect(fn).toContain('addArg');
    expect(fn).toContain('removeArg');
    expect(fn).toContain('{{contact.id}}');
  });

  it('the node card shows an argument count / not-configured warning for Tool nodes', () => {
    const src = indexSource();
    expect(src).toContain("node.type==='tool'");
    expect(src).toContain('no tool selected');
  });
});

describe('6 & 7. Workflow save/load preserves AI and Tool nodes', () => {
  it('FlowNodeData declares every AI and Tool field the editors write, so they round-trip through save', () => {
    const src = apiSource();
    for (const field of [
      'aiOperation', 'aiInstruction', 'aiInput', 'aiOutputVariable',
      'aiCategories', 'aiExtractFields', 'aiUseKnowledgeBase', 'toolName', 'toolArgs',
    ]) {
      expect(src).toContain(`${field}?:`);
    }
  });

  it("NodeType includes 'ai' and 'tool', not just the Phase 1/2 types", () => {
    const src = apiSource();
    expect(src).toContain("export type NodeType = 'agent' | 'app' | 'webhook' | 'condition' | 'ai' | 'tool';");
  });
});

describe('8. Preview results render AI/Tool statuses', () => {
  it('testStepStyle covers the full status vocabulary AI/Tool nodes can return, keyed by status not node_type', () => {
    const src = indexSource();
    const fnStart = src.indexOf('function testStepStyle(');
    const fnEnd = src.indexOf('\n  }', fnStart);
    const fn = src.slice(fnStart, fnEnd);
    // Generic by status, so AI/Tool nodes (which reuse the identical
    // executed/would_execute/skipped/blocked/error vocabulary as every
    // other node type) render correctly with no AI/Tool-specific branch
    // needed in the results panel itself.
    for (const status of ['executed', 'would_execute', 'skipped', 'blocked', 'error']) {
      expect(fn).toContain(`case '${status}':`);
    }
  });

  it('the results panel renders node_type alongside target/id for every step, including ai/tool', () => {
    const src = indexSource();
    const panelStart = src.indexOf('Test/preview results');
    const panelEnd = src.indexOf('{/* Legend', panelStart);
    const panel = src.slice(panelStart, panelEnd);
    expect(panel).toContain('step.node_type');
  });
});
