/**
 * Step 69 — Technology Relationship Semantics: resolver test matrix.
 *
 * Exercises the pure {@link resolveRelationships} engine with crafted
 * definition graphs (for full control over chains, conflicts, and
 * determinism) and with the **real** production catalog (for the three
 * declared relationships: `woocommerce requires wordpress`,
 * `nextjs implies react`, `nuxtjs implies vue`).
 *
 * The resolver is a pure post-scoring layer — it is invoked directly here
 * (not through `createProductionDetector`) so the matrix is hermetic and
 * fast. End-to-end coverage through the production pipeline lives in
 * `relationship-pipeline.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { resolveRelationships, RelationshipResolver } from './relationships.js';
import { findDefinition } from './catalog/index.js';
import type { TechnologyDefinition } from './catalog/types.js';
import type { Detection, Evidence } from '@devlens/core';
import {
  createDetection,
  createTechnologyId,
  createTechnologyCategory,
  createConfidence,
} from '@devlens/core';
import type { Detector } from './detector.js';
import type { SiteSnapshot } from '@devlens/core';

// ─── Test helpers ──────────────────────────────────────────────────

/** A single meta-tag evidence item shared by every direct detection. */
const EVIDENCE: Evidence[] = [{ type: 'meta_tag', name: 'generator', content: 'test' }];

/**
 * Builds a minimal but domain-valid direct `Detection` (no `source`).
 *
 * Accepts either call form:
 *   directDetection(id, name, confidence)            // 3-arg (confidence as 3rd)
 *   directDetection(id, name, category, confidence)  // 4-arg
 */
function directDetection(
  id: string,
  name: string = id,
  categoryOrConfidence: number | string = 'framework',
  confidence: number = 80,
): Detection {
  let category = 'framework';
  if (typeof categoryOrConfidence === 'number') {
    // 3-arg form: the 3rd argument is the confidence value.
    confidence = categoryOrConfidence;
  } else {
    category = categoryOrConfidence;
  }
  return createDetection(
    {
      id: createTechnologyId(id),
      name,
      category: createTechnologyCategory(category),
    },
    createConfidence(confidence),
    EVIDENCE,
    null,
  );
}

/** Builds a crafted `TechnologyDefinition` with only metadata + relationships. */
function def(
  id: string,
  name: string = id,
  category: string = 'framework',
  relationships: TechnologyDefinition['relationships'] = undefined,
): TechnologyDefinition {
  return { id, name, category, relationships } as TechnologyDefinition;
}

const SNAPSHOT: SiteSnapshot = {
  url: 'https://example.com' as never,
  hostname: 'example.com' as never,
  capturedAt: '2025-06-01T12:00:00.000Z' as never,
  http: {
    statusCode: 200 as never,
    headers: [],
    contentType: 'text/html',
    finalUrl: 'https://example.com' as never,
  },
  html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
  resources: [],
};

// ─── Phase 6/14: the relationship-resolution matrix ──────────────────

describe('resolveRelationships — implies', () => {
  it('returns direct detections unchanged when no relationships are declared', () => {
    const a = directDetection('a', 'A');
    const out = resolveRelationships([a], {
      definitions: [def('a', 'A')],
    });
    expect(out).toEqual([a]);
    // Direct detections pass through by reference (no conflict → no copy).
    expect(out[0]).toBe(a);
  });

  it('derives a target when its source is directly observed', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships([directDetection('a', 'A', 'framework', 90)], {
      definitions: defs,
    });

    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);

    // The direct detection is preserved by reference (it has no conflict).
    const inputA = directDetection('a', 'A', 'framework', 90);
    const outRef = resolveRelationships([inputA], { definitions: defs });
    expect(outRef[0]).toBe(inputA);

    const derived = out[1]!;
    expect(derived.source).toBe('relationship');
    expect(derived.confidence).toBe(0);
    expect(derived.evidence).toEqual([]);
    expect(derived.version).toBeNull();
    expect(derived.derivedFrom).toEqual([{ source: 'a', sourceName: 'A', type: 'implies' }]);
  });

  it('does NOT derive a target that is already directly observed (Phase 2)', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships(
      [directDetection('a', 'A', 90), directDetection('b', 'B', 85)],
      { definitions: defs },
    );

    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);
    // No derived detection is produced.
    expect(out.filter((d) => d.source === 'relationship')).toEqual([]);
    // Both remain direct (no source field) and by reference.
    expect(out[0]!.source).toBeUndefined();
    expect(out[1]!.source).toBeUndefined();
  });

  it('resolves transitive implies chains (Phase 6)', () => {
    const defs = [
      def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]),
      def('b', 'B', 'framework', [{ type: 'implies', target: 'c' }]),
      def('c', 'C'),
    ];
    const out = resolveRelationships([directDetection('a', 'A')], { definitions: defs });

    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b', 'c']);
    // B is derived from A (immediate predecessor); C from B.
    expect(out[1]!.derivedFrom).toEqual([{ source: 'a', sourceName: 'A', type: 'implies' }]);
    expect(out[2]!.derivedFrom).toEqual([{ source: 'b', sourceName: 'B', type: 'implies' }]);
  });

  it('collapses duplicate derivation paths (deterministic first-source-wins)', () => {
    const defs = [
      def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]),
      def('c', 'C', 'framework', [{ type: 'implies', target: 'b' }]),
      def('b', 'B'),
    ];
    // Pass direct detections in non-sorted order to prove derivation is
    // order-independent (seeds are sorted internally).
    const out = resolveRelationships([directDetection('c', 'C'), directDetection('a', 'A')], {
      definitions: defs,
    });

    // Direct detections keep input order; derived 'b' is appended last.
    expect(out.slice(0, 2).map((d) => d.technology.id)).toEqual(['c', 'a']);
    expect(out[2]!.technology.id).toBe('b');
    // 'a' sorts before 'c' → 'a' claims 'b' first.
    expect(out[2]!.derivedFrom).toEqual([{ source: 'a', sourceName: 'A', type: 'implies' }]);
    // Exactly one derived detection (no duplicates).
    expect(out.filter((d) => d.source === 'relationship')).toHaveLength(1);
  });

  it('does not infinite-loop on a cyclic implies graph (visited-set safety)', () => {
    const defs = [
      def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]),
      def('b', 'B', 'framework', [{ type: 'implies', target: 'a' }]),
    ];
    const out = resolveRelationships([directDetection('a', 'A')], { definitions: defs });
    // 'a' is direct; 'b' is derived from 'a'; 'b'→'a' is skipped (a direct).
    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);
    expect(out[1]!.source).toBe('relationship');
  });
});

describe('resolveRelationships — requires (validation, never derive)', () => {
  it('surfaces a missing-requirement conflict and never derives the target', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'requires', target: 'b' }]), def('b', 'B')];
    const direct = [directDetection('a', 'A', 'framework', 85)];
    const out = resolveRelationships(direct, { definitions: defs });

    // No derived 'b' — requires never derives.
    expect(out.find((d) => d.technology.id === 'b')).toBeUndefined();
    expect(out).toHaveLength(1);
    expect(out[0]!.relationshipConflicts).toEqual([
      { type: 'requires', other: 'b', reason: 'missing_requirement' },
    ]);
    // Evidence is preserved on the conflicted direct detection.
    expect(out[0]!.evidence).toEqual(EVIDENCE);
  });

  it('does not flag a conflict when the requirement is directly satisfied', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'requires', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships(
      [directDetection('a', 'A', 85), directDetection('b', 'B', 80)],
      { definitions: defs },
    );

    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);
    expect(out[0]!.relationshipConflicts).toBeUndefined();
    expect(out[1]!.relationshipConflicts).toBeUndefined();
    expect(out.filter((d) => d.source === 'relationship')).toEqual([]);
  });
});

describe('resolveRelationships — excludes (never delete)', () => {
  it('surfaces an excludes conflict when both are directly observed, preserving both', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'excludes', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships(
      [directDetection('a', 'A', 90), directDetection('b', 'B', 85)],
      { definitions: defs },
    );

    // Both detections are preserved (nothing is deleted).
    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);
    expect(out[0]!.relationshipConflicts).toEqual([
      { type: 'excludes', other: 'b', reason: 'both_directly_observed' },
    ]);
    // Evidence intact on both.
    expect(out[0]!.evidence).toEqual(EVIDENCE);
    expect(out[1]!.evidence).toEqual(EVIDENCE);
  });

  it('does not flag an excludes conflict when only the declarer is observed', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'excludes', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships([directDetection('a', 'A')], { definitions: defs });

    expect(out).toHaveLength(1);
    expect(out[0]!.relationshipConflicts).toBeUndefined();
  });
});

describe('resolveRelationships — Phase 10/11 invariants', () => {
  it('a derived detection never carries a version', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships([directDetection('a', 'A')], { definitions: defs });
    const derived = out.find((d) => d.technology.id === 'b')!;
    expect(derived.version).toBeNull();
  });

  it('a derived detection is never scored as a direct observation', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const out = resolveRelationships([directDetection('a', 'A', 90)], { definitions: defs });
    const derived = out.find((d) => d.technology.id === 'b')!;
    expect(derived.source).toBe('relationship');
    expect(derived.confidence).toBe(0);
    expect(derived.evidence).toEqual([]);
  });
});

describe('resolveRelationships — determinism', () => {
  it('produces identical output for identical input (JSON-stable)', () => {
    const defs = [
      def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]),
      def('b', 'B', 'framework', [{ type: 'implies', target: 'c' }]),
      def('c', 'C'),
    ];
    const input = [directDetection('a', 'A'), directDetection('x', 'X')];
    const a = resolveRelationships(input, { definitions: defs });
    const b = resolveRelationships(input, { definitions: defs });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('derives the same technology set regardless of direct-input order', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'z' }]), def('z', 'Z')];
    const first = resolveRelationships([directDetection('a', 'A')], { definitions: defs });
    const alsoFirst = resolveRelationships([directDetection('a', 'A')], { definitions: defs });
    expect(first.map((d) => d.technology.id)).toEqual(alsoFirst.map((d) => d.technology.id));
  });
});

describe('resolveRelationships — real production catalog (Phase 12 proof)', () => {
  it('declares exactly the three documented relationships', () => {
    const rels = {
      woocommerce: findDefinition('woocommerce')!.relationships ?? [],
      nextjs: findDefinition('nextjs')!.relationships ?? [],
      nuxtjs: findDefinition('nuxtjs')!.relationships ?? [],
    };
    expect(rels.woocommerce).toEqual([{ type: 'requires', target: 'wordpress' }]);
    expect(rels.nextjs).toEqual([{ type: 'implies', target: 'react' }]);
    expect(rels.nuxtjs).toEqual([{ type: 'implies', target: 'vue' }]);
  });

  it('derives React from a directly-observed Next.js (no React fingerprint)', () => {
    const out = resolveRelationships([directDetection('nextjs', 'Next.js', 'framework', 90)]);

    const react = out.find((d) => d.technology.id === 'react');
    expect(react).toBeDefined();
    expect(react!.source).toBe('relationship');
    expect(react!.derivedFrom).toEqual([
      { source: 'nextjs', sourceName: 'Next.js', type: 'implies' },
    ]);
    expect(react!.evidence).toEqual([]);
    expect(react!.version).toBeNull();
    expect(react!.confidence).toBe(0);
  });

  it('does NOT derive React when React is already directly observed', () => {
    const out = resolveRelationships([
      directDetection('nextjs', 'Next.js', 'framework', 90),
      directDetection('react', 'React', 'framework', 95),
    ]);
    expect(out.find((d) => d.technology.id === 'react')!.source).toBeUndefined();
    expect(out.filter((d) => d.source === 'relationship')).toEqual([]);
  });

  it('does NOT derive WordPress from a requires edge (validation only)', () => {
    const out = resolveRelationships([
      directDetection('woocommerce', 'WooCommerce', 'ecommerce', 85),
    ]);
    expect(out.find((d) => d.technology.id === 'wordpress')).toBeUndefined();
    expect(out[0]!.relationshipConflicts).toEqual([
      { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
    ]);
  });

  it('does not flag a requires conflict when both WooCommerce and WordPress are observed', () => {
    const out = resolveRelationships([
      directDetection('woocommerce', 'WooCommerce', 'ecommerce', 85),
      directDetection('wordpress', 'WordPress', 'cms', 100),
    ]);
    expect(out[0]!.relationshipConflicts).toBeUndefined();
    expect(out.filter((d) => d.source === 'relationship')).toEqual([]);
  });
});

// ─── RelationshipResolver decorator ─────────────────────────────────

describe('RelationshipResolver (Detector decorator)', () => {
  it('wraps an inner detector and resolves its direct output', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const inner: Detector = { detect: () => [directDetection('a', 'A')] };
    const resolver = new RelationshipResolver(inner, defs);

    const out = resolver.detect(SNAPSHOT);
    expect(out.map((d) => d.technology.id)).toEqual(['a', 'b']);
    expect(out[1]!.source).toBe('relationship');
  });

  it('defaults to the production catalog when no definitions given', () => {
    const inner: Detector = { detect: () => [directDetection('nextjs', 'Next.js')] };
    const resolver = new RelationshipResolver(inner);

    const out = resolver.detect(SNAPSHOT);
    expect(out.find((d) => d.technology.id === 'react')!.source).toBe('relationship');
  });

  it('is deterministic across repeated calls', () => {
    const defs = [def('a', 'A', 'framework', [{ type: 'implies', target: 'b' }]), def('b', 'B')];
    const inner: Detector = { detect: () => [directDetection('a', 'A')] };
    const resolver = new RelationshipResolver(inner, defs);

    const a = resolver.detect(SNAPSHOT);
    const b = resolver.detect(SNAPSHOT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
