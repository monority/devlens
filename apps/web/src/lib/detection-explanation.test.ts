/**
 * Unit tests for the pure detection-explanation module.
 *
 * These tests verify the explanation derivation pipeline without React,
 * HTTP, or a DOM environment. The pipeline is:
 *
 *   DetectionResponse → getDetectionExplanation() → explanation object
 */

import { describe, it, expect } from 'vitest';
import { getDetectionExplanation } from './detection-explanation';
import type { DetectionResponse } from '../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeEvidence(
  type: DetectionResponse['evidence'][number]['type'],
  data: Partial<Record<string, unknown>> = {},
): DetectionResponse['evidence'][number] {
  return { type, ...data } as DetectionResponse['evidence'][number];
}

function makeDetection(overrides: Partial<DetectionResponse> = {}): DetectionResponse {
  return {
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [makeEvidence('script_url', { url: 'https://example.com/app.js' })],
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('getDetectionExplanation', () => {
  it('produces an explanation for a detection with one evidence type', () => {
    const detection = makeDetection({
      confidence: 90,
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('http_header', { name: 'X-Frame', value: 'DENY' }),
      ],
    });

    const result = getDetectionExplanation(detection);

    expect(result.evidenceCount).toBe(2);
    expect(result.confidence).toBe(90);
    expect(result.evidenceTypes).toEqual(['HTTP Header']);
    expect(result.summary).toContain('HTTP Header');
  });

  it('produces an explanation for a detection with multiple evidence types', () => {
    const detection = makeDetection({
      confidence: 85,
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
        makeEvidence('script_url', { url: 'https://example.com/app.js' }),
      ],
    });

    const result = getDetectionExplanation(detection);

    expect(result.evidenceCount).toBe(3);
    expect(result.evidenceTypes).toEqual(['HTTP Header', 'Meta Tag', 'Script URL']);
    expect(result.summary).toContain('HTTP Header');
    expect(result.summary).toContain('Meta Tag');
    expect(result.summary).toContain('Script URL');
  });

  it('deduplicates evidence types (unique types only)', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('http_header', { name: 'X-Frame', value: 'DENY' }),
        makeEvidence('http_header', { name: 'X-Powered', value: 'Express' }),
      ],
    });

    const result = getDetectionExplanation(detection);

    // Three evidence items but only one unique type
    expect(result.evidenceCount).toBe(3);
    expect(result.evidenceTypes).toEqual(['HTTP Header']);
  });

  it('handles zero evidence gracefully', () => {
    const detection = makeDetection({ evidence: [] });

    const result = getDetectionExplanation(detection);

    expect(result.evidenceCount).toBe(0);
    expect(result.evidenceTypes).toEqual([]);
    expect(result.summary).toBe('No evidence details are available.');
  });

  it('produces deterministic output across calls (no mutation)', () => {
    const detection = makeDetection({
      confidence: 75,
      evidence: [
        makeEvidence('script_url', { url: 'https://example.com/a.js' }),
        makeEvidence('html', { selector: '#app', snippet: 'React' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'React' }),
      ],
    });

    const first = getDetectionExplanation(detection);
    const second = getDetectionExplanation(detection);

    expect(first).toEqual(second);
    expect(first.evidenceTypes).toEqual(second.evidenceTypes);
  });

  it('returns correct evidence count matching the input', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
        makeEvidence('script_url', { url: 'https://example.com/app.js' }),
        makeEvidence('html', { selector: '#app', snippet: 'React' }),
        makeEvidence('link', { url: 'https://example.com/style.css' }),
      ],
    });

    const result = getDetectionExplanation(detection);

    expect(result.evidenceCount).toBe(5);
  });

  it('preserves the exact confidence value from the detection', () => {
    const detection = makeDetection({ confidence: 87 });

    const result = getDetectionExplanation(detection);

    expect(result.confidence).toBe(87);
  });

  it('handles unknown evidence types safely', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        // Unknown evidence type — should fall back to "Evidence" label
        makeEvidence('future_type' as DetectionResponse['evidence'][number]['type'], {
          data: 'unknown',
        }),
      ],
    });

    const result = getDetectionExplanation(detection);

    expect(result.evidenceCount).toBe(2);
    // Unknown type should use the fallback label
    expect(result.evidenceTypes).toContain('Evidence');
    expect(result.evidenceTypes).toContain('HTTP Header');
    // Should not crash
    expect(result.summary).toBeTruthy();
  });

  it('does not mutate the input detection', () => {
    const detection = makeDetection({
      evidence: [
        makeEvidence('http_header', { name: 'Server', value: 'nginx' }),
        makeEvidence('meta_tag', { name: 'generator', content: 'WordPress' }),
      ],
    });
    const originalEvidenceLength = detection.evidence.length;
    const originalType = detection.evidence[0]!.type;

    getDetectionExplanation(detection);

    // Input should be unchanged
    expect(detection.evidence.length).toBe(originalEvidenceLength);
    expect(detection.evidence[0]!.type).toBe(originalType);
  });

  it('never invents evidence that does not exist', () => {
    const detection = makeDetection({
      evidence: [makeEvidence('http_header', { name: 'Server', value: 'nginx' })],
    });

    const result = getDetectionExplanation(detection);

    // The summary should only mention HTTP Header, not any other type
    expect(result.summary).not.toContain('Meta Tag');
    expect(result.summary).not.toContain('Script URL');
    expect(result.summary).not.toContain('HTML Element');
    // Should mention the actual evidence type
    expect(result.summary).toContain('HTTP Header');
  });
});
