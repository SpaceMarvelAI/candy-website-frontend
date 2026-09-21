/**
 * voice/parseLocal.ts — the deterministic fast path.
 *
 * "Go to Analytics" is a solved problem and should never cost a network round
 * trip to an LLM. This file answers everything the registry can answer on its
 * own, in microseconds, and returns `miss` for anything it cannot — only then
 * does the caller ask the server.
 *
 * It follows a pattern the backend already uses: agent_pipeline/tools/loan_tools.py
 * detects intent with cheap local matching and skips the tool-call round trip
 * entirely rather than asking the model to do arithmetic.
 *
 * This module also owns verb stripping for the whole pipeline. See
 * stripLeadingVerb() for why that job lives here and not in match.ts's FILLER.
 */
import { resolveTabByOrdinal, resolveTarget } from './resolve';
import { SEARCH_NOT_CONNECTED } from './registry/navTargets';
import type { LocalParse, ScrollDirection, VerbCategory, VoiceTarget } from './types';

/**
 * Verb phrases that can open an utterance, longest first so "go back to" is
 * tried before "go" and "show me" before "show".
 *
 * Only ever matched at the head of an utterance, which is what makes this safe
 * where a word-list would not be. "Search" is a target label and "connect apps"
 * is an alias; stripping mid-phrase would erase the names of real targets.
 */
const VERB_PHRASES: ReadonlyArray<readonly [string, VerbCategory]> = [
  ['take me to', 'navigate'], ['bring me to', 'navigate'], ['go back to', 'navigate'],
  ['navigate to', 'navigate'], ['switch to', 'navigate'], ['jump to', 'navigate'],
  ['move to', 'navigate'], ['show me', 'navigate'], ['go to', 'navigate'],
  ['open up', 'navigate'], ['bring up', 'navigate'], ['goto', 'navigate'],
  ['open', 'navigate'], ['show', 'navigate'], ['display', 'navigate'],
  ['view', 'navigate'], ['navigate', 'navigate'], ['go', 'navigate'],
  ['click on', 'click'], ['click', 'click'], ['press', 'click'], ['tap', 'click'],
  ['hit', 'click'], ['push', 'click'],
  ['type', 'type'], ['enter', 'type'], ['write', 'type'],
  ['select', 'select'], ['choose', 'select'], ['pick', 'select'],
  ['search for', 'search'], ['look for', 'search'], ['search', 'search'], ['find', 'search'],
  ['scroll', 'scroll'],
];

const ORDINALS: Readonly<Record<string, number>> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};

const BACK_RE         = /^(?:go\s+)?back$|^previous\s+page$/;
const FORWARD_RE      = /^(?:go\s+)?forward$|^next\s+page$/;
const ORDINAL_TAB_RE  = /^(?:the\s+)?([a-z]+|\d+)(?:st|nd|rd|th)?\s+tab$/;
const NUMBERED_TAB_RE = /^tab\s+(\d+)$/;

/** Lowercase, drop trailing punctuation, collapse whitespace. */
function tidy(text: string): string {
  return text.trim().toLowerCase().replace(/[.,!?]+$/g, '').replace(/\s+/g, ' ').trim();
}

export interface StrippedVerb {
  category: VerbCategory | null;
  /** The verb phrase that matched, or null when none did. */
  phrase: string | null;
  /** The utterance with its leading verb removed. Never empty. */
  rest: string;
}

/**
 * Remove a leading verb phrase, if there is one and if anything survives it.
 *
 * Two guards make this safe where a blanket verb list would not be:
 *
 *   · head-only — "connect apps" keeps its "connect", and no mid-phrase word
 *     is ever touched, so alias text stays intact
 *   · non-empty remainder — a bare "search" is the name of the topbar search
 *     box, not a command missing its object, so it is left alone
 *
 * Slice 5 added the "retry with the original utterance" fallback this comment
 * used to predict — see namesATarget() below. It stays scoped to the command
 * verbs, for the reason originally given: for a navigate verb the stripped
 * fragment is always a subset of its own target's name, so the subset rung
 * matches it on the first attempt and a retry would never fire.
 */
export function stripLeadingVerb(utterance: string): StrippedVerb {
  const text = tidy(utterance);
  for (const [phrase, category] of VERB_PHRASES) {
    if (text === phrase) return { category: null, phrase: null, rest: text };
    if (text.startsWith(phrase + ' ')) {
      const rest = text.slice(phrase.length + 1).trim();
      if (rest) return { category, phrase, rest };
    }
  }
  return { category: null, phrase: null, rest: text };
}

/**
 * What naming this target means.
 *
 * Keyed on the target's kind rather than on the verb that introduced it, which
 * is why "open save", "click save" and a bare "save" all reach the same place.
 * The verb decides which utterances are allowed through (see the category gate
 * in parseLocal) — it does not decide what happens once a target is in hand.
 *
 * `unavailable` is checked before anything else, so a control that exists but
 * is switched off for voice answers with its own sentence and stops here. It
 * never falls through to `miss`, so it never reaches the server to come back as
 * an `unsupported` the user can do nothing with. That ordering is what keeps
 * the destructive controls in flowsTargets.ts off the network entirely.
 */
function actionFor(target: VoiceTarget): LocalParse {
  if (target.unavailable) return { kind: 'unavailable', message: target.unavailable };
  if (target.kind === 'tab')    return { kind: 'action', action: { kind: 'openTab',  targetId: target.id } };
  if (target.kind === 'nav')    return { kind: 'action', action: { kind: 'navigate', targetId: target.id } };
  // Naming a field, rather than saying what to put in it, means "put my cursor
  // there" — which is a click. executeAction focuses before it clicks, so for a
  // text box that is exactly the ⌘K behaviour, and for a <select> it opens the
  // list. Nothing is entered and nothing is chosen, so this stays safe for a
  // misheard utterance.
  return { kind: 'action', action: { kind: 'click', targetId: target.id } };
}

function parseOrdinalTab(
  rest: string, targets: readonly VoiceTarget[], route: string,
): LocalParse | null {
  const numbered = NUMBERED_TAB_RE.exec(rest);
  const ordinal  = ORDINAL_TAB_RE.exec(rest);
  let position: number | null = null;

  if (numbered) {
    position = Number(numbered[1]);
  } else if (ordinal) {
    const word = ordinal[1];
    position = /^\d+$/.test(word) ? Number(word) : (ORDINALS[word] ?? null);
  }
  if (position === null) return null;

  const r = resolveTabByOrdinal(position, targets, route);
  return r.status === 'ok' ? actionFor(r.target) : { kind: 'miss' };
}

export interface ParseContext {
  route: string;
  targets: readonly VoiceTarget[];
}

function fromResolution(
  phrase: string, ctx: ParseContext,
): LocalParse | null {
  const r = resolveTarget(phrase, ctx.targets, { route: ctx.route });
  if (r.status === 'ok')          return actionFor(r.target);
  if (r.status === 'unavailable') return { kind: 'unavailable', message: r.target.unavailable as string };
  if (r.status === 'ambiguous')   return { kind: 'ambiguous', candidates: r.candidates };
  return null;
}

/**
 * Categories whose verb is an instruction rather than part of a name.
 *
 * These are the ones where the leading word can also open the NAME of a real
 * target — "search box" is the search box, not a search for "box". Anything
 * here gets the whole-utterance retry below before its verb is believed.
 */
const COMMAND_CATEGORIES: ReadonlySet<VerbCategory> = new Set(['search', 'type', 'select', 'scroll']);

/** "type X into Y" / "enter X in the Y" — the value, then the field. */
const INTO_RE = /^(.*\S)\s+(?:into|in)\s+(?:the\s+)?(\S.*)$/;

/**
 * Does the WHOLE utterance name something, verb and all?
 *
 * The fallback parseLocal.ts's header used to predict. A command verb at the
 * head of an utterance is ambiguous in a way a navigate verb is not: "search"
 * opens both a real instruction and the real name of the topbar box. Trying the
 * untouched utterance first settles it by evidence rather than by guesswork —
 * "search box" scores 1.0 against that target's alias, while "search for
 * refunds" scores 0.53 and falls well short of ACCEPT_SCORE, so the same rule
 * separates them without either being special-cased.
 *
 * Only consulted for COMMAND_CATEGORIES. Running it for every verb would put
 * "open agents" and friends through a second resolution pass that can only
 * introduce disagreement with the first.
 */
function namesATarget(text: string, ctx: ParseContext): LocalParse | null {
  return fromResolution(text, ctx);
}

/**
 * Which way to scroll, from what follows the verb.
 *
 * Ordered longest-intent-first: "all the way down" has to be read as an end
 * jump before the bare "down" branch claims it as one page.
 */
const SCROLL_DIRECTIONS: ReadonlyArray<readonly [RegExp, ScrollDirection]> = [
  [/^(?:to\s+)?(?:the\s+)?top$|^all\s+the\s+way\s+up$|^to\s+the\s+(?:start|beginning)$/, 'top'],
  [/^(?:to\s+)?(?:the\s+)?(?:bottom|end)$|^all\s+the\s+way\s+down$/,                     'bottom'],
  [/^up(?:wards?)?$/,                                                                     'up'],
  [/^down(?:wards?)?$/,                                                                   'down'],
];

/**
 * "scroll down" / "scroll to the top" -> a scroll, with no target involved.
 *
 * Anything else after the verb is a miss rather than a guessed direction.
 * "scroll down a bit" lands there deliberately: the grammar has no unit for
 * "a bit", and the server can answer it with an explicit pixel `amount`, which
 * is a better answer than silently treating it as a full page.
 */
function parseScrollCommand(rest: string): LocalParse {
  for (const [re, direction] of SCROLL_DIRECTIONS) {
    if (re.test(rest)) return { kind: 'action', action: { kind: 'scroll', direction } };
  }
  return { kind: 'miss' };
}

/**
 * "type refunds into the workflow name" -> type refunds into that field.
 *
 * A preposition is required. Bare "type refunds" is a miss on purpose: it does
 * not say where, and picking the only visible input would be a guess that gets
 * silently wrong the moment a page has two. The server sees the same snapshot
 * and is in a better position to choose.
 */
function parseTypeCommand(rest: string, ctx: ParseContext): LocalParse {
  const m = INTO_RE.exec(rest);
  if (!m) return { kind: 'miss' };

  const [, value, fieldPhrase] = m;
  const r = resolveTarget(fieldPhrase, ctx.targets, { route: ctx.route, kinds: ['input'] });

  if (r.status === 'unavailable') return { kind: 'unavailable', message: r.target.unavailable as string };
  if (r.status === 'ambiguous')   return { kind: 'ambiguous', candidates: r.candidates };
  if (r.status !== 'ok')          return { kind: 'miss' };

  return { kind: 'action', action: { kind: 'type', targetId: r.target.id, value } };
}

/**
 * Best-effort local understanding. `miss` means "ask the server", and is the
 * honest answer for anything this grammar does not cover — never a guess.
 */
export function parseLocal(utterance: string, ctx: ParseContext): LocalParse {
  const text = tidy(utterance);
  if (!text) return { kind: 'miss' };

  if (BACK_RE.test(text))    return { kind: 'action', action: { kind: 'back' } };
  if (FORWARD_RE.test(text)) return { kind: 'action', action: { kind: 'forward' } };

  const { category, rest } = stripLeadingVerb(text);

  const byOrdinal = parseOrdinalTab(rest, ctx.targets, ctx.route);
  if (byOrdinal) return byOrdinal;

  // A command verb may be the first word of a real target's NAME. Settle that
  // before treating it as an instruction, or "search box" becomes a search for
  // the word "box".
  if (category !== null && COMMAND_CATEGORIES.has(category)) {
    const named = namesATarget(text, ctx);
    if (named) return named;
  }

  // `navigate` and `click` are resolved by target kind, so "click Analytics"
  // navigates and "open save" clicks. Neither verb can force a kind the target
  // does not have.
  if (category !== null && category !== 'navigate' && category !== 'click') {
    // Typing is real: the workflow-name field is a genuine controlled input.
    if (category === 'type') return parseTypeCommand(rest, ctx);

    // Searching is not. The topbar box consumes nothing — no value, no
    // onChange, nothing in src/ reads it — so entering the words and reporting
    // a search would be a confident false success, and the user would wait for
    // results that cannot come. Say so instead, and point at the half that does
    // work: focusing the box, which is what ⌘K does.
    if (category === 'search') return { kind: 'unavailable', message: SEARCH_NOT_CONNECTED };

    // Scrolling names no target, which makes it the one command here that
    // cannot be wrong about WHAT it acts on — only about which way.
    if (category === 'scroll') return parseScrollCommand(rest);

    // `select` stays a miss. There is no <select> on a stable surface to
    // address — the four in this app are all inside modals or the node drawer —
    // so a local grammar for it would have nothing to resolve against. Left to
    // the server rather than faked.
    return { kind: 'miss' };
  }

  return fromResolution(rest, ctx) ?? { kind: 'miss' };
}
