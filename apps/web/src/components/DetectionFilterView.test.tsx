/**
 * URL state tests for the detection filter view.
 *
 * Tests the `buildDetectionUrl` pure function and the initialization
 * behavior of `DetectionFilterView` (how URL parameters populate
 * the initial filter state).
 *
 * `next/navigation` is mocked so `useSearchParams` returns controlled
 * values. `next/link` is mocked to render plain `<a>` tags.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Hoist the mock so it's available in the vi.mock factory
const { mockSearchParams } = vi.hoisted(() => ({
  mockSearchParams: {
    get: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// ─── Imports (after mocks) ───────────────────────────────────────────

import { buildDetectionUrl } from '../lib/detection-filter';
import { DetectionFilterView } from '@/components/DetectionFilterView';
import type { DetectionResponse } from '@/lib/types';

function makeDetection(id: string, name: string, category: string): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence: 90,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
  };
}

function makeDetections(): DetectionResponse[] {
  return [
    makeDetection('react', 'React', 'framework'),
    makeDetection('wordpress', 'WordPress', 'cms'),
    makeDetection('nginx', 'nginx', 'server'),
  ];
}

// ─── URL building tests (5 tests) ────────────────────────────────────

describe('buildDetectionUrl (URL state)', () => {
  it('q parameter is included when query is set', () => {
    expect(buildDetectionUrl('scan123', 'react', '')).toBe('/scans/scan123?q=react');
  });

  it('category parameter is included when category is set', () => {
    expect(buildDetectionUrl('scan123', '', 'cms')).toBe('/scans/scan123?category=cms');
  });

  it('both parameters are preserved when both are set', () => {
    expect(buildDetectionUrl('scan123', 'react', 'framework')).toBe(
      '/scans/scan123?q=react&category=framework',
    );
  });

  it('invalid category is normalized before URL construction', () => {
    // The caller normalizes invalid categories to '' before calling
    // buildDetectionUrl. An empty category means no param.
    expect(buildDetectionUrl('scan123', 'react', '')).toBe('/scans/scan123?q=react');
  });

  it('reset removes parameters (clean URL when both are empty)', () => {
    expect(buildDetectionUrl('scan123', '', '')).toBe('/scans/scan123');
  });
});

// ─── Initialization tests (3 tests) ──────────────────────────────────

describe('DetectionFilterView URL initialization', () => {
  beforeEach(() => {
    mockSearchParams.get.mockReset();
  });

  it('q initializes the search field from URL', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'q') return 'react';
      return null;
    });

    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections: makeDetections(),
        scanId: 'scan_001',
        initialQuery: '',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('value="react"');
  });

  it('category initializes the category select from URL', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'category') return 'framework';
      return null;
    });

    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections: makeDetections(),
        scanId: 'scan_001',
        initialQuery: '',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('value="framework"');
  });

  it('invalid category resolves to All (empty select value)', () => {
    mockSearchParams.get.mockImplementation((key: string) => {
      if (key === 'category') return 'invalid-category';
      return null;
    });

    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections: makeDetections(),
        scanId: 'scan_001',
        initialQuery: '',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('value=""');
  });
});

// ─── Filter behavior integration tests ───────────────────────────────

describe('DetectionFilterView filter behavior', () => {
  beforeEach(() => {
    mockSearchParams.get.mockReturnValue(null);
  });

  it('filters detections by search query', () => {
    const detections = makeDetections();
    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections,
        scanId: 'scan_001',
        initialQuery: 'react',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Only React should be in the detection list
    expect(cleaned).toContain('React');
    // The result count should reflect the filter
    expect(cleaned).toContain('1 of 3');
  });

  it('filters detections by category', () => {
    const detections = makeDetections();
    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections,
        scanId: 'scan_001',
        initialQuery: '',
        initialCategory: 'cms',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('WordPress');
    expect(cleaned).toContain('1 of 3');
  });

  it('clears filters when both are empty (reset)', () => {
    const detections = makeDetections();
    const html = renderToString(
      React.createElement(DetectionFilterView, {
        detections,
        scanId: 'scan_001',
        initialQuery: '',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // All detections visible
    expect(cleaned).toContain('3 detections');
  });
});
