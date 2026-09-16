/**
 * Unit tests for the ScanComparison presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * (jsdom) required. The comparison logic is tested separately in
 * `comparison.test.ts`; these tests focus on presentation.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanComparison } from './ScanComparison.js';
import { compareScans } from '../lib/comparison.js';
import type { ScanDetailResponse, DetectionResponse } from '../lib/types.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(
  id: string,
  status: string = 'completed',
  detections: DetectionResponse[] = [],
  target: string = 'https://example.com/',
  timestamps?: {
    startedAt?: string | null;
    completedAt?: string | null;
    failedAt?: string | null;
  },
  error: { code: string; message: string } | null = null,
): ScanDetailResponse {
  return {
    scan: {
      id,
      status,
      target,
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: timestamps?.startedAt ?? null,
      completedAt: timestamps?.completedAt ?? '2025-06-01T12:00:05.000Z',
      failedAt: timestamps?.failedAt ?? null,
      error,
    },
    snapshot: null,
    detections,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
  evidence: DetectionResponse['evidence'] = [],
): DetectionResponse {
  return { technology: { id, name, category }, confidence, evidence };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanComparison', () => {
  it('renders a successful comparison with both scan summaries', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 90),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Scan Comparison');
    expect(cleaned).toContain('Previous / Left');
    expect(cleaned).toContain('Current / Right');
    expect(cleaned).toContain('scan_left');
    expect(cleaned).toContain('scan_right');
  });

  it('renders missing left scan state', () => {
    const left = null;
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Unable to compare scans');
    expect(html).toContain('left scan');
    expect(html).toContain('Back to scan history');
  });

  it('renders missing right scan state', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = null;
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Unable to compare scans');
    expect(html).toContain('right scan');
  });

  it('renders failed scan comparison with limited detection notice', () => {
    const left = makeScan(
      'scan_left',
      'failed',
      [],
      'https://example.com/',
      {
        startedAt: '2025-06-01T12:00:01.000Z',
        completedAt: null,
        failedAt: '2025-06-01T12:00:05.000Z',
      },
      { code: 'timeout', message: 'Request timed out' },
    );
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Limited comparison');
    expect(html).toContain('failed');
    expect(html).toContain('Detection comparison is');
    expect(html).toContain('unavailable');
  });

  it('renders "No detection changes" for identical scans', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('No detection changes');
  });

  it('renders technology changes (added and removed)', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('vue', 'Vue', 'frontend', 80),
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('svelte', 'Svelte', 'frontend', 70),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Added (1)');
    expect(cleaned).toContain('Removed (1)');
    expect(cleaned).toContain('Svelte');
    expect(cleaned).toContain('Vue');
    expect(cleaned).toContain('Present in both (1)');
    expect(cleaned).toContain('React');
  });

  it('renders score/confidence changes', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 90),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Score / confidence changes (1)');
    expect(cleaned).toContain('Previous');
    expect(cleaned).toContain('Current');
    expect(cleaned).toContain('Change');
  });

  it('renders evidence changes', () => {
    const left = makeScan('scan_left', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
      ]),
    ]);
    const right = makeScan('scan_right', 'completed', [
      makeDetection('react', 'React', 'frontend', 95, [
        { type: 'http_header', name: 'Server', value: 'nginx' },
        { type: 'meta_tag', name: 'generator', content: 'React 19' },
      ]),
    ]);
    const result = compareScans(left, right);

    const html = renderToString(React.createElement(ScanComparison, { result }));

    expect(html).toContain('Evidence changes');
    expect(html).toContain('Meta Tag');
    expect(html).toContain('added');
  });
});
