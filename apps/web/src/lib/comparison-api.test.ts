/**
 * Tests for the comparison adapter (`comparison-api.ts`) — the bridge
 * between the HTTP API client and the pure `compareScans()`.
 *
 * `fetchScanById` (HTTP) is mocked so we only exercise the adapter's
 * mapping/delegation logic (§13 "API — Tester le mapping de comparaison"),
 * never the network.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScanDetailResponse, DetectionResponse } from './types.js';
import { compareScanResults, fetchComparison } from './comparison-api.js';

// Mock the HTTP client so `fetchComparison` is fully isolated.
const mockFetchScanById = vi.hoisted(() => vi.fn());
vi.mock('./api.js', () => ({
  fetchScanById: mockFetchScanById,
}));

function makeScan(id: string, detections: DetectionResponse[]): ScanDetailResponse {
  return {
    scan: {
      id,
      status: 'completed',
      target: 'https://example.com/',
      hostname: 'example.com',
      createdAt: '2025-06-01T12:00:00.000Z',
      startedAt: null,
      completedAt: '2025-06-01T12:00:05.000Z',
      failedAt: null,
      error: null,
    },
    snapshot: null,
    detections,
  };
}

describe('comparison-api — compareScanResults (pure mapping)', () => {
  it('maps an already-fetched pair into a structured DetectionDiff', () => {
    const left = makeScan('s1', [
      {
        technology: { id: 'react', name: 'React', category: 'frontend' },
        confidence: 95,
        evidence: [],
        version: '6.4.2',
      },
    ]);
    const right = makeScan('s2', [
      {
        technology: { id: 'react', name: 'React', category: 'frontend' },
        confidence: 95,
        evidence: [],
        version: '6.5.1',
      },
    ]);

    const result = compareScanResults({ left, right });

    expect(result.hasBoth).toBe(true);
    expect(result.leftNotFound).toBe(false);
    expect(result.rightNotFound).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]!.kind).toBe('version_changed');
    expect(result.versionChanges).toHaveLength(1);
    expect(result.changes[0]!.version.before).toBe('6.4.2');
    expect(result.changes[0]!.version.after).toBe('6.5.1');
  });
});

describe('comparison-api — fetchComparison (HTTP adapter)', () => {
  beforeEach(() => mockFetchScanById.mockReset());

  it('fetches both scans concurrently and delegates to compareScans', async () => {
    mockFetchScanById.mockImplementation((id: string) => Promise.resolve(makeScan(id, [])));

    const result = await fetchComparison('left-id', 'right-id');

    expect(mockFetchScanById).toHaveBeenCalledTimes(2);
    expect(mockFetchScanById).toHaveBeenCalledWith('left-id');
    expect(mockFetchScanById).toHaveBeenCalledWith('right-id');
    expect(result.leftNotFound).toBe(false);
    expect(result.rightNotFound).toBe(false);
    expect(result.changes).toHaveLength(0);
  });

  it('treats a 404 (null) for one scan as a not-found flag, not an error', async () => {
    mockFetchScanById.mockImplementation((id: string) =>
      id === 'left-id' ? Promise.resolve(null) : Promise.resolve(makeScan(id, [])),
    );

    const result = await fetchComparison('left-id', 'right-id');

    expect(result.leftNotFound).toBe(true);
    expect(result.rightNotFound).toBe(false);
    expect(result.hasBoth).toBe(false);
    expect(result.hasChanges).toBe(false);
  });
});
