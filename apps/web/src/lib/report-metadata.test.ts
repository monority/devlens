/**
 * Unit tests for the report metadata helper functions.
 *
 * These are pure functions — no React, HTTP, or database dependencies.
 * Tests verify that metadata is derived correctly from scan data and
 * that no internal errors or sensitive information leaks into metadata.
 */

import { describe, it, expect } from 'vitest';
import {
  scanReportTitle,
  scanReportDescription,
  generateReportMetadata,
  generateDetailMetadata,
  errorMetadata,
} from './report-metadata.js';
import type { ScanDetailResponse, ScanSummary } from './types.js';

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

function makeScanDetail(overrides: Partial<ScanDetailResponse['scan']> = {}): ScanDetailResponse {
  return {
    scan: makeScan(overrides),
    snapshot: null,
    detections: [],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('report-metadata', () => {
  it('derives page title from scan target', () => {
    const title = scanReportTitle({ target: 'https://example.com/' } as ScanSummary);
    expect(title).toBe('DevLens — https://example.com/');
  });

  it('generates correct metadata for a completed scan', () => {
    const result = makeScanDetail({ target: 'https://example.com/', status: 'completed' });
    const metadata = generateReportMetadata(result);

    expect(metadata.title).toBe('DevLens — https://example.com/');
    expect(metadata.description).toBe('Technology scan report from DevLens.');
  });

  it('generates safe metadata for a failed scan (no error details leaked)', () => {
    const result = makeScanDetail({
      target: 'https://example.com/',
      status: 'failed',
      error: { code: 'timeout', message: 'Request timed out after 30000ms' },
      failedAt: '2025-06-01T12:00:10.000Z',
    });
    const metadata = generateReportMetadata(result);

    // Title is derived from target, not error
    expect(metadata.title).toBe('DevLens — https://example.com/');
    expect(metadata.description).toBe('Technology scan report from DevLens.');
    // No error details in metadata
    expect(JSON.stringify(metadata)).not.toContain('timeout');
    expect(JSON.stringify(metadata)).not.toContain('Request timed out');
  });

  it('returns not-found metadata when scan is null', () => {
    const metadata = generateDetailMetadata(null);

    expect(metadata.title).toBe('DevLens — Scan Not Found');
    expect(metadata.description).toBe('The requested scan could not be found.');
  });

  it('returns error metadata', () => {
    const metadata = errorMetadata();
    expect(metadata.title).toBe('DevLens — Error');
    expect(metadata.description).toBe('An error occurred while loading the scan report.');
  });

  it('scanReportDescription is generic (no scan data)', () => {
    expect(scanReportDescription()).toBe('Technology scan report from DevLens.');
  });
});
