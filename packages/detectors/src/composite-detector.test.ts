import { describe, it, expect } from 'vitest';
import { CompositeDetector } from './composite-detector.js';
import { HeaderDetector } from './header-detector.js';
import { NullDetector } from './detector.js';
import type { Detector } from './detector.js';
import type { Detection, SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
  createDetection,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(headers: Array<{ name: string; value: string }>): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers,
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
    resources: [],
  };
}

/**
 * Creates a Detection suitable for test assertions — uses the real
 * `createDetection` factory to ensure domain-conformant objects.
 */
function makeDetection(id: string, name: string, category: string, confidence: number): Detection {
  return createDetection(
    { id: createTechnologyId(id), name, category: createTechnologyCategory(category) },
    createConfidence(confidence),
    [{ type: 'http_header', name: 'Test', value: 'value' }],
  );
}

/**
 * Creates a mock Detector that returns a fixed list of detections.
 */
function makeMockDetector(detections: Detection[]): Detector {
  return {
    detect: () => detections,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('CompositeDetector', () => {
  describe('zero detectors', () => {
    it('returns empty array when composed with no detectors', () => {
      const composite = new CompositeDetector([]);
      const result = composite.detect(makeSnapshot([]));

      expect(result).toEqual([]);
    });
  });

  describe('one detector', () => {
    it('returns the same results as the single contained detector', () => {
      const detection = makeDetection('react', 'React', 'frontend', 90);
      const mock = makeMockDetector([detection]);
      const composite = new CompositeDetector([mock]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(detection);
    });

    it('returns empty array when the single detector returns nothing', () => {
      const composite = new CompositeDetector([NullDetector]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toEqual([]);
    });
  });

  describe('multiple detectors', () => {
    it('aggregates results from multiple detectors', () => {
      const d1 = makeDetection('nginx', 'nginx', 'server', 95);
      const d2 = makeDetection('express', 'Express', 'framework', 90);
      const detectorA = makeMockDetector([d1]);
      const detectorB = makeMockDetector([d2]);
      const composite = new CompositeDetector([detectorA, detectorB]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(d1);
      expect(result[1]).toBe(d2);
    });
  });

  describe('ordering preservation', () => {
    it('preserves detector ordering — first detector first', () => {
      const first = makeDetection('nginx', 'nginx', 'server', 95);
      const second = makeDetection('apache', 'Apache', 'server', 95);
      const third = makeDetection('php', 'PHP', 'language', 90);
      const composite = new CompositeDetector([
        makeMockDetector([first]),
        makeMockDetector([second]),
        makeMockDetector([third]),
      ]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(first);
      expect(result[1]).toBe(second);
      expect(result[2]).toBe(third);
    });

    it('preserves ordering even when detectors are reversed', () => {
      const first = makeDetection('php', 'PHP', 'language', 90);
      const second = makeDetection('nginx', 'nginx', 'server', 95);
      const composite = new CompositeDetector([
        makeMockDetector([first]),
        makeMockDetector([second]),
      ]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(first);
      expect(result[1]).toBe(second);
    });
  });

  describe('same snapshot passed to all detectors', () => {
    it('passes the exact same snapshot reference to every sub-detector', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      let receivedByA: SiteSnapshot | undefined;
      let receivedByB: SiteSnapshot | undefined;
      const detectorA: Detector = {
        detect: (s) => {
          receivedByA = s;
          return [];
        },
      };
      const detectorB: Detector = {
        detect: (s) => {
          receivedByB = s;
          return [];
        },
      };
      const composite = new CompositeDetector([detectorA, detectorB]);

      composite.detect(snapshot);

      expect(receivedByA).toBe(snapshot);
      expect(receivedByB).toBe(snapshot);
    });

    it('does not mutate the snapshot (verified with HeaderDetector)', () => {
      const snapshot = makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]);
      const originalHeaderCount = snapshot.http.headers.length;

      const composite = new CompositeDetector([new HeaderDetector(), new HeaderDetector()]);

      composite.detect(snapshot);

      expect(snapshot.http.headers.length).toBe(originalHeaderCount);
    });
  });

  describe('empty detector results', () => {
    it('produces empty array when all detectors return empty', () => {
      const composite = new CompositeDetector([NullDetector, NullDetector, NullDetector]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toEqual([]);
    });

    it('skips empty results and includes non-empty results', () => {
      const detection = makeDetection('nginx', 'nginx', 'server', 95);
      const composite = new CompositeDetector([
        NullDetector,
        makeMockDetector([detection]),
        NullDetector,
      ]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(1);
      expect(result[0]).toBe(detection);
    });
  });

  describe('multiple detections from one detector', () => {
    it('collects all detections from each sub-detector', () => {
      const d1 = makeDetection('nginx', 'nginx', 'server', 95);
      const d2 = makeDetection('express', 'Express', 'framework', 90);
      const d3 = makeDetection('php', 'PHP', 'language', 90);
      const composite = new CompositeDetector([makeMockDetector([d1, d2]), makeMockDetector([d3])]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(d1);
      expect(result[1]).toBe(d2);
      expect(result[2]).toBe(d3);
    });
  });

  describe('deduplication policy', () => {
    it('does NOT deduplicate — preserves duplicate detections from different sub-detectors', () => {
      // The domain model (Detection) does not define a unique identity.
      // Two detections with the same technology but different evidence
      // are legitimately distinct. The CompositeDetector does not
      // introduce its own deduplication policy.
      const detection = makeDetection('nginx', 'nginx', 'server', 95);
      const composite = new CompositeDetector([
        makeMockDetector([detection]),
        makeMockDetector([detection]),
      ]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(detection);
      expect(result[1]).toBe(detection);
    });

    it('preserves detections for the same technology from different evidence sources', () => {
      // Two sub-detectors detect the same technology (nginx) but with
      // different confidence values and evidence — both are preserved.
      const d1 = makeDetection('nginx', 'nginx', 'server', 95);
      const d2 = makeDetection('nginx', 'nginx', 'server', 80);
      const composite = new CompositeDetector([makeMockDetector([d1]), makeMockDetector([d2])]);

      const result = composite.detect(makeSnapshot([]));

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(d1);
      expect(result[1]).toBe(d2);
      // Same technology ID, but not deduplicated
      expect(result[0]!.technology.id).toBe('nginx');
      expect(result[1]!.technology.id).toBe('nginx');
    });
  });

  describe('error behavior', () => {
    // The architecture does not establish detectors as best-effort.
    // runScan treats a detector throwing as a scan failure (UNKNOWN_ERROR).
    // CompositeDetector propagates the first error it encounters immediately,
    // consistent with this convention.
    it('propagates errors from a single failing sub-detector', () => {
      const failingDetector: Detector = {
        detect: () => {
          throw new Error('detection failed');
        },
      };
      const composite = new CompositeDetector([failingDetector]);

      expect(() => composite.detect(makeSnapshot([]))).toThrow('detection failed');
    });

    it('propagates the first error immediately without running subsequent detectors', () => {
      let secondWasCalled = false;
      const failingDetector: Detector = {
        detect: () => {
          throw new Error('first detector failed');
        },
      };
      const secondDetector: Detector = {
        detect: () => {
          secondWasCalled = true;
          return [];
        },
      };
      const composite = new CompositeDetector([failingDetector, secondDetector]);

      expect(() => composite.detect(makeSnapshot([]))).toThrow('first detector failed');
      expect(secondWasCalled).toBe(false);
    });

    it('does not catch and swallow errors — error type is preserved', () => {
      class CustomDetectorError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomDetectorError';
        }
      }
      const failingDetector: Detector = {
        detect: () => {
          throw new CustomDetectorError('custom failure');
        },
      };
      const composite = new CompositeDetector([failingDetector]);

      expect(() => composite.detect(makeSnapshot([]))).toThrow(CustomDetectorError);
      expect(() => composite.detect(makeSnapshot([]))).toThrow('custom failure');
    });

    it('propagates errors from a later sub-detector after earlier sub-detectors succeeded', () => {
      // If the first detector succeeds but the second fails, the error
      // propagates — earlier results are not returned.
      const firstDetection = makeDetection('nginx', 'nginx', 'server', 95);
      const failingDetector: Detector = {
        detect: () => {
          throw new Error('second detector crashed');
        },
      };
      const composite = new CompositeDetector([
        makeMockDetector([firstDetection]),
        failingDetector,
      ]);

      expect(() => composite.detect(makeSnapshot([]))).toThrow('second detector crashed');
    });
  });

  describe('integration with real HeaderDetector', () => {
    it('composes HeaderDetector with a mock detector and preserves ordering', () => {
      const mockDetection = makeDetection('react', 'React', 'framework', 90);
      const composite = new CompositeDetector([
        new HeaderDetector(),
        makeMockDetector([mockDetection]),
      ]);

      const result = composite.detect(
        makeSnapshot([
          { name: 'Server', value: 'nginx/1.21.6' },
          { name: 'X-Powered-By', value: 'PHP/8.1' },
        ]),
      );

      // HeaderDetector results come first (nginx + PHP), then mock result (react)
      expect(result).toHaveLength(3);
      expect(result[0]!.technology.id).toBe('nginx');
      expect(result[1]!.technology.id).toBe('php');
      expect(result[2]).toBe(mockDetection);
    });

    it('composes two HeaderDetectors without crashing', () => {
      // Two HeaderDetectors both detect nginx from the same header.
      // Both results are preserved (no cross-detector deduplication).
      const composite = new CompositeDetector([new HeaderDetector(), new HeaderDetector()]);

      const result = composite.detect(makeSnapshot([{ name: 'Server', value: 'nginx/1.21.6' }]));

      expect(result).toHaveLength(2);
      expect(result[0]!.technology.id).toBe('nginx');
      expect(result[1]!.technology.id).toBe('nginx');
    });
  });
});
