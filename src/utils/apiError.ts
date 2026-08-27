/**
 * Shared error helpers for anything thrown by `api()`.
 *
 *  • `errorMessage(e)`  — ALWAYS returns a renderable string. React throws
 *    "Objects are not valid as a React child" the moment an object detail
 *    reaches JSX, and `${obj}` degrades to "[object Object]"; every catch block
 *    that puts a message on screen should go through here.
 *  • `gateInfo(e)`      — tells a plan / credit / role gate apart from a real
 *    failure so a page can show `<PlanGateNotice>` instead of an error.
 *
 * Backend shapes this mirrors (verified against Candy-Agents):
 *   403 api/v1/plan_gate.py → detail { error: 'upgrade_required' | 'voice_minutes_exhausted',
 *                                     message, current_plan, feature?, limit?, used? }
 *   402 api/v1/agents.py    → detail { error: 'no_credits', message }
 *   403 middleware/candy_auth.py → detail "Role 'member' cannot perform this action"  (string)
 */
import { ApiError } from '../api/client';

/** Turn anything catch() can hand you into a string safe to render. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  // ApiError.message is already normalised by the client (never an object).
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === 'string') return e || fallback;
  // Non-Error throw (a bare object, a number, null, undefined…).
  if (e && typeof e === 'object') {
    const m = (e as any).message ?? (e as any).detail?.message ?? (e as any).detail;
    if (typeof m === 'string' && m) return m;
    try {
      // Only worth showing if it actually says something: "{}" / "[]" carry no
      // information at all, so the caller's fallback is strictly better on screen.
      const json = JSON.stringify(e);
      if (json && json !== '{}' && json !== '[]') return json;
    } catch { /* circular */ }
  }
  return fallback;
}

export type GateKind =
  | 'plan'      // feature/quota not included in the current plan (403 + object detail)
  | 'credits'   // workspace out of credits (402)
  | 'role';     // signed-in user's role may not do this (403 + string detail)

export interface GateInfo {
  kind:         GateKind;
  message:      string;   // the backend's own wording when it gave one
  code?:        string;   // 'upgrade_required' | 'voice_minutes_exhausted' | 'no_credits'
  currentPlan?: string;
  feature?:     string;
}

/** Gate info for 402/403 responses, or null for "something actually broke". */
export function gateInfo(e: unknown): GateInfo | null {
  if (!(e instanceof ApiError)) return null;
  if (e.status !== 402 && e.status !== 403) return null;
  const p = e.payload;
  return {
    // An object detail always comes from the plan/credit gates; a 403 with a
    // plain string detail is the role check in candy_auth.
    kind:        e.status === 402 ? 'credits' : (e.code ? 'plan' : 'role'),
    message:     errorMessage(e),
    code:        e.code,
    currentPlan: typeof p?.current_plan === 'string' ? p.current_plan : undefined,
    feature:     typeof p?.feature === 'string' ? p.feature : undefined,
  };
}
