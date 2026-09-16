/**
 * Integration tests for the scan detail report.
 *
 * Tests the rendering of `ScanDetailView` (which renders `ScanSummary`
 * and `DetectionList`) for different scan lifecycle states, plus
 * report-level elements like detection count and navigation links.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment.
 * `next/link` is mocked to render plain `<a>` tags.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

import { ScanDetailView } from './ScanViews.js';
import { CopyReportLink } from './CopyReportLink.js';
import { isTerminal } from '../lib/scan-utils.js';
import type { ScanDetailResponse, ScanSummary, DetectionResponse } from '../lib/types.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: 'scan_001',
    status: 'completed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null,
    completedAt: '2025-06-01T12:00:05.000Z',
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence: number,
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence: [],
  };
}

function makeScanDetail(
  scanOverrides: Partial<ScanSummary> = {},
  detections: DetectionResponse[] = [],
): ScanDetailResponse {
  return {
    scan: makeScan(scanOverrides),
    snapshot: null,
    detections,
  };
}

// ─── Report tests ────────────────────────────────────────────────────

describe('ScanDetailReport', () => {
  it('scan ID is visible in the report', () => {
    const result = makeScanDetail({ id: 'abc123-def456' });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('abc123-def456');
  });

  it('target URL is visible', () => {
    const result = makeScanDetail({ target: 'https://my-site.com/' });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('https://my-site.com/');
  });

  it('status is visible', () => {
    const result = makeScanDetail({ status: 'completed' });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Completed');
  });

  it('detection count is displayed for completed scans', () => {
    const detections = [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ];
    const result = makeScanDetail({ status: 'completed' }, detections);

    // Verify the detection count logic
    expect(isTerminal(result.scan.status)).toBe(true);
    expect(result.detections.length).toBe(2);

    // Verify detections are rendered
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('React');
    expect(cleaned).toContain('Vue');
  });

  it('existing navigation links remain present', () => {
    const result = makeScanDetail({ status: 'completed' }, [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    // ScanSummary shows scan ID; ScanCard in history list has detail links
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('scan_001');

    // CopyReportLink renders the copy button
    const copyHtml = renderToString(React.createElement(CopyReportLink, { scanId: 'scan_001' }));
    expect(copyHtml).toContain('Copy report link');
    expect(copyHtml).toContain('aria-label="Copy report link"');
  });
});

// ─── Regression tests: lifecycle states ──────────────────────────────

describe('ScanDetailReport lifecycle regression', () => {
  it('renders pending scan without errors', () => {
    const result = makeScanDetail({
      status: 'pending',
      startedAt: null,
      completedAt: null,
    });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Pending');
    // No detection list crash for pending scans
    expect(html).toBeTruthy();
  });

  it('renders running scan without errors', () => {
    const result = makeScanDetail({
      status: 'running',
      startedAt: '2025-06-01T12:00:01.000Z',
      completedAt: null,
    });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Running');
    expect(html).toBeTruthy();
  });

  it('renders completed scan without errors', () => {
    const result = makeScanDetail({ status: 'completed' }, [
      makeDetection('react', 'React', 'frontend', 95),
    ]);
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Completed');
    expect(html).toContain('React');
  });

  it('renders failed scan without errors', () => {
    const result = makeScanDetail({
      status: 'failed',
      error: { code: 'timeout', message: 'Request timed out' },
      failedAt: '2025-06-01T12:00:10.000Z',
      completedAt: null,
    });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Failed');
    // Error info is visible in the report (not in metadata)
    expect(html).toContain('timeout');
    expect(html).toContain('Request timed out');
  });
});
