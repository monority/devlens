/**
 * Unit tests for the presentation components in `ScanViews.tsx`.
 *
 * These components are pure — they receive data as props and render HTML.
 * No DOM environment (jsdom) is required: `renderToString` from
 * `react-dom/server` produces an HTML string in the node environment,
 * and we assert on text content.
 *
 * `next/link` is mocked to render a plain `<a>` tag, since the Next.js
 * router context is not available in the node test environment.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScansHistory, ScanCard, ScansError, ScanNotFound, ScanDetailView } from './ScanViews.js';
import type { ScanSummary, ScanDetailResponse, DetectionResponse } from '../lib/types.js';

// Mock next/link to render a plain <a> tag (no router context needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock next/navigation so DetectionFilterView (rendered for completed scans
// with initialQuery provided) can call useRouter/useSearchParams in renderToString
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeCompletedScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
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

function makeFailedScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: 'scan_failed',
    status: 'failed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null,
    completedAt: null,
    failedAt: '2025-06-01T12:00:01.000Z',
    error: { code: 'timeout', message: 'Request timed out' },
    ...overrides,
  };
}

function makePendingScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: 'scan_pending',
    status: 'pending',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null,
    completedAt: null,
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function makeRunningScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: 'scan_running',
    status: 'running',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: '2025-06-01T12:00:01.000Z',
    completedAt: null,
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function makeScanDetail(overrides: Partial<ScanDetailResponse> = {}): ScanDetailResponse {
  return {
    scan: makeCompletedScan(),
    snapshot: {
      url: 'https://example.com/',
      hostname: 'example.com',
      capturedAt: '2025-06-01T12:00:00.000Z',
      http: { statusCode: 200, contentType: 'text/html', finalUrl: 'https://example.com/' },
      html: { title: 'Example Domain', description: 'An example site' },
    },
    detections: [
      {
        technology: { id: 'nginx', name: 'nginx', category: 'server' },
        confidence: 80,
        evidence: [
          { type: 'http_header', name: 'Server', value: 'nginx' },
          { type: 'meta_tag', name: 'generator', content: 'WordPress 6.0' },
        ],
      },
    ],
    ...overrides,
  };
}

function makeDetection(
  id: string,
  name: string,
  category: string,
  confidence = 80,
): DetectionResponse {
  return {
    technology: { id, name, category },
    confidence,
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
  };
}

// ─── ScanCard tests ──────────────────────────────────────────────────

describe('ScanCard', () => {
  it('renders the target URL and hostname', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeCompletedScan() }));

    expect(html).toContain('https://example.com/');
    expect(html).toContain('example.com');
  });

  it('renders the scan status as "Completed"', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeCompletedScan() }));

    expect(html).toContain('Completed');
  });

  it('renders the scan status as "Failed" for failed scans', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeFailedScan() }));

    expect(html).toContain('Failed');
  });

  it('renders a link to the detail page', () => {
    const html = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan({ id: 'abc123' }) }),
    );

    expect(html).toContain('href="/scans/abc123"');
  });

  it('renders the creation timestamp', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeCompletedScan() }));

    expect(html).toContain('2025-06-01T12:00:00.000Z');
  });

  it('renders the scan status as "Pending" for pending scans', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makePendingScan() }));

    expect(html).toContain('Pending');
  });

  it('renders the scan status as "Running" for running scans', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeRunningScan() }));

    expect(html).toContain('Running');
  });

  it('does not show same-target count when sameTargetCount is not provided', () => {
    const html = renderToString(React.createElement(ScanCard, { scan: makeCompletedScan() }));

    // The sameTargetCount badge uses a specific CSS class — verify it's absent
    expect(html).not.toMatch(/sameTargetCount/);
  });

  it('does not show same-target count when sameTargetCount is 1', () => {
    const html = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan(), sameTargetCount: 1 }),
    );

    expect(html).not.toMatch(/sameTargetCount/);
  });

  it('shows "N scans" when sameTargetCount is greater than 1', () => {
    const html = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan(), sameTargetCount: 3 }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('3 scans');
  });

  it('sameTargetCount=1 does not render the count badge', () => {
    // The badge only appears when sameTargetCount > 1
    const withOne = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan(), sameTargetCount: 1 }),
    );
    expect(withOne).not.toMatch(/sameTargetCount/);

    const withTwo = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan(), sameTargetCount: 2 }),
    );
    expect(withTwo).toMatch(/sameTargetCount/);
  });

  it('preserves all scan metadata when sameTargetCount is displayed', () => {
    const html = renderToString(
      React.createElement(ScanCard, { scan: makeCompletedScan(), sameTargetCount: 2 }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Target, hostname, status, timestamp, and detail link all still present
    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('example.com');
    expect(cleaned).toContain('Completed');
    expect(cleaned).toContain('href="/scans/scan_001"');
    expect(cleaned).toContain('2 scans');
  });
});

// ─── ScansHistory tests ──────────────────────────────────────────────

describe('ScansHistory', () => {
  it('renders scans list when scans are present', () => {
    const scans: ScanSummary[] = [makeCompletedScan(), makeFailedScan()];
    const html = renderToString(React.createElement(ScansHistory, { scans }));

    expect(html).toContain('Scan History');
    expect(html).toContain('https://example.com/');
    expect(html).toContain('Completed');
    expect(html).toContain('Failed');
  });

  it('renders empty state when no scans exist', () => {
    const html = renderToString(React.createElement(ScansHistory, { scans: [] }));

    expect(html).toContain('No scans found');
    expect(html).toContain('New scan');
  });

  it('renders a link to detail for each scan', () => {
    const scans: ScanSummary[] = [
      makeCompletedScan({ id: 'scan_a' }),
      makeCompletedScan({ id: 'scan_b' }),
    ];
    const html = renderToString(React.createElement(ScansHistory, { scans }));

    expect(html).toContain('href="/scans/scan_a"');
    expect(html).toContain('href="/scans/scan_b"');
  });

  it('renders multiple scans with correct statuses', () => {
    const scans: ScanSummary[] = [makeCompletedScan(), makeFailedScan()];
    const html = renderToString(React.createElement(ScansHistory, { scans }));

    expect(html).toContain('scan_001');
    expect(html).toContain('scan_failed');
  });

  it('includes pending and running scans in the list', () => {
    const scans: ScanSummary[] = [
      makeCompletedScan({ id: 'scan_completed' }),
      makeFailedScan({ id: 'scan_failed' }),
      makePendingScan({ id: 'scan_pending' }),
      makeRunningScan({ id: 'scan_running' }),
    ];
    const html = renderToString(React.createElement(ScansHistory, { scans }));

    expect(html).toContain('Completed');
    expect(html).toContain('Failed');
    expect(html).toContain('Pending');
    expect(html).toContain('Running');
    expect(html).toContain('scan_completed');
    expect(html).toContain('scan_pending');
    expect(html).toContain('scan_running');
  });
});

// ─── ScansError tests ────────────────────────────────────────────────

describe('ScansError', () => {
  it('renders an error message', () => {
    const html = renderToString(React.createElement(ScansError));

    expect(html).toContain('Unable to load scans');
  });
});

// ─── ScanNotFound tests ──────────────────────────────────────────────

describe('ScanNotFound', () => {
  it('renders a not-found message with the scan ID', () => {
    const html = renderToString(React.createElement(ScanNotFound, { id: 'scan_abc123' }));

    expect(html).toContain('Scan not found');
    expect(html).toContain('scan_abc123');
  });

  it('renders a back link to scan history', () => {
    const html = renderToString(React.createElement(ScanNotFound, { id: 'scan_abc' }));

    expect(html).toContain('href="/scans"');
  });

  it('renders a "New scan" link to /scans/new', () => {
    const html = renderToString(React.createElement(ScanNotFound, { id: 'scan_abc' }));

    expect(html).toContain('href="/scans/new"');
    expect(html).toContain('New scan');
  });

  it('renders both back link and new scan link', () => {
    const html = renderToString(React.createElement(ScanNotFound, { id: 'scan_abc' }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Back to scan history');
    expect(cleaned).toContain('New scan');
  });
});

// ─── ScanDetailView tests ────────────────────────────────────────────

describe('ScanDetailView', () => {
  it('renders scan data (target, hostname, timestamps, status)', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('https://example.com/');
    expect(html).toContain('example.com');
    expect(html).toContain('2025-06-01T12:00:00.000Z');
    expect(html).toContain('Completed');
    expect(html).toContain('2025-06-01T12:00:05.000Z');
  });

  it('renders snapshot information when available', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Snapshot');
    expect(html).toContain('200');
    expect(html).toContain('text/html');
    expect(html).toContain('Example Domain');
    expect(html).toContain('An example site');
  });

  it('renders detections with technology name, confidence, and evidence', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('nginx');
    expect(html).toContain('80');
    expect(html).toContain('server');
    expect(html).toContain('HTTP Header');
    expect(html).toContain('Server');
    expect(html).toContain('nginx');
    expect(html).toContain('Meta Tag');
    expect(html).toContain('generator');
    expect(html).toContain('WordPress 6.0');
  });

  it('renders "No technologies were detected" when detections is empty', () => {
    const result = makeScanDetail({ detections: [] });
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('No supported technologies were detected');
    expect(html).toContain('The scan completed successfully');
  });

  it('handles a failed scan — displays error code and message', () => {
    const failedScan: ScanDetailResponse = {
      scan: makeFailedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result: failedScan }));

    expect(html).toContain('Failed');
    expect(html).toContain('timeout');
    expect(html).toContain('Request timed out');
    expect(html).toContain('2025-06-01T12:00:01.000Z');
  });

  it('does not render snapshot section for failed scans', () => {
    const failedScan: ScanDetailResponse = {
      scan: makeFailedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result: failedScan }));

    expect(html).not.toContain('>Snapshot<');
  });

  it('renders detection count in the heading', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    // React 19 renderToString inserts <!-- --> around numbers in JSX text.
    // Check for the parts separately.
    expect(html).toContain('Detections');
    expect(html).toContain('>');
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Detections (1)');
  });

  it('renders evidence for each evidence type', () => {
    const result: ScanDetailResponse = {
      scan: makeCompletedScan(),
      snapshot: null,
      detections: [
        {
          technology: { id: 'react', name: 'React', category: 'framework' },
          confidence: 95,
          evidence: [
            { type: 'http_header', name: 'X-Powered-By', value: 'React' },
            { type: 'meta_tag', name: 'generator', content: 'React 19' },
            { type: 'script_url', url: 'https://cdn.example.com/react.js' },
            { type: 'script_content', snippet: 'window.__REACT__' },
            { type: 'html', selector: 'meta#react', snippet: '<meta>' },
            { type: 'javascript_global', globalName: 'React' },
            { type: 'resource', url: 'https://cdn.example.com/logo.png' },
            { type: 'link', url: 'https://cdn.example.com/style.css' },
          ],
        },
      ],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('X-Powered-By');
    expect(html).toContain('generator');
    expect(html).toContain('React 19');
    expect(html).toContain('https://cdn.example.com/react.js');
    expect(html).toContain('window.__REACT__');
    expect(html).toContain('meta#react');
    expect(html).toContain('React');
    expect(html).toContain('https://cdn.example.com/logo.png');
    expect(html).toContain('https://cdn.example.com/style.css');
  });

  // ─── Pending / Running states ─────────────────────────

  it('renders "Queued in progress" for a pending scan', () => {
    const result: ScanDetailResponse = {
      scan: makePendingScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Queued');
    expect(cleaned).toContain('in progress');
    expect(cleaned).toContain('queued and waiting to start');

    // No snapshot
    expect(cleaned).not.toContain('Snapshot');

    // Detections show pending message
    expect(cleaned).toContain('Detection results will appear after the scan completes.');
  });

  it('renders "Scanning in progress" for a running scan with startedAt', () => {
    const result: ScanDetailResponse = {
      scan: makeRunningScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Scanning');
    expect(cleaned).toContain('in progress');
    expect(cleaned).toContain('currently running');
    expect(cleaned).toContain('2025-06-01T12:00:01.000Z');

    // No snapshot for running scans
    expect(cleaned).not.toContain('Snapshot');
  });

  it('shows "Pending" status badge for a pending scan', () => {
    const result: ScanDetailResponse = {
      scan: makePendingScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Pending');
  });

  it('shows "Running" status badge for a running scan', () => {
    const result: ScanDetailResponse = {
      scan: makeRunningScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Running');
  });

  // ─── Snapshot section ────────────────────────────────

  it('renders snapshot with HTTP status code', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('HTTP Status');
    expect(html).toContain('200');
  });

  it('renders snapshot with content type', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Content Type');
    expect(html).toContain('text/html');
  });

  it('renders snapshot with final URL', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Final URL');
    expect(html).toContain('https://example.com/');
  });

  it('renders snapshot captured timestamp', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('Captured');
    expect(html).toContain('2025-06-01T12:00:00.000Z');
  });

  it('renders snapshot description when present', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('An example site');
  });

  // ─── Zero-detection completed scan ───────────────────

  it('renders empty state for completed scan with zero detections', () => {
    const result: ScanDetailResponse = {
      scan: makeCompletedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    expect(html).toContain('The scan completed successfully');
    expect(html).toContain('No supported technologies were detected');
    expect(html).toContain('Detections (0)');
  });

  // ─── Detection coverage integration (Step 40) ───────────────────────

  it('renders detection coverage for completed scans', () => {
    const result = makeScanDetail();
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Detection coverage');
    expect(cleaned).toContain('Evidence items');
    expect(cleaned).toContain('Evidence types');
  });

  it('does not render detection coverage for non-completed scans', () => {
    const pendingResult: ScanDetailResponse = {
      scan: makePendingScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result: pendingResult }));

    expect(html).not.toContain('Detection coverage');
  });

  it('does not render detection coverage for failed scans', () => {
    const failedResult: ScanDetailResponse = {
      scan: makeFailedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result: failedResult }));

    expect(html).not.toContain('Detection coverage');
  });

  it('coverage data remains stable when filter is active', () => {
    const result = makeScanDetail();
    const html = renderToString(
      React.createElement(ScanDetailView, {
        result,
        initialQuery: 'nginx',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Coverage should show all evidence (global), not filtered subset
    expect(cleaned).toContain('Detection coverage');
    expect(cleaned).toContain('Evidence items');
    expect(cleaned).toContain('Evidence types');
  });

  it('zero-detection completed scan shows coverage empty state', () => {
    const result: ScanDetailResponse = {
      scan: makeCompletedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Detection coverage');
    expect(cleaned).toContain('No evidence available');
  });

  // ─── Step 61: Robustness tests ───────────────────────────────

  it('renders long evidence values without truncation', () => {
    const longValue = 'a'.repeat(2000);
    const result: ScanDetailResponse = {
      scan: makeCompletedScan(),
      snapshot: null,
      detections: [
        {
          technology: { id: 'nginx', name: 'nginx', category: 'server' },
          confidence: 80,
          evidence: [{ type: 'http_header', name: 'X-Powered-By', value: longValue }],
        },
      ],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result }));

    // The full long value must be present
    expect(html).toContain(longValue);
  });
});

// ─── Step 36: Detection filtering integration ────────────────────────

describe('ScanDetailView — Detection filtering (Step 36)', () => {
  it('renders filter controls when initialQuery is provided', () => {
    const result = makeScanDetail({
      detections: [makeDetection('react', 'React', 'frontend', 95)],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );

    expect(html).toContain('Search technologies');
    expect(html).toContain('Category');
  });

  it('renders filtered detection list with result count', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ];
    const result = { ...makeScanDetail(), detections };
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: 'react', initialCategory: '' }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('1 of 2');
    expect(cleaned).toContain('Detections (1)');
  });

  it('preserves existing insights and evidence UI when filters are active', () => {
    const result = makeScanDetail({
      detections: [
        makeDetection('react', 'React', 'frontend', 95),
        makeDetection('vue', 'Vue', 'frontend', 80),
      ],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: 'react', initialCategory: '' }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // All existing sections must still be present
    expect(cleaned).toContain('Technology Insights');
    expect(cleaned).toContain('Technology composition');
    expect(cleaned).toContain('Technology evidence');
    expect(cleaned).toContain('Search technologies');
  });

  it('shows "No detections match these filters." when filter yields zero results', () => {
    const result = makeScanDetail({
      detections: [makeDetection('react', 'React', 'frontend', 95)],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, {
        result,
        initialQuery: 'nonexistent',
        initialCategory: '',
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('No detections match these filters.');
  });

  it('does not render filter controls for a failed scan', () => {
    const failedScan: ScanDetailResponse = {
      scan: makeFailedScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(
      React.createElement(ScanDetailView, {
        result: failedScan,
        initialQuery: '',
        initialCategory: '',
      }),
    );

    expect(html).not.toContain('Search technologies');
  });

  it('does not render filter controls for a pending scan', () => {
    const pendingScan: ScanDetailResponse = {
      scan: makePendingScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(
      React.createElement(ScanDetailView, {
        result: pendingScan,
        initialQuery: '',
        initialCategory: '',
      }),
    );

    expect(html).not.toContain('Search technologies');
  });

  it('does not render filter controls for a running scan', () => {
    const runningScan: ScanDetailResponse = {
      scan: makeRunningScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(
      React.createElement(ScanDetailView, {
        result: runningScan,
        initialQuery: '',
        initialCategory: '',
      }),
    );

    expect(html).not.toContain('Search technologies');
  });

  it('technology links remain intact in filtered view', () => {
    const result = makeScanDetail({
      detections: [makeDetection('nginx', 'nginx', 'server', 80)],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );

    expect(html).toContain('href="/technologies/nginx"');
  });

  it('renders correct catalog links for multiple detected technologies', () => {
    const detections: DetectionResponse[] = [
      makeDetection('nginx', 'nginx', 'server', 80),
      makeDetection('react', 'React.js', 'frontend', 95),
    ];
    const result = { ...makeScanDetail(), detections };
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );

    // Both known technologies should link to their canonical catalog IDs
    expect(html).toContain('href="/technologies/nginx"');
    expect(html).toContain('href="/technologies/react"');
    expect(html).not.toContain('href="/technologies/React.js"');
  });

  it('preserves detection order (no reordering by filter)', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ];
    const result = { ...makeScanDetail(), detections };
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // React should appear before Vue in the HTML
    expect(cleaned.indexOf('React')).toBeLessThan(cleaned.indexOf('Vue'));
  });

  it('renders all category options in the select', () => {
    const result = makeScanDetail({
      detections: [makeDetection('react', 'React', 'frontend', 95)],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );

    // Categories from the catalog should be present
    expect(html).toContain('framework');
    expect(html).toContain('All');
  });
});

// ─── Step 37: Scan Overview integration ──────────────────────────────

describe('ScanDetailView — Scan Overview (Step 37)', () => {
  it('renders overview metrics for completed scans', () => {
    const result = makeScanDetail({
      detections: [
        makeDetection('react', 'React', 'frontend', 95),
        makeDetection('nginx', 'nginx', 'server', 80),
      ],
    });
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Technologies');
    expect(cleaned).toContain('Evidence');
    expect(cleaned).toContain('Highest confidence');
    expect(cleaned).toContain('95%');
  });

  it('does not render overview for non-completed scans', () => {
    const pendingScan: ScanDetailResponse = {
      scan: makePendingScan(),
      snapshot: null,
      detections: [],
    };
    const html = renderToString(React.createElement(ScanDetailView, { result: pendingScan }));

    expect(html).not.toContain('Highest confidence');
  });

  it('shows zero-detection state in overview', () => {
    const result = makeScanDetail({ detections: [] });
    const html = renderToString(React.createElement(ScanDetailView, { result }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Technologies');
    expect(cleaned).toContain('Highest confidence');
  });

  it('overview metrics are stable when filters are active', () => {
    const detections: DetectionResponse[] = [
      makeDetection('react', 'React', 'frontend', 95),
      makeDetection('vue', 'Vue', 'frontend', 80),
    ];
    const result: ScanDetailResponse = { ...makeScanDetail(), detections };

    // Without filters
    const htmlNoFilter = renderToString(React.createElement(ScanDetailView, { result }));
    const cleanedNoFilter = htmlNoFilter.replace(/<!-- -->/g, '');

    // With filters
    const htmlWithFilter = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: 'react', initialCategory: '' }),
    );
    const cleanedWithFilter = htmlWithFilter.replace(/<!-- -->/g, '');

    // Technology count (2 unique) and highest confidence (95) must be the same
    expect(cleanedNoFilter).toContain('2');
    expect(cleanedWithFilter).toContain('2');
    expect(cleanedNoFilter).toContain('95%');
    expect(cleanedWithFilter).toContain('95%');
  });

  it('overview and detection list both render for completed scans', () => {
    const result = makeScanDetail({
      detections: [makeDetection('react', 'React', 'frontend', 95)],
    });
    const html = renderToString(
      React.createElement(ScanDetailView, { result, initialQuery: '', initialCategory: '' }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Overview metrics present
    expect(cleaned).toContain('Technologies');
    // Detection list also present
    expect(cleaned).toContain('Detections');
    expect(cleaned).toContain('React');
  });
});
