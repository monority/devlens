import { describe, it, expect } from 'vitest';
import { formatResult } from './main.js';
import { persistResult } from '@devlens/application';
import { InMemoryScanResultRepository } from '@devlens/database';
import type { ScanResult } from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  startScan,
  completeScan,
  failScan,
  createHttpStatus,
} from '@devlens/core';
import type { Scan, ScanTarget, SiteSnapshot, ScanError } from '@devlens/core';

// ─── Helpers ───────────────────────────────────────────────────────

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

function makeCompletedScan(): Scan {
  const pending = makeScan();
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return completeScan(running, createTimestampFromString('2025-06-01T11:02:00.000Z'));
}

function makeFailedScan(error: ScanError): Scan {
  const pending = makeScan();
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return failScan(running, error, createTimestampFromString('2025-06-01T11:02:00.000Z'));
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('formatResult', () => {
  it('formats a completed scan as a success message', () => {
    const result: ScanResult = {
      scan: makeCompletedScan(),
      snapshot: makeSnapshot(),
      detections: [],
    };

    expect(formatResult(result)).toBe('Scan scan_001 completed successfully');
  });

  it('formats a failed scan with error code and message', () => {
    const result: ScanResult = {
      scan: makeFailedScan({ code: 'timeout', message: 'Request timed out after 10ms' }),
      snapshot: null,
      detections: [],
    };

    expect(formatResult(result)).toBe(
      'Scan scan_001 failed (timeout): Request timed out after 10ms',
    );
  });
});

describe('persistence integration', () => {
  it('persists a completed ScanResult via the in-memory repository', async () => {
    const repository = new InMemoryScanResultRepository();
    const result: ScanResult = {
      scan: makeCompletedScan(),
      snapshot: makeSnapshot(),
      detections: [],
    };

    await persistResult(result, repository);

    expect(repository.getScan(result.scan.id)).toBe(result.scan);
    expect(repository.getSnapshot(result.scan.id)).toBe(result.snapshot);
  });

  it('persists a failed ScanResult without a snapshot', async () => {
    const repository = new InMemoryScanResultRepository();
    const result: ScanResult = {
      scan: makeFailedScan({ code: 'timeout', message: 'Request timed out after 10ms' }),
      snapshot: null,
      detections: [],
    };

    await persistResult(result, repository);

    expect(repository.getScan(result.scan.id)).toBe(result.scan);
    expect(repository.getSnapshot(result.scan.id)).toBeUndefined();
  });
});
