/**
 * voice/match.ts — how close a spoken phrase is to a target's name.
 *
 * Hand-rolled on purpose. The app ships five runtime dependencies and a fuzzy
 * matcher is ~100 lines; pulling in fuse.js to compare two dozen short labels
 * would be the largest thing in the bundle that voice adds.
 *
 * The scoring is a ladder of decreasing certainty rather than one blended
 * number, because the caller has to distinguish "sure" from "nearly" to decide
 * between acting and asking. Each rung is a different *kind* of match:
 *
 *   1.00  identical, or identical once filler words are dropped
 *   0.92  a prefix within a word, and most of it       ("flow" → "Flows")
 *   0.88  they named part of the target                ("calls" → "Live calls")
 *   ≤0.85 partial word overlap; plus character-bigram similarity for a
 *         misheard or run-together word, but never when MORE words were spoken
 *         than the name has ("analitics" → "Analytics" 0.75 on bigrams alone;
 *         "livecalls" → "Live Calls" 0.85)
 *
 * Below the 0.88 rung the comparison stops being symmetric, and that asymmetry
 * matters. Saying LESS than a target's name is safe — nothing you said is
 * unexplained. Saying MORE is not: the extra words mean something, and we have
 * not matched them. So an over-specified phrase is scaled by the share of the
 * utterance the name covers, which is what keeps "the billing dashboard" (0.44)
 * from opening Healthcare just because "dashboard" is one of its aliases.
 *
 * Anything below ACCEPT_SCORE is not a match at all. Two candidates within
 * AMBIGUITY_DELTA of each other are a tie, and a tie is reported, never broken.
 */
import type { VoiceTarget } from './types';

/** Below this, a candidate is not considered a match at all. */
export const ACCEPT_SCORE = 0.72;

/** Two candidates closer together than this are a tie the user must break. */
export const AMBIGUITY_DELTA = 0.08;

/**
 * Words that carry no addressing information. Dropped before comparison, so
 * "the analytics page please" and "analytics" score identically.
 *
 * Note what that example does NOT contain: a verb. This set holds articles,
 * politeness and generic UI furniture, and two categories must never join it.
 *
 * Words that are part of a real name. "calls", "live", "flows", "agents" and
 * "chat" are all load-bearing in this app.
 *
 * Command verbs, however tempting. A leading verb survives normalisation, so
 * "open the analytics page" tokenises to ["open","analytics"] — an extra spoken
 * word no target accounts for, which puts the comparison on the over-specified
 * rung and scores 0.44, below ACCEPT. The whole utterance therefore fails to
 * resolve, loudly, rather than quietly matching the wrong thing. The fix is NOT to list
 * verbs here — "Search" is a target label and "connect apps" is an alias, so a
 * blanket verb list would delete the words those targets are named after.
 * Verbs are removed once, structurally, by stripLeadingVerb() in parseLocal.ts:
 * only at the head of an utterance, and only when something is left over. See
 * the precondition documented on resolveTarget().
 */
const FILLER = new Set([
  'the', 'a', 'an', 'to', 'of', 'for', 'on', 'in', 'my', 'me', 'please', 'just',
  'button', 'tab', 'page', 'screen', 'section', 'link', 'panel',
]);

/** Lowercase, strip accents, reduce anything non-alphanumeric to a space. */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Meaning-bearing words of `text`. Falls back to the full token list when a
 * phrase is nothing but filler, so "page" still compares as "page" rather than
 * matching everything equally.
 */
export function contentTokens(text: string): string[] {
  const all = normalize(text).split(' ').filter(Boolean);
  const kept = all.filter(t => !FILLER.has(t));
  return kept.length > 0 ? kept : all;
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) out.add(text.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice over character bigrams — tolerant of a misheard syllable. */
function dice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const ba = bigrams(a);
  const bb = bigrams(b);
  let shared = 0;
  ba.forEach(g => { if (bb.has(g)) shared++; });
  return (2 * shared) / (ba.size + bb.size);
}

/** Similarity of two names, 0…1. See the ladder in the file header. */
export function scorePair(spoken: string, name: string): number {
  const a = normalize(spoken);
  const b = normalize(name);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const ta = contentTokens(a);
  const tb = contentTokens(b);
  const sa = ta.join(' ');
  const sb = tb.join(' ');
  if (sa === sb) return 1;

  // Prefix, but only a prefix *within* a word — same number of words, the
  // shorter being most of the longer. Both guards earn their place:
  //   · the ratio floor stops a stray "a" prefix-matching half the registry
  //   · the token-count check stops "healthcare" scoring 0.92 against
  //     "Healthcare Agent", which put the two within AMBIGUITY_DELTA and made
  //     every healthcare phrase ambiguous. A missing word is a weaker match
  //     than a missing suffix, so that case belongs on the 0.88 rung below.
  const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
  if (
    ta.length === tb.length
    && short.length >= 3
    && short.length / long.length >= 0.6
    && long.startsWith(short)
  ) {
    return 0.92;
  }

  // From here the comparison is DIRECTIONAL and deliberately not symmetric:
  // which side is missing words changes what the match is worth.
  const said  = new Set(ta);
  const named = new Set(tb);
  let shared = 0;
  named.forEach(t => { if (said.has(t)) shared++; });

  // Under-specified — everything they said appears in the name. "calls" for
  // "Live Calls". Nothing spoken is left unaccounted for, so this is safe.
  if (said.size > 0 && shared === said.size) return 0.88;

  // Over-specified — the whole name is in there, but they said more besides,
  // and those extra words carry meaning we have not matched. Scale by the share
  // of the utterance the name actually covers: "the billing dashboard" against
  // the "dashboard" alias covers half of what was said, lands at 0.44, and so
  // fails to resolve and goes to the model instead of silently opening
  // Healthcare.
  if (named.size > 0 && shared === named.size) return 0.88 * (shared / said.size);

  const widest  = Math.max(said.size, named.size);
  const overlap = widest > 0 ? shared / widest : 0;

  // Character similarity is for a misheard word, and the gate on it is
  // DIRECTIONAL for the same reason the rung above is.
  //
  // Saying MORE words than the name is the unsafe direction, and Dice hides it:
  // every bigram of "health care" appears in "open the healthcare agent", which
  // scored exactly ACCEPT (0.72) and opened the healthcare page for an
  // utterance about the healthcare agent. So that direction is refused here.
  //
  // Saying FEWER is the opposite case and is safe — it is what STT joining two
  // words looks like. "livecalls" is one spoken word against a two-word name,
  // and Dice recovers it at 0.85. This app already carries 'web hooks' and
  // 'chat bots' as aliases, so join/split mishearing is known to happen; the
  // aliases cover the ones we anticipated and this covers the ones we did not.
  if (said.size > named.size) return Math.min(0.85, overlap);

  return Math.min(0.85, Math.max(overlap, dice(sa.replace(/ /g, ''), sb.replace(/ /g, ''))));
}

/** Best score across a target's canonical label and every spoken alias. */
export function scoreTarget(spoken: string, target: VoiceTarget): number {
  let best = scorePair(spoken, target.label);
  for (const alias of target.aliases) {
    if (best === 1) break;
    const s = scorePair(spoken, alias);
    if (s > best) best = s;
  }
  return best;
}
