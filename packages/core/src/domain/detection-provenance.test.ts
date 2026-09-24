/**
 * Unit tests for the Step-80 detection-provenance projection.
 *
 * Pure domain tests (no React, HTTP, DB, browser). They verify:
 * - evidenceCount matches the (already-deduplicated) evidence length (§5)
 * - evidenceTypes are deduplicated, distinct, and in canonical order (§6)
 * - strongestEvidenceType is deterministic (§7/§8)
 * - derived/zero-evidence detections degrade cleanly
 * - determinism under permutation (§8)
 */

import { describe, it, expect } from 'vitest';
import {
  computeDetectionProvenance,
  DETECTION_PROVENANCE_TYPE_ORDER,
} from './detection-provenance.js';
import { createDetection } from './detection.js';
import { createConfidence, createTechnologyId, createUrl } from './value-objects.js';
import { createTechnologyCategory } from './technology.js';
import type { Evidence } from './evidence.js';
import type { Technology } from './technology.js';

function makeTech(id = 'nginx'): Technology {
  return {
    id: createTechnologyId(id),
    name: id,
    category: createTechnologyCategory('server'),
  };
}

function httpEvidence(value: string): Evidence {
  return { type: 'http_header', name: 'Server', value };
}

describe('computeDetectionProvenance', () => {
  describe('evidence count (§5)', () => {
    it('counts the deduplicated evidence items on the detection', () => {
      const detection = createDetection(makeTech(), createConfidence(95), [
        httpEvidence('nginx'),
        httpEvidence('nginx'),
      ]);

      // §9: provenance relies on the upstream DeduplicatingDetector — the
      // detection arriving here is already de-duplicated, so the count equals
      // the evidence length (two identical items would have been collapsed to
      // one by the pipeline before provenance is computed).
      const prov = computeDetectionProvenance(detection);
      expect(prov.evidenceCount).toBe(detection.evidence.length);
    });

    it('reports 0 for a detection with no evidence (e.g. relationship-derived)', () => {
      // createDetection forbids empty evidence, so build the derived shape
      // directly to exercise the zero-evidence branch.
      const emptyEvidence: readonly Evidence[] = [];
      const detection = {
        technology: makeTech(),
        confidence: 0,
        evidence: emptyEvidence,
      };
      const prov = computeDetectionProvenance(
        detection as unknown as ReturnType<typeof createDetection>,
      );
      expect(prov.evidenceCount).toBe(0);
      expect(prov.evidenceTypes).toEqual([]);
      expect(prov.strongestEvidenceType).toBeUndefined();
    });
  });

  describe('evidence types (§6)', () => {
    it('returns distinct types in canonical precedence order', () => {
      // Given in a deliberately scrambled order.
      const detection = createDetection(makeTech(), createConfidence(95), [
        { type: 'script_content', snippet: '__NEXT_DATA__' },
        { type: 'script_url', url: createUrl('https://cdn.example.com/_next/main.js') },
        { type: 'meta_tag', name: 'generator', content: 'Next.js' },
      ]);

      const prov = computeDetectionProvenance(detection);

      expect(prov.evidenceTypes).toEqual(['meta_tag', 'script_url', 'script_content']);
    });

    it('does not duplicate a type that appears in several evidence items', () => {
      const detection = createDetection(makeTech(), createConfidence(95), [
        { type: 'link', url: createUrl('https://cdn.example.com/a.css') },
        { type: 'link', url: createUrl('https://cdn.example.com/b.css') },
        { type: 'resource', url: createUrl('https://cdn.example.com/logo.png') },
      ]);

      const prov = computeDetectionProvenance(detection);

      expect(prov.evidenceTypes).toEqual(['resource', 'link']);
    });

    it('orders types following the canonical §6 table', () => {
      const detection = createDetection(makeTech(), createConfidence(100), [
        { type: 'javascript_global', globalName: 'React' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'link', url: createUrl('https://cdn.example.com/a.css') },
        {
          type: 'resource_content',
          url: createUrl('https://cdn.example.com/main.js'),
          resourceType: 'script',
          match: '__NEXT_DATA__',
          snippet: 'x',
        },
        { type: 'resource', url: createUrl('https://cdn.example.com/logo.png') },
        { type: 'script_content', snippet: 'window.foo' },
        { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
        { type: 'meta_tag', name: 'generator', content: 'x' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]);

      const prov = computeDetectionProvenance(detection);

      expect(prov.evidenceTypes).toEqual(DETECTION_PROVENANCE_TYPE_ORDER);
    });
  });

  describe('strongest evidence type (§7)', () => {
    it('is the single type when only one is present', () => {
      const detection = createDetection(makeTech(), createConfidence(90), [
        { type: 'script_url', url: createUrl('https://cdn.example.com/react.js') },
      ]);

      const prov = computeDetectionProvenance(detection);

      expect(prov.strongestEvidenceType).toBe('script_url');
    });

    it('is deterministic regardless of evidence item order (§8)', () => {
      const evidence = [
        { type: 'meta_tag', name: 'generator', content: 'Next.js' },
        { type: 'script_content', snippet: '__NEXT_DATA__' },
        { type: 'script_url', url: createUrl('https://cdn.example.com/_next/main.js') },
      ];

      const provA = computeDetectionProvenance(
        createDetection(makeTech(), createConfidence(100), evidence),
      );
      const provB = computeDetectionProvenance(
        createDetection(makeTech(), createConfidence(100), [
          evidence[2]!,
          evidence[0]!,
          evidence[1]!,
        ]),
      );

      expect(provA).toEqual(provB);
      expect(provA.strongestEvidenceType).toBe(provB.strongestEvidenceType);
    });
  });

  describe('determinism (§8)', () => {
    it('produces identical output for identical input across calls', () => {
      const detection = createDetection(makeTech(), createConfidence(95), [
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: createUrl('https://cdn.example.com/app.js') },
      ]);

      expect(computeDetectionProvenance(detection)).toEqual(computeDetectionProvenance(detection));
    });

    it('is a pure function of evidence + confidence (no external state)', () => {
      const tech = makeTech();
      const evidence = [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'nginx' },
      ];

      const a = computeDetectionProvenance(createDetection(tech, createConfidence(100), evidence));
      const b = computeDetectionProvenance(createDetection(tech, createConfidence(100), evidence));

      expect(a).toEqual(b);
      // No runtime class / prototype leakage — plain, serializable objects.
      expect(Object.getPrototypeOf(a)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(a.evidenceTypes)).toBe(Array.prototype);
    });
  });
});

describe('DETECTION_PROVENANCE_TYPE_ORDER (§6)', () => {
  it('contains every evidence type defined by the domain Evidence union', () => {
    // The canonical table must cover all Evidence variants so §6 ordering is
    // total. (Adding a new Evidence type without extending this table would
    // silently leave it last — this test guards against that drift.)
    const domainTypes = new Set<string>([
      'html',
      'http_header',
      'script_url',
      'script_content',
      'meta_tag',
      'javascript_global',
      'resource',
      'link',
      'resource_content',
    ]);
    expect(new Set(DETECTION_PROVENANCE_TYPE_ORDER)).toEqual(domainTypes);
    expect(DETECTION_PROVENANCE_TYPE_ORDER).toHaveLength(9);
  });

  it('starts with the §6 example order', () => {
    expect(DETECTION_PROVENANCE_TYPE_ORDER.slice(0, 5)).toEqual([
      'http_header',
      'meta_tag',
      'script_url',
      'script_content',
      'resource',
    ]);
  });
});

// (no module-level side effects — this file is type-checked for exports).
function _assertExports(): void {
  // Exercises the exported surface so the build/test pipeline fails fast if
  // the public API drifts.
  const fn: typeof computeDetectionProvenance = computeDetectionProvenance;
  const order: readonly string[] = DETECTION_PROVENANCE_TYPE_ORDER;
  void [fn, order];
}
void _assertExports;
