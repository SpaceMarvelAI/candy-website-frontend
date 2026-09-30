/**
 * Edge badge text on the Flows canvas. Regression: an `incoming_call` edge fell
 * through to the catch-all and was labelled "both", so a user could not tell it
 * apart from an escalation+demo edge.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { triggerBadgeLabel, EXECUTABLE_TRIGGER_TYPES } from '../../../src/api/workflows';

describe('triggerBadgeLabel', () => {
  it.each([
    ['escalation', 'escalation'],
    ['demo_booking', 'demo booked'],
    ['incoming_call', 'incoming call'],
    ['both', 'both'],
  ])('%s -> "%s"', (trigger, label) => {
    expect(triggerBadgeLabel(trigger)).toBe(label);
  });

  it('gives every executable trigger a distinct badge', () => {
    const labels = EXECUTABLE_TRIGGER_TYPES.map(triggerBadgeLabel);
    expect(new Set(labels).size).toBe(EXECUTABLE_TRIGGER_TYPES.length);
  });

  it('falls back to "both" only for unknown/absent values', () => {
    expect(triggerBadgeLabel(undefined)).toBe('both');
    expect(triggerBadgeLabel('something_new')).toBe('both');
  });
});

describe('canvas wiring', () => {
  it('the edge badge is rendered through triggerBadgeLabel, not an inline ternary', () => {
    const src = readFileSync(resolvePath(__dirname, '../../../src/pages/flows/index.tsx'), 'utf8');
    expect(src).toContain('triggerBadgeLabel(edge.triggerType)');
    expect(src).not.toMatch(/edge\.triggerType === 'demo_booking' \? 'demo booked'/);
  });
});
