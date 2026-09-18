/**
 * Unit tests for the pure scan-overview module.
 *
 * These tests verify the overview derivation pipeline without React,
 * HTTP, or a DOM environment.
 */

import { describe, it, expect } from 'vitest';
import { getScanOverview } from './scan-overview';
import type { ScanDetailResponse, ScanResponse, DetectionResponse } from './types';

// ─── Fixture builders ────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanResponse> = {}): ScanResponse {
  return {
    id: 'scan_001',
    status: 'completed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: '2025-06-01T12:00:01.000Z',
    completedAt: '2025-06-01T12:00:05.000Z',
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
  };
}

function makeDetections(): DetectionResponse[] {
  return [
    makeDetection('react', 'React', 'framework', 95),
    makeDetection('vue', 'Vue', 'framework', 80),
    makeDetection('nginx', 'nginx', 'server', 70),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getScanOverview', () => {
  it('derives metrics from a completed scan', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'completed' }),
      snapshot: null,
      detections: makeDetections(),
    };
    const overview = getScanOverview(result);

    expect(overview.target).toBe('https://example.com/');
    expect(overview.hostname).toBe('example.com');
    expect(overview.status).toBe('completed');
    expect(overview.technologyCount).toBe(3);
    expect(overview.evidenceCount).toBe(3);
    expect(overview.highestConfidence).toBe(95);
  });

  it('counts unique technology IDs across multiple detections', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('react', 'React', 'framework', 90), // duplicate ID
      makeDetection('vue', 'Vue', 'framework', 80),
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    // 2 unique IDs, not 3
    expect(overview.technologyCount).toBe(2);
  });

  it('counts unique technology IDs (deduplication)', () => {
    const detections: DetectionResponse[] = [
      makeDetection('nginx', 'nginx', 'server', 80),
      makeDetection('nginx', 'nginx', 'server', 75),
      makeDetection('nginx', 'nginx', 'server', 70),
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    expect(overview.technologyCount).toBe(1);
    // evidenceCount counts ALL evidence entries (not deduplicated)
    expect(overview.evidenceCount).toBe(3);
  });

  it('returns zero counts and null confidence for zero detections', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'completed' }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.technologyCount).toBe(0);
    expect(overview.evidenceCount).toBe(0);
    expect(overview.highestConfidence).toBeNull();
  });

  it('counts evidence entries across all detections', () => {
    const detections: DetectionResponse[] = [
      {
        technology: { id: 'react', name: 'React', category: 'framework' },
        confidence: 95,
        evidence: [
          { type: 'http_header', name: 'X', value: 'y' },
          { type: 'meta_tag', name: 'Z', content: 'w' },
        ],
      },
      {
        technology: { id: 'vue', name: 'Vue', category: 'framework' },
        confidence: 80,
        evidence: [{ type: 'script_url', url: 'https://example.com/app.js' }],
      },
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    expect(overview.evidenceCount).toBe(3);
  });

  it('returns the highest confidence value', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 45),
      makeDetection('nginx', 'nginx', 'server', 70),
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    expect(overview.highestConfidence).toBe(95);
  });

  it('returns the highest confidence when multiple detections have equal values', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'framework', 90),
      makeDetection('vue', 'Vue', 'framework', 90),
      makeDetection('nginx', 'nginx', 'server', 90),
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    expect(overview.highestConfidence).toBe(90);
  });

  it('preserves the exact confidence value (no recalculation)', () => {
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections: [makeDetection('react', 'React', 'framework', 37)],
    };
    const overview = getScanOverview(result);

    expect(overview.highestConfidence).toBe(37);
  });

  it('preserves the target exactly (no canonicalization)', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ target: 'https://example.com/path?q=1#fragment' }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.target).toBe('https://example.com/path?q=1#fragment');
  });

  it('preserves the status exactly', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'failed' }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.status).toBe('failed');
  });

  it('preserves the createdAt timestamp exactly', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ createdAt: '2025-01-15T08:30:00.000Z' }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.createdAt).toBe('2025-01-15T08:30:00.000Z');
  });

  it('does not mutate the input', () => {
    const detections: DetectionResponse[] = makeDetections();
    const originalLength = detections.length;
    const originalConfidence = detections[0]!.confidence;
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };

    getScanOverview(result);

    expect(detections.length).toBe(originalLength);
    expect(detections[0]!.confidence).toBe(originalConfidence);
  });

  it('is deterministic (same input → same output)', () => {
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections: makeDetections(),
    };

    const first = getScanOverview(result);
    const second = getScanOverview(result);

    expect(first).toEqual(second);
  });

  it('returns null completedAt for non-completed scans', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'running', completedAt: null }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.completedAt).toBeNull();
  });

  it('does not invent an overall/average score — highestConfidence is a max of existing values', () => {
    // The overview must NOT compute an aggregate score (e.g. average or
    // weighted index). highestConfidence must be the maximum of the
    // per-detection confidence values returned by the API — exactly.
    const detections: DetectionResponse[] = [
      { technology: { id: 'a', name: 'A', category: 'x' }, confidence: 80, evidence: [] },
      { technology: { id: 'b', name: 'B', category: 'x' }, confidence: 45, evidence: [] },
      { technology: { id: 'c', name: 'C', category: 'x' }, confidence: 92, evidence: [] },
    ];
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections,
    };
    const overview = getScanOverview(result);

    // Max of {80, 45, 92} is 92 — not an average (which would be 72.33...)
    expect(overview.highestConfidence).toBe(92);
    expect(overview.highestConfidence).not.toBe(72);
  });

  it('highestConfidence is null (not 0 or computed) when there are zero detections', () => {
    const result: ScanDetailResponse = {
      scan: makeScan(),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    // No invented score for empty scans — null, not 0 or NaN
    expect(overview.highestConfidence).toBeNull();
  });

  it('handles failed scans correctly — target and status preserved', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'failed', error: { code: 'timeout', message: 'Timeout' } }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);

    expect(overview.status).toBe('failed');
    expect(overview.target).toBe('https://example.com/');
    expect(overview.technologyCount).toBe(0);
    expect(overview.evidenceCount).toBe(0);
    expect(overview.highestConfidence).toBeNull();
  });
});
