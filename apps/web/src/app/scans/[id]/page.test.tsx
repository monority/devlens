/**
 * Unit tests for the scan detail page (`app/scans/[id]/page.tsx`).
 *
 * The page is an async server component that fetches scan data via
 * `fetchScanById` (mocked). It renders different UI for three states:
 *
 * - Scan found (including failed scans)
 * - Scan not found (404)
 * - API/Infrastructure error (500)
 *
 * Tests use `renderToString` from `react-dom/server` — no DOM environment.
 * `next/link` is mocked to render a plain `<a>` tag. Child client
 * components (`ScanLifecycle`, `CopyReportLink`, `ExportScanButton`)
 * are mocked to placeholders so the page structure can be tested in
 * isolation.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

// ─── Mocks ──────────────────────────────────────────────────────────

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock the API module so fetchScanById is controllable
const mockFetchScanById = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  fetchScanById: mockFetchScanById,
}));

// Mock child components (client components / browser-only)
vi.mock('@/components/ScanLifecycle', () => ({
  ScanLifecycle: () => React.createElement('div', { 'data-testid': 'scan-lifecycle' }, 'Lifecycle'),
}));
vi.mock('@/components/CopyReportLink', () => ({
  CopyReportLink: () => React.createElement('div', { 'data-testid': 'copy-link' }, 'Copy'),
}));
vi.mock('@/components/ExportScanButton', () => ({
  ExportScanButton: () => React.createElement('div', { 'data-testid': 'export' }, 'Export'),
}));

// Must import after mocks
import ScanDetailPage from '@/app/scans/[id]/page.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScan(target: string, status: string = 'completed', id: string = 'scan_001') {
  return {
    id,
    status,
    target,
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: '2025-06-01T12:00:01.000Z',
    completedAt: status === 'completed' ? '2025-06-01T12:00:05.000Z' : null,
    failedAt: status === 'failed' ? '2025-06-01T12:00:01.000Z' : null,
    error: status === 'failed' ? { code: 'crawl_error', message: 'Crawl failed' } : null,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanDetailPage — Re-scan action', () => {
  it('renders a Re-scan link pointing to /scans/new with the target', async () => {
    mockFetchScanById.mockResolvedValue({
      scan: makeScan('https://example.com/'),
      snapshot: null,
      detections: [],
    });

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_001' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Re-scan link should point to /scans/new with target query param
    expect(cleaned).toContain('href="/scans/new?target=');
    expect(cleaned).toContain('Re-scan');
  });

  it('URL-encodes the target in the re-scan link', async () => {
    const target = 'https://example.com/path?q=hello&lang=en';
    mockFetchScanById.mockResolvedValue({
      scan: makeScan(target),
      snapshot: null,
      detections: [],
    });

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_001' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const decoded = html.replace(/&amp;/g, '&');

    // Target should be URL-encoded in the href
    expect(decoded).toContain(
      'href="/scans/new?target=https%3A%2F%2Fexample.com%2Fpath%3Fq%3Dhello%26lang%3Den"',
    );
  });

  it('does not render a Re-scan link when target is empty', async () => {
    mockFetchScanById.mockResolvedValue({
      scan: makeScan(''),
      snapshot: null,
      detections: [],
    });

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_001' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('Re-scan');
  });

  it('renders Re-scan for a failed scan (target is still available)', async () => {
    mockFetchScanById.mockResolvedValue({
      scan: makeScan('https://example.com/', 'failed', 'scan_failed'),
      snapshot: null,
      detections: [],
    });

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_failed' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Re-scan');
    expect(cleaned).toContain('href="/scans/new?target=');
  });

  it('does not render a Re-scan link when scan is not found (404)', async () => {
    mockFetchScanById.mockResolvedValue(null);

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'nonexistent' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('Re-scan');
  });

  it('does not render a Re-scan link on API error (500)', async () => {
    mockFetchScanById.mockRejectedValue(new Error('DB connection failed'));

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_001' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).not.toContain('Re-scan');
  });

  it('preserves existing "New scan" link alongside the Re-scan link', async () => {
    mockFetchScanById.mockResolvedValue({
      scan: makeScan('https://example.com/'),
      snapshot: null,
      detections: [],
    });

    const html = renderToString(
      await ScanDetailPage({
        params: Promise.resolve({ id: 'scan_001' }),
        searchParams: Promise.resolve({}),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Both "New scan" (blank form) and "Re-scan" (prefilled) should be present
    expect(cleaned).toContain('New scan');
    expect(cleaned).toContain('Re-scan');
  });
});
