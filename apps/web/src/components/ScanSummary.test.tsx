/**
 * Unit tests for the ScanSummary component.
 *
 * Uses `renderToString` — no DOM environment required.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanSummary } from './ScanSummary.js';
import type { ScanResponse } from '../lib/types.js';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

function makeScan(overrides: Partial<ScanResponse> = {}): ScanResponse {
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

describe('ScanSummary', () => {
  it('renders the scan ID in the heading', () => {
    const html = renderToString(React.createElement(ScanSummary, { scan: makeScan() }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Scan #scan_001');
  });

  it('renders the target URL', () => {
    const html = renderToString(React.createElement(ScanSummary, { scan: makeScan() }));

    expect(html).toContain('https://example.com/');
  });

  it('renders the hostname', () => {
    const html = renderToString(React.createElement(ScanSummary, { scan: makeScan() }));

    expect(html).toContain('example.com');
  });

  it('renders the status badge with human-readable label', () => {
    const html = renderToString(React.createElement(ScanSummary, { scan: makeScan() }));

    expect(html).toContain('Completed');
  });

  it('renders the creation timestamp with <time> element', () => {
    const html = renderToString(React.createElement(ScanSummary, { scan: makeScan() }));

    expect(html).toContain('2025-06-01T12:00:00.000Z');
    expect(html).toContain('<time');
  });

  it('renders startedAt when present', () => {
    const scan = makeScan({ startedAt: '2025-06-01T12:00:01.000Z' });
    const html = renderToString(React.createElement(ScanSummary, { scan }));

    expect(html).toContain('2025-06-01T12:00:01.000Z');
  });

  it('renders completedAt when present', () => {
    const scan = makeScan({ completedAt: '2025-06-01T12:00:05.000Z' });
    const html = renderToString(React.createElement(ScanSummary, { scan }));

    expect(html).toContain('2025-06-01T12:00:05.000Z');
  });

  it('renders error code and message when present', () => {
    const scan = makeScan({ error: { code: 'timeout', message: 'Request timed out' } });
    const html = renderToString(React.createElement(ScanSummary, { scan }));

    expect(html).toContain('timeout');
    expect(html).toContain('Request timed out');
  });

  it('renders all timestamp fields for a running scan', () => {
    const scan = makeScan({
      status: 'running',
      startedAt: '2025-06-01T12:00:01.000Z',
      completedAt: null,
    });
    const html = renderToString(React.createElement(ScanSummary, { scan }));

    expect(html).toContain('Running');
    expect(html).toContain('2025-06-01T12:00:01.000Z');
  });
});
