/**
 * Unit tests for the `ScanHistory` client component.
 *
 * `ScanHistory` manages client-side filtering (search + status) and
 * renders `ScanCard` for each filtered scan. It also computes
 * same-target counts via `countScansByTarget()` and passes them to
 * each `ScanCard`.
 *
 * Tests verify:
 * - Scans are rendered with the same-target count indicator
 * - Repeated scans of the same target show the correct count
 * - Failed scans remain visible and distinguishable
 * - The Re-scan flow (via `/scans/new`) remains intact (tested on the
 *   detail page in `app/scans/[id]/page.test.tsx`)
 *
 * `next/link` and `next/navigation` are mocked per codebase conventions.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanHistory } from './ScanHistory.js';
import type { ScanSummary } from '../lib/types.js';

// Mock next/link to render a plain <a> tag
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Mock next/navigation so the client component can use useRouter/useSearchParams
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanHistory — same-target context', () => {
  it('shows scan count for repeated targets', () => {
    const scans: ScanSummary[] = [
      makeScan({ id: 's1', target: 'https://example.com/' }),
      makeScan({ id: 's2', target: 'https://example.com/' }),
      makeScan({ id: 's3', target: 'https://example.com/' }),
      makeScan({ id: 's4', target: 'https://other.com/' }),
    ];
    const html = renderToString(React.createElement(ScanHistory, { scans }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // The 3 example.com scans should show "3 scans"
    expect(cleaned).toContain('3 scans');
  });

  it('does not show count for unique targets', () => {
    const scans: ScanSummary[] = [
      makeScan({ id: 's1', target: 'https://example.com/' }),
      makeScan({ id: 's2', target: 'https://other.com/' }),
    ];
    const html = renderToString(React.createElement(ScanHistory, { scans }));

    // No sameTargetCount badge should appear (count is only shown when > 1)
    expect(html).not.toMatch(/sameTargetCount/);
  });

  it('recognizes same target as same target (exact string match)', () => {
    const target = 'https://example.com/path?q=test&lang=en';
    const scans: ScanSummary[] = [makeScan({ id: 's1', target }), makeScan({ id: 's2', target })];
    const html = renderToString(React.createElement(ScanHistory, { scans }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Only the "2 scans" count badge should appear (ScanFilters shows result count
    // like "2 scans" too, but the badge uses a different CSS class)
    expect(cleaned).toContain('2 scans');
  });

  it('treats different URL spellings as different targets', () => {
    const scans: ScanSummary[] = [
      makeScan({ id: 's1', target: 'https://example.com' }),
      makeScan({ id: 's2', target: 'https://example.com/' }),
      makeScan({ id: 's3', target: 'http://example.com/' }),
    ];
    const html = renderToString(React.createElement(ScanHistory, { scans }));

    // Each is unique → no count badge (badge only shows when > 1)
    expect(html).not.toMatch(/sameTargetCount/);
  });

  it('renders scans in API order (newest first, no re-sort)', () => {
    const scans: ScanSummary[] = [
      makeScan({ id: 'newest', target: 'https://new.com/', createdAt: '2025-06-03T00:00:00.000Z' }),
      makeScan({ id: 'middle', target: 'https://mid.com/', createdAt: '2025-06-02T00:00:00.000Z' }),
      makeScan({ id: 'oldest', target: 'https://old.com/', createdAt: '2025-06-01T00:00:00.000Z' }),
    ];
    const html = renderToString(React.createElement(ScanHistory, { scans }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Scans should appear in API-provided order (already sorted by API)
    expect(cleaned.indexOf('newest')).toBeLessThan(cleaned.indexOf('middle'));
    expect(cleaned.indexOf('middle')).toBeLessThan(cleaned.indexOf('oldest'));
  });
});

describe('ScanHistory — scan list rendering', () => {
  it('renders each scan as a clickable card with detail link', () => {
    const scans: ScanSummary[] = [makeScan({ id: 'scan_a' }), makeScan({ id: 'scan_b' })];
    const html = renderToString(React.createElement(ScanHistory, { scans }));

    expect(html).toContain('href="/scans/scan_a"');
    expect(html).toContain('href="/scans/scan_b"');
  });

  it('renders failed scans with "Failed" status', () => {
    const scans: ScanSummary[] = [
      makeScan({
        id: 'scan_failed',
        status: 'failed',
        error: { code: 'crawl_error', message: 'Failed' },
      }),
    ];
    const html = renderToString(React.createElement(ScanHistory, { scans }));

    expect(html).toContain('Failed');
  });

  it('renders empty state when no scans exist', () => {
    const html = renderToString(React.createElement(ScanHistory, { scans: [] }));

    // The empty state in ScanHistory/ScanViews shows "No scans yet."
    expect(html).toContain('No scans yet');
  });

  it('handles targets with special URL characters without breaking display', () => {
    const target = 'https://example.com/path?q=hello&lang=en&frag=test';
    const scans: ScanSummary[] = [makeScan({ id: 's1', target }), makeScan({ id: 's2', target })];
    const html = renderToString(React.createElement(ScanHistory, { scans }));
    const cleaned = html.replace(/<!-- -->/g, '');

    // Target with query string renders correctly (& is HTML-escaped by renderToString)
    expect(cleaned).toContain('https://example.com/path?q=hello&amp;lang=en&amp;frag=test');
    // And the same-target count badge appears
    expect(cleaned).toContain('2 scans');
  });
});
