/**
 * Unit tests for the pure detection-explainability module.
 *
 * Tests the structured explanation model — confidence preservation,
 * evidence-source descriptions, evidence type listing, determinism,
 * and immutability. No React, HTTP, or DOM required.
 */

import { describe, it, expect } from 'vitest';
import { getDetectionExplainability } from './detection-explainability';
import type { DetectionResponse } from './types';

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
  it('returns one detection', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
    );

    expect(result.technology.name).toBe('React');
    expect(result.technology.category).toBe('frontend');
    expect(result.confidence).toBe(95);
  });

  it('returns multiple detections (evidence count reflects all evidence)', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'WordPress' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
      ]),
    );

    expect(result.evidenceCount).toBe(3);
    expect(result.evidenceSources).toHaveLength(3);
  });

  it('preserves confidence value exactly', () => {
    const result = getDetectionExplainability(makeDetection('react', 'React', 'frontend', 87));

    expect(result.confidence).toBe(87);
  });

  it('preserves evidence exactly', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
    );

    expect(result.evidenceSources[0]!.value).toBe('https://cdn.example.com/react.js');
  });

  it('preserves evidence type labels', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ]),
    );

    expect(result.evidenceTypes).toContain('HTTP Header');
    expect(result.evidenceTypes).toContain('Meta Tag');
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
    ]);
    const originalEvidenceLength = detection.evidence.length;

    getDetectionExplainability(detection);

    expect(detection.evidence.length).toBe(originalEvidenceLength);
  });

  it('deduplicates evidence identity is authoritative (sources preserve duplicates as distinct items)', () => {
    // Note: getDetectionExplainability maps over evidence array as-is;
    // deduplication is handled at the getScanDetectionResults layer.
    // This test verifies the explainability module does not drop evidence.
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    );

    expect(result.evidenceCount).toBe(2);
    expect(result.evidenceSources).toHaveLength(2);
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

    expect(result.evidenceSources[0]!.source).toBe("HTTP header 'Server'");
    expect(result.evidenceSources[1]!.source).toBe("Meta tag 'generator'");
    expect(result.evidenceSources[2]!.source).toBe("Script from 'https://cdn.example.com/app.js'");
    expect(result.evidenceSources[3]!.source).toBe('JavaScript snippet');
    expect(result.evidenceSources[4]!.source).toBe("HTML element at '#app'");
    expect(result.evidenceSources[5]!.source).toBe("JavaScript global 'React'");
    expect(result.evidenceSources[6]!.source).toBe(
      "Resource at 'https://cdn.example.com/logo.png'",
    );
    expect(result.evidenceSources[7]!.source).toBe("Link to 'https://cdn.example.com/style.css'");
  });

  it('handles unknown evidence type gracefully', () => {
    const unknownEvidence = {
      type: 'future_type',
      data: 'x',
    } as unknown as DetectionResponse['evidence'][number];
    const result = getDetectionExplainability(
      makeDetection('unknown', 'Unknown', 'misc', 50, [unknownEvidence]),
    );

    expect(result.evidenceTypes).toContain('Evidence');
    expect(result.evidenceSources[0]!.type).toBe('Evidence');
  });

  it('handles zero evidence', () => {
    const result = getDetectionExplainability(makeDetection('react', 'React', 'frontend', 95, []));

    expect(result.evidenceCount).toBe(0);
    expect(result.evidenceSources).toHaveLength(0);
    expect(result.evidenceTypes).toEqual([]);
    expect(result.summary).toBe('No evidence details are available.');
  });

  it('sorts evidence type labels alphabetically', () => {
    const result = getDetectionExplainability(
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
      ]),
    );

    // Types should be: HTTP Header, Meta Tag, Script URL (alphabetical)
    expect(result.evidenceTypes).toEqual(['HTTP Header', 'Meta Tag', 'Script URL']);
  });
});
