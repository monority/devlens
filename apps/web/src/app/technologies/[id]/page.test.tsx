/**
 * Regression tests for the technology detail page (`app/technologies/[id]/page.tsx`).
 *
 * The page is an async server component. It only fetches via the mocked
 * `fetchScansByTechnology` boundary (the `GET /api/scans?technologyId=...`
 * endpoint); the rest of the pipeline (`technologyDetectionHistory` +
 * timeline, `TechnologyDetectedInScans` cards, Step 89 summary) runs for real,
 * so these tests lock the wiring (Step 88): the API returns
 * `TechnologyScanSummary[]` (flat scan + detections), `ScanSummary[]` is
 * derived for the "Detected in scans" cards, and the detection timeline is
 * projected below it.
 *
 * `next/link` is mocked to a plain `<a>` (no router context); the real
 * `next/navigation` `notFound` is never called because the catalog lookup
 * returns a technology.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { Detection } from '@devlens/core';
import type { TechnologyScanSummary } from '@/lib/types';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockFetchScansByTechnology = vi.hoisted(() => vi.fn());
const mockGetTechnologyById = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Stub the API boundary so the page is exercised without a running server/DB.
vi.mock('@/lib/api', () => ({
  fetchScansByTechnology: mockFetchScansByTechnology,
}));

// Only stub the catalog lookup (returns a known technology).
vi.mock('@/lib/technology-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/technology-catalog')>();
  return { ...actual, getTechnologyById: mockGetTechnologyById };
});

// Must import after mocks.
import TechnologyDetailPage from '@/app/technologies/[id]/page.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeTechnologyScanSummary(
  id: string,
  createdAt: string,
  completedAt: string,
  detections: Detection[],
): TechnologyScanSummary {
  return {
    scan: {
      id,
      createdAt,
      target: 'https://example.com/',
      hostname: 'example.com',
      status: 'completed',
      startedAt: null,
      completedAt,
      failedAt: null,
      error: null,
    },
    detections,
  };
}

function makeDetection(id: string, confidence: number, evidence: Detection['evidence']): Detection {
  return {
    technology: { id, name: id, category: 'server' },
    confidence,
    evidence,
  } as unknown as Detection;
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('TechnologyDetailPage — wiring (Step 88)', () => {
  beforeEach(() => {
    mockGetTechnologyById.mockReturnValue({
      id: 'nginx',
      name: 'nginx',
      category: 'server',
      description: 'A high-performance web server.',
    });
    mockFetchScansByTechnology.mockResolvedValue({
      scans: [
        makeTechnologyScanSummary(
          'scan_001',
          '2025-06-01T12:00:00.000Z',
          '2025-06-01T12:00:05.000Z',
          [makeDetection('nginx', 80, [{ type: 'http_header', name: 'Server', value: 'nginx' }])],
        ),
      ],
    });
  });

  it('renders the technology header, the detected-in-scans cards, and the timeline', async () => {
    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    // Technology metadata (from the catalog).
    expect(cleaned).toContain('A high-performance web server.');

    // "Detected in scans" cards (ScanSummary[] derived for ScanCard).
    expect(cleaned).toContain('Detected in 1 scan');
    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('Completed');

    // Detection history timeline (Step 88) projected from the real transformer.
    expect(cleaned).toContain('Detection history');
    expect(cleaned).toContain('href="/scans/scan_001"');
    expect(cleaned).toContain('80'); // confidence preserved exactly
    expect(cleaned).toContain('Direct');
    expect(cleaned).toContain('Valid');

    // Step 89 compact summary, placed immediately before the timeline: the
    // single detected scan yields one observation ⇒ indeterminate.
    expect(cleaned).toContain('Detection history summary');
    expect(cleaned).toContain('Latest confidence');
    expect(cleaned).toContain('First detected');
    expect(cleaned).toContain('Last detected');
    expect(cleaned).toContain('Indeterminate');
  });

  it('renders nothing from the timeline when no scan detected the technology', async () => {
    // The endpoint filters server-side; a technology with no detected scans
    // yields an empty payload (the page never sees the non-matching scan).
    mockFetchScansByTechnology.mockResolvedValue({ scans: [] });

    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    // TechnologyDetectedInScans empty state is still rendered.
    expect(cleaned).toContain('No scans have detected this technology yet.');
    // Timeline renders nothing (component returns null for []) — and so does
    // the Step 89 summary (it disappears when there is no history).
    expect(cleaned).not.toContain('Detection history');
    expect(cleaned).not.toContain('Detection history summary');
  });

  it('renders an error state when scan data cannot be loaded', async () => {
    mockFetchScansByTechnology.mockRejectedValue(new Error('api unavailable'));

    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    // fetchDetectedScansPage returns null => TechnologyDetectedInScans error state.
    expect(cleaned).toContain('Unable to load scan data for this technology.');
    // No timeline and no summary when data is unavailable.
    expect(cleaned).not.toContain('Detection history');
    expect(cleaned).not.toContain('Detection history summary');
  });

  it('renders a "Load more" button when the first page has more results', async () => {
    mockFetchScansByTechnology.mockResolvedValue({
      scans: [
        makeTechnologyScanSummary(
          'scan_001',
          '2025-06-01T12:00:00.000Z',
          '2025-06-01T12:00:05.000Z',
          [makeDetection('nginx', 80, [{ type: 'http_header', name: 'Server', value: 'nginx' }])],
        ),
      ],
      nextCursor: 'next-page-cursor',
      hasMore: true,
      summary: { scanCount: 3, firstDetectedAt: '2025-06-01T12:00:00.000Z' },
    });

    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Load more');
  });
});
