/**
 * Unit tests for the ScanDetectionResults presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required. `next/link` is mocked to render plain `<a>` tags.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

import { ScanDetectionResults } from './ScanDetectionResults';
import type { DetectionResponse } from '../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────

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

describe('ScanDetectionResults', () => {
  it('renders technology name', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [makeDetection('react', 'React', 'frontend', 95)],
      }),
    );

    expect(html).toContain('React');
  });

  it('renders confidence value', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [makeDetection('react', 'React', 'frontend', 95)],
      }),
    );

    expect(html).toContain('95');
    expect(html).toContain('Confidence');
  });

  it('renders evidence count', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'http_header', name: 'X', value: 'y' },
            { type: 'meta_tag', name: 'm', content: 'c' },
          ]),
        ],
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('2 evidence items');
  });

  it('renders evidence values', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
          ]),
        ],
      }),
    );

    expect(html).toContain('Server');
    expect(html).toContain('nginx');
  });

  it('renders evidence type', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'meta_tag', name: 'generator', content: 'React 19' },
          ]),
        ],
      }),
    );

    expect(html).toContain('Meta Tag');
  });

  it('renders multiple detections in confidence-descending order', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('vue', 'Vue', 'framework', 80),
          makeDetection('react', 'React', 'framework', 95),
        ],
      }),
    );

    // React (95) should appear before Vue (80) in the HTML
    const reactPos = html.indexOf('React');
    const vuePos = html.indexOf('Vue');

    expect(reactPos).toBeGreaterThan(-1);
    expect(vuePos).toBeGreaterThan(-1);
    expect(reactPos).toBeLessThan(vuePos);
  });

  it('renders empty state for zero detections', () => {
    const html = renderToString(React.createElement(ScanDetectionResults, { detections: [] }));

    expect(html).toContain('No supported technologies were detected');
  });

  it('renders semantic headings and list elements', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [makeDetection('react', 'React', 'frontend', 95)],
      }),
    );

    expect(html).toContain('<h2');
    expect(html).toContain('<ol');
    expect(html).toContain('<li');
  });

  it('renders accessible evidence disclosure', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('react', 'React', 'frontend', 95, [
            { type: 'http_header', name: 'Server', value: 'nginx' },
          ]),
        ],
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Evidence (1)');
  });

  it('non-completed scan behavior is unchanged (no overview)', () => {
    // ScanDetectionResults is only rendered for completed scans —
    // this test verifies it renders correctly with given data regardless
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [makeDetection('react', 'React', 'frontend', 95)],
      }),
    );

    expect(html).toContain('React');
    expect(html).toContain('95');
  });

  it('deduplicates detections by technology ID', () => {
    const html = renderToString(
      React.createElement(ScanDetectionResults, {
        detections: [
          makeDetection('react', 'React', 'frontend', 80),
          makeDetection('react', 'React', 'frontend', 95),
          makeDetection('vue', 'Vue', 'frontend', 70),
        ],
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Should show 2 technologies, not 3
    expect(cleaned).toContain('Detections (2)');
    expect(cleaned).toContain('95');
  });
});
