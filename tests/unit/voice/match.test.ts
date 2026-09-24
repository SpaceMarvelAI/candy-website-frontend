import { describe, it, expect } from 'vitest';
import {
  ACCEPT_SCORE, AMBIGUITY_DELTA, contentTokens, normalize, scorePair, scoreTarget,
} from '../../../src/voice/match';
import type { VoiceTarget } from '../../../src/voice/types';

const target = (label: string, aliases: string[] = []): VoiceTarget => ({
  id: 't', kind: 'nav', label, aliases, scope: '*',
});

describe('normalize', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalize('Knowledge-Gaps!')).toBe('knowledge gaps');
  });

  it('strips accents so a transcript with diacritics still matches', () => {
    expect(normalize('Anàlytics')).toBe('analytics');
  });

  it('collapses runs of whitespace', () => {
    expect(normalize('  live   calls  ')).toBe('live calls');
  });
});

describe('contentTokens', () => {
  it('drops filler words', () => {
    expect(contentTokens('the analytics page please')).toEqual(['analytics']);
  });

  it('keeps every word of a phrase that is entirely filler', () => {
    // Otherwise "page" would normalize to nothing and match everything equally.
    expect(contentTokens('the page')).toEqual(['the', 'page']);
  });

  it('never treats a real product word as filler', () => {
    expect(contentTokens('live calls')).toEqual(['live', 'calls']);
    expect(contentTokens('flows')).toEqual(['flows']);
  });
});

describe('scorePair', () => {
  it('scores an identical name 1', () => {
    expect(scorePair('Analytics', 'analytics')).toBe(1);
  });

  it('scores 1 when the names differ only by filler', () => {
    expect(scorePair('the analytics page', 'Analytics')).toBe(1);
  });

  it('scores a near-complete prefix 0.92', () => {
    expect(scorePair('flow', 'Flows')).toBeCloseTo(0.92);
  });

  it('scores a word-subset 0.88', () => {
    expect(scorePair('calls', 'Live Calls')).toBeCloseTo(0.88);
  });

  it('accepts a misheard word on character similarity alone', () => {
    // No shared token and no prefix — this rides entirely on bigram overlap.
    const score = scorePair('analitics', 'Analytics');
    expect(score).toBeGreaterThanOrEqual(ACCEPT_SCORE);
    expect(score).toBeLessThan(0.88);
  });

  it('does not let a one-letter fragment prefix-match the registry', () => {
    // The ratio floor exists for this: without it "a" scored 0.92 against
    // anything beginning with it.
    expect(scorePair('a', 'Analytics')).toBeLessThan(ACCEPT_SCORE);
  });

  it('rejects unrelated names', () => {
    expect(scorePair('webhooks', 'Healthcare')).toBeLessThan(ACCEPT_SCORE);
    expect(scorePair('zxcvbn', 'Analytics')).toBeLessThan(ACCEPT_SCORE);
  });

  it('is deliberately asymmetric', () => {
    // Saying LESS than a name is safe: every word spoken is accounted for.
    // Saying MORE is not, because the extra words mean something we have not
    // matched. The same pair therefore scores differently by direction.
    expect(scorePair('calls', 'Live Calls')).toBeCloseTo(0.88);
    expect(scorePair('Live Calls', 'calls')).toBeCloseTo(0.44);
  });

  it('does not let character similarity match across differing word counts', () => {
    // Regression: "openhealthcareagent" contains every bigram of "healthcare",
    // so the Dice rung returned exactly ACCEPT (0.72) for the "health care"
    // alias and opened the healthcare page for an utterance about the agent.
    expect(scorePair('open the healthcare agent', 'health care')).toBeLessThan(ACCEPT_SCORE);
  });

  it('still tolerates a misheard word when the word counts agree', () => {
    expect(scorePair('live calz', 'Live Calls')).toBeGreaterThanOrEqual(ACCEPT_SCORE);
  });

  it('recovers a name that STT ran together into one word', () => {
    // The gate has to be directional: a joined word is FEWER spoken words than
    // the name, which is the safe direction. An earlier symmetric gate refused
    // these outright. Join/split mishearing is known to happen in this app —
    // 'web hooks' and 'chat bots' are already carried as aliases — so the
    // unanticipated ones must degrade to Dice rather than fail hard.
    expect(scorePair('livecalls', 'Live Calls')).toBeCloseTo(0.85);
    expect(scorePair('knowledgegaps', 'Knowledge Gaps')).toBeCloseTo(0.85);
  });

  it('scales an over-specified phrase by the share of it the name covers', () => {
    // The defect this rung exists for: "dashboard" is a genuine alias of the
    // healthcare page, but "billing" is unaccounted for, so the phrase must not
    // clear ACCEPT and quietly navigate there.
    const score = scorePair('the billing dashboard', 'dashboard');
    expect(score).toBeCloseTo(0.44);
    expect(score).toBeLessThan(ACCEPT_SCORE);
  });

  it('scores empty input 0', () => {
    expect(scorePair('', 'Analytics')).toBe(0);
    expect(scorePair('Analytics', '')).toBe(0);
  });
});

describe('scoreTarget', () => {
  it('matches on an alias as well as the label', () => {
    expect(scoreTarget('integrations', target('Connectors', ['integrations']))).toBe(1);
  });

  it('takes the best of label and aliases', () => {
    const t = target('Connectors', ['integrations', 'apps']);
    expect(scoreTarget('connectors', t)).toBe(1);
    expect(scoreTarget('apps', t)).toBe(1);
  });

  it('returns a low score when neither label nor alias is close', () => {
    expect(scoreTarget('webhooks', target('Connectors', ['integrations'])))
      .toBeLessThan(ACCEPT_SCORE);
  });
});

describe('thresholds', () => {
  it('leaves room between the accept floor and a certain match', () => {
    expect(ACCEPT_SCORE).toBeGreaterThan(0.5);
    expect(ACCEPT_SCORE).toBeLessThan(1);
    expect(AMBIGUITY_DELTA).toBeGreaterThan(0);
    // A subset match (0.88) and an exact match (1.0) must be distinguishable,
    // or "healthcare" would tie against "Healthcare Agent" forever.
    expect(1 - 0.88).toBeGreaterThan(AMBIGUITY_DELTA);
  });
});

describe('scorePair — a prefix must not cross a word boundary', () => {
  it('scores a within-word prefix higher than a dropped word', () => {
    // Regression: "healthcare" used to prefix-match "Healthcare Agent" at 0.92,
    // landing exactly AMBIGUITY_DELTA below an exact match and making every
    // healthcare phrase ambiguous.
    const withinWord  = scorePair('flow', 'Flows');            // suffix missing
    const droppedWord = scorePair('healthcare', 'Healthcare Agent');
    expect(withinWord).toBeCloseTo(0.92);
    expect(droppedWord).toBeCloseTo(0.88);
    expect(1 - droppedWord).toBeGreaterThan(AMBIGUITY_DELTA);
  });

  it('still allows a within-word prefix across multi-word names', () => {
    expect(scorePair('live call', 'Live Calls')).toBeCloseTo(0.92);
  });
});
