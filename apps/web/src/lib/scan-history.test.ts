/**
 * Unit tests for the pure scan-history helpers.
 *
 * Tests verify same-target counting logic without React, HTTP, or DOM.
 */

import { describe, it, expect } from 'vitest';
import { countScansByTarget, getSameTargetCount } from './scan-history.js';
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
    makeScan({ id: 's1', target: 'https://example.com/', status: 'completed' }),
    makeScan({ id: 's2', target: 'https://example.com/', status: 'failed' }),
    makeScan({ id: 's3', target: 'https://example.com/', status: 'completed' }),
    makeScan({ id: 's4', target: 'https://foo.com/', status: 'completed' }),
    makeScan({ id: 's5', target: 'https://example.com/path', status: 'completed' }),
  ];
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('countScansByTarget', () => {
  it('counts scans grouped by target URL', () => {
    const scans = makeScanList();
    const counts = countScansByTarget(scans);

    expect(counts.get('https://example.com/')).toBe(3);
    expect(counts.get('https://foo.com/')).toBe(1);
    expect(counts.get('https://example.com/path')).toBe(1);
  });

  it('treats different URL spellings as different targets', () => {
    // Per spec: "Do NOT invent a new URL normalization algorithm."
    // The target string is used verbatim — identical to how the API stores it.
    const scans = [
      makeScan({ id: 's1', target: 'https://example.com' }),
      makeScan({ id: 's2', target: 'https://example.com/' }),
      makeScan({ id: 's3', target: 'http://example.com/' }),
    ];
    const counts = countScansByTarget(scans);

    expect(counts.get('https://example.com')).toBe(1);
    expect(counts.get('https://example.com/')).toBe(1);
    expect(counts.get('http://example.com/')).toBe(1);
  });

  it('handles an empty scan list', () => {
    const counts = countScansByTarget([]);
    expect(counts.size).toBe(0);
  });

  it('counts targets with special URL characters correctly', () => {
    const scans = [
      makeScan({ id: 's1', target: 'https://example.com/path?q=hello&lang=en' }),
      makeScan({ id: 's2', target: 'https://example.com/path?q=hello&lang=en' }),
    ];
    const counts = countScansByTarget(scans);

    expect(counts.get('https://example.com/path?q=hello&lang=en')).toBe(2);
  });

  it('counts across different statuses (completed + failed)', () => {
    const scans = [
      makeScan({ id: 's1', target: 'https://example.com/', status: 'completed' }),
      makeScan({ id: 's2', target: 'https://example.com/', status: 'failed' }),
      makeScan({ id: 's3', target: 'https://example.com/', status: 'pending' }),
    ];
    const counts = countScansByTarget(scans);

    expect(counts.get('https://example.com/')).toBe(3);
  });
});

describe('getSameTargetCount', () => {
  it('returns the count for a given scan target', () => {
    const scans = makeScanList();
    const scan = makeScan({ id: 's1', target: 'https://example.com/' });

    expect(getSameTargetCount(scan, scans)).toBe(3);
  });

  it('returns 1 for a unique target', () => {
    const scans = makeScanList();
    const scan = makeScan({ id: 's4', target: 'https://foo.com/' });

    expect(getSameTargetCount(scan, scans)).toBe(1);
  });
});
