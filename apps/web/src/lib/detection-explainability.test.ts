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
        { type: 'http_header', name: 'Server', value: 'Apache' }, // same identity (http_header:Server)
      ]),
    );

    // All three have the same identity (http_header:Server) → 1 unique
    expect(result.evidenceCount).toBe(1);
    expect(result.evidenceSources).toHaveLength(1);
    // First occurrence's value is preserved
    expect(result.evidenceSources[0]!.value).toBe('Server: nginx');
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

    // Sorted by type label ASC, then identity ASC:
    // HTTP Header (X-A) → HTTP Header (X-B) → Meta Tag → Script URL
    expect(result.evidenceSources.map((s) => s.identity)).toEqual([
      'http_header:X-A',
      'http_header:X-B',
      'meta_tag:m',
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

    // All same type → sorted by identity ASC
    expect(result.evidenceSources.map((s) => s.identity)).toEqual([
      'meta_tag:a',
      'meta_tag:m',
      'meta_tag:z',
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
    expect(result.evidenceSources[0]!.identity).toMatch(/^html:#app$/);
    expect(result.evidenceSources[1]!.identity).toMatch(/^http_header:Server$/);
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
        { type: 'http_header', name: 'Server', value: 'Apache' }, // same identity
      ]),
    );

    // evidenceCount should match evidenceSources length after deduplication
    expect(result.evidenceCount).toBe(result.evidenceSources.length);
    expect(result.evidenceCount).toBe(1);
    // The evidence array should also be deduplicated
    expect(result.evidence).toHaveLength(1);
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
