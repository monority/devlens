/**
 * Unit tests for the pure helper functions in `comparison-selector.ts`.
 *
 * These functions have no side effects and no dependencies on React,
 * HTTP, or the DOM — they can be tested directly in the node
 * environment without any mocking.
 */

import { describe, it, expect } from 'vitest';
import {
  isComparable,
  getComparableScans,
  buildCompareUrl,
  isValidSelection,
} from './comparison-selector';
import type { ScanSummary } from './types.js';

function makeScan(overrides: Partial<ScanSummary> = {}): ScanSummary {
  return {
    id: overrides.id ?? 'scan_1',
    status: overrides.status ?? 'completed',
    target: overrides.target ?? 'https://example.com/',
    hostname: overrides.hostname ?? 'example.com',
    createdAt: overrides.createdAt ?? '2025-06-01T12:00:00.000Z',
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? '2025-06-01T12:00:05.000Z',
    failedAt: overrides.failedAt ?? null,
    error: overrides.error ?? null,
  };
}

describe('isComparable', () => {
  it('returns true for completed scans', () => {
    expect(isComparable(makeScan({ status: 'completed' }))).toBe(true);
  });

  it('returns false for pending scans', () => {
    expect(isComparable(makeScan({ status: 'pending' }))).toBe(false);
  });

  it('returns false for running scans', () => {
    expect(isComparable(makeScan({ status: 'running' }))).toBe(false);
  });

  it('returns false for failed scans', () => {
    expect(isComparable(makeScan({ status: 'failed' }))).toBe(false);
  });

  it('returns false for unknown statuses', () => {
    expect(isComparable(makeScan({ status: 'archived' }))).toBe(false);
  });
});

describe('getComparableScans', () => {
  it('returns only completed scans', () => {
    const scans = [
      makeScan({ id: 'a', status: 'completed' }),
      makeScan({ id: 'b', status: 'running' }),
      makeScan({ id: 'c', status: 'completed' }),
      makeScan({ id: 'd', status: 'failed' }),
    ];

    const result = getComparableScans(scans);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns empty array when no scans are completed', () => {
    const scans = [makeScan({ status: 'pending' }), makeScan({ status: 'failed' })];
    expect(getComparableScans(scans)).toHaveLength(0);
  });

  it('preserves the original order of completed scans', () => {
    const scans = [
      makeScan({ id: 'a', status: 'completed' }),
      makeScan({ id: 'b', status: 'running' }),
      makeScan({ id: 'c', status: 'completed' }),
      makeScan({ id: 'd', status: 'completed' }),
    ];
    const result = getComparableScans(scans);
    expect(result.map((s) => s.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('buildCompareUrl', () => {
  it('builds URL with left and right query params', () => {
    expect(buildCompareUrl('scan_a', 'scan_b')).toBe('/scans/compare?left=scan_a&right=scan_b');
  });

  it('URL-encodes special characters in scan IDs', () => {
    expect(buildCompareUrl('scan:a', 'scan b')).toBe('/scans/compare?left=scan%3Aa&right=scan+b');
  });

  it('builds the same param order every time', () => {
    // Deterministic: left always comes before right in the URL.
    expect(buildCompareUrl('z', 'a')).toBe('/scans/compare?left=z&right=a');
  });
});

describe('isValidSelection', () => {
  it('returns true when both left and right are set and distinct', () => {
    expect(isValidSelection('a', 'b')).toBe(true);
  });

  it('returns false when left is null', () => {
    expect(isValidSelection(null, 'b')).toBe(false);
  });

  it('returns false when right is null', () => {
    expect(isValidSelection('a', null)).toBe(false);
  });

  it('returns false when left and right are the same', () => {
    expect(isValidSelection('a', 'a')).toBe(false);
  });

  it('returns false when both are null', () => {
    expect(isValidSelection(null, null)).toBe(false);
  });
});

// ─── Selection gate scenarios (Step 58 spec) ────────────────────────
//
// These tests verify the end-to-end selection rules that the
// ScanComparisonSelector component relies on. They document the
// deterministic selection behavior:
//   - 0 selected → disabled
//   - 1 selected → disabled (need a second)
//   - 2 selected → enabled
//   - same scan selected twice → disabled (prevented by same-scan protection)

describe('selection gate scenarios', () => {
  it('0 selected → comparison action disabled (both null)', () => {
    expect(isValidSelection(null, null)).toBe(false);
  });

  it('1 selected → comparison action disabled (only left set)', () => {
    expect(isValidSelection('scan_a', null)).toBe(false);
  });

  it('1 selected → comparison action disabled (only right set)', () => {
    expect(isValidSelection(null, 'scan_b')).toBe(false);
  });

  it('2 distinct scans selected → comparison action enabled', () => {
    expect(isValidSelection('scan_a', 'scan_b')).toBe(true);
  });

  it('same scan selected as both left and right → prevented', () => {
    expect(isValidSelection('scan_a', 'scan_a')).toBe(false);
  });
});
