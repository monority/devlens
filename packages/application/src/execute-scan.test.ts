import { describe, it, expect, vi } from 'vitest';
import { executeScan } from './execute-scan.js';
import type { Crawler } from '@devlens/crawler';
import type { Detector } from '@devlens/detectors';
import type { ScanResultRepository } from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';
import type { Scan, ScanTarget, SiteSnapshot } from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

const FIXED_DATE = new Date('2025-06-01T12:00:00.000Z');

/** A mock Detector that returns an empty array (no detections). */
const mockDetector: Detector = { detect: () => [] };

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

function makeScan(): Scan {
  return createScan(
    createScanId('scan_001'),
    makeTarget(),
    createTimestampFromString('2025-06-01T11:00:00.000Z'),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('executeScan', () => {
  it('runs a scan and persists the result', async () => {
    const scan = makeScan();
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: async () => snapshot };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const result = await executeScan(scan, crawler, mockDetector, repository, FIXED_DATE);

    // Scan was run (completed)
    expect(result.scan.status.type).toBe('completed');
    expect(result.snapshot).toBe(snapshot);
    expect(result.detections).toEqual([]);

    // Result was persisted
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledWith(result);
  });

  it('persists a failed scan (crawler error) without throwing', async () => {
    const scan = makeScan();
    const error = new Error('DNS resolution failed');
    const crawler: Crawler = {
      crawl: async () => {
        throw error;
      },
    };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const result = await executeScan(scan, crawler, mockDetector, repository, FIXED_DATE);

    // Scan failed at domain level
    expect(result.scan.status.type).toBe('failed');
    expect(result.scan.status.error.code).toBe('UNKNOWN_ERROR');
    expect(result.snapshot).toBeNull();
    expect(result.detections).toEqual([]);

    // Failed scan was still persisted
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('propagates persistence failures as infrastructure errors', async () => {
    const scan = makeScan();
    const crawler: Crawler = { crawl: async () => makeSnapshot() };
    const repository: ScanResultRepository = {
      save: vi.fn().mockRejectedValue(new Error('Connection refused')),
    };

    // The infrastructure error should propagate, NOT be swallowed
    await expect(executeScan(scan, crawler, mockDetector, repository, FIXED_DATE)).rejects.toThrow(
      'Connection refused',
    );
  });

  it('persists before returning (persistence error is not swallowed by scan success)', async () => {
    const scan = makeScan();
    const crawler: Crawler = { crawl: async () => makeSnapshot() };
    const repository: ScanResultRepository = {
      save: vi.fn().mockRejectedValue(new Error('DB down')),
    };

    await expect(executeScan(scan, crawler, mockDetector, repository, FIXED_DATE)).rejects.toThrow(
      'DB down',
    );
  });
});
