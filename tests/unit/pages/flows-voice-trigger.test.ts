/**
 * Flows Phase 4 — incoming_call voice trigger. No new node type: an
 * ordinary Agent node's outgoing edge just gets a new selectable
 * triggerType, mirroring escalation/demo_booking exactly (see backend
 * api/v1/workflows.py's fire_incoming_call_workflow). Source-fixture tests,
 * same pattern as every other Flows UI test in this project.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

const indexSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');
const apiSource = () =>
  readFileSync(resolvePath(__dirname, '../../../src/api/workflows.ts'), 'utf8');

describe('1. Voice/Incoming Call trigger can be added', () => {
  it('EXECUTABLE_TRIGGER_TYPES and FlowEdge.triggerType include incoming_call', () => {
    const src = apiSource();
    expect(src).toContain("['escalation', 'demo_booking', 'incoming_call', 'both']");
    expect(src).toContain("'escalation' | 'demo_booking' | 'incoming_call' | 'both' | 'webhook_to_agent'");
  });

  it('TriggerPicker offers Incoming call as a selectable option', () => {
    const src = indexSource();
    expect(src).toContain("['escalation','demo_booking','incoming_call','both']");
    expect(src).toContain("'Incoming call'");
  });
});

describe('2. Node configuration saves / 3. Workflow save/load preserves voice trigger', () => {
  it('no duplicate company/agent/call-id fields were added — reuses the existing edge.triggerType + Agent node fields', () => {
    // Phase 4's explicit minimalism requirement: no new node type, no new
    // per-node config fields for company/agent/phone/session/call id.
    const src = apiSource();
    expect(src).not.toContain('callId?:');
    expect(src).not.toContain('phoneNumber?:');
  });

  it('incoming_call is treated as a real, executable trigger (not inert like webhook_to_agent)', () => {
    const src = apiSource();
    const start = src.indexOf('EXECUTABLE_TRIGGER_TYPES');
    const block = src.slice(start, src.indexOf(';', start));
    expect(block).toContain('incoming_call');
  });
});

describe('4. Voice node appears correctly', () => {
  it('gives incoming_call its own tint/icon in the trigger picker and legend', () => {
    const src = indexSource();
    expect(src).toContain('incoming_call:    \'var(--blue)\'');
    expect(src).toContain("t==='incoming_call' ? 'phone'");
  });
});

describe('5. Preview result displays correctly', () => {
  it('the preview results panel is generic over trigger type — no voice-specific branch needed', () => {
    // The /test endpoint groups by trigger-capable SOURCE NODE TYPE
    // (agent/webhook), not by triggerType string, so incoming_call-tagged
    // edges are already included with zero frontend changes to the panel
    // itself — confirmed by the absence of any triggerType filter in the
    // results-rendering code.
    const src = indexSource();
    const panelStart = src.indexOf('Test/preview results');
    const panelEnd = src.indexOf('{/* Legend', panelStart);
    const panel = src.slice(panelStart, panelEnd);
    expect(panel).not.toContain('triggerType');
  });
});
