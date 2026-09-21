/**
 * Unit tests for the pure Detection → DetectionResponse mapping
 * (Step 73 §3 / §8).
 *
 * Pure-function tests (no React, HTTP, or DOM). They verify that the
 * domain `Detection` is mapped to the API `DetectionResponse` contract,
 * that absent fields stay absent (exactOptionalPropertyTypes semantics),
 * and that a precomputed `explanation` is always attached.
 */

import { describe, it, expect } from 'vitest';
import type { Detection } from '@devlens/core';
import { detectionToResponse } from './detection-to-response';
import type { DetectionResponse, EvidenceReason } from './types';

/**
 * Builds a minimal domain-shaped `Detection`. The object is structurally
 * plain (no branded types) — it is cast to `Detection` for the mapping,
 * mirroring how route.test.ts constructs detector output.
 */
function makeDetection(overrides: Partial<DetectionResponse> = {}): Detection {
  return {
    technology: { id: 'nginx', name: 'nginx', category: 'server' },
    confidence: 80,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
    ...overrides,
  } as unknown as Detection;
}

describe('detectionToResponse — pure mapping', () => {
  it('maps a direct detection with evidence', () => {
    const response = detectionToResponse(makeDetection());

    expect(response.technology).toEqual({ id: 'nginx', name: 'nginx', category: 'server' });
    expect(response.confidence).toBe(80);
    expect(response.evidence).toEqual([{ type: 'http_header', name: 'Server', value: 'nginx' }]);
    // Direct observation → no `source` (exactOptionalPropertyTypes).
    expect(response.source).toBeUndefined();
    expect(response.explanation).toBeDefined();
    expect(response.explanation!.kind).toBe('direct');
    expect(response.explanation!.confidence).toBe(80);
  });

  it('omits absent fields (no fabricated version/source/conflict fields)', () => {
    const response = detectionToResponse(makeDetection());

    expect('version' in response).toBe(false);
    expect('versionConflict' in response).toBe(false);
    expect('versionSource' in response).toBe(false);
    expect('versionEvidence' in response).toBe(false);
    expect('source' in response).toBe(false);
    expect('derivedFrom' in response).toBe(false);
    expect('relationshipConflicts' in response).toBe(false);
  });

  it('always attaches a precomputed explanation', () => {
    const response = detectionToResponse(makeDetection());

    expect(response.explanation).toBeDefined();
    expect(response.explanation!.evidenceCount).toBe(response.evidence.length);
    expect(response.explanation!.technology).toEqual({
      name: 'nginx',
      category: 'server',
    });
  });

  it('round-trips resource_content evidence (Step 63 signature match)', () => {
    const response = detectionToResponse(
      makeDetection({
        evidence: [
          {
            type: 'resource_content',
            url: 'https://cdn.example.com/main.js',
            resourceType: 'script',
            match: 'ng.version',
            snippet: 'ng',
          },
        ],
      }),
    );

    expect(response.evidence[0]!.type).toBe('resource_content');
    expect(response.explanation!.evidenceTypes).toEqual(['Resource Content']);
    const evidenceReason = response.explanation!.reasons[0] as EvidenceReason;
    expect(evidenceReason.evidenceType).toBe('Resource Content');
  });
});

describe('detectionToResponse — Step 72 version intelligence', () => {
  it('forwards a resolved version + versionSource + versionEvidence', () => {
    const response = detectionToResponse(
      makeDetection({
        version: '1.21.6',
        versionSource: 'header',
        versionEvidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
      }),
    );

    expect(response.version).toBe('1.21.6');
    expect(response.versionSource).toBe('header');
    expect(response.versionEvidence).toEqual([
      { type: 'http_header', name: 'Server', value: 'nginx/1.21.6' },
    ]);
    expect(response.explanation!.version?.version).toBe('1.21.6');
    expect(response.explanation!.version?.source).toBe('header');
  });

  it('emits versionConflict=true + null version on conflict (no placeholder)', () => {
    const response = detectionToResponse(
      makeDetection({
        version: null,
        versionConflict: true,
        versionEvidence: [
          { type: 'http_header', name: 'Server', value: '1.21.6' },
          { type: 'meta_tag', name: 'generator', content: '1.22.0' },
        ],
      }),
    );

    expect(response.version).toBeNull();
    expect(response.versionConflict).toBe(true);
    expect(response.versionEvidence).toHaveLength(2);
    expect(response.explanation!.versionConflict).toBe(true);
    expect(response.explanation!.versionConflictDetail).toBeDefined();
    // Per-observation versions are not persisted → no fabricated version strings.
    expect(response.explanation!.versionConflictDetail!.flatMap((d) => d.source)).toEqual([
      'HTTP Header',
      'Meta Tag',
    ]);
  });

  it('omits version entirely when no version signal was observed', () => {
    const response = detectionToResponse(makeDetection());

    expect('version' in response).toBe(false);
    expect(response.explanation!.version).toBeUndefined();
  });
});

describe('detectionToResponse — Step 69 relationship provenance', () => {
  it('maps a derived detection with relationship provenance', () => {
    const response = detectionToResponse(
      makeDetection({
        evidence: [],
        source: 'relationship',
        derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
      }),
    );

    expect(response.source).toBe('relationship');
    expect(response.derivedFrom).toEqual([
      { source: 'nextjs', sourceName: 'Next.js', type: 'implies' },
    ]);
    expect(response.explanation!.kind).toBe('derived');
    expect(response.explanation!.reasons).toHaveLength(1);
    expect(response.explanation!.reasons[0]!.kind).toBe('relationship');
  });

  it('forwards relationshipConflicts on a direct detection', () => {
    const response = detectionToResponse(
      makeDetection({
        relationshipConflicts: [
          { type: 'excludes', other: 'vercel', reason: 'both_directly_observed' },
          { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
        ],
      }),
    );

    expect(response.relationshipConflicts).toHaveLength(2);
    expect(response.explanation!.kind).toBe('direct');
  });
});

describe('detectionToResponse — determinism & immutability', () => {
  it('produces deterministic output (same input → same output)', () => {
    const detection = makeDetection();

    expect(detectionToResponse(detection)).toEqual(detectionToResponse(detection));
  });

  it('does not mutate the input detection', () => {
    const detection = makeDetection({
      versionEvidence: [{ type: 'http_header', name: 'Server', value: 'nginx/1.21.6' }],
    });
    const originalEvidenceLength = detection.evidence.length;

    detectionToResponse(detection);

    expect(detection.evidence.length).toBe(originalEvidenceLength);
  });
});
