/**
 * Regression tests for the technology detail page (`app/technologies/[id]/page.tsx`).
 *
 * The page is an async server component. It only fetches via the mocked
 * `getAllScanResults` boundary; the rest of the pipeline (`scanResultToSummary`
 * for cards, `technologyDetectionHistory` + the timeline) runs for real, so
 * these tests lock the wiring (Step 88): full `ScanResult[]` retained,
 * `ScanSummary[]` derived for the "Detected in scans" cards, and the detection
 * timeline projected below it.
 *
 * `next/link` is mocked to a plain `<a>` (no router context); the real
 * `next/navigation` `notFound` is never called because the catalog lookup
 * returns a technology.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { ScanResult } from '@devlens/application';
import type { Detection } from '@devlens/core';

// ─── Mocks ──────────────────────────────────────────────────────────

const mockGetAllScanResults = vi.hoisted(() => vi.fn());
const mockGetTechnologyById = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}));

// Keep `scanResultToSummary` real; only stub the database fetch boundary.
vi.mock('@/lib/scan-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/scan-data')>();
  return { ...actual, getAllScanResults: mockGetAllScanResults };
});

// Only stub the catalog lookup (returns a known technology).
vi.mock('@/lib/technology-catalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/technology-catalog')>();
  return { ...actual, getTechnologyById: mockGetTechnologyById };
});

// Must import after mocks.
import TechnologyDetailPage from '@/app/technologies/[id]/page.js';

// ─── Fixtures ────────────────────────────────────────────────────────

function makeScanResult(
  id: string,
  createdAt: string,
  completedAt: string,
  detections: Detection[],
): ScanResult {
  return {
    scan: {
      id,
      createdAt,
      target: { url: 'https://example.com/', hostname: 'example.com' },
      status: { type: 'completed', completedAt },
    },
    snapshot: null,
    detections,
  } as unknown as ScanResult;
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
    mockGetAllScanResults.mockResolvedValue([
      makeScanResult('scan_001', '2025-06-01T12:00:00.000Z', '2025-06-01T12:00:05.000Z', [
        makeDetection('nginx', 80, [{ type: 'http_header', name: 'Server', value: 'nginx' }]),
      ]),
    ]);
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
  });

  it('renders nothing from the timeline when no scan detected the technology', async () => {
    mockGetAllScanResults.mockResolvedValue([
      makeScanResult('scan_001', '2025-06-01T12:00:00.000Z', '2025-06-01T12:00:05.000Z', [
        makeDetection('react', 95, [{ type: 'http_header', name: 'Server', value: 'React' }]),
      ]),
    ]);

    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    // TechnologyDetectedInScans empty state is still rendered.
    expect(cleaned).toContain('No scans have detected this technology yet.');
    // Timeline renders nothing (component returns null for []).
    expect(cleaned).not.toContain('Detection history');
  });

  it('renders an error state when scan data cannot be loaded', async () => {
    mockGetAllScanResults.mockRejectedValue(new Error('db down'));

    const element = await TechnologyDetailPage({
      params: Promise.resolve({ id: 'nginx' }),
    });
    const html = renderToString(element);
    const cleaned = html.replace(/<!-- -->/g, '');

    // fetchDetectedScans returns null → TechnologyDetectedInScans error state.
    expect(cleaned).toContain('Unable to load scan data for this technology.');
    // No timeline when data is unavailable.
    expect(cleaned).not.toContain('Detection history');
  });
});
