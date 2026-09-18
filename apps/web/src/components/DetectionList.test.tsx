/**
 * Unit tests for the DetectionList component.
 *
 * Uses `renderToString` — no DOM environment required.
 * Verifies that detections are rendered in API-returned order
 * (no client-side re-sorting or re-scoring).
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionList } from './DetectionList.js';
import type { DetectionResponse } from '../lib/types.js';

// Helper to build a detection
function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidenceCount: number = 1,
): DetectionResponse {
  const evidence = Array.from({ length: evidenceCount }, (_, i) => ({
    type: 'http_header' as const,
    name: `Header${i}`,
    value: `value${i}`,
  }));
  return {
    technology: { id, name, category },
    confidence,
    evidence,
  };
}

describe('DetectionList', () => {
  it('renders the detection count in the heading', () => {
    const detections = [makeDetection('a', 'React', 'framework', 95)];
    const html = renderToString(React.createElement(DetectionList, { detections }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Detections (1)');
  });

  it('preserves the API-returned ranking order', () => {
    const detections = [
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 78),
      makeDetection('angular', 'Angular', 'framework', 65),
    ];
    const html = renderToString(React.createElement(DetectionList, { detections }));

    const reactPos = html.indexOf('React');
    const vuePos = html.indexOf('Vue');
    const angularPos = html.indexOf('Angular');

    expect(reactPos).toBeGreaterThan(-1);
    expect(vuePos).toBeGreaterThan(reactPos);
    expect(angularPos).toBeGreaterThan(vuePos);
  });

  it('renders multiple technologies', () => {
    const detections = [
      makeDetection('nginx', 'nginx', 'server', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ];
    const html = renderToString(React.createElement(DetectionList, { detections }));

    expect(html).toContain('nginx');
    expect(html).toContain('React');
  });

  it('produces correct catalog links for each known technology', () => {
    const detections = [
      makeDetection('nginx', 'nginx', 'server', 80),
      makeDetection('react', 'React.js', 'frontend', 95),
    ];
    const html = renderToString(React.createElement(DetectionList, { detections }));

    // Each known technology links to its canonical /technologies/{id} route
    expect(html).toContain('href="/technologies/nginx"');
    expect(html).toContain('href="/technologies/react"');
    // Link uses canonical ID, not display name
    expect(html).not.toContain('/technologies/React.js');
  });

  it('renders technology metadata (id, name, category)', () => {
    const detections = [makeDetection('react', 'React', 'frontend', 95)];
    const html = renderToString(React.createElement(DetectionList, { detections }));

    expect(html).toContain('React');
    expect(html).toContain('frontend');
  });

  it('renders evidence items for each detection', () => {
    const detections = [makeDetection('react', 'React', 'frontend', 95, 3)];
    const html = renderToString(React.createElement(DetectionList, { detections }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 evidence items');
    expect(html).toContain('HTTP Header');
  });

  it('renders empty state for zero detections', () => {
    const html = renderToString(React.createElement(DetectionList, { detections: [] }));

    expect(html).toContain('The scan completed successfully');
    expect(html).toContain('No supported technologies were detected');
    expect(html).toContain('Detections (0)');
  });

  it('renders many detections without truncation', () => {
    const detections = Array.from({ length: 20 }, (_, i) =>
      makeDetection(`tech${i}`, `Tech${i}`, 'category', 50 + i),
    );
    const html = renderToString(React.createElement(DetectionList, { detections }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Detections (20)');
    expect(html).toContain('Tech0');
    expect(html).toContain('Tech19');
  });

  it('does not display "pending" for completed scans', () => {
    const detections = [makeDetection('react', 'React', 'frontend', 95)];
    const html = renderToString(React.createElement(DetectionList, { detections }));

    // The word "pending" should not appear in any form.
    expect(html.toLowerCase()).not.toContain('pending');
  });
});
