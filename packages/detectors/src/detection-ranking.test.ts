import { describe, it, expect } from 'vitest';
import { ScoringDetector, ConfidenceScorer } from './index.js';
import type { Detector } from './detector.js';
import type { Detection, Evidence, Technology, SiteSnapshot } from '@devlens/core';
import {
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
  createDetection,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTechnology(id: string, name = id, category = 'framework'): Technology {
  return {
    id: createTechnologyId(id),
    name,
    category: createTechnologyCategory(category),
  };
}

function makeLinkEvidence(url: string): Evidence {
  return { type: 'link', url: createUrl(url) };
}

function makeDetection(
  confidence: number,
  evidence: Evidence[],
  technology: Technology,
): Detection {
  return createDetection(technology, createConfidence(confidence), evidence);
}

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Step 10 — Detection ranking', () => {
  const snapshot = makeSnapshot();

  describe('Scenario A — higher confidence ranks first', () => {
    it('Next.js (90) ranks above React (70)', () => {
      const nextjs = makeTechnology('nextjs', 'Next.js');
      const react = makeTechnology('react', 'React');

      const mockInner: Detector = {
        detect: () => [
          makeDetection(70, [makeLinkEvidence('https://cdn.example.com/react.js')], react),
          makeDetection(90, [makeLinkEvidence('https://cdn.example.com/_next/main.js')], nextjs),
        ],
      };

      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());
      const result = detector.detect(snapshot);

      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[1]!.technology.id).toBe('react');
    });

    it('ranking is by scored confidence, not base confidence', () => {
      const techA = makeTechnology('alpha');
      const techB = makeTechnology('beta');

      // A: base 80, 3 distinct source types → 80 + 10 = 90
      // B: base 90, 1 source type → 90
      // Both score 90 → tie-break by id: 'alpha' < 'beta'
      const mockInner: Detector = {
        detect: () => [
          makeDetection(
            80,
            [
              makeLinkEvidence('https://example.com/a-link'),
              { type: 'meta_tag', name: 'generator', content: 'A' },
              { type: 'script_content', snippet: '__NEXT_DATA__' },
            ],
            techA,
          ),
          makeDetection(90, [makeLinkEvidence('https://example.com/b-link')], techB),
        ],
      };

      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());
      const result = detector.detect(snapshot);

      // A (90) and B (90) tie → 'alpha' first
      expect(result[0]!.technology.id).toBe('alpha');
      expect(result[1]!.technology.id).toBe('beta');
    });
  });

  describe('Scenario B — tie-break on equal confidence', () => {
    it('equal confidence → ranked by technology.id ASC', () => {
      const wordpress = makeTechnology('wordpress', 'WordPress');
      const react = makeTechnology('react', 'React');
      const nextjs = makeTechnology('nextjs', 'Next.js');

      const mockInner: Detector = {
        detect: () => [
          makeDetection(90, [makeLinkEvidence('w')], wordpress),
          makeDetection(90, [makeLinkEvidence('n')], nextjs),
          makeDetection(90, [makeLinkEvidence('r')], react),
        ],
      };

      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());
      const result = detector.detect(snapshot);

      // All 90 → tie-break by id ASC: 'nextjs' < 'react' < 'wordpress'
      expect(result.map((d) => d.technology.id)).toEqual(['nextjs', 'react', 'wordpress']);
    });

    it('tie-break is stable regardless of insertion order', () => {
      const a = makeTechnology('aaa');
      const b = makeTechnology('bbb');
      const c = makeTechnology('ccc');

      const mockAfirst: Detector = {
        detect: () => [
          makeDetection(90, [makeLinkEvidence('a')], a),
          makeDetection(90, [makeLinkEvidence('b')], b),
          makeDetection(90, [makeLinkEvidence('c')], c),
        ],
      };
      const mockCreverse: Detector = {
        detect: () => [
          makeDetection(90, [makeLinkEvidence('c')], c),
          makeDetection(90, [makeLinkEvidence('b')], b),
          makeDetection(90, [makeLinkEvidence('a')], a),
        ],
      };

      const resultA = new ScoringDetector(mockAfirst, new ConfidenceScorer()).detect(snapshot);
      const resultC = new ScoringDetector(mockCreverse, new ConfidenceScorer()).detect(snapshot);

      expect(resultA.map((d) => d.technology.id)).toEqual(['aaa', 'bbb', 'ccc']);
      expect(resultC.map((d) => d.technology.id)).toEqual(['aaa', 'bbb', 'ccc']);
    });
  });

  describe('Scenario C — input order does not affect ranking', () => {
    it('[A, B, C] and [C, B, A] produce the same ranking', () => {
      const techA = makeTechnology('a');
      const techB = makeTechnology('b');
      const techC = makeTechnology('c');

      const makeMock = (order: Technology[]): Detector => ({
        detect: () => order.map((t) => makeDetection(80, [makeLinkEvidence(t.id)], t)),
      });

      const result1 = new ScoringDetector(
        makeMock([techA, techB, techC]),
        new ConfidenceScorer(),
      ).detect(snapshot);
      const result2 = new ScoringDetector(
        makeMock([techC, techB, techA]),
        new ConfidenceScorer(),
      ).detect(snapshot);

      expect(result1.map((d) => d.technology.id)).toEqual(result2.map((d) => d.technology.id));
    });

    it('mixed confidence + tie-break produces stable, order-independent result', () => {
      const alpha = makeTechnology('alpha');
      const beta = makeTechnology('beta');
      const gamma = makeTechnology('gamma');

      // alpha=95, beta=90, gamma=90 → alpha first, then beta (tie with gamma, 'beta' < 'gamma')
      const makeMock = (detections: Detection[]): Detector => ({ detect: () => detections });

      const order1 = [
        makeDetection(95, [makeLinkEvidence('a')], alpha),
        makeDetection(90, [makeLinkEvidence('b')], beta),
        makeDetection(90, [makeLinkEvidence('g')], gamma),
      ];
      const order2 = [
        makeDetection(90, [makeLinkEvidence('g')], gamma),
        makeDetection(90, [makeLinkEvidence('b')], beta),
        makeDetection(95, [makeLinkEvidence('a')], alpha),
      ];

      const result1 = new ScoringDetector(makeMock(order1), new ConfidenceScorer()).detect(
        snapshot,
      );
      const result2 = new ScoringDetector(makeMock(order2), new ConfidenceScorer()).detect(
        snapshot,
      );

      expect(result1.map((d) => d.technology.id)).toEqual(['alpha', 'beta', 'gamma']);
      expect(result2.map((d) => d.technology.id)).toEqual(['alpha', 'beta', 'gamma']);
    });
  });

  describe('Deterministic output', () => {
    it('two consecutive calls produce identical JSON', () => {
      const react = makeTechnology('react');
      const nextjs = makeTechnology('nextjs');
      const shopify = makeTechnology('shopify');

      const mockInner: Detector = {
        detect: () => [
          makeDetection(70, [makeLinkEvidence('cdn.example.com/react.js')], react),
          makeDetection(95, [makeLinkEvidence('cdn.shopify.com/theme.css')], shopify),
          makeDetection(90, [makeLinkEvidence('cdn.example.com/_next/main.js')], nextjs),
        ],
      };

      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      const result1 = JSON.stringify(detector.detect(snapshot));
      const result2 = JSON.stringify(detector.detect(snapshot));

      expect(result1).toBe(result2);
    });

    it('empty detection array returns empty', () => {
      const mockInner: Detector = { detect: () => [] };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      expect(detector.detect(snapshot)).toEqual([]);
    });
  });
});
