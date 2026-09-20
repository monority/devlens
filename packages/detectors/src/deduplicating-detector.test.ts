import { describe, it, expect } from 'vitest';
import { DeduplicatingDetector } from './deduplicating-detector.js';
import type { Detector } from './detector.js';
import type {
  Detection,
  Evidence,
  SiteSnapshot,
  Technology,
  TechnologyVersion,
} from '@devlens/core';
import {
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
  createDetection,
  createTechnologyVersion,
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

// ─── Evidence helpers ───────────────────────────────────────────────

const nextTech = makeTechnology('nextjs', 'Next.js', 'framework');
const reactTech = makeTechnology('react', 'React', 'framework');
const wpTech = makeTechnology('wordpress', 'WordPress', 'cms');

function metaTagEvidence(name: string, content: string): Evidence {
  return { type: 'meta_tag', name, content };
}

function scriptUrlEvidence(url: string): Evidence {
  return { type: 'script_url', url: createUrl(url) };
}

function scriptContentEvidence(snippet: string): Evidence {
  return { type: 'script_content', snippet };
}

function httpHeaderEvidence(name: string, value: string): Evidence {
  return { type: 'http_header', name, value };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('DeduplicatingDetector', () => {
  const snapshot = makeSnapshot();

  describe('delegation', () => {
    it('delegates to the wrapped detector', () => {
      const inner: Detector = {
        detect: (snap: SiteSnapshot) => {
          expect(snap).toBe(snapshot);
          return [];
        },
      };
      const detector = new DeduplicatingDetector(inner);

      const result = detector.detect(snapshot);

      expect(result).toEqual([]);
    });

    it('returns detections unchanged when no duplicate technologies exist', () => {
      const detections = [
        makeDetection(nextTech, 90, [httpHeaderEvidence('X-Powered-By', 'Next.js')]),
        makeDetection(reactTech, 85, [scriptContentEvidence('react-dom')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(2);
      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[1]!.technology.id).toBe('react');
    });
  });

  describe('grouping and deduplication', () => {
    it('groups detections by technology and keeps exactly one per technology', () => {
      const detections = [
        makeDetection(nextTech, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.technology.id).toBe('nextjs');
    });

    it('selects highest confidence as representative', () => {
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextTech, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(95);
    });

    it('merges evidence from all duplicate detections', () => {
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextTech, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.evidence).toHaveLength(3);
      // Evidence is sorted canonically by type: http_header < meta_tag < script_content < script_url
      expect(result[0]!.evidence[0]!.type).toBe('meta_tag');
      expect(result[0]!.evidence[1]!.type).toBe('script_content');
      expect(result[0]!.evidence[2]!.type).toBe('script_url');
    });

    it('preserves all different evidence types in the merged result', () => {
      const detections = [
        makeDetection(nextTech, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(nextTech, 95, [
          scriptContentEvidence('__NEXT_DATA__'),
          httpHeaderEvidence('X-Powered-By', 'Next.js'),
        ]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result[0]!.evidence).toHaveLength(3);
      const types = result[0]!.evidence.map((e) => e.type);
      expect(types).toContain('script_url');
      expect(types).toContain('script_content');
      expect(types).toContain('http_header');
    });
  });

  describe('deterministic ordering', () => {
    it('sorts evidence canonically (by type, then content) regardless of input order', () => {
      const detections = [
        makeDetection(nextTech, 90, [
          scriptUrlEvidence('https://example.com/_next/main.js'),
          scriptContentEvidence('__NEXT_DATA__'),
        ]),
        makeDetection(nextTech, 95, [metaTagEvidence('generator', 'Next.js')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      // Evidence is sorted canonically: meta_tag < script_content < script_url
      expect(result[0]!.evidence[0]!.type).toBe('meta_tag');
      expect(result[0]!.evidence[1]!.type).toBe('script_content');
      expect(result[0]!.evidence[2]!.type).toBe('script_url');
    });

    it('preserves first-appearance order of technologies', () => {
      const detections = [
        makeDetection(nextTech, 90, [scriptUrlEvidence('/_next/')]),
        makeDetection(reactTech, 85, [scriptContentEvidence('react-dom')]),
        makeDetection(replTech(), 90, [scriptUrlEvidence('/_next/')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      // nextjs appears first, react second
      expect(result[0]!.technology.id).toBe(nextTech.id);
      expect(result[1]!.technology.id).toBe(reactTech.id);
    });

    function replTech(): Technology {
      return makeTechnology('nextjs', 'Next.js', 'framework');
    }
  });

  describe('duplicate evidence removal', () => {
    it('removes exact duplicate evidence objects', () => {
      const url = createUrl('https://example.com/_next/main.js');
      const evidence: Evidence = { type: 'script_url', url };

      const detections = [
        makeDetection(nextTech, 90, [evidence]),
        makeDetection(nextTech, 95, [evidence]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result[0]!.evidence).toHaveLength(1);
    });

    it('keeps different evidence that happens to share the type', () => {
      const detections = [
        makeDetection(nextTech, 90, [scriptUrlEvidence('https://example.com/_next/main.js')]),
        makeDetection(nextTech, 95, [scriptUrlEvidence('https://example.com/_next/vendor.js')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result[0]!.evidence).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('handles a single detection (no duplicates)', () => {
      const detections = [makeDetection(reactTech, 90, [scriptContentEvidence('react-dom')])];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(90);
      expect(result[0]!.evidence).toHaveLength(1);
    });

    it('handles empty result', () => {
      const detector = new DeduplicatingDetector(makeMockDetector([]));

      const result = detector.detect(snapshot);

      expect(result).toEqual([]);
    });

    it('handles multiple technologies with no overlap', () => {
      const detections = [
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        makeDetection(reactTech, 90, [scriptContentEvidence('react-dom')]),
        makeDetection(wpTech, 90, [scriptUrlEvidence('https://example.com/wp-content/')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(3);
      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[1]!.technology.id).toBe('react');
      expect(result[2]!.technology.id).toBe('wordpress');
    });
  });

  describe('confidence ties', () => {
    it('selects the first detection as representative on confidence ties', () => {
      const firstEvidence: Evidence = {
        type: 'meta_tag',
        name: 'generator',
        content: 'Next.js',
      };
      const secondEvidence: Evidence = {
        type: 'script_content',
        snippet: '__NEXT_DATA__',
      };

      const detections = [
        makeDetection(nextTech, 90, [firstEvidence]),
        makeDetection(nextTech, 90, [secondEvidence]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(90);
      // Evidence is sorted canonically: meta_tag < script_content
      expect(result[0]!.evidence[0]!).toEqual(firstEvidence);
      expect(result[0]!.evidence[1]!).toEqual(secondEvidence);
    });

    it('first detection wins representative selection on ties (different evidence)', () => {
      const detections = [
        makeDetection(nextTech, 90, [httpHeaderEvidence('X-Powered-By', 'Next.js')]),
        makeDetection(nextTech, 90, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.confidence).toBe(90);
      // Both evidence items are preserved
      expect(result[0]!.evidence).toHaveLength(2);
      expect(result[0]!.evidence[0]!.type).toBe('http_header');
      expect(result[0]!.evidence[1]!.type).toBe('script_content');
    });
  });

  describe('representative identity', () => {
    it('preserves representative technology id, name, and category', () => {
      const highConfidenceTech = makeTechnology('nextjs', 'Next.js', 'framework');
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(highConfidenceTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[0]!.technology.name).toBe('Next.js');
      expect(result[0]!.technology.category).toBe('framework');
    });

    it('does not aggregate confidence (no sum, no average)', () => {
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextTech, 90, [scriptUrlEvidence('/_next/main.js')]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result[0]!.confidence).toBe(95);
      expect(result[0]!.confidence).not.toBe(270);
      expect(result[0]!.confidence).not.toBe(90); // not the average (90)
    });
  });

  describe('inconsistent category behavior', () => {
    it('preserves the representative detection category when categories differ', () => {
      const nextJsFramework = makeTechnology('nextjs', 'Next.js', 'framework');
      const nextJsCms = makeTechnology('nextjs', 'Next.js', 'cms');

      const detections = [
        makeDetection(nextJsFramework, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextJsCms, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      // Representative is the highest-confidence detection (95, cms)
      expect(result[0]!.technology.category).toBe('cms');
      // Evidence from both is still preserved
      expect(result[0]!.evidence).toHaveLength(2);
    });

    it('preserves first detection category when confidence is tied', () => {
      const nextJsFramework = makeTechnology('nextjs', 'Next.js', 'framework');
      const nextJsCms = makeTechnology('nextjs', 'Next.js', 'cms');

      const detections = [
        makeDetection(nextJsFramework, 90, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextJsCms, 90, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      // On tie, first detection is the representative
      expect(result[0]!.technology.category).toBe('framework');
    });
  });

  describe('realistic integration data', () => {
    it('Next.js detected by meta tag + script URL + inline script → ONE detection', () => {
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextTech, 90, [
          scriptUrlEvidence('https://example.com/_next/static/chunks/main.js'),
        ]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[0]!.confidence).toBe(95);
      expect(result[0]!.evidence).toHaveLength(3);
      // Evidence is sorted canonically: meta_tag < script_content < script_url
      expect(result[0]!.evidence.map((e) => e.type)).toEqual([
        'meta_tag',
        'script_content',
        'script_url',
      ]);
    });

    it('WordPress detected by meta tag + script URL → ONE detection with both evidence', () => {
      const detections = [
        makeDetection(wpTech, 85, [metaTagEvidence('generator', 'WordPress 6.5')]),
        makeDetection(wpTech, 90, [
          scriptUrlEvidence('https://example.com/wp-content/themes/twentytwentythree/style.css'),
        ]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.technology.id).toBe('wordpress');
      expect(result[0]!.confidence).toBe(90);
      expect(result[0]!.evidence).toHaveLength(2);
    });

    it('React detected by script URL + inline script → ONE detection with both evidence', () => {
      const detections = [
        makeDetection(reactTech, 90, [
          scriptUrlEvidence('https://cdn.example.com/react-dom@18.js'),
        ]),
        makeDetection(reactTech, 90, [scriptContentEvidence('react-dom')]),
        makeDetection(reactTech, 85, [scriptContentEvidence('createRoot(')]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.technology.id).toBe('react');
      expect(result[0]!.confidence).toBe(90); // first 90 wins on tie
      expect(result[0]!.evidence).toHaveLength(3);
    });

    it('multiple technologies with realistic overlap → all preserved and deduplicated', () => {
      const detections = [
        makeDetection(nextTech, 85, [metaTagEvidence('generator', 'Next.js')]),
        makeDetection(nextTech, 90, [
          scriptUrlEvidence('https://example.com/_next/static/chunks/main.js'),
        ]),
        makeDetection(nextTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        makeDetection(reactTech, 90, [scriptContentEvidence('react-dom')]),
        makeDetection(wpTech, 90, [
          scriptUrlEvidence('https://example.com/wp-content/themes/a/style.css'),
        ]),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));

      const result = detector.detect(snapshot);

      expect(result).toHaveLength(3);
      expect(result[0]!.technology.id).toBe('nextjs');
      expect(result[0]!.confidence).toBe(95);
      expect(result[0]!.evidence).toHaveLength(3);

      expect(result[1]!.technology.id).toBe('react');
      expect(result[1]!.confidence).toBe(90);
      expect(result[1]!.evidence).toHaveLength(1);

      expect(result[2]!.technology.id).toBe('wordpress');
      expect(result[2]!.confidence).toBe(90);
      expect(result[2]!.evidence).toHaveLength(1);
    });
  });

  describe('version consensus', () => {
    const makeVersioned = (
      technology: Technology,
      confidence: number,
      evidence: Evidence[],
      version: TechnologyVersion | null,
    ): Detection => createDetection(technology, createConfidence(confidence), evidence, version);

    it('keeps a version extracted by any source — survives even when the representative has none', () => {
      // Highest-confidence detection carries NO version; a lower-confidence
      // duplicate carries '6.4.2'. The consensus must still surface the
      // version (mirrors the WordPress case: meta '6.4.2' vs. CSS-resource null).
      const detections = [
        makeVersioned(wpTech, 95, [httpHeaderEvidence('Server', 'nginx/1.21')], null),
        makeVersioned(
          wpTech,
          90,
          [metaTagEvidence('generator', 'WordPress 6.4.2')],
          createTechnologyVersion('6.4.2'),
        ),
      ];
      const result = new DeduplicatingDetector(makeMockDetector(detections)).detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBe('6.4.2');
    });

    it('keeps a version when all duplicate detections agree', () => {
      const detections = [
        makeVersioned(
          wpTech,
          90,
          [metaTagEvidence('generator', 'WordPress 6.4.2')],
          createTechnologyVersion('6.4.2'),
        ),
        makeVersioned(
          wpTech,
          95,
          [scriptUrlEvidence('https://example.com/wp-content/style.css')],
          createTechnologyVersion('6.4.2'),
        ),
      ];
      const result = new DeduplicatingDetector(makeMockDetector(detections)).detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBe('6.4.2');
    });

    it('returns null when duplicate detections carry conflicting versions', () => {
      const detections = [
        makeVersioned(
          wpTech,
          95,
          [metaTagEvidence('generator', 'WordPress 6.4.2')],
          createTechnologyVersion('6.4.2'),
        ),
        makeVersioned(
          wpTech,
          90,
          [scriptUrlEvidence('https://example.com/wp-content/')],
          createTechnologyVersion('6.5.0'),
        ),
      ];
      const result = new DeduplicatingDetector(makeMockDetector(detections)).detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBeNull();
    });

    it('returns null when no duplicate detection carries a version', () => {
      const detections = [
        makeDetection(wpTech, 95, [scriptContentEvidence('__NEXT_DATA__')]),
        makeDetection(wpTech, 90, [metaTagEvidence('generator', 'WordPress')]),
      ];
      const result = new DeduplicatingDetector(makeMockDetector(detections)).detect(snapshot);

      expect(result).toHaveLength(1);
      expect(result[0]!.version).toBeNull();
    });

    it('version is deterministic across repeated runs', () => {
      const detections = [
        makeVersioned(wpTech, 95, [httpHeaderEvidence('Server', 'nginx/1.21')], null),
        makeVersioned(
          wpTech,
          90,
          [metaTagEvidence('generator', 'WordPress 6.4.2')],
          createTechnologyVersion('6.4.2'),
        ),
      ];
      const detector = new DeduplicatingDetector(makeMockDetector(detections));
      const a = detector.detect(snapshot);
      const b = detector.detect(snapshot);

      expect(a[0]!.version).toBe(b[0]!.version);
      expect(a[0]!.version).toBe('6.4.2');
    });

    it('selects the version independently of evidence-merge ordering', () => {
      // Two orders of the same two detections → identical version.
      const a = makeVersioned(wpTech, 95, [httpHeaderEvidence('Server', 'nginx/1.21')], null);
      const b = makeVersioned(
        wpTech,
        90,
        [metaTagEvidence('generator', 'WordPress 6.4.2')],
        createTechnologyVersion('6.4.2'),
      );
      const first = new DeduplicatingDetector(makeMockDetector([a, b])).detect(snapshot);
      const second = new DeduplicatingDetector(makeMockDetector([b, a])).detect(snapshot);
      expect(first[0]!.version).toBe(second[0]!.version);
      expect(first[0]!.version).toBe('6.4.2');
    });
  });
});
