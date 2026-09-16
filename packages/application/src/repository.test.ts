import { describe, it, expect } from 'vitest';
import { persistResult } from './repository.js';
import type { ScanResultRepository } from './repository.js';
import type { ScanResult } from './orchestrator.js';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  startScan,
  completeScan,
  failScan,
} from '@devlens/core';
import type { Scan, SiteSnapshot, ScanTarget } from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

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
    html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
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

function makeCompletedScan(): Scan {
  const pending = makeScan();
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return completeScan(running, createTimestampFromString('2025-06-01T11:02:00.000Z'));
}

function makeFailedScan(): Scan {
  const pending = makeScan();
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return failScan(
    running,
    { code: 'timeout', message: 'Request timed out' },
    createTimestampFromString('2025-06-01T11:02:00.000Z'),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('persistResult', () => {
  it('calls repository.save with the given ScanResult', async () => {
    const saved: ScanResult[] = [];
    const repo: ScanResultRepository = {
      save: async (result: ScanResult) => {
        saved.push(result);
      },
    };
    const result: ScanResult = { scan: makeCompletedScan(), snapshot: makeSnapshot() };

    await persistResult(result, repo);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toBe(result);
  });

  it('propagates errors from the repository without swallowing them', async () => {
    const repo: ScanResultRepository = {
      save: async () => {
        throw new Error('Database connection failed');
      },
    };
    const result: ScanResult = { scan: makeCompletedScan(), snapshot: makeSnapshot() };

    await expect(persistResult(result, repo)).rejects.toThrow('Database connection failed');
  });

  it('passes through the result for both completed and failed scans', async () => {
    const saved: ScanResult[] = [];
    const repo: ScanResultRepository = {
      save: async (result: ScanResult) => {
        saved.push(result);
      },
    };

    const completed: ScanResult = { scan: makeCompletedScan(), snapshot: makeSnapshot() };
    const failed: ScanResult = { scan: makeFailedScan(), snapshot: null };

    await persistResult(completed, repo);
    await persistResult(failed, repo);

    expect(saved).toEqual([completed, failed]);
  });
});
