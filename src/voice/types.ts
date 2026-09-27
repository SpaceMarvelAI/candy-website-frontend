/**
 * voice/types.ts — the vocabulary the whole voice pipeline agrees on.
 *
 * Two invariants live here and everything downstream depends on them:
 *
 *   1. An action never carries a URL, a CSS selector or raw spoken text that
 *      could become one. It carries a registry `targetId`, and the executor
 *      reads the destination off the registered target. A transcript can
 *      therefore never be interpolated into navigation or the DOM — the worst
 *      a hostile transcript can do is fail to resolve.
 *
 *   2. Resolution and validation report failure explicitly. There is no
 *      "closest guess" path: an utterance either names one target well enough,
 *      or comes back `ambiguous` / `not_found` / `rejected` so the UI can ask.
 */

// ─── Targets ─────────────────────────────────────────────────────────────────

export type VoiceTargetKind = 'nav' | 'button' | 'input' | 'select' | 'tab';

/**
 * Route prefixes a target can be addressed from, or '*' for app-wide targets
 * (the sidebar and the topbar search, which are mounted by AppLayout on every
 * route).
 */
export type VoiceScope = '*' | readonly string[];

export interface VoiceTarget {
  id:      string;
  kind:    VoiceTargetKind;
  /** Canonical spoken name. Also what the UI reads back in confirmations. */
  label:   string;
  aliases: readonly string[];
  scope:   VoiceScope;
  /**
   * Navigation destination. The ONLY permitted source of a route string —
   * `navigate()` is never called with anything derived from a transcript.
   */
  path?:   string;
  /**
   * Human name of the section this target sits in — 'Analytics', 'Live Calls'.
   *
   * Exists purely so a candidate can be said out loud. Two tabs in this app are
   * both called "Agents", and "Do you mean Agents or Agents?" is not a
   * question. See spokenName() in resolve.ts.
   */
  section?: string;
  /** Tab-group id, so "the third tab" can be addressed by position. */
  group?:  string;
  /** 0-based position within `group`. */
  index?:  number;
  /** Needs spoken confirmation before it runs (delete / spend / send / leave). */
  destructive?: boolean;
  /**
   * Present when the app has a name for this but nowhere to go — the "coming
   * soon" sidebar entries, and Settings, which has no page at all. Resolving
   * one is a success: voice says this sentence instead of acting, which is a
   * far better answer than "not found" for a phrase the product does use.
   */
  unavailable?: string;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type ScrollDirection = 'up' | 'down' | 'top' | 'bottom';

export type RejectReason =
  | 'unknown_target'
  | 'not_visible'
  | 'wrong_kind'
  | 'unavailable'
  | 'invalid_value'
  | 'not_executable'
  | 'unsupported'
  | 'unsafe';

export type VoiceAction =
  | { kind: 'navigate'; targetId: string }
  | { kind: 'click';    targetId: string }
  | { kind: 'type';     targetId: string; value: string }
  | { kind: 'select';   targetId: string; option: string }
  | { kind: 'openTab';  targetId: string }
  | { kind: 'scroll';   direction: ScrollDirection; amount?: number }
  | { kind: 'back' }
  | { kind: 'forward' }
  | { kind: 'search';   query: string }
  | { kind: 'confirm' }
  | { kind: 'cancel' }
  | { kind: 'clarify';  reason: string; candidates: readonly string[] }
  | { kind: 'reject';   reason: RejectReason };

/** Actions the executor can actually carry out. */
export type ExecutableAction = Exclude<VoiceAction, { kind: 'clarify' } | { kind: 'reject' }>;

// ─── Resolution ──────────────────────────────────────────────────────────────

export type Resolution =
  | { status: 'ok';          target: VoiceTarget; score: number }
  | { status: 'ambiguous';   candidates: readonly VoiceTarget[] }
  | { status: 'unavailable'; target: VoiceTarget }
  | { status: 'not_found';   phrase: string };

// ─── Validation ──────────────────────────────────────────────────────────────

export type Validation =
  | { status: 'ok';                  action: ExecutableAction }
  | { status: 'needs_confirmation';  action: ExecutableAction; target: VoiceTarget; prompt: string }
  | { status: 'rejected';            reason: RejectReason; message: string };

// ─── Screen snapshot ─────────────────────────────────────────────────────────

/**
 * What is addressable *right now*: in scope for the current route and actually
 * on screen. Built fresh per utterance — visibility is never cached, because a
 * target that was visible when it registered may be behind a closed drawer by
 * the time the user finishes speaking.
 *
 * This is also exactly what gets sent to the parse endpoint, so the model can
 * only ever choose from ids that are real and reachable.
 */
export interface ScreenSnapshot {
  route:   string;
  routeId: string;
  title:   string;
  targets: readonly VoiceTarget[];
}

// ─── Local parsing ───────────────────────────────────────────────────────────

/** What a leading verb was asking for. See parseLocal.stripLeadingVerb(). */
export type VerbCategory = 'navigate' | 'click' | 'type' | 'select' | 'search' | 'scroll';

/**
 * Outcome of the deterministic fast path.
 *
 * `miss` is the only one that costs a network round trip — the others are all
 * answers the registry could give on its own, including the two that are not
 * actions. An ambiguity in particular must never be forwarded to the model:
 * two targets with the same name are equally valid readings, and no amount of
 * language understanding can pick between them. Only the user can.
 */
export type LocalParse =
  | { kind: 'action';      action: VoiceAction }
  | { kind: 'ambiguous';   candidates: readonly VoiceTarget[] }
  | { kind: 'unavailable'; message: string }
  | { kind: 'miss' };
