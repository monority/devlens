/**
 * Unit tests for the pure scan-detection-results module.
 *
 * Tests the deterministic sorting, deduplication, and evidence ordering
 * pipeline without React, HTTP, or a DOM environment.
 */

import { describe, it, expect } from 'vitest';
import { getScanDetectionResults } from './scan-detection-results';
import type { DetectionResponse } from './types';

// ─── Fixture builders ────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('getScanDetectionResults', () => {
  it('returns empty array for empty detections', () => {
    const results = getScanDetectionResults([]);
    expect(results).toEqual([]);
  });

  it('returns a single detection', () => {
    const detections = [makeDetection('react', 'React', 'framework', 95)];
    const results = getScanDetectionResults(detections);

    expect(results).toHaveLength(1);
    expect(results[0]!.technology.id).toBe('react');
    expect(results[0]!.confidence).toBe(95);
  });

  it('sorts by confidence descending', () => {
    const detections = [
      makeDetection('low', 'Low', 'category', 30),
      makeDetection('high', 'High', 'category', 95),
      makeDetection('mid', 'Mid', 'category', 70),
    ];
    const results = getScanDetectionResults(detections);

    expect(results.map((r) => r.technology.id)).toEqual(['high', 'mid', 'low']);
  });

  it('uses technology name as alphabetical tie-breaker for equal confidence', () => {
    const detections = [
      makeDetection('b', 'Zebra', 'category', 80),
      makeDetection('c', 'Apple', 'category', 80),
      makeDetection('a', 'Mango', 'category', 80),
    ];
    const results = getScanDetectionResults(detections);

    expect(results.map((r) => r.technology.name)).toEqual(['Apple', 'Mango', 'Zebra']);
  });

  it('uses technology ID as final tie-breaker for equal confidence and name', () => {
    const detections = [
      makeDetection('z', 'Same', 'category', 80),
      makeDetection('a', 'Same', 'category', 80),
      makeDetection('m', 'Same', 'category', 80),
    ];
    const results = getScanDetectionResults(detections);

    expect(results.map((r) => r.technology.id)).toEqual(['a', 'm', 'z']);
  });

  it('deduplicates by technology ID (keeps highest confidence)', () => {
    const detections = [
      makeDetection('react', 'React', 'framework', 80),
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 70),
    ];
    const results = getScanDetectionResults(detections);

    expect(results).toHaveLength(2);
    expect(results[0]!.technology.id).toBe('react');
    expect(results[0]!.confidence).toBe(95);
    expect(results[1]!.technology.id).toBe('vue');
  });

  it('preserves exact confidence value (no recalculation)', () => {
    const detections = [makeDetection('react', 'React', 'framework', 37)];
    const results = getScanDetectionResults(detections);

    expect(results[0]!.confidence).toBe(37);
  });

  it('preserves exact evidence values', () => {
    const detections = [
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ];
    const results = getScanDetectionResults(detections);

    expect(results[0]!.evidence).toHaveLength(1);
    expect(results[0]!.evidence[0]).toEqual({
      type: 'http_header',
      name: 'Server',
      value: 'nginx',
    });
  });

  it('deduplicates evidence using existing domain semantics', () => {
    const detections = [
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ];
    const results = getScanDetectionResults(detections);

    expect(results[0]!.evidence).toHaveLength(1);
  });

  it('handles multiple evidence types', () => {
    const detections = [
      makeDetection('wordpress', 'WordPress', 'cms', 90, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress 6.0' },
        { type: 'script_url', url: 'https://example.com/app.js' },
      ]),
    ];
    const results = getScanDetectionResults(detections);

    expect(results[0]!.evidence).toHaveLength(3);
    const types = results[0]!.evidence.map((e) => e.type);
    expect(types).toEqual(['http_header', 'meta_tag', 'script_url']);
  });

  it('sorts evidence deterministically by type label then key', () => {
    const detections = [
      makeDetection('multifoo', 'MultiFoo', 'framework', 90, [
        { type: 'script_url', url: 'https://z.com/late.js' },
        { type: 'http_header', name: 'X-A', value: 'a' },
        { type: 'http_header', name: 'X-B', value: 'b' },
        { type: 'meta_tag', name: 'm', content: 'c' },
      ]),
    ];
    const results = getScanDetectionResults(detections);

    const types = results[0]!.evidence.map((e) => e.type);
    expect(types).toEqual(['http_header', 'http_header', 'meta_tag', 'script_url']);
  });

  it('does not mutate the input', () => {
    const detections = [
      makeDetection('b', 'Zebra', 'category', 80),
      makeDetection('a', 'Apple', 'category', 95),
    ];
    const originalLength = detections.length;
    const originalFirstConfidence = detections[0]!.confidence;
    const originalFirstEvidenceLength = detections[0]!.evidence.length;

    getScanDetectionResults(detections);

    expect(detections.length).toBe(originalLength);
    expect(detections[0]!.confidence).toBe(originalFirstConfidence);
    expect(detections[0]!.evidence.length).toBe(originalFirstEvidenceLength);
  });

  it('is deterministic (same input → same output)', () => {
    const detections = [
      makeDetection('b', 'Zebra', 'category', 80),
      makeDetection('a', 'Apple', 'category', 80),
    ];

    const first = getScanDetectionResults(detections);
    const second = getScanDetectionResults(detections);

    expect(first).toEqual(second);
  });

  it('preserves detection ID, name, and category', () => {
    const detections = [makeDetection('nginx', 'nginx', 'server', 80)];
    const results = getScanDetectionResults(detections);

    expect(results[0]!.technology.id).toBe('nginx');
    expect(results[0]!.technology.name).toBe('nginx');
    expect(results[0]!.technology.category).toBe('server');
  });
});
