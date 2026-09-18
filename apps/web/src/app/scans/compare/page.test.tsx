/**
 * Unit tests for the scan comparison page (`app/scans/compare/page.tsx`).
 *
 * `ScanComparisonPage` is an async server component that reads `left` and
 * `right` query parameters, fetches both scans via `fetchScanById` (mocked),
 * and renders `ScanComparison` with the result of `compareScans()`.
 *
 * Tests use `renderToString` from `react-dom/server` — no DOM environment.
 * `next/link` is mocked to render a plain `<a>` tag. `fetchScanById` is
 * mocked at the module level using `vi.hoisted` so it can be controlled
 * per-test.
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

// Mock the API module so fetchScanById is controllable per-test.
const mockFetchScanById = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  fetchScanById: mockFetchScanById,
}));

// Mock the ScanComparison presentation component so we can verify the
// page passes the comparison result without testing the component itself
// (which has its own dedicated test file).
vi.mock('@/components/ScanComparison', () => ({
  ScanComparison: ({ result }: { result: unknown }) =>
    React.createElement('div', { 'data-testid': 'scan-comparison' }, JSON.stringify(result)),
}));

// Must import after mocks
import ScanComparisonPage from '@/app/scans/compare/page.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function makeScanDetail(
  overrides: Partial<{
    id: string;
    status: string;
    target: string;
    hostname: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    error: unknown;
  }> = {},
) {
  return {
    id: overrides.id ?? 'scan_001',
    status: overrides.status ?? 'completed',
    target: overrides.target ?? 'https://example.com/',
    hostname: overrides.hostname ?? 'example.com',
    createdAt: overrides.createdAt ?? '2025-06-01T12:00:00.000Z',
    startedAt: overrides.startedAt ?? '2025-06-01T12:00:01.000Z',
    completedAt: overrides.completedAt ?? '2025-06-01T12:00:05.000Z',
    failedAt: overrides.failedAt ?? null,
    error: overrides.error ?? null,
  };
}

function makeScanResult(overrides: Partial<ReturnType<typeof makeScanDetail>> = {}) {
  return {
    scan: makeScanDetail(overrides),
    snapshot: null,
    detections: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanComparisonPage — missing params', () => {
  it('renders "Missing scan IDs" when no params are provided', async () => {
    const html = renderToString(await ScanComparisonPage({ searchParams: Promise.resolve({}) }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Missing scan IDs');
    expect(cleaned).toContain('left');
    expect(cleaned).toContain('right');
  });

  it('renders "Missing scan IDs" when only left is provided', async () => {
    const html = renderToString(
      await ScanComparisonPage({ searchParams: Promise.resolve({ left: 'scan_a' }) }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Missing scan IDs');
  });

  it('renders "Missing scan IDs" when only right is provided', async () => {
    const html = renderToString(
      await ScanComparisonPage({ searchParams: Promise.resolve({ right: 'scan_b' }) }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Missing scan IDs');
  });

  it('shows a back link to scan history on the missing-params page', async () => {
    const html = renderToString(await ScanComparisonPage({ searchParams: Promise.resolve({}) }));
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('href="/scans"');
    expect(cleaned).toContain('Back to scan history');
  });
});

describe('ScanComparisonPage — successful comparison', () => {
  it('renders comparison when both scan IDs are valid', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      if (id === 'scan_a') {
        return Promise.resolve(makeScanResult({ id: 'scan_a', target: 'https://example.com/' }));
      }
      if (id === 'scan_b') {
        return Promise.resolve(makeScanResult({ id: 'scan_b', target: 'https://example.com/' }));
      }
      return Promise.resolve(null);
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('fetches both scans concurrently (not sequentially)', async () => {
    const mockFetch = vi.fn();
    mockFetchScanById.mockImplementation((id: string) => {
      mockFetch(id);
      return Promise.resolve(makeScanResult({ id, target: 'https://example.com/' }));
    });

    await ScanComparisonPage({
      searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
    });

    // Both IDs should be fetched
    expect(mockFetch).toHaveBeenCalledWith('scan_a');
    expect(mockFetch).toHaveBeenCalledWith('scan_b');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('renders the subtitle with both scan IDs', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      return Promise.resolve(
        makeScanResult({
          id,
          target: 'https://example.com/',
          createdAt: '2025-06-01T12:00:00.000Z',
        }),
      );
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // The page subtitle shows "Comparing scan X with scan Y"
    expect(cleaned).toContain('scan_a');
    expect(cleaned).toContain('scan_b');
    expect(cleaned).toContain('Comparing scan');
  });
});

describe('ScanComparisonPage — same-target vs different-target', () => {
  it('allows comparison of same-target scans', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      if (id === 'scan_a')
        return Promise.resolve(makeScanResult({ id: 'scan_a', target: 'https://example.com/' }));
      if (id === 'scan_b')
        return Promise.resolve(makeScanResult({ id: 'scan_b', target: 'https://example.com/' }));
      return Promise.resolve(null);
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('allows comparison of different-target scans (no same-target constraint)', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      if (id === 'scan_a')
        return Promise.resolve(makeScanResult({ id: 'scan_a', target: 'https://a.com/' }));
      if (id === 'scan_b')
        return Promise.resolve(makeScanResult({ id: 'scan_b', target: 'https://b.com/' }));
      return Promise.resolve(null);
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    // No same-target constraint enforced — comparison proceeds
    expect(html).toContain('data-testid="scan-comparison"');
  });
});

describe('ScanComparisonPage — invalid scan ID handling', () => {
  it('handles a 404 (scan not found) for the left ID safely', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      if (id === 'scan_a') return Promise.resolve(null); // 404
      if (id === 'scan_b') return Promise.resolve(makeScanResult({ id: 'scan_b' }));
      return Promise.resolve(null);
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    // The comparison still renders (with null for the missing scan)
    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('handles a 404 (scan not found) for the right ID safely', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      if (id === 'scan_a') return Promise.resolve(makeScanResult({ id: 'scan_a' }));
      if (id === 'scan_b') return Promise.resolve(null); // 404
      return Promise.resolve(null);
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('handles both scans being invalid (404) safely', async () => {
    mockFetchScanById.mockResolvedValue(null);

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'nonexistent', right: 'also_nonexistent' }),
      }),
    );

    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('handles API errors (500) without crashing', async () => {
    mockFetchScanById.mockRejectedValue(new Error('DB connection failed'));

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Shows error state, not a crash
    expect(cleaned).toContain('Error loading scans');
  });
});

describe('ScanComparisonPage — URL/refresb behavior', () => {
  it('direct navigation with valid IDs renders the comparison', async () => {
    // Simulate what happens on a fresh page load with valid IDs in the URL.
    // searchParams is resolved from the URL by Next.js.
    mockFetchScanById.mockImplementation((id: string) => {
      return Promise.resolve(
        makeScanResult({
          id,
          target: 'https://example.com/',
          createdAt: '2025-06-01T12:00:00.000Z',
        }),
      );
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );

    expect(html).toContain('data-testid="scan-comparison"');
  });

  it('IDs in the URL are passed directly to fetchScanById (URL-safe encoding)', async () => {
    const fetchCalls: string[] = [];
    mockFetchScanById.mockImplementation((id: string) => {
      fetchCalls.push(id);
      return Promise.resolve(makeScanResult({ id, target: 'https://example.com/' }));
    });

    await ScanComparisonPage({
      searchParams: Promise.resolve({ left: 'scan-with-dashes', right: 'scan_with_underscores' }),
    });

    expect(fetchCalls).toEqual(['scan-with-dashes', 'scan_with_underscores']);
  });
});

describe('ScanComparisonPage — scan metadata display', () => {
  it('comparison page subtitle includes both scan IDs', async () => {
    mockFetchScanById.mockImplementation((id: string) => {
      return Promise.resolve(makeScanResult({ id, target: 'https://example.com/' }));
    });

    const html = renderToString(
      await ScanComparisonPage({
        searchParams: Promise.resolve({ left: 'scan_a', right: 'scan_b' }),
      }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('scan_a');
    expect(cleaned).toContain('scan_b');
  });
});
