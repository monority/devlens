import { describe, it, expect } from 'vitest';
import { ScoringDetector } from './scoring-detector.js';
import { ConfidenceScorer } from './detection-scorer.js';
import { CompositeDetector, HeaderDetector, MetaTagDetector } from './index.js';
import type { Detector } from './detector.js';
import type { Detection, SiteSnapshot, Technology, Evidence } from '@devlens/core';
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

// ─── Test helpers ───────────────────────────────────────────────────

function makeTechnology(id = 'wordpress', name = 'WordPress', category = 'cms'): Technology {
  return {
    id: createTechnologyId(id),
    name,
    category: createTechnologyCategory(category),
  };
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

function makeDetection(
  confidence: number,
  evidence: Evidence[],
  technology: Technology = makeTechnology(),
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

// ─── Tests ─────────────────────────────────────────────────────────

describe('ScoringDetector', () => {
  describe('delegation', () => {
    it('delegates detect() to the inner detector', () => {
      const expected: Detection[] = [makeDetection(90, [makeEvidence('meta_tag')])];
      const mockInner: Detector = { detect: () => expected };
      const scorer = new ConfidenceScorer();
      const detector = new ScoringDetector(mockInner, scorer);

      const result = detector.detect(makeSnapshot());

      // Inner returns 1 detection with 1 source → no bonus → 90
      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(90);
    });

    it('applies the scorer to each detection independently', () => {
      const mockInner: Detector = {
        detect: () => [
          makeDetection(90, [makeEvidence('meta_tag')]), // 1 source → 90
          makeDetection(
            85,
            [makeEvidence('meta_tag'), makeEvidence('script_url')], // 2 sources → 90
          ),
        ],
      };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      const result = detector.detect(makeSnapshot());

      expect(result).toHaveLength(2);
      expect(result[0]!.confidence).toBe(90);
      expect(result[1]!.confidence).toBe(90);
    });

    it('returns empty array when inner detector returns empty', () => {
      const mockInner: Detector = { detect: () => [] };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      const result = detector.detect(makeSnapshot());

      expect(result).toEqual([]);
    });
  });

  describe('scoring integration', () => {
    it('scores detections with multiple independent evidence sources higher', () => {
      // Single-source detection
      const singleSource: Detection[] = [makeDetection(90, [makeEvidence('meta_tag')])];
      // Multi-source detection (same base confidence)
      const multiSource: Detection[] = [
        makeDetection(90, [
          makeEvidence('meta_tag'),
          makeEvidence('script_url'),
          makeEvidence('link'),
        ]),
      ];

      const singleScorer = new ScoringDetector(
        { detect: () => singleSource } as Detector,
        new ConfidenceScorer(),
      );
      const multiScorer = new ScoringDetector(
        { detect: () => multiSource } as Detector,
        new ConfidenceScorer(),
      );

      const singleResult = singleScorer.detect(makeSnapshot());
      const multiResult = multiScorer.detect(makeSnapshot());

      expect(singleResult[0]!.confidence).toBe(90); // no bonus
      expect(multiResult[0]!.confidence).toBe(100); // +10 bonus → capped
    });

    it('preserves technology and evidence fields', () => {
      const technology = makeTechnology('shopify', 'Shopify', 'ecommerce');
      const evidence = [makeEvidence('link', 'https://cdn.shopify.com/'), makeEvidence('meta_tag')];
      const mockInner: Detector = {
        detect: () => [makeDetection(95, evidence, technology)],
      };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      const result = detector.detect(makeSnapshot());

      expect(result[0]!.technology).toEqual(technology);
      expect(result[0]!.evidence).toEqual(evidence);
    });

    it('does not mutate original detections from inner detector', () => {
      const original = makeDetection(90, [makeEvidence('meta_tag'), makeEvidence('script_url')]);
      const originalConfidence = original.confidence;
      const originalEvidenceLength = original.evidence.length;

      const mockInner: Detector = { detect: () => [original] };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      detector.detect(makeSnapshot());

      expect(original.confidence).toBe(originalConfidence);
      expect(original.evidence).toHaveLength(originalEvidenceLength);
    });
  });

  describe('error propagation', () => {
    it('propagates errors from the inner detector', () => {
      const mockInner: Detector = {
        detect: () => {
          throw new Error('inner detector failed');
        },
      };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      expect(() => detector.detect(makeSnapshot())).toThrow('inner detector failed');
    });

    it('does not partially score when inner detector throws', () => {
      const mockInner: Detector = {
        detect: () => {
          throw new Error('fail');
        },
      };
      const detector = new ScoringDetector(mockInner, new ConfidenceScorer());

      expect(() => detector.detect(makeSnapshot())).toThrow();
    });
  });

  describe('real detector integration', () => {
    it('works with real HeaderDetector + MetaTagDetector via CompositeDetector', () => {
      const detector = new ScoringDetector(
        new CompositeDetector([new HeaderDetector(), new MetaTagDetector()]),
        new ConfidenceScorer(),
      );

      const snapshot = makeSnapshot();
      const detections = detector.detect(snapshot);

      // No headers or meta tags → no detections
      expect(detections).toEqual([]);
    });

    it('scores WordPress detection from header + meta tag with bonus', () => {
      // Create a snapshot with Server: nginx header and meta generator: WordPress
      const snapshot: SiteSnapshot = {
        ...makeSnapshot(),
        http: {
          ...makeSnapshot().http,
          headers: [
            { name: 'Server', value: 'nginx' },
            { name: 'X-Powered-By', value: 'PHP' },
          ],
        },
        html: {
          ...makeSnapshot().html,
          metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        },
      };

      const detector = new ScoringDetector(
        new CompositeDetector([new HeaderDetector(), new MetaTagDetector()]),
        new ConfidenceScorer(),
      );

      const detections = detector.detect(snapshot);

      // HeaderDetector detects nginx (95) and PHP (90)
      // MetaTagDetector detects WordPress (90)
      // Each technology has 1 evidence source → no bonus
      expect(detections.length).toBeGreaterThanOrEqual(2);

      const nginx = detections.find((d) => d.technology.id === 'nginx');
      const wordpress = detections.find((d) => d.technology.id === 'wordpress');

      expect(nginx).toBeDefined();
      expect(nginx!.confidence).toBe(95); // 1 source, no bonus

      expect(wordpress).toBeDefined();
      expect(wordpress!.confidence).toBe(90); // 1 source, no bonus
    });
  });
});
