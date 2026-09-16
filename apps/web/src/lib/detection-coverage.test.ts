/**
 * Unit tests for the pure detection-coverage module.
 *
 * Tests the deterministic coverage summary — technology counting,
 * evidence deduplication, evidence type listing, and immutability.
 * No React, HTTP, or DOM required.
 */

import { describe, it, expect } from 'vitest';
import { getDetectionCoverage } from './detection-coverage';
import type { DetectionResponse } from './types';

function makeDetection(
  id: string,
  name: string,
  category = 'category',
  confidence = 80,
  evidence: DetectionResponse['evidence'] = [],
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence,
  };
}

describe('getDetectionCoverage', () => {
  it('returns zero counts for zero detections', () => {
    const coverage = getDetectionCoverage([]);

    expect(coverage.technologyCount).toBe(0);
    expect(coverage.detectionCount).toBe(0);
    expect(coverage.evidenceCount).toBe(0);
    expect(coverage.evidenceTypeCount).toBe(0);
    expect(coverage.evidenceTypes).toEqual([]);
  });

  it('counts one technology', () => {
    const coverage = getDetectionCoverage([
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
    ]);

    expect(coverage.technologyCount).toBe(1);
    expect(coverage.detectionCount).toBe(1);
    expect(coverage.evidenceCount).toBe(1);
    expect(coverage.evidenceTypeCount).toBe(1);
    expect(coverage.evidenceTypes).toEqual(['Script URL']);
  });

  it('counts multiple technologies (deduplicated by ID)', () => {
    const coverage = getDetectionCoverage([
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
      makeDetection('vue', 'Vue', 'framework', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);

    expect(coverage.technologyCount).toBe(2);
    expect(coverage.detectionCount).toBe(2);
    expect(coverage.evidenceCount).toBe(2);
    expect(coverage.evidenceTypeCount).toBe(2);
    expect(coverage.evidenceTypes).toEqual(['HTTP Header', 'Script URL']);
  });

  it('deduplicates technology count by ID (detectionCount differs)', () => {
    const coverage = getDetectionCoverage([
      makeDetection('react', 'React', 'framework', 80),
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 70),
    ]);

    expect(coverage.technologyCount).toBe(2);
    expect(coverage.detectionCount).toBe(3);
  });

  it('deduplicates evidence globally (same evidence in different detections)', () => {
    const coverage = getDetectionCoverage([
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
      makeDetection('vue', 'Vue', 'framework', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' }, // duplicate
      ]),
    ]);

    // 2 unique evidence items... wait, the duplicated header should be deduplicated
    expect(coverage.evidenceCount).toBe(1);
    expect(coverage.evidenceTypeCount).toBe(1);
  });

  it('counts multiple evidence types', () => {
    const coverage = getDetectionCoverage([
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ]),
    ]);

    expect(coverage.evidenceTypeCount).toBe(4);
    expect(coverage.evidenceTypes).toContain('HTTP Header');
    expect(coverage.evidenceTypes).toContain('Meta Tag');
    expect(coverage.evidenceTypes).toContain('Script URL');
    expect(coverage.evidenceTypes).toContain('Link');
  });

  it('deduplicates evidence types (same type in multiple items)', () => {
    const coverage = getDetectionCoverage([
      makeDetection('nginx', 'nginx', 'server', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'X-Powered-By', value: 'PHP' },
        { type: 'http_header', name: 'Content-Type', value: 'text/html' },
      ]),
    ]);

    // 3 evidence items but only 1 unique evidence type
    expect(coverage.evidenceCount).toBe(3);
    expect(coverage.evidenceTypeCount).toBe(1);
    expect(coverage.evidenceTypes).toEqual(['HTTP Header']);
  });

  it('sorts evidence type labels alphabetically', () => {
    const coverage = getDetectionCoverage([
      makeDetection('multi', 'Multi', 'category', 90, [
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'javascript_global', globalName: 'React' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);

    // Should be alphabetical: HTML Element, HTTP Header, JavaScript Global, Link, Script URL
    expect(coverage.evidenceTypes).toEqual([
      'HTML Element',
      'HTTP Header',
      'JavaScript Global',
      'Link',
      'Script URL',
    ]);
  });

  it('counts evidence from multiple detections with mixed types', () => {
    const coverage = getDetectionCoverage([
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
        { type: 'javascript_global', globalName: 'React' },
      ]),
      makeDetection('vue', 'Vue', 'framework', 80, [
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);

    expect(coverage.technologyCount).toBe(2);
    expect(coverage.detectionCount).toBe(2);
    expect(coverage.evidenceCount).toBe(4);
    expect(coverage.evidenceTypeCount).toBe(4);
    expect(coverage.evidenceTypes).toEqual([
      'HTML Element',
      'HTTP Header',
      'JavaScript Global',
      'Script URL',
    ]);
  });

  it('does not mutate the input', () => {
    const detections = [
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ];
    const originalLength = detections.length;
    const originalEvidenceLength = detections[0]!.evidence.length;

    getDetectionCoverage(detections);

    expect(detections.length).toBe(originalLength);
    expect(detections[0]!.evidence.length).toBe(originalEvidenceLength);
  });

  it('is deterministic (same input → same output)', () => {
    const detections = [
      makeDetection('react', 'React', 'framework', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
      makeDetection('vue', 'Vue', 'framework', 80, [
        { type: 'meta_tag', name: 'generator', content: 'Vue' },
      ]),
    ];

    const first = getDetectionCoverage(detections);
    const second = getDetectionCoverage(detections);

    expect(first).toEqual(second);
  });

  it('distinguishes detectionCount from technologyCount', () => {
    // Two detection records for the same tech ID
    const coverage = getDetectionCoverage([
      makeDetection('nginx', 'nginx', 'server', 80),
      makeDetection('nginx', 'nginx', 'server', 90),
    ]);

    // Unique tech count is 1, but detection count is 2
    expect(coverage.technologyCount).toBe(1);
    expect(coverage.detectionCount).toBe(2);
  });

  it('handles all 8 evidence types', () => {
    const coverage = getDetectionCoverage([
      makeDetection('all', 'All', 'misc', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'Hugo' },
        { type: 'script_url', url: 'https://cdn.example.com/app.js' },
        { type: 'script_content', snippet: 'window.foo' },
        { type: 'html', selector: '#app', snippet: '<div>' },
        { type: 'javascript_global', globalName: 'React' },
        { type: 'resource', url: 'https://cdn.example.com/logo.png' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ]),
    ]);

    expect(coverage.evidenceCount).toBe(8);
    expect(coverage.evidenceTypeCount).toBe(8);
    expect(coverage.evidenceTypes).toEqual([
      'HTML Element',
      'HTTP Header',
      'JavaScript Global',
      'Link',
      'Meta Tag',
      'Resource URL',
      'Script Content',
      'Script URL',
    ]);
  });
});
