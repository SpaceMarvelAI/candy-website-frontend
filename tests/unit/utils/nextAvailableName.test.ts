/**
 * Guards the duplicate-agent-name fix.
 *
 * The healthcare create dialog pre-filled `${uc.title} Agent` every time, so
 * clicking "Create & customise" repeatedly produced a stack of agents all named
 * "Patient Intake Agent" — indistinguishable in every picker. Observed live with
 * 5 identical drafts for one use case.
 */
import { describe, it, expect } from 'vitest';
import { nextAvailableName } from '../../../src/pages/healthcare-domain';

describe('nextAvailableName', () => {
  it('keeps the base name when nothing is taken', () => {
    expect(nextAvailableName('Patient Intake Agent', [])).toBe('Patient Intake Agent');
  });

  it('suggests " 2" when the base name already exists', () => {
    expect(nextAvailableName('Patient Intake Agent', [{ name: 'Patient Intake Agent' }]))
      .toBe('Patient Intake Agent 2');
  });

  it('skips over a run of existing duplicates — the observed case', () => {
    const taken = [
      { name: 'Patient Intake Agent' },
      { name: 'Patient Intake Agent 2' },
      { name: 'Patient Intake Agent 3' },
    ];
    expect(nextAvailableName('Patient Intake Agent', taken)).toBe('Patient Intake Agent 4');
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(nextAvailableName('Patient Intake Agent', [{ name: '  patient intake agent ' }]))
      .toBe('Patient Intake Agent 2');
  });

  it('does not renumber when an unrelated agent exists', () => {
    expect(nextAvailableName('Referral Intake Agent', [{ name: 'Patient Intake Agent' }]))
      .toBe('Referral Intake Agent');
  });
});
