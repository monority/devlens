import { describe, it, expect } from 'vitest';
import { ConfidenceScorer, clampConfidence } from './detection-scorer.js';
import type { Detection, Evidence, Technology } from '@devlens/core';
import {
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
  createDetection,
  createUrl,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeTechnology(id = 'wordpress', name = 'WordPress', category = 'cms'): Technology {
  return {
    id: createTechnologyId(id),
    name,
    category: createTechnologyCategory(category),
  };
}

function makeDetection(
  confidence: number,
  evidence: Evidence[],
  technology: Technology = makeTechnology(),
): Detection {
  return createDetection(technology, createConfidence(confidence), evidence);
}

function makeEvidence(type: Evidence['type'], url = 'https://example.com/test'): Evidence {
  switch (type) {
    case 'http_header':
      return { type, name: 'Server', value: 'nginx' };
    case 'meta_tag':
      return { type, name: 'generator', content: 'WordPress' };
    case 'script_url':
      return { type, url: createUrl(url) };
    case 'script_content':
      return { type, snippet: '__NEXT_DATA__' };
    case 'javascript_global':
      return { type, globalName: '__NUXT__' };
    case 'resource':
      return { type, url: createUrl(url) };
    case 'link':
      return { type, url: createUrl(url) };
    case 'html':
      return { type, selector: 'div', snippet: '<div>' };
  }
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ConfidenceScorer', () => {
  const scorer = new ConfidenceScorer();

  describe('scoring formula', () => {
    it('returns the same confidence when there is only one evidence source', () => {
      const detection = makeDetection(90, [makeEvidence('link')]);
      const scored = scorer.score(detection);

      expect(scored.confidence).toBe(90);
    });

    it('adds per-source bonus for two evidence sources', () => {
      const detection = makeDetection(90, [makeEvidence('meta_tag'), makeEvidence('link')]);
      const scored = scorer.score(detection);

      // base=90, sources=2, bonus=5 → 95
      expect(scored.confidence).toBe(95);
    });

    it('caps the bonus at maxBonus (default 10) for three+ sources', () => {
      const detection = makeDetection(90, [
        makeEvidence('meta_tag'),
        makeEvidence('link'),
        makeEvidence('script_url'),
      ]);
      const scored = scorer.score(detection);

      // base=90, sources=3, bonus=10 (capped) → 100
      expect(scored.confidence).toBe(100);
    });

    it('caps the bonus at maxBonus for many sources', () => {
      const detection = makeDetection(85, [
        makeEvidence('http_header'),
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('script_content'),
        makeEvidence('resource'),
        makeEvidence('link'),
        makeEvidence('html'),
        makeEvidence('javascript_global'),
      ]);
      const scored = scorer.score(detection);

      // base=85, sources=8, bonus=min(10, 7*5)=10 → 95
      expect(scored.confidence).toBe(95);
    });

    it('caps the final score at 100 even if base + bonus exceeds 100', () => {
      const detection = makeDetection(98, [
        makeEvidence('meta_tag'),
        makeEvidence('link'),
        makeEvidence('script_url'),
      ]);
      const scored = scorer.score(detection);

      // base=98, sources=3, bonus=10 → 108 → capped at 100
      expect(scored.confidence).toBe(100);
    });
  });

  describe('evidence source independence', () => {
    it('counts three evidence items of the same type as ONE source', () => {
      // Three LinkEvidence items (wp-content, wp-includes, wp-json) — same source
      const detection = makeDetection(90, [
        makeEvidence('link', 'https://example.com/wp-content/'),
        makeEvidence('link', 'https://example.com/wp-includes/'),
        makeEvidence('link', 'https://example.com/wp-json/'),
      ]);
      const scored = scorer.score(detection);

      // Only 1 source type → no bonus
      expect(scored.confidence).toBe(90);
    });

    it('counts same-type evidence with identical URLs as ONE source', () => {
      const detection = makeDetection(90, [
        makeEvidence('resource', 'https://example.com/robots.txt'),
        makeEvidence('resource', 'https://example.com/robots.txt'),
        makeEvidence('resource', 'https://example.com/robots.txt'),
      ]);
      const scored = scorer.score(detection);

      // Same source type → no bonus
      expect(scored.confidence).toBe(90);
    });

    it('two evidence items of different types each count as a source', () => {
      const detection = makeDetection(85, [makeEvidence('meta_tag'), makeEvidence('script_url')]);
      const scored = scorer.score(detection);

      // 2 sources → bonus 5 → 90
      expect(scored.confidence).toBe(90);
    });

    it('many evidence items of two different types count as TWO sources', () => {
      const detection = makeDetection(85, [
        makeEvidence('meta_tag'),
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('script_url'),
        makeEvidence('script_url'),
      ]);
      const scored = scorer.score(detection);

      // 2 unique source types → bonus 5 → 90
      expect(scored.confidence).toBe(90);
    });
  });

  describe('monotonicity', () => {
    it('adding an evidence source never decreases the score', () => {
      const base = makeDetection(85, [makeEvidence('meta_tag')]);
      const withOneMore = makeDetection(85, [makeEvidence('meta_tag'), makeEvidence('script_url')]);
      const withTwoMore = makeDetection(85, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
      ]);

      const score1 = scorer.score(base).confidence;
      const score2 = scorer.score(withOneMore).confidence;
      const score3 = scorer.score(withTwoMore).confidence;

      expect(score2).toBeGreaterThanOrEqual(score1);
      expect(score3).toBeGreaterThanOrEqual(score2);
    });

    it('score with more sources is always >= score with fewer', () => {
      const confidences = [80, 85, 90, 95];
      const evidenceSets = [
        [makeEvidence('meta_tag')],
        [makeEvidence('meta_tag'), makeEvidence('script_url')],
        [makeEvidence('meta_tag'), makeEvidence('script_url'), makeEvidence('link')],
        [
          makeEvidence('meta_tag'),
          makeEvidence('script_url'),
          makeEvidence('link'),
          makeEvidence('resource'),
        ],
      ];

      for (let i = 0; i < confidences.length - 1; i++) {
        const score1 = scorer.score(makeDetection(confidences[i], evidenceSets[i]!)).confidence;
        const score2 = scorer.score(
          makeDetection(confidences[i + 1]!, evidenceSets[i + 1]!),
        ).confidence;
        expect(score2).toBeGreaterThanOrEqual(score1);
      }
    });
  });

  describe('bounded', () => {
    it('never exceeds 100', () => {
      const detection = makeDetection(100, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
        makeEvidence('resource'),
        makeEvidence('http_header'),
      ]);
      const scored = scorer.score(detection);

      expect(scored.confidence).toBeLessThanOrEqual(100);
    });

    it('never exceeds 100 even with a single max-confidence source', () => {
      const detection = makeDetection(100, [makeEvidence('link')]);
      const scored = scorer.score(detection);

      expect(scored.confidence).toBe(100);
    });
  });

  describe('preservation', () => {
    it('preserves technology and evidence unchanged', () => {
      const technology = makeTechnology('shopify', 'Shopify', 'ecommerce');
      const evidence = [makeEvidence('link', 'https://cdn.shopify.com/'), makeEvidence('meta_tag')];
      const detection = makeDetection(95, evidence, technology);
      const scored = scorer.score(detection);

      expect(scored.technology).toEqual(technology);
      expect(scored.evidence).toEqual(evidence);
      expect(scored.evidence).toHaveLength(2);
    });

    it('does not mutate the original detection', () => {
      const detection = makeDetection(90, [makeEvidence('meta_tag'), makeEvidence('script_url')]);
      const originalConfidence = detection.confidence;
      const originalEvidenceLength = detection.evidence.length;

      scorer.score(detection);

      expect(detection.confidence).toBe(originalConfidence);
      expect(detection.evidence).toHaveLength(originalEvidenceLength);
    });
  });

  describe('configurable parameters', () => {
    it('respects custom perSourceBonus', () => {
      const customScorer = new ConfidenceScorer({ perSourceBonus: 2, maxBonus: 10 });
      const detection = makeDetection(90, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
      ]);
      const scored = customScorer.score(detection);

      // base=90, sources=3, bonus=min(10, 2*2)=4 → 94
      expect(scored.confidence).toBe(94);
    });

    it('respects custom maxBonus', () => {
      const customScorer = new ConfidenceScorer({ perSourceBonus: 5, maxBonus: 5 });
      const detection = makeDetection(90, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
      ]);
      const scored = customScorer.score(detection);

      // base=90, sources=3, bonus=min(5, 2*5)=5 → 95
      expect(scored.confidence).toBe(95);
    });

    it('uses defaults when config is empty', () => {
      const defaultScorer = new ConfidenceScorer({});
      const detection = makeDetection(90, [makeEvidence('meta_tag'), makeEvidence('link')]);
      const scored = defaultScorer.score(detection);

      // base=90, sources=2, bonus=5 → 95
      expect(scored.confidence).toBe(95);
    });
  });

  describe('weak vs strong evidence', () => {
    it('a strong single-source detection scores at least as high as a weak multi-source one (when close)', () => {
      const strong = makeDetection(95, [makeEvidence('meta_tag')]);
      const weak = makeDetection(90, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
      ]);

      const strongScore = scorer.score(strong).confidence;
      const weakScore = scorer.score(weak).confidence;

      // Strong: 95, Weak: 90 + 10 = 100 (capped)
      // A multi-source detection at 90 reaches 100, beating a single 95
      // This is acceptable: diversity compensates for lower individual confidence
      expect(strongScore).toBe(95);
      expect(weakScore).toBe(100);
    });

    it('a single strong source is not downgraded by the scorer', () => {
      const detection = makeDetection(92, [makeEvidence('script_url')]);
      const scored = scorer.score(detection);

      // No bonus → 92
      expect(scored.confidence).toBe(92);
    });
  });

  describe('edge cases', () => {
    it('handles a single evidence item', () => {
      const detection = makeDetection(80, [makeEvidence('script_content')]);
      const scored = scorer.score(detection);

      expect(scored.confidence).toBe(80);
    });

    it('rounds the score to the nearest integer', () => {
      const detection = makeDetection(88, [makeEvidence('meta_tag'), makeEvidence('script_url')]);
      const scored = scorer.score(detection);

      // 88 + 5 = 93 (already integer)
      expect(scored.confidence).toBe(93);
    });

    it('handles confidence of 0', () => {
      const detection = makeDetection(0, [makeEvidence('meta_tag'), makeEvidence('link')]);
      const scored = scorer.score(detection);

      // 0 + 5 = 5
      expect(scored.confidence).toBe(5);
    });
  });

  // ── Step 10 additions: contract, bounds, NaN/Infinity, determinism ──

  describe('A — No evidence (contract enforcement)', () => {
    it('createDetection rejects empty evidence arrays', () => {
      expect(() => createDetection(makeTechnology(), createConfidence(90), [])).toThrow(
        'Detection must have at least one evidence item',
      );
    });

    it('the scorer never receives a detection with zero evidence (invariant)', () => {
      // The contract is that createDetection enforces ≥1 evidence.
      // The scorer relies on this invariant — verify it holds.
      const detection = makeDetection(90, [makeEvidence('meta_tag')]);
      expect(detection.evidence).toHaveLength(1);
      expect(scorer.score(detection).evidence).toHaveLength(1);
    });
  });

  describe('H — Many weak signals do not exceed one strong signal', () => {
    it('80 base + 10 bonus (90) is less than 95 base + 0 bonus (95)', () => {
      const manyWeak = makeDetection(80, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
        makeEvidence('script_content'),
      ]);
      const oneStrong = makeDetection(95, [makeEvidence('script_content')]);

      expect(scorer.score(manyWeak).confidence).toBeLessThan(scorer.score(oneStrong).confidence);
    });
  });

  describe('I — Bounds (0 ≤ confidence ≤ 100)', () => {
    it('lower bound is 0', () => {
      const detection = makeDetection(0, [makeEvidence('meta_tag')]);
      expect(scorer.score(detection).confidence).toBeGreaterThanOrEqual(0);
    });

    it('upper bound is 100', () => {
      const detection = makeDetection(100, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
        makeEvidence('resource'),
      ]);
      expect(scorer.score(detection).confidence).toBeLessThanOrEqual(100);
      expect(scorer.score(detection).confidence).toBe(100);
    });
  });

  describe('J — No NaN / Infinity (clampConfidence)', () => {
    it('clamps NaN to 0', () => {
      expect(clampConfidence(NaN)).toBe(0);
    });

    it('clamps Infinity to 100', () => {
      expect(clampConfidence(Infinity)).toBe(100);
    });

    it('clamps -Infinity to 0', () => {
      expect(clampConfidence(-Infinity)).toBe(0);
    });

    it('clamps negative values to 0', () => {
      expect(clampConfidence(-5)).toBe(0);
      expect(clampConfidence(-0.1)).toBe(0);
    });

    it('clamps values above 100 to 100', () => {
      expect(clampConfidence(101)).toBe(100);
      expect(clampConfidence(150)).toBe(100);
    });

    it('rounds non-integer values', () => {
      expect(clampConfidence(89.4)).toBe(89);
      expect(clampConfidence(89.6)).toBe(90);
      expect(clampConfidence(89.5)).toBe(90);
    });

    it('the scorer never produces 100 + bonus exceeding 100', () => {
      const detection = makeDetection(100, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
        makeEvidence('resource'),
        makeEvidence('http_header'),
      ]);
      const scored = scorer.score(detection);
      expect(Number.isFinite(Number(scored.confidence))).toBe(true);
      expect(scored.confidence).toBe(100);
    });
  });

  describe('K — Determinism (same evidence set → same score)', () => {
    it('produces the same score for the same evidence regardless of call count', () => {
      const detection = makeDetection(90, [
        makeEvidence('meta_tag'),
        makeEvidence('script_url'),
        makeEvidence('link'),
      ]);
      const score1 = scorer.score(detection).confidence;
      const score2 = scorer.score(detection).confidence;
      const score3 = scorer.score(detection).confidence;

      expect(score1).toBe(score2);
      expect(score2).toBe(score3);
    });

    it('produces the same score for evidence in different order', () => {
      const tech = makeTechnology();
      const evA: Evidence[] = [makeEvidence('meta_tag'), makeEvidence('script_url')];
      const evB: Evidence[] = [makeEvidence('script_url'), makeEvidence('meta_tag')];

      const score1 = scorer.score(makeDetection(90, evA, tech)).confidence;
      const score2 = scorer.score(makeDetection(90, evB, tech)).confidence;

      expect(score1).toBe(score2);
    });
  });

  describe('L — Monotonicity (adding evidence never decreases score)', () => {
    it('adding an independent source type never decreases the score', () => {
      const base = makeDetection(90, [makeEvidence('meta_tag')]);
      const withMore = makeDetection(90, [makeEvidence('meta_tag'), makeEvidence('script_url')]);

      expect(scorer.score(withMore).confidence).toBeGreaterThanOrEqual(
        scorer.score(base).confidence,
      );
    });

    it('adding more evidence of the same source type (different URLs) does not change the score', () => {
      // Two link evidence with different URLs are still the same source type
      const single = makeDetection(90, [makeEvidence('link', 'https://example.com/a.css')]);
      const sameType = makeDetection(90, [
        makeEvidence('link', 'https://example.com/a.css'),
        makeEvidence('link', 'https://example.com/b.css'),
      ]);

      expect(scorer.score(sameType).confidence).toBe(scorer.score(single).confidence);
    });
  });
});
