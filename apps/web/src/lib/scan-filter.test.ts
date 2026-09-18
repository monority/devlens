/**
 * Unit tests for the pure scan-filtering module.
 *
 * These tests verify the filtering pipeline without React, HTTP, or a
 * DOM environment. The pipeline is: API result → search filter → status
 * filter → ordered list (no re-sorting).
 */

import { describe, it, expect } from 'vitest';
import { filterScans, isValidStatus, SCAN_STATUSES, statusLabel } from './scan-filter.js';
import type { ScanSummary } from './types.js';

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

function makeScanList(): ScanSummary[] {
  return [
    makeScan({ id: 's1', status: 'completed', target: 'https://example.com/' }),
    makeScan({ id: 's2', status: 'pending', target: 'https://foo.com/' }),
    makeScan({ id: 's3', status: 'running', target: 'https://bar.org/' }),
    makeScan({ id: 's4', status: 'failed', target: 'https://example.com/path' }),
    makeScan({ id: 's5', status: 'completed', target: 'https://blog.test/' }),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('filterScans', () => {
  it('returns all scans when no filters are applied', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: '', status: '' });
    expect(result).toHaveLength(5);
    expect(result.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
  });

  it('filters by URL substring (case-insensitive)', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: 'example.com', status: '' });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['s1', 's4']);
  });

  it('search is case-insensitive', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: 'EXAMPLE.COM', status: '' });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['s1', 's4']);
  });

  it('filters by status only', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: '', status: 'completed' });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['s1', 's5']);
  });

  it('combines search and status filters', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: 'example.com', status: 'failed' });
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('s4');
  });

  it('returns empty array when no scans match', () => {
    const scans = makeScanList();
    const result = filterScans(scans, { search: 'nonexistent', status: '' });
    expect(result).toHaveLength(0);
  });

  it('invalid status falls back to "All" (no status filter applied)', () => {
    // isValidStatus rejects 'invalid'; filterScans with an invalid status
    // string should be normalized before reaching filterScans.
    // Here we test that isValidStatus correctly rejects it.
    expect(isValidStatus('invalid')).toBe(false);
    expect(isValidStatus('completed')).toBe(true);
  });

  it('preserves original ordering (does not re-sort)', () => {
    const scans = makeScanList();
    // Filter that matches all
    const result = filterScans(scans, { search: '', status: '' });
    expect(result.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);

    // Filter that matches some — order should still match original
    const subset = [scans[0]!, scans[2]!, scans[4]!] as ScanSummary[];
    const result2 = filterScans(subset, { search: '', status: '' });
    expect(result2.map((s) => s.id)).toEqual(['s1', 's3', 's5']);
  });

  it('handles empty dataset', () => {
    const result = filterScans([], { search: '', status: '' });
    expect(result).toHaveLength(0);

    const result2 = filterScans([], { search: 'example', status: 'completed' });
    expect(result2).toHaveLength(0);
  });

  it('preserves deterministic ordering: createdAt DESC, id ASC tiebreaker', () => {
    // The repository orders scans by `createdAt DESC, scanId ASC`.
    // filterScans must preserve this order exactly — no re-sorting.
    // Equal timestamps are tie-broken by stable scanId (string ASC).
    const scans: ScanSummary[] = [
      // Newest first (already in API order)
      makeScan({ id: 's3', target: 'https://c.com/', createdAt: '2025-06-03T00:00:00.000Z' }),
      makeScan({ id: 's1', target: 'https://a.com/', createdAt: '2025-06-02T00:00:00.000Z' }),
      makeScan({ id: 's2', target: 'https://b.com/', createdAt: '2025-06-02T00:00:00.000Z' }),
      makeScan({ id: 's0', target: 'https://old.com/', createdAt: '2025-06-01T00:00:00.000Z' }),
    ];

    const result = filterScans(scans, { search: '', status: '' });

    // Order preserved: newest first, ties broken by id ASC
    expect(result.map((s) => s.id)).toEqual(['s3', 's1', 's2', 's0']);
  });
});

describe('SCAN_STATUSES', () => {
  it('contains exactly the four lifecycle statuses', () => {
    expect(SCAN_STATUSES).toEqual(['pending', 'running', 'completed', 'failed']);
  });

  it('statusLabel returns human-readable labels', () => {
    expect(statusLabel('pending')).toBe('Pending');
    expect(statusLabel('running')).toBe('Running');
    expect(statusLabel('completed')).toBe('Completed');
    expect(statusLabel('failed')).toBe('Failed');
    expect(statusLabel('unknown')).toBe('unknown');
  });
});
