/**
 * Unit tests for the DetectionCoverage component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionCoverage } from './DetectionCoverage';
import type { DetectionResponse } from '../lib/types';

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

describe('DetectionCoverage', () => {
  it('renders deduplicated evidence count', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('react', 'React', 'framework', 95, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
          ]),
          makeDetection('vue', 'Vue', 'framework', 80, [
            { type: 'http_header', name: 'Server', value: 'nginx' }, // duplicate
          ]),
        ],
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Deduplicated: only 1 unique evidence item despite 2 in raw detections
    expect(cleaned).toContain('1 item');
    expect(cleaned).toContain('HTTP Header');
  });

  it('renders evidence type count', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('multi', 'Multi', 'category', 90, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
            { type: 'meta_tag', name: 'generator', content: 'Hugo' },
          ]),
        ],
      }),
    );

    expect(html).toContain('Evidence types');
    expect(html).toContain('2');
  });

  it('renders evidence type labels', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('multi', 'Multi', 'category', 90, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
            { type: 'script_url', url: 'https://cdn.example.com/app.js' },
          ]),
        ],
      }),
    );

    expect(html).toContain('HTTP Header');
    expect(html).toContain('Script URL');
  });

  it('renders empty state for zero evidence', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [makeDetection('react', 'React', 'frontend', 95, [])],
      }),
    );

    expect(html).toContain('No evidence available');
  });

  it('renders semantic section structure', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'script_url', url: 'https://cdn.example.com/react.js' },
          ]),
        ],
      }),
    );

    expect(html).toContain('<section');
    expect(html).toContain('Detection coverage');
    expect(html).toContain('<dl');
    expect(html).toContain('<dt>Evidence items</dt>');
    expect(html).toContain('<dt>Evidence types</dt>');
  });

  it('does not duplicate ScanOverview technology count', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'script_url', url: 'https://cdn.example.com/react.js' },
          ]),
        ],
      }),
    );

    // Should NOT show "Technologies" — that's ScanOverview's job
    expect(html).not.toContain('Technologies');
  });

  it('does not duplicate ScanOverview raw evidence count', () => {
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
            { type: 'http_header', name: 'X-Powered-By', value: 'React' },
          ]),
        ],
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Shows deduplicated count (2 unique items), not raw sum
    expect(cleaned).toContain('2 items');
    // Should NOT show "Evidence:" label (that's ScanOverview's label)
    expect(html).not.toContain('Evidence:');
  });

  it('provides global values stable under filters', () => {
    // DetectionCoverage receives the FULL detection list (not filtered)
    // This test verifies it counts all detections, not a filtered subset
    const allDetections = [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'script_url', url: 'https://cdn.example.com/react.js' },
      ]),
      makeDetection('vue', 'Vue', 'frontend', 80, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
      makeDetection('angular', 'Angular', 'framework', 70, [
        { type: 'meta_tag', name: 'generator', content: 'Angular' },
      ]),
    ];
    // Even if only showing a "filtered" subset, coverage shows all 3
    const html = renderToString(
      React.createElement(DetectionCoverage, {
        detections: allDetections,
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 items');
    expect(html).toContain('3');
  });
});
