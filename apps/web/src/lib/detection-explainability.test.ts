/**
 * Unit tests for the pure detection-explainability module.
 *
 * Tests the structured explanation model — confidence preservation,
 * evidence deduplication using canonical identity, deterministic ordering
 * (type label ASC → identity ASC), source descriptions, evidence type
 * listing, and immutability. No React, HTTP, or DOM required.
 */

import { describe, it, expect } from 'vitest';
import { getDetectionExplainability } from './detection-explainability';
import type { DetectionResponse, EvidenceReason, RelationshipReason } from './types';

function makeDetection(
  id = 'react',
  name = 'React',
  category = 'frontend',
  confidence = 95,
  evidence: DetectionResponse['evidence'] = [],
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence,
  };
}

describe('getDetectionExplainability', () => {
  it('handles zero evidence', () => {
    const result = getDetectionExplainability(makeDetection('react', 'React', 'frontend', 95, []));

    expect(result.evidenceCount).toBe(0);
    expect(result.evidenceSources).toHaveLength(0);
    expect(result.evidenceTypes).toEqual([]);
    expect(result.summary).toBe('No evidence details are available.');
  });

  it('handles single evidence', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
    );

    expect(result.technology.name).toBe('React');
    expect(result.technology.category).toBe('frontend');
    expect(result.confidence).toBe(95);
    expect(result.evidenceCount).toBe(1);
    expect(result.evidenceSources).toHaveLength(1);
    expect(result.evidenceSources[0]!.identity).toBe('script_url:https://cdn.example.com/react.js');
  });

  it('handles multiple evidence types', () => {
    const result = getDetectionExplainability(
      makeDetection('wordpress', 'WordPress', 'cms', 90, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
      ]),
    );

    expect(result.evidenceCount).toBe(3);
    expect(result.evidenceTypes).toContain('HTTP Header');
    expect(result.evidenceTypes).toContain('Meta Tag');
    expect(result.evidenceTypes).toContain('Script URL');
  });

  it('deduplicates duplicate evidence using canonical identity', () => {
    const result = getDetectionExplainability(
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'nginx' }, // exact duplicate
        { type: 'http_header', name: 'Server', value: 'Apache' }, // distinct (value differs)
      ]),
    );

    // The exact nginx duplicate collapses, but Server:Apache is a DISTINCT
    // evidence item (matching canonical getEvidenceKey semantics).
    expect(result.evidenceCount).toBe(2);
    expect(result.evidenceSources).toHaveLength(2);
    // Sorted by identity ASC: 'Server|Apache' < 'Server|nginx' (capital 'A' < 'n')
    expect(result.evidenceSources[0]!.value).toBe('Server: Apache');
    expect(result.evidenceSources[1]!.value).toBe('Server: nginx');
  });

  it('produces deterministic ordering (type label ASC → identity ASC)', () => {
    const result = getDetectionExplainability(
      makeDetection('multi', 'Multi', 'category', 90, [
        { type: 'script_url', url: 'https://z.com/late.js' },
        { type: 'http_header', name: 'X-B', value: 'b' },
        { type: 'http_header', name: 'X-A', value: 'a' },
        { type: 'meta_tag', name: 'm', content: 'c' },
      ]),
    );

    // Sorted by type label ASC, then identity ASC (identity includes value):
    // HTTP Header (X-A|a) → HTTP Header (X-B|b) → Meta Tag (m|c) → Script URL
    expect(result.evidenceSources.map((s) => s.identity)).toEqual([
      'http_header:X-A|a',
      'http_header:X-B|b',
      'meta_tag:m|c',
      'script_url:https://z.com/late.js',
    ]);
  });

  it('produces deterministic ordering with identical types', () => {
    const result = getDetectionExplainability(
      makeDetection('multi', 'Multi', 'category', 90, [
        { type: 'meta_tag', name: 'z', content: 'c' },
        { type: 'meta_tag', name: 'a', content: 'c' },
        { type: 'meta_tag', name: 'm', content: 'c' },
      ]),
    );

    // All same type → sorted by identity ASC (identity includes content)
    expect(result.evidenceSources.map((s) => s.identity)).toEqual([
      'meta_tag:a|c',
      'meta_tag:m|c',
      'meta_tag:z|c',
    ]);
  });

  it('reuses canonical identity from existing evidenceIdentity semantics', () => {
    const result = getDetectionExplainability(
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
      ]),
    );

    // Evidence sorted by type label ASC → identity ASC:
    // HTML Element, HTTP Header, JS... wait — JavaScript Global not present
    // HTML Element < HTTP Header < Script URL
    // So: [0] = HTML, [1] = HTTP Header, [2] = Script URL
    expect(result.evidenceSources[0]!.identity).toMatch(/^html:#app\|/);
    expect(result.evidenceSources[1]!.identity).toMatch(/^http_header:Server\|/);
    expect(result.evidenceSources[2]!.identity).toMatch(
      /^script_url:https:\/\/cdn\.example\.com\/app\.js$/,
    );
  });

  it('preserves confidence in the model', () => {
    const result = getDetectionExplainability(makeDetection('react', 'React', 'frontend', 87));

    expect(result.confidence).toBe(87);
  });

  it('preserves exact evidence values without truncation', () => {
    const longValue = 'x'.repeat(1000);
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: longValue },
      ]),
    );

    expect(result.evidenceSources[0]!.value).toBe(`Server: ${longValue}`);
  });

  it('produces deterministic output (same input → same output)', () => {
    const detection = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'script_url', url: 'https://cdn.example.com/react.js' },
    ]);

    const first = getDetectionExplainability(detection);
    const second = getDetectionExplainability(detection);

    expect(first).toEqual(second);
  });

  it('does not mutate the input', () => {
    const detection = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ]);
    const originalEvidenceLength = detection.evidence.length;

    getDetectionExplainability(detection);

    expect(detection.evidence.length).toBe(originalEvidenceLength);
  });

  it('builds source descriptions for all evidence types', () => {
    const result = getDetectionExplainability(
      makeDetection('multi', 'Multi', 'category', 90, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'script_content', snippet: 'window.foo' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'javascript_global', globalName: 'React' },
        { type: 'resource', url: 'https://cdn.example.com/logo.png' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ]),
    );

    // Evidence is sorted by type label ASC → identity ASC
    // Order: HTML Element, HTTP Header, JavaScript Global, Link, Meta Tag,
    //        Resource URL, Script Content, Script URL
    expect(result.evidenceSources[0]!.source).toBe("HTML element at '#app'");
    expect(result.evidenceSources[1]!.source).toBe("HTTP header 'Server'");
    expect(result.evidenceSources[2]!.source).toBe("JavaScript global 'React'");
    expect(result.evidenceSources[3]!.source).toBe("Link to 'https://cdn.example.com/style.css'");
    expect(result.evidenceSources[4]!.source).toBe("Meta tag 'generator'");
    expect(result.evidenceSources[5]!.source).toBe(
      "Resource at 'https://cdn.example.com/logo.png'",
    );
    expect(result.evidenceSources[6]!.source).toBe('JavaScript snippet');
    expect(result.evidenceSources[7]!.source).toBe("Script from 'https://cdn.example.com/app.js'");
  });

  it('handles unknown/unsupported evidence fields gracefully', () => {
    const unknownEvidence = {
      type: 'future_type',
      data: 'x',
    } as unknown as DetectionResponse['evidence'][number];
    const result = getDetectionExplainability(
      makeDetection('unknown', 'Unknown', 'misc', 50, [unknownEvidence]),
    );

    expect(result.evidenceTypes).toContain('Evidence');
    expect(result.evidenceSources[0]!.type).toBe('Evidence');
    expect(result.evidenceSources[0]!.source).toBe('Evidence');
  });

  it('preserves evidence count consistency after deduplication', () => {
    const result = getDetectionExplainability(
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'Apache' }, // distinct (value differs)
      ]),
    );

    // evidenceCount should match evidenceSources length after deduplication
    expect(result.evidenceCount).toBe(result.evidenceSources.length);
    // Both are distinct evidence (same name, different value) → 2 unique
    expect(result.evidenceCount).toBe(2);
    // The evidence array should also be deduplicated but both kept
    expect(result.evidence).toHaveLength(2);
  });

  it('sorts evidence type labels alphabetically', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
      ]),
    );

    // Sorted alphabetically: HTTP Header, Meta Tag, Script URL
    expect(result.evidenceTypes).toEqual(['HTTP Header', 'Meta Tag', 'Script URL']);
  });
});

describe('getDetectionExplainability — Step 73 structured model', () => {
  it('classifies a directly-observed detection with evidence reasons', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    );

    expect(result.kind).toBe('direct');
    expect(result.noDirectEvidence).toBe(false);
    expect(result.reasons).toHaveLength(1);
    const reason = result.reasons[0] as EvidenceReason;
    expect(reason.kind).toBe('evidence');
    expect(reason.evidenceType).toBe('HTTP Header');
    expect(reason.summary).toContain("HTTP header 'Server'");
    expect(reason.summary).toContain('matched');
    expect(reason.summary).toContain("'nginx'");
    expect(reason.evidence).toEqual({
      type: 'http_header',
      name: 'Server',
      value: 'nginx',
    });
  });

  it('classifies a relationship-derived detection with no direct evidence', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 80,
      evidence: [],
      source: 'relationship',
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
    };
    const result = getDetectionExplainability(detection);

    expect(result.kind).toBe('derived');
    expect(result.noDirectEvidence).toBe(true);
    expect(result.reasons).toHaveLength(1);
    const relationshipReason = result.reasons[0] as RelationshipReason;
    expect(relationshipReason.kind).toBe('relationship');
    expect(relationshipReason.relationshipType).toBe('implies');
    expect(relationshipReason.sourceTechnology).toBe('nextjs');
    expect(relationshipReason.sourceName).toBe('Next.js');
    expect(relationshipReason.targetTechnology).toBe('react');
    expect(result.derivedFrom).toBeDefined();
    expect(result.derivedFrom![0]!.source).toBe('nextjs');
    expect(result.derivedFrom![0]!.relationshipType).toBe('implies');
    expect(result.derivedFrom![0]!.sourceName).toBe('Next.js');
  });

  it('marks a direct detection with no evidence as having no direct evidence', () => {
    const result = getDetectionExplainability(makeDetection('react', 'React', 'frontend', 95, []));

    expect(result.kind).toBe('direct');
    expect(result.noDirectEvidence).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('builds a version explanation from resolved version fields', () => {
    const detection: DetectionResponse = {
      technology: { id: 'nginx', name: 'nginx', category: 'server' },
      confidence: 80,
      evidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
      version: '1.21.6',
      versionSource: 'header',
      versionEvidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
    };
    const result = getDetectionExplainability(detection);

    expect(result.version).toBeDefined();
    expect(result.version!.version).toBe('1.21.6');
    expect(result.version!.source).toBe('header');
    expect(result.version!.evidence).toHaveLength(1);
    expect(result.version!.evidence![0]!.value).toBe('Server: nginx/1.21.6');
    expect(result.versionConflict).toBeUndefined();
    expect(result.versionConflictDetail).toBeUndefined();
  });

  it('builds version-conflict detail from disagreeing evidence (no fabricated versions)', () => {
    const detection: DetectionResponse = {
      technology: { id: 'jquery', name: 'jQuery', category: 'library' },
      confidence: 70,
      evidence: [{ type: 'http_header', name: 'X-Version', value: '18.2.0' }],
      version: null,
      versionConflict: true,
      versionEvidence: [
        { type: 'http_header', name: 'X-Version', value: '18.2.0' },
        { type: 'meta_tag', name: 'generator', content: '18.3.1' },
      ],
    };
    const result = getDetectionExplainability(detection);

    expect(result.versionConflict).toBe(true);
    expect(result.versionConflictDetail).toBeDefined();
    // Disagreeing observations grouped by evidence-type label.
    expect(result.versionConflictDetail!.map((d) => d.source).sort()).toEqual([
      'HTTP Header',
      'Meta Tag',
    ]);
    // Per-observation extracted versions are NOT persisted → we surface the
    // disagreeing evidence's source modality + matched value only.
    const values = result
      .versionConflictDetail!.flatMap((d) => d.evidence.map((e) => e.value))
      .sort();
    expect(values).toEqual(['X-Version: 18.2.0', 'generator: 18.3.1']);
  });

  it('forwards and sorts relationship conflicts', () => {
    const detection: DetectionResponse = {
      technology: { id: 'woocommerce', name: 'WooCommerce', category: 'ecommerce' },
      confidence: 60,
      evidence: [{ type: 'meta_tag', name: 'generator', content: 'WooCommerce' }],
      relationshipConflicts: [
        { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
        { type: 'excludes', other: 'vercel', reason: 'both_directly_observed' },
      ],
    };
    const result = getDetectionExplainability(detection);

    expect(result.relationshipConflicts).toHaveLength(2);
    // Sorted by type ASC ('excludes' < 'requires'), then by `other` ASC.
    expect(result.relationshipConflicts![0]!.type).toBe('excludes');
    expect(result.relationshipConflicts![0]!.other).toBe('vercel');
    expect(result.relationshipConflicts![1]!.type).toBe('requires');
    expect(result.relationshipConflicts![1]!.other).toBe('wordpress');
  });

  it('handles resource_content evidence (Step 63 signature match)', () => {
    const detection: DetectionResponse = {
      technology: { id: 'angular', name: 'Angular', category: 'frontend' },
      confidence: 85,
      evidence: [
        {
          type: 'resource_content',
          url: 'https://cdn.example.com/main.js',
          resourceType: 'script',
          match: 'ng.version',
          snippet: 'ng=require(["angular"])',
        },
      ],
    };
    const result = getDetectionExplainability(detection);

    expect(result.evidenceCount).toBe(1);
    expect(result.evidenceTypes).toEqual(['Resource Content']);
    expect(result.evidenceSources[0]!.source).toBe(
      "Resource content at 'https://cdn.example.com/main.js'",
    );
    const evidenceReason = result.reasons[0] as EvidenceReason;
    expect(evidenceReason.evidenceType).toBe('Resource Content');
    expect(evidenceReason.summary).toContain(
      "Resource content at 'https://cdn.example.com/main.js'",
    );
    expect(evidenceReason.summary).toContain("matched 'ng.version'");
  });

  it('builds a normalized evidence graph for a direct detection', () => {
    const detection = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'React' },
    ]);

    const first = getDetectionExplainability(detection);
    const second = getDetectionExplainability(detection);

    expect(first.graph).toBeDefined();
    expect(second).toEqual(first); // deterministic
    // One detection node + one evidence node per evidence item.
    expect(first.graph!.nodes.filter((n) => n.kind === 'detection')).toHaveLength(1);
    expect(first.graph!.nodes.filter((n) => n.kind === 'evidence')).toHaveLength(2);
    // supported_by edge from the detection node to each evidence node.
    const supportedBy = first.graph!.edges.filter((e) => e.type === 'supported_by');
    expect(supportedBy).toHaveLength(2);
    const detectionNode = first.graph!.nodes.find((n) => n.kind === 'detection')!;
    expect(supportedBy.every((e) => e.from === detectionNode.id)).toBe(true);
  });

  it('builds a derived_from edge in the graph for a derived detection', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 80,
      evidence: [],
      source: 'relationship',
      derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
    };
    const result = getDetectionExplainability(detection);

    expect(result.graph).toBeDefined();
    expect(result.graph!.nodes.some((n) => n.kind === 'technology' && n.techId === 'nextjs')).toBe(
      true,
    );
    expect(
      result.graph!.edges.some((e) => e.type === 'derived_from' && e.to === 'tech:nextjs'),
    ).toBe(true);
  });

  it('builds a conflicts_with edge for relationship conflicts', () => {
    const detection: DetectionResponse = {
      technology: { id: 'woocommerce', name: 'WooCommerce', category: 'ecommerce' },
      confidence: 60,
      evidence: [{ type: 'meta_tag', name: 'generator', content: 'WooCommerce' }],
      relationshipConflicts: [
        { type: 'excludes', other: 'vercel', reason: 'both_directly_observed' },
      ],
    };
    const result = getDetectionExplainability(detection);

    expect(result.graph).toBeDefined();
    expect(
      result.graph!.edges.some((e) => e.type === 'conflicts_with' && e.to === 'tech:vercel'),
    ).toBe(true);
    expect(result.graph!.nodes.some((n) => n.kind === 'technology' && n.techId === 'vercel')).toBe(
      true,
    );
  });

  it('keeps evidence ordering consistent between reasons, sources, and evidence', () => {
    const detection = makeDetection('multi', 'Multi', 'category', 90, [
      { type: 'script_url', url: 'https://z.com/late.js' },
      { type: 'http_header', name: 'X-B', value: 'b' },
      { type: 'http_header', name: 'X-A', value: 'a' },
    ]);
    const result = getDetectionExplainability(detection);

    // Direct detection → reasons.length === evidenceCount === evidenceSources.length
    expect(result.reasons).toHaveLength(result.evidenceCount);
    expect(result.evidenceSources).toHaveLength(result.evidenceSources.length);
    // Each evidence reason's underlying evidence matches the parallel evidence entry.
    for (let i = 0; i < result.reasons.length; i++) {
      const reason = result.reasons[i]!;
      if (reason.kind === 'evidence') {
        expect(reason.evidence).toBe(result.evidence[i]);
        expect(reason.evidenceType).toBe(result.evidenceSources[i]!.type);
      }
    }
  });
});
