import { describe, it, expect } from 'vitest';
import { DeduplicatingDetector, ScoringDetector, ConfidenceScorer } from './index.js';
import { getEvidenceKey } from './evidence-key.js';
import type { Detector } from './detector.js';
import type { SiteSnapshot, Detection, Evidence, Technology } from '@devlens/core';
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

function makeTechnology(id: string, name: string, category: string): Technology {
  return {
    id: createTechnologyId(id),
    name,
    category: createTechnologyCategory(category),
  };
}

function makeDetection(
  technology: Technology,
  confidence: number,
  evidence: Evidence[],
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

function makeMockDetector(detections: Detection[]): Detector {
  return { detect: () => detections };
}

const techA = makeTechnology('a', 'Technology A', 'framework');
const techB = makeTechnology('b', 'Technology B', 'library');

// ─── Evidence helpers ───────────────────────────────────────────────

function headerEvidence(name: string, value: string): Evidence {
  return { type: 'http_header', name, value };
}

function metaEvidence(name: string, content: string): Evidence {
  return { type: 'meta_tag', name, content };
}

function scriptUrlEvidence(url: string): Evidence {
  return { type: 'script_url', url: createUrl(url) };
}

function scriptContentEvidence(snippet: string): Evidence {
  return { type: 'script_content', snippet };
}

function linkEvidence(url: string): Evidence {
  return { type: 'link', url: createUrl(url) };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Step 9 — Evidence quality & explainability', () => {
  const snapshot = makeSnapshot();

  // ── A — Evidence presence ───────────────────────────────────────

  describe('A — Evidence presence (Invariant A)', () => {
    it('a detection must always have at least one evidence item', () => {
      const detection = makeDetection(techA, 90, [headerEvidence('Server', 'nginx')]);
      expect(detection.evidence).toHaveLength(1);
    });

    it('createDetection throws when evidence array is empty', () => {
      expect(() => createDetection(techA, createConfidence(90), [])).toThrow(
        'Detection must have at least one evidence item',
      );
    });

    it('DeduplicatingDetector never produces a detection with zero evidence', () => {
      // Even if the inner detector has a bug, DeduplicatingDetector uses
      // createDetection which enforces the invariant.
      const inner: Detector = {
        detect: () => [makeDetection(techA, 90, [headerEvidence('Server', 'nginx')])],
      };
      const detector = new DeduplicatingDetector(inner);

      const result = detector.detect(snapshot);
      expect(result).toHaveLength(1);
      expect(result[0]!.evidence).toHaveLength(1);
    });
  });

  // ── B — Evidence deduplication ────────────────────────────────────

  describe('B — Evidence deduplication', () => {
    it('removes exact-duplicate evidence (same type, same fields)', () => {
      const evidence: Evidence = scriptUrlEvidence('https://example.com/_next/main.js');

      const detections = [
        makeDetection(techA, 90, [evidence]),
        makeDetection(techA, 95, [evidence]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);
      expect(result[0]!.evidence).toHaveLength(1);
    });

    it('removes duplicate evidence across different detection groups for the same technology', () => {
      // Two detectors both find the same WordPress evidence
      const sharedEvidence: Evidence = metaEvidence('generator', 'WordPress 6.4');

      const detections = [
        makeDetection(techA, 85, [sharedEvidence, scriptUrlEvidence('https://example.com/app.js')]),
        makeDetection(techA, 90, [sharedEvidence, scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      // metaEvidence appears in both — should be deduplicated to 1
      expect(result[0]!.evidence).toHaveLength(3);
      const metaCount = result[0]!.evidence.filter((e) => e.type === 'meta_tag').length;
      expect(metaCount).toBe(1);
    });

    it('deduplicates based on canonical key (not JSON.stringify property order)', () => {
      // Two evidence objects with the same content but potentially
      // different property order should still deduplicate.
      // In practice, JavaScript preserves insertion order for string keys,
      // but the getEvidenceKey function is designed to be robust regardless.
      const e1: Evidence = { type: 'link', url: createUrl('https://cdn.shopify.com/a.css') };
      const e2: Evidence = { type: 'link', url: createUrl('https://cdn.shopify.com/a.css') };

      const detections = [makeDetection(techA, 90, [e1]), makeDetection(techA, 95, [e2])];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);
      expect(result[0]!.evidence).toHaveLength(1);
    });
  });

  // ── C — Different evidence is preserved ───────────────────────────

  describe('C — Different evidence preserved', () => {
    it('different URLs for the same evidence type are both kept', () => {
      const detections = [
        makeDetection(techA, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(techA, 95, [scriptUrlEvidence('https://example.com/_next/vendor.js')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);
      expect(result[0]!.evidence).toHaveLength(2);
    });

    it('different evidence types are always distinct', () => {
      const detections = [
        makeDetection(techA, 90, [metaEvidence('generator', 'Next.js')]),
        makeDetection(techA, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        makeDetection(techA, 85, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(techA, 95, [linkEvidence('https://example.com/style.css')]),
        makeDetection(techA, 90, [headerEvidence('Server', 'nginx')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);
      expect(result[0]!.evidence).toHaveLength(5);
    });

    it('case difference in URL produces same canonical key (URL normalized)', () => {
      const e1: Evidence = {
        type: 'resource',
        url: createUrl('https://CDN.Example.COM/style.css'),
      };
      const e2: Evidence = {
        type: 'resource',
        url: createUrl('https://cdn.example.com/style.css'),
      };

      expect(getEvidenceKey(e1)).toBe(getEvidenceKey(e2));
    });
  });

  // ── D — Deterministic ordering ──────────────────────────────────

  describe('D — Deterministic ordering (Section 5 of spec)', () => {
    it('[A, B] and [B, A] produce the same canonical evidence order', () => {
      // Evidence in order A, B
      const orderAB = [
        makeDetection(techA, 90, [
          metaEvidence('generator', 'Next.js'),
          scriptContentEvidence('__NEXT_DATA__'),
        ]),
        makeDetection(techA, 95, [scriptUrlEvidence('https://example.com/_next/main.js')]),
      ];

      // Evidence in different order B, A (same content, different grouping)
      const orderBA = [
        makeDetection(techA, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(techA, 95, [
          metaEvidence('generator', 'Next.js'),
          scriptContentEvidence('__NEXT_DATA__'),
        ]),
      ];

      const detectorAB = new DeduplicatingDetector(makeMockDetector(orderAB));
      const detectorBA = new DeduplicatingDetector(makeMockDetector(orderBA));

      const resultAB = detectorAB.detect(snapshot);
      const resultBA = detectorBA.detect(snapshot);

      // Same canonical order regardless of input order
      const jsonAB = JSON.stringify(resultAB[0]!.evidence.map((e) => e.type));
      const jsonBA = JSON.stringify(resultBA[0]!.evidence.map((e) => e.type));

      expect(jsonAB).toBe(jsonBA);
      // Both should be sorted: http_header < javascript_global < link < meta_tag < resource < script_content < script_url
      expect(resultAB[0]!.evidence.map((e) => e.type)).toEqual([
        'meta_tag',
        'script_content',
        'script_url',
      ]);
    });

    it('evidence order is always sorted by canonical key within each detection', () => {
      const detections = [
        makeDetection(techA, 90, [
          scriptUrlEvidence('https://example.com/_next/main.js'),
          linkEvidence('https://example.com/style.css'),
          scriptContentEvidence('__NEXT_DATA__'),
          metaEvidence('generator', 'Next.js'),
          headerEvidence('Server', 'nginx'),
        ]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      const keys = result[0]!.evidence.map((e) => getEvidenceKey(e));
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });

    it('two identical snapshots produce byte-identical JSON output', () => {
      const evidence = [
        scriptUrlEvidence('https://example.com/_next/main.js'),
        metaEvidence('generator', 'Next.js'),
        scriptContentEvidence('__NEXT_DATA__'),
      ];

      const detections = [
        makeDetection(techA, 90, [evidence[0]!]),
        makeDetection(techA, 95, [evidence[1]!]),
        makeDetection(techA, 85, [evidence[2]!]),
      ];

      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result1 = JSON.stringify(detector.detect(snapshot));
      const result2 = JSON.stringify(detector.detect(snapshot));

      expect(result1).toBe(result2);
    });
  });

  // ── E — Scoring preservation ────────────────────────────────────

  describe('E — Scoring preservation (Invariants C, D)', () => {
    it('ScoringDetector preserves all evidence items after scoring', () => {
      const detections = [
        makeDetection(techA, 90, [metaEvidence('generator', 'Next.js')]),
        makeDetection(techA, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new ScoringDetector(
        new DeduplicatingDetector(makeMockDetector(detections)),
        new ConfidenceScorer(),
      );

      const result = detector.detect(snapshot);

      // base=95, 2 sources (meta_tag + script_content) → +5 → 100
      expect(result[0]!.confidence).toBe(100);
      expect(result[0]!.evidence).toHaveLength(2);
    });

    it('scoring does not mutate or remove evidence from the deduplicated detection', () => {
      const originalDetections = [
        makeDetection(techA, 90, [metaEvidence('generator', 'Next.js')]),
        makeDetection(techA, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];

      const dedup = new DeduplicatingDetector(makeMockDetector(originalDetections));
      const deduped = dedup.detect(snapshot);
      const evidenceCountBefore = deduped[0]!.evidence.length;

      const scoring = new ScoringDetector(dedup, new ConfidenceScorer());
      const scored = scoring.detect(snapshot);

      const evidenceCountAfter = scored[0]!.evidence.length;
      expect(evidenceCountAfter).toBe(evidenceCountBefore);
    });

    it('scoring preserves evidence type discriminant for scoring', () => {
      const detections = [makeDetection(techA, 95, [scriptContentEvidence('__NEXT_DATA__')])];
      const detector = new ScoringDetector(
        new DeduplicatingDetector(makeMockDetector(detections)),
        new ConfidenceScorer(),
      );

      const result = detector.detect(snapshot);

      // Single source → no bonus → 95
      expect(result[0]!.confidence).toBe(95);
      expect(result[0]!.evidence[0]!.type).toBe('script_content');
    });
  });

  // ── G — Multiple detectors produce consistent representation ─────

  describe('G — Multiple detectors, coherent result', () => {
    it('two detectors detecting the same technology produce one result with merged distinct evidence', () => {
      // Detector A: meta_tag
      // Detector B: script_url + script_content
      const inner: Detector = {
        detect: () => [
          makeDetection(techA, 85, [metaEvidence('generator', 'Next.js')]),
          makeDetection(techA, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
          makeDetection(techA, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        ],
      };
      const detector = new DeduplicatingDetector(inner);

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.technology.id).toBe('a');
      expect(result[0]!.confidence).toBe(95);
      expect(result[0]!.evidence).toHaveLength(3);
      // No duplicates
      const keys = result[0]!.evidence.map(getEvidenceKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);
    });

    it('two technologies detected by overlapping signatures remain distinct', () => {
      const inner: Detector = {
        detect: () => [
          makeDetection(techA, 90, [scriptContentEvidence('react-dom')]),
          makeDetection(techB, 85, [scriptUrlEvidence('https://example.com/react.js')]),
        ],
      };
      const detector = new DeduplicatingDetector(inner);

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(2);
      expect(result[0]!.technology.id).toBe('a');
      expect(result[1]!.technology.id).toBe('b');
    });
  });

  // ── H — JSON serialization ───────────────────────────────────────

  describe('H — JSON serialization (no information loss)', () => {
    it('detection with all evidence types serializes and deserializes losslessly', () => {
      const allEvidence: Evidence[] = [
        headerEvidence('Server', 'nginx/1.24.0'),
        metaEvidence('generator', 'WordPress 6.4'),
        scriptUrlEvidence('https://example.com/_next/main.js'),
        scriptContentEvidence('__NEXT_DATA__'),
        linkEvidence('https://cdn.shopify.com/theme.css'),
      ];

      const detection = makeDetection(techA, 95, allEvidence);

      const json = JSON.stringify(detection);
      const parsed = JSON.parse(json);

      expect(parsed.technology.id).toBe('a');
      expect(parsed.confidence).toBe(95);
      expect(parsed.evidence).toHaveLength(5);

      // Each evidence item round-trips with its type discriminant
      for (const e of parsed.evidence as Evidence[]) {
        expect(typeof e.type).toBe('string');
        expect(e.type).toMatch(
          /^(http_header|meta_tag|script_url|script_content|resource|link|html|javascript_global)$/,
        );
      }
    });

    it('serialized evidence can be re-canonicalized', () => {
      const detection = makeDetection(techA, 95, [
        metaEvidence('generator', 'Next.js'),
        scriptContentEvidence('__NEXT_DATA__'),
      ]);

      const json = JSON.stringify(detection);
      const parsed = JSON.parse(json) as Detection;

      // The deserialized evidence items should produce the same keys
      const originalKeys = detection.evidence.map(getEvidenceKey).sort();
      const parsedKeys = parsed.evidence.map(getEvidenceKey).sort();

      expect(parsedKeys).toEqual(originalKeys);
    });
  });
});
