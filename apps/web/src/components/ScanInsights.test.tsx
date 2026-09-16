/**
 * Unit tests for the ScanInsights component.
 *
 * Uses `renderToString` — no DOM environment required.
 * `next/link` is mocked to render plain `<a>` tags.
 *
 * The `ScanInsights` component computes insights from the scan result
 * via the pure `getScanInsights()` function and renders a compact
 * summary section.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement('a', { href, className }, children),
}));

import { ScanInsights } from './ScanInsights';
import type { ScanDetailResponse } from '../lib/types';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeTech(
  id: string,
  name: string,
  category: string,
): { id: string; name: string; category: string } {
  return { id, name, category };
}

function makeEvidence(type: string, data: Record<string, unknown> = {}): Record<string, unknown> {
  return { type, ...data };
}

function makeDetection(
  techId: string,
  techName: string,
  techCategory: string,
  evidenceCount: number = 1,
) {
  const evidenceTypes: string[] = ['http_header', 'meta_tag', 'script_url', 'html', 'link'];
  const evidence = [];
  for (let i = 0; i < evidenceCount; i++) {
    const type = evidenceTypes[i % evidenceTypes.length]!;
    evidence.push(makeEvidence(type, { name: `field${i}`, value: `value${i}` }));
  }
  return {
    technology: makeTech(techId, techName, techCategory),
    confidence: 90,
    evidence,
  };
}

function makeCompletedScanDetail(
  detections: ReturnType<typeof makeDetection>[],
): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_001',
      status: 'completed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-01-01T12:00:00.000Z',
      startedAt: '2025-01-01T12:00:01.000Z',
      completedAt: '2025-01-01T12:00:05.000Z',
      failedAt: null,
      error: null,
    },
    snapshot: {
      url: 'https://example.com/',
      hostname: 'example.com',
      capturedAt: '2025-01-01T12:00:05.000Z',
      http: { statusCode: 200, contentType: 'text/html', finalUrl: 'https://example.com/' },
      html: { title: 'Example Domain', description: 'An example site' },
    },
    detections: detections as ScanDetailResponse['detections'],
  };
}

function makeFailedScanDetail(): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_failed',
      status: 'failed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-01-01T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      failedAt: '2025-01-01T12:00:01.000Z',
      error: { code: 'timeout', message: 'Request timed out' },
    },
    snapshot: null,
    detections: [],
  };
}

function makePendingScanDetail(): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_pending',
      status: 'pending',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-01-01T12:00:00.000Z',
      startedAt: null,
      completedAt: null,
      failedAt: null,
      error: null,
    },
    snapshot: null,
    detections: [],
  };
}

function makeRunningScanDetail(): ScanDetailResponse {
  return {
    scan: {
      id: 'scan_running',
      status: 'running',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-01-01T12:00:00.000Z',
      startedAt: '2025-01-01T12:00:01.000Z',
      completedAt: null,
      failedAt: null,
      error: null,
    },
    snapshot: null,
    detections: [],
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function clean(html: string): string {
  return html.replace(/<!-- -->/g, '');
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanInsights', () => {
  it('renders technology count', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(clean(html)).toContain('2 technologies detected');
  });

  it('renders category counts', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('vue', 'Vue.js', 'framework'),
      makeDetection('wordpress', 'WordPress', 'cms'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('framework');
    expect(html).toContain('cms');
    expect(clean(html)).toContain('Categories');
  });

  it('renders evidence summary', () => {
    const result = makeCompletedScanDetail([makeDetection('react', 'React', 'framework', 3)]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(clean(html)).toContain('Evidence coverage');
    expect(clean(html)).toContain('3 items');
  });

  it('renders empty detection state instead of insights header for zero detections', () => {
    const result = makeCompletedScanDetail([]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    // Should show "0 technologies detected" rather than misleading statistics
    expect(cleaned).toContain('0 technologies detected');
    expect(cleaned).toContain('Technology Insights');
  });

  it('does not render insights for a failed scan', () => {
    const result = makeFailedScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('does not render insights for a pending scan', () => {
    const result = makePendingScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('does not render insights for a running scan', () => {
    const result = makeRunningScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('known technology links to the technology catalog detail page', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    // Known technologies should have <a> links to /technologies/{id}
    expect(html).toContain('href="/technologies/react"');
    expect(html).toContain('href="/technologies/nginx"');
    expect(html).toContain('React');
    expect(html).toContain('nginx');
  });

  it('renders unknown technology IDs as plain text (no link)', () => {
    const result = makeCompletedScanDetail([
      makeDetection('unknown-tech', 'Unknown Technology', 'custom'),
      makeDetection('react', 'React', 'framework'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    // Known tech should be a link
    expect(html).toContain('href="/technologies/react"');

    // Unknown tech should NOT have a catalog link
    expect(html).not.toContain('/technologies/unknown-tech');

    // But the name should still be visible
    expect(html).toContain('Unknown Technology');

    // And its category should show as "Unknown"
    expect(html).toContain('Unknown');
  });
});

// ─── Step 34: Technology composition component tests ─────────────────

describe('ScanInsights — Technology composition', () => {
  it('renders the composition section for a completed scan with multiple categories', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('wordpress', 'WordPress', 'cms'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('Technology composition');
    expect(html).toContain('cms');
    expect(html).toContain('framework');
    expect(html).toContain('server');
  });

  it('groups technologies by category in the composition', () => {
    const result = makeCompletedScanDetail([
      makeDetection('wordpress', 'WordPress', 'cms'),
      makeDetection('drupal', 'Drupal', 'cms'),
      makeDetection('react', 'React', 'framework'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('WordPress');
    expect(html).toContain('Drupal');
    expect(html).toContain('React');
  });

  it('renders known technology names as catalog links', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('href="/technologies/react"');
    expect(html).toContain('href="/technologies/nginx"');
  });

  it('renders unknown technology names as plain text (no link)', () => {
    const result = makeCompletedScanDetail([
      makeDetection('unknown-tech', 'Unknown Technology', 'custom'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    // Unknown tech should NOT have a catalog link
    expect(html).not.toContain('/technologies/unknown-tech');
    // But the name should still be visible
    expect(html).toContain('Unknown Technology');
  });

  it('does not render composition for an empty detection scan', () => {
    const result = makeCompletedScanDetail([]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    expect(cleaned).not.toContain('Technology composition');
  });

  it('does not render composition for a failed scan', () => {
    const result = makeFailedScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('does not render composition for a pending scan', () => {
    const result = makePendingScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('renders composition with descriptive wording', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('wordpress', 'WordPress', 'cms'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    // Wording should be purely descriptive — no relationship terms
    expect(html).toContain('Technology composition');
    expect(html).not.toContain('Technology stack');
    expect(html).not.toContain('Dependencies');
    expect(html).not.toContain('Built with');
    expect(html).not.toContain('Compatible technologies');
  });
});

// ─── Step 35: Technology evidence matrix component tests ─────────────

describe('ScanInsights — Technology evidence matrix', () => {
  it('matrix renders for a completed scan with detections', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('wordpress', 'WordPress', 'cms'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('Technology evidence');
  });

  it('renders technology names with correct catalog links', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('href="/technologies/react"');
    expect(html).toContain('href="/technologies/nginx"');
  });

  it('renders unknown technologies as plain text (no link)', () => {
    const result = makeCompletedScanDetail([
      makeDetection('unknown-tech', 'Unknown Technology', 'custom'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).not.toContain('/technologies/unknown-tech');
    expect(html).toContain('Unknown Technology');
  });

  it('renders evidence type labels correctly', () => {
    const result = makeCompletedScanDetail([makeDetection('react', 'React', 'framework', 3)]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    // makeDetection with 3 evidence items creates: http_header, meta_tag, script_url
    expect(cleaned).toContain('HTTP Header');
    expect(cleaned).toContain('Meta Tag');
    expect(cleaned).toContain('Script URL');
  });

  it('renders evidence count (sources) correctly', () => {
    const result = makeCompletedScanDetail([makeDetection('react', 'React', 'framework', 2)]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    expect(cleaned).toContain('2 sources');
  });

  it('renders multiple technologies in the matrix', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework'),
      makeDetection('wordpress', 'WordPress', 'cms'),
      makeDetection('nginx', 'nginx', 'server'),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toContain('React');
    expect(html).toContain('WordPress');
    expect(html).toContain('nginx');
  });

  it('does not render matrix for empty completed scan', () => {
    const result = makeCompletedScanDetail([]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    expect(cleaned).not.toContain('Technology evidence');
  });

  it('does not render matrix for a failed scan', () => {
    const result = makeFailedScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('does not render matrix for a pending scan', () => {
    const result = makePendingScanDetail();
    const html = renderToString(React.createElement(ScanInsights, { result }));

    expect(html).toBe('');
  });

  it('preserves existing composition, explanation, and evidence UI', () => {
    const result = makeCompletedScanDetail([
      makeDetection('react', 'React', 'framework', 2),
      makeDetection('wordpress', 'WordPress', 'cms', 1),
    ]);
    const html = renderToString(React.createElement(ScanInsights, { result }));
    const cleaned = clean(html);

    // All existing sections must still be present
    expect(cleaned).toContain('Technology Insights');
    expect(cleaned).toContain('2 technologies detected');
    expect(cleaned).toContain('Categories');
    expect(cleaned).toContain('Evidence coverage');
    expect(cleaned).toContain('Detected technologies');
    expect(cleaned).toContain('Technology composition');
    expect(cleaned).toContain('Technology evidence');
  });
});
