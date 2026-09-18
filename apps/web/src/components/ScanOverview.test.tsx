/**
 * Unit tests for the ScanOverview presentation component.
 *
 * Uses `renderToString` from `react-dom/server` — no DOM environment
 * required. `next/link` is not used by this component.
 */

import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanOverview } from './ScanOverview';
import { getScanOverview } from '../lib/scan-overview';
import type { ScanDetailResponse, ScanResponse, DetectionResponse } from '../lib/types';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(overrides: Partial<ScanResponse> = {}): ScanResponse {
  return {
    id: 'scan_001',
    status: 'completed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: '2025-06-01T12:00:01.000Z',
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
    evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
  };
}

function makeResult(
  detections: DetectionResponse[] = [],
  scanOverrides: Partial<ScanResponse> = {},
): ScanDetailResponse {
  return {
    scan: makeScan(scanOverrides),
    snapshot: null,
    detections,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanOverview', () => {
  it('renders the target URL', () => {
    const result = makeResult();
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('https://example.com/');
  });

  it('renders the hostname', () => {
    const result = makeResult();
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('example.com');
  });

  it('renders the scan status as text', () => {
    const result = makeResult();
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Completed');
  });

  it('renders the scan ID', () => {
    const result = makeResult();
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('scan_001');
  });

  it('renders the technology count', () => {
    const result = makeResult([
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 80),
    ]);
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('2');
  });

  it('renders the evidence count', () => {
    const result = makeResult([
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 80),
    ]);
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('Evidence');
  });

  it('renders the highest confidence value exactly', () => {
    const result = makeResult([
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('vue', 'Vue', 'framework', 80),
    ]);
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('95%');
  });

  it('renders a compact header for zero detections', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('0');
    expect(html).toContain('—');
  });

  it('renders a completed report with all sections', () => {
    const result = makeResult([
      makeDetection('react', 'React', 'framework', 95),
      makeDetection('nginx', 'nginx', 'server', 70),
    ]);
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('example.com');
    expect(cleaned).toContain('Completed');
    expect(cleaned).toContain('Technologies');
    expect(cleaned).toContain('Evidence');
    expect(cleaned).toContain('Highest confidence');
    expect(cleaned).toContain('2');
    expect(cleaned).toContain('95%');
  });

  it('uses semantic HTML with proper heading hierarchy', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // h1 for the scan ID header
    expect(html).toContain('<h1>');
    // dl/dd for metrics (semantic definition list)
    expect(html).toContain('<dl');
    expect(html).toContain('<dt>');
    expect(html).toContain('<dd>');
    // time element for date (machine-readable)
    expect(html).toContain('<time');
  });

  it('renders status as text, not color-only', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // The status text "Completed" is visible in the HTML (not just a CSS class)
    const cleaned = html.replace(/<!-- -->/g, '');
    expect(cleaned).toContain('Completed');
  });

  it('renders the createdAt timestamp in a time element', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('dateTime="2025-06-01T12:00:00.000Z"');
  });

  it('renders the completedAt timestamp in a time element', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).toContain('dateTime="2025-06-01T12:00:05.000Z"');
  });

  it('does not show completedAt for non-completed scans', () => {
    const result: ScanDetailResponse = {
      scan: makeScan({ status: 'running', completedAt: null }),
      snapshot: null,
      detections: [],
    };
    const overview = getScanOverview(result);
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    expect(html).not.toContain('dateTime="2025-06-01T12:00:05.000Z"');
  });

  it('does not invent an "overall score" label — uses "Highest confidence" only', () => {
    const overview = getScanOverview(makeResult([]));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // Must NOT contain "overall score", "average", "aggregate", etc.
    expect(html).not.toContain('overall score');
    expect(html).not.toContain('Overall');
    expect(html).not.toContain('Average');
    // Must contain the actual label used
    expect(html).toContain('Highest confidence');
  });

  // ─── Step 61: Robustness tests (long target, missing metadata) ────

  it('renders a long target URL in full without truncation', () => {
    const longTarget =
      'https://very-long-subdomain-name.example.com/some/very/long/path/with/many/segments?query=value&another=param#fragment';
    const overview = getScanOverview(
      makeResult([], { target: longTarget, hostname: 'very-long-subdomain-name.example.com' }),
    );
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // The full URL must be present — not truncated.
    // React's renderToString escapes & to &amp;, so normalize for comparison.
    const decoded = html.replace(/&amp;/g, '&');
    expect(decoded).toContain(longTarget);
  });

  it('renders safely when optional timestamp fields are missing', () => {
    // A scan where startedAt is null and completedAt is also null
    // (edge case — completedAt normally present for completed, but test robustness)
    const overview = getScanOverview(makeResult([], { startedAt: null, completedAt: null }));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // Created date still renders
    expect(html).toContain('Created');
    expect(html).toContain('dateTime="2025-06-01T12:00:00.000Z"');
    // No crash, no NaN, no "undefined" in date area
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('renders safely when hostname is empty', () => {
    const overview = getScanOverview(makeResult([], { hostname: '' }));
    const html = renderToString(React.createElement(ScanOverview, { overview }));

    // Target still renders; empty hostname doesn't crash
    expect(html).toContain('https://example.com/');
  });
});
