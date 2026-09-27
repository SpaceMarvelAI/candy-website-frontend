/**
 * voice/resolve.ts — turn a spoken fragment into exactly one target, or say why not.
 *
 * The whole point of this file is that it is allowed to fail. A resolver that
 * always returns its best guess will eventually navigate somewhere the user did
 * not ask for, and with voice there is no hover state to warn them first. So
 * every call ends in one of four honest outcomes: `ok`, `ambiguous`,
 * `unavailable`, or `not_found`.
 *
 * Scoping, and why there is one candidate pool rather than two
 * ────────────────────────────────────────────────────────────
 * A target is a candidate if it is in scope for the current route, OR if it has
 * a `path` (routes and tabs are reachable from anywhere — "go to Sessions" has
 * to work from /healthcare). Both kinds compete in a single pool, and ties are
 * broken by the current route.
 *
 * That single rule is what makes "Open Agents" behave correctly without a
 * special case for it. Two targets are called Agents — /analytics/agents and
 * /live/agents — so they always tie:
 *
 *   on /analytics/*  → the analytics one is route-scoped, it wins
 *   on /live/*       → the live one is route-scoped, it wins
 *   anywhere else    → neither is, so the tie stands and voice asks which
 *
 * The same tie-break resolves "live calls" on /live to the tab rather than
 * re-navigating the sidebar item that is already active.
 */
import { ACCEPT_SCORE, AMBIGUITY_DELTA, scoreTarget } from './match';
import type { Resolution, VoiceTarget, VoiceTargetKind } from './types';

/** Most candidates worth reading back to someone who has to listen to them. */
const MAX_CANDIDATES = 4;

/**
 * How to say a target out loud.
 *
 * A bare label is enough almost everywhere, and not enough in the one place it
 * matters: /analytics/agents and /live/agents are both labelled "Agents", so
 * reading candidates back produced "Do you mean Agents or Agents?" — a question
 * with no information in it. The section name is what separates them by ear.
 *
 * navTargets.test.ts asserts no two targets share a spoken name, so this class
 * of bug fails at the test rather than at the microphone.
 */
export function spokenName(target: VoiceTarget): string {
  return target.section ? `${target.label} in ${target.section}` : target.label;
}

export interface ResolveOptions {
  route: string;
  /** Restrict to these kinds — `type` only wants inputs, `select` only selects. */
  kinds?: readonly VoiceTargetKind[];
}

/** Is `target` addressable from `route`? '*' targets are, from everywhere. */
export function isInScope(target: VoiceTarget, route: string): boolean {
  if (target.scope === '*') return true;
  return target.scope.some(prefix => route === prefix || route.startsWith(prefix + '/'));
}

/**
 * Scoped to *this* route specifically, as opposed to globally available. Used
 * only to break ties: something belonging to the page you are looking at beats
 * something belonging to the whole app.
 */
function isRouteSpecific(target: VoiceTarget, route: string): boolean {
  return target.scope !== '*' && isInScope(target, route);
}

interface Scored { target: VoiceTarget; score: number }

/**
 * PRECONDITION: `phrase` is a target fragment, not a whole utterance. The
 * leading verb must already be gone — stripLeadingVerb() in parseLocal.ts owns
 * that, and is the only place that should.
 *
 * This is a real contract, not a style note. A surviving verb is a spoken word
 * no target accounts for, which puts the comparison on match.ts's
 * over-specified rung: the score is scaled by the share of the utterance the
 * name covers, so a whole utterance falls below ACCEPT. "open the healthcare
 * agent" comes back `not_found`, while the fragment "healthcare agent"
 * resolves correctly.
 *
 * Failing loudly is the point. An earlier version scored these at a flat 0.88,
 * which was worse than useless: it silently returned a target, and collapsed
 * distinct names onto one rung so they tied. Pinned by a test in
 * resolve.test.ts rather than left to this comment.
 */
export function resolveTarget(
  phrase: string,
  targets: readonly VoiceTarget[],
  opts: ResolveOptions,
): Resolution {
  const { route, kinds } = opts;
  const trimmed = phrase.trim();
  if (!trimmed) return { status: 'not_found', phrase };

  const pool = targets.filter(t => {
    if (kinds && !kinds.includes(t.kind)) return false;
    return isInScope(t, route) || t.path !== undefined;
  });

  const scored: Scored[] = [];
  for (const target of pool) {
    const score = scoreTarget(trimmed, target);
    if (score >= ACCEPT_SCORE) scored.push({ target, score });
  }
  if (scored.length === 0) return { status: 'not_found', phrase };

  scored.sort((a, b) => b.score - a.score);
  const top  = scored[0].score;
  let  tied  = scored.filter(s => top - s.score <= AMBIGUITY_DELTA);

  if (tied.length > 1) {
    // Anything belonging to the page we are on beats anything global.
    const specific = tied.filter(s => isRouteSpecific(s.target, route));
    if (specific.length > 0) tied = specific;
  }

  if (tied.length > 1) {
    // The other half of the same idea: from outside a section, a tab inside it
    // loses to the section itself. "Live calls" is both the sidebar entry and a
    // tab within it — on /live you mean the tab, anywhere else you mean the
    // section. Only applied when exactly one nav is in the tie; two sections
    // with the same name is a real ambiguity and stays one.
    const navs = tied.filter(s => s.target.kind === 'nav');
    if (navs.length === 1) tied = navs;
  }

  if (tied.length > 1) {
    return { status: 'ambiguous', candidates: tied.slice(0, MAX_CANDIDATES).map(s => s.target) };
  }

  const winner = tied[0];
  if (winner.target.unavailable) return { status: 'unavailable', target: winner.target };
  return { status: 'ok', target: winner.target, score: winner.score };
}

/**
 * "Open the third tab" — position within the tab group of the current route.
 * Index is 1-based as spoken, 0-based in the registry.
 *
 * This exists so ordinal phrasing still ends at a registry id: the caller
 * converts to an id here and everything downstream stays id-only.
 */
export function resolveTabByOrdinal(
  ordinal: number,
  targets: readonly VoiceTarget[],
  route: string,
): Resolution {
  const group = targets
    .filter(t => t.kind === 'tab' && t.index !== undefined && isRouteSpecific(t, route))
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const hit = group[ordinal - 1];
  if (!hit) return { status: 'not_found', phrase: String(ordinal) };
  return { status: 'ok', target: hit, score: 1 };
}
