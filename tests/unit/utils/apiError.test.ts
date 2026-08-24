import { describe, it, expect } from 'vitest';
import { errorMessage, gateInfo } from '../../../src/utils/apiError';
import { ApiError } from '../../../src/api/client';

// ── errorMessage: the crash guard ─────────────────────────────────────────────
// Anything that reaches JSX must be a string — an object child throws
// "Objects are not valid as a React child" and unmounts the branch.

describe('errorMessage', () => {
  it('returns the detail string from an ApiError with a string detail', () => {
    expect(errorMessage(new ApiError(400, { detail: 'Number already assigned' })))
      .toBe('Number already assigned');
  });

  it('returns the message field from an ApiError with an object detail', () => {
    const e = new ApiError(403, {
      detail: { error: 'upgrade_required', message: 'Not included in your plan.', current_plan: 'free' },
    });
    expect(errorMessage(e)).toBe('Not included in your plan.');
  });

  it('returns a string (never "[object Object]") for an object detail with no message', () => {
    const msg = errorMessage(new ApiError(422, { detail: { field: 'email', code: 3 } }));
    expect(typeof msg).toBe('string');
    expect(msg).not.toContain('[object Object]');
  });

  it('returns the message of a plain Error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });

  it('falls back for an Error with an empty message', () => {
    expect(errorMessage(new Error(''), 'Failed')).toBe('Failed');
  });

  it('returns a thrown string as-is', () => {
    expect(errorMessage('just a string')).toBe('just a string');
  });

  it('reads .message off a non-Error object throw', () => {
    expect(errorMessage({ message: 'plain object throw' })).toBe('plain object throw');
  });

  it('reads a nested detail.message off a non-Error object throw', () => {
    expect(errorMessage({ detail: { message: 'nested' } })).toBe('nested');
  });

  it('serialises an object throw that carries no message', () => {
    expect(errorMessage({ a: 1 })).toBe('{"a":1}');
  });

  it('uses the fallback for null, undefined and numbers', () => {
    expect(errorMessage(null, 'Fallback')).toBe('Fallback');
    expect(errorMessage(undefined, 'Fallback')).toBe('Fallback');
    expect(errorMessage(42, 'Fallback')).toBe('Fallback');
  });

  it('uses the fallback for a circular object throw', () => {
    const circular: any = {};
    circular.self = circular;
    expect(errorMessage(circular, 'Fallback')).toBe('Fallback');
  });

  it('has a default fallback so callers never render an empty string', () => {
    expect(errorMessage(null)).toBe('Something went wrong');
  });
});

// ── gateInfo: plan / credits / role vs "something broke" ──────────────────────

describe('gateInfo', () => {
  it('classifies a 403 plan gate (backend: api/v1/plan_gate.py requires_feature)', () => {
    const e = new ApiError(403, {
      detail: {
        error: 'upgrade_required',
        message: 'This feature is not included in your current plan. Upgrade to access it.',
        current_plan: 'free',
        feature: 'workflows',
      },
    });
    expect(gateInfo(e)).toEqual({
      kind: 'plan',
      code: 'upgrade_required',
      message: 'This feature is not included in your current plan. Upgrade to access it.',
      currentPlan: 'free',
      feature: 'workflows',
    });
  });

  it('classifies the 403 voice-minute quota gate as a plan gate', () => {
    const e = new ApiError(403, {
      detail: {
        error: 'voice_minutes_exhausted',
        message: 'Your free plan includes 5000 voice minutes per cycle. Upgrade for more.',
        current_plan: 'free', limit: 5000, used: 5000,
      },
    });
    const g = gateInfo(e);
    expect(g?.kind).toBe('plan');
    expect(g?.code).toBe('voice_minutes_exhausted');
    expect(g?.feature).toBeUndefined();
  });

  it('classifies a 402 credit gate', () => {
    const e = new ApiError(402, {
      detail: { error: 'no_credits', message: 'This workspace is out of credits. Please add credits to continue.' },
    });
    const g = gateInfo(e);
    expect(g?.kind).toBe('credits');
    expect(g?.code).toBe('no_credits');
    expect(g?.message).toContain('out of credits');
  });

  it('classifies a 403 with a string detail as a role gate', () => {
    const g = gateInfo(new ApiError(403, { detail: "Role 'member' cannot perform this action" }));
    expect(g?.kind).toBe('role');
    expect(g?.code).toBeUndefined();
    expect(g?.message).toBe("Role 'member' cannot perform this action");
  });

  it('returns null for real failures (404, 500, network, timeout)', () => {
    expect(gateInfo(new ApiError(404, { detail: 'Not found' }))).toBeNull();
    expect(gateInfo(new ApiError(500, { detail: 'Internal error' }))).toBeNull();
    expect(gateInfo(new ApiError(0, 'Network error'))).toBeNull();
    expect(gateInfo(new ApiError(408, 'Request timed out after 30000 ms'))).toBeNull();
  });

  it('returns null for a 401 (handled by the auth-expiry flow, not a gate)', () => {
    expect(gateInfo(new ApiError(401, { detail: 'Token expired' }))).toBeNull();
  });

  it('returns null for non-ApiError throws', () => {
    expect(gateInfo(new Error('boom'))).toBeNull();
    expect(gateInfo('nope')).toBeNull();
    expect(gateInfo(null)).toBeNull();
  });
});
