/**
 * Pure function tests for the `compareScans` comparison module.
 *
 * These tests verify the deterministic comparison logic without any
 * React, HTTP, or database dependencies. The comparison function
 * operates on plain data structures only.
 */

import { describe, it, expect } from 'vitest';
import { compareScans, evidenceKey } from '../lib/comparison.js';
import { getEvidenceIdentity } from '../lib/evidence-identity.js';
import type { ScanDetailResponse, DetectionResponse } from '../lib/types.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanDetailResponse> = {}): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_001',
      status: 'completed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: null,
      completedAt: '2025-06-01T12:00:05.000Z',
      failedAt: null,
      error: null,
    },
    snapshot: null,
    detections: [],
    ...overrides,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidence: DetectionResponse['evidence'] = [],
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence,
  };
}

function makeScanWithDetections(
  detections: DetectionResponse[],
  overrides: Partial<ScanDetailResponse> = {},
): ScanDetailResponse {
  return makeScan({ detections, ...overrides });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('compareScans', () => {
  it('detects a technology added in the right scan', () => {
    const left = makeScanWithDetections([]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe('React');
    expect(result.removed).toHaveLength(0);
  });

  it('detects a technology removed in the right scan', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([]);

    const result = compareScans(left, right);

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.name).toBe('React');
    expect(result.added).toHaveLength(0);
  });

  it('detects an unchanged technology present in both', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.name).toBe('React');
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
  });

  it('detects multiple additions and removals', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);

    const result = compareScans(left, right);

    expect(result.added).toHaveLength(1);
    expect(result.added[0]!.name).toBe('Svelte');
    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]!.name).toBe('Vue');
    expect(result.unchanged).toHaveLength(1);
    expect(result.unchanged[0]!.name).toBe('React');
  });

  it('ignores ranking/order changes for unchanged technologies', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ]);

    const result = compareScans(left, right);

    // Both technologies are present in both scans with the same IDs.
    expect(result.unchanged).toHaveLength(2);
    expect(result.added).toHaveLength(0);
    expect(result.removed).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });

  it('detects a confidence score change', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 90)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.scoreChanges).toHaveLength(1);
    expect(result.scoreChanges[0]!.leftConfidence).toBe(90);
    expect(result.scoreChanges[0]!.rightConfidence).toBe(95);
    expect(result.scoreChanges[0]!.scoreDelta).toBe(5);
  });

  it('does not report a score change when confidence is identical', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.scoreChanges).toHaveLength(0);
  });

  it('detects evidence added in the right scan', () => {
    const leftDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ]);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'React 19' },
    ]);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(1);
    expect(evidenceChanges[0]!.status).toBe('added');
  });

  it('detects evidence removed from the right scan', () => {
    const leftDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
      { type: 'meta_tag', name: 'generator', content: 'React 19' },
    ]);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, [
      { type: 'http_header', name: 'Server', value: 'nginx' },
    ]);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(1);
    expect(evidenceChanges[0]!.status).toBe('removed');
  });

  it('detects identical evidence as unchanged', () => {
    const evidence = [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }];
    const leftDet = makeDetection('react', 'React', 'frontend', 95, evidence);
    const rightDet = makeDetection('react', 'React', 'frontend', 95, evidence);

    const result = compareScans(
      makeScanWithDetections([leftDet]),
      makeScanWithDetections([rightDet]),
    );

    const evidenceChanges = result.evidenceChanges.filter((e) => e.status !== 'unchanged');
    expect(evidenceChanges).toHaveLength(0);
  });

  it('detects different targets', () => {
    const left = makeScanWithDetections([], {
      scan: {
        id: 'scan_left',
        status: 'completed',
        target: 'https://example.com/',
        hostname: 'example.com',
        createdAt: '2025-06-01T12:00:00.000Z',
        startedAt: null,
        completedAt: '2025-06-01T12:00:05.000Z',
        failedAt: null,
        error: null,
      },
    });
    const right = makeScanWithDetections([], {
      scan: {
        id: 'scan_right',
        status: 'completed',
        target: 'https://other.com',
        hostname: 'other.com',
        createdAt: '2025-06-01T13:00:00.000Z',
        startedAt: null,
        completedAt: '2025-06-01T13:00:05.000Z',
        failedAt: null,
        error: null,
      },
    });

    const result = compareScans(left, right);

    expect(result.targetsDiffer).toBe(true);
  });

  it('handles a failed scan on the left side', () => {
    const left = makeScanWithDetections([], {
      scan: {
        id: 'scan_left',
        status: 'failed',
        target: 'https://example.com/',
        hostname: 'example.com',
        createdAt: '2025-06-01T12:00:00.000Z',
        startedAt: '2025-06-01T12:00:01.000Z',
        completedAt: null,
        failedAt: '2025-06-01T12:00:05.000Z',
        error: { code: 'timeout', message: 'Request timed out' },
      },
    });
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);

    const result = compareScans(left, right);

    expect(result.leftFailed).toBe(true);
    expect(result.rightFailed).toBe(false);
  });

  it('handles empty detection sets on both sides', () => {
    const left = makeScanWithDetections([]);
    const right = makeScanWithDetections([]);

    const result = compareScans(left, right);

    expect(result.technologies).toHaveLength(0);
    expect(result.hasChanges).toBe(false);
  });
});

// ─── Deterministic output ────────────────────────────────────────────

describe('compareScans — determinism', () => {
  it('produces the same output for the same inputs', () => {
    const left = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const right = makeScanWithDetections([
      makeDetection('react', 'React', 'frontend', 90),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);

    const result1 = compareScans(left, right);
    const result2 = compareScans(left, right);

    expect(result1.hasChanges).toBe(result2.hasChanges);
    expect(result1.added.length).toBe(result2.added.length);
    expect(result1.removed.length).toBe(result2.removed.length);
    expect(result1.unchanged.length).toBe(result2.unchanged.length);
    expect(result1.scoreChanges.length).toBe(result2.scoreChanges.length);
  });

  it('produces independent outputs (no shared mutable state)', () => {
    const left = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 95)]);
    const right = makeScanWithDetections([makeDetection('react', 'React', 'frontend', 90)]);

    const result = compareScans(left, right);
    expect(result.scoreChanges[0]!.leftConfidence).toBe(95);
    expect(result.scoreChanges[0]!.rightConfidence).toBe(90);

    // Mutating the input should not affect the result.
    left.detections[0]!.confidence = 50;
    expect(result.scoreChanges[0]!.leftConfidence).toBe(95);
  });
});

// ─── evidenceKey backward compatibility ──────────────────────────────
//
// evidenceKey is re-exported from comparison.ts as an alias of
// getEvidenceIdentity. The canonical tests for getEvidenceIdentity live
// in evidence-identity.test.ts. Here we verify compareScans still
// deduplicates evidence correctly using the canonical identity.

describe('evidenceKey backward compatibility (compareScans integration)', () => {
  it('comparison.ts re-exports canonical getEvidenceIdentity as evidenceKey', () => {
    // The re-exported evidenceKey must be the exact same function reference
    // as the canonical getEvidenceIdentity.
    expect(evidenceKey).toBe(getEvidenceIdentity);
  });

  it('compareScans deduplicates evidence by canonical identity', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 95,
      evidence: [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'Apache' }, // same identity
      ],
    };
    const scan: ScanDetailResponse = {
      scan: {
        id: 's1',
        status: 'completed',
        target: 'https://example.com',
        hostname: 'example.com',
        createdAt: '2025-01-01T00:00:00Z',
        startedAt: '2025-01-01T00:00:00Z',
        completedAt: '2025-01-01T00:01:00Z',
        failedAt: null,
        error: null,
      },
      snapshot: null,
      detections: [detection],
    };

    const result = compareScans(scan, scan);
    const unchangedTech = result.unchanged[0]!;

    // Both evidence items have identity "http_header:Server" → deduplicated to 1
    expect(unchangedTech.evidenceChanges).toHaveLength(1);
  });
});
