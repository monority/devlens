/**
 * Unit tests for the DetectionItem component.
 *
 * Uses `renderToString` — no DOM environment required.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DetectionItem } from './DetectionItem.js';
import type { DetectionResponse } from '../lib/types.js';

describe('DetectionItem', () => {
  const makeDetection = (overrides: Partial<DetectionResponse> = {}): DetectionResponse => ({
    technology: { id: 'react', name: 'React', category: 'frontend' },
    confidence: 95,
    evidence: [{ type: 'script_url', url: 'https://cdn.example.com/react.js' }],
    ...overrides,
  });

  it('renders technology name', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('React');
  });

  it('renders technology category', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('frontend');
  });

  it('renders confidence score exactly as returned by the API', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('95');
    expect(html).toContain('Confidence');
  });

  it('renders evidence count', () => {
    const detection: DetectionResponse = {
      technology: { id: 'react', name: 'React', category: 'frontend' },
      confidence: 95,
      evidence: [
        { type: 'http_header', name: 'X-Powered-By', value: 'React' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ],
    };
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('2 evidence items');
  });

  it('renders singular "item" for a single evidence entry', () => {
    const detection = makeDetection();
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('1 evidence item');
  });

  it('renders evidence items inside the detection', () => {
    const html = renderToString(
      React.createElement(DetectionItem, { detection: makeDetection(), index: 0 }),
    );

    expect(html).toContain('Script URL');
    expect(html).toContain('https://cdn.example.com/react.js');
  });

  it('preserves exact confidence value without rounding', () => {
    const detection = makeDetection({ confidence: 87 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    expect(html).toContain('87');
  });

  it('does not introduce subjective labels', () => {
    const detection = makeDetection({ confidence: 30 });
    const html = renderToString(React.createElement(DetectionItem, { detection, index: 0 }));

    // No subjective labels like "weak", "likely", "excellent"
    expect(html).not.toContain('weak');
    expect(html).not.toContain('likely');
    expect(html).not.toContain('excellent');
    // But the raw confidence should still appear.
    expect(html).toContain('30');
  });
});
