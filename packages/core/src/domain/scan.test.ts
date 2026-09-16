import { describe, it, expect } from 'vitest';
import { createScan, startScan, completeScan, failScan } from './scan';
import {
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
} from './value-objects';
import type { ScanTarget } from './scan';

// ─── Helpers ───────────────────────────────────────────────────────

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('createScan', () => {
  it('creates a scan in the pending state', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );

    expect(scan.id).toBe('scan_001');
    expect(scan.status.type).toBe('pending');
    expect(scan.createdAt).toBe('2025-06-01T10:00:00.000Z');
  });

  it('stores the target', () => {
    const target = makeTarget();
    const scan = createScan(
      createScanId('scan_002'),
      target,
      createTimestampFromString('2025-01-01T00:00:00.000Z'),
    );
    expect(scan.target).toBe(target);
  });
});

describe('startScan', () => {
  it('transitions pending → running', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const started = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));

    expect(started.status.type).toBe('running');
    expect(started.status.startedAt).toBe('2025-06-01T10:01:00.000Z');
  });

  it('throws when starting a running scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const started = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    expect(() => startScan(started, createTimestampFromString('2025-06-01T10:02:00.000Z'))).toThrow(
      'Cannot start a scan in "running" status',
    );
  });

  it('throws when starting a completed scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const completed = completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));
    expect(() =>
      startScan(completed, createTimestampFromString('2025-06-01T10:06:00.000Z')),
    ).toThrow('Cannot start a scan in "completed" status');
  });
});

describe('completeScan', () => {
  it('transitions running → completed with a completion timestamp', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const completed = completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));

    expect(completed.status.type).toBe('completed');
    expect(completed.status.completedAt).toBe('2025-06-01T10:05:00.000Z');
  });

  it('completed ScanStatus does not contain a snapshot', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const completed = completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));

    expect(completed.status.type).toBe('completed');
    // The completed status must NOT carry a snapshot — lifecycle != result.
    expect('snapshot' in completed.status).toBe(false);
  });

  it('throws when completing a pending scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    expect(() => completeScan(scan, createTimestampFromString('2025-06-01T10:05:00.000Z'))).toThrow(
      'Cannot complete a scan in "pending" status',
    );
  });

  it('throws when completing a completed scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const completed = completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));
    expect(() =>
      completeScan(completed, createTimestampFromString('2025-06-01T10:06:00.000Z')),
    ).toThrow('Cannot complete a scan in "completed" status');
  });
});

describe('failScan', () => {
  const error = { code: 'CRAWL_ERROR', message: 'Failed to load page' };

  it('transitions pending → failed', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const failed = failScan(scan, error, createTimestampFromString('2025-06-01T10:02:00.000Z'));

    expect(failed.status.type).toBe('failed');
    expect(failed.status.failedAt).toBe('2025-06-01T10:02:00.000Z');
    expect(failed.status.error).toEqual(error);
  });

  it('transitions running → failed', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const failed = failScan(running, error, createTimestampFromString('2025-06-01T10:03:00.000Z'));

    expect(failed.status.type).toBe('failed');
    expect(failed.status.error).toEqual(error);
  });

  it('throws when failing a completed scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const completed = completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));
    expect(() =>
      failScan(completed, error, createTimestampFromString('2025-06-01T10:06:00.000Z')),
    ).toThrow('Cannot fail a scan in "completed" status');
  });

  it('throws when failing an already failed scan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const failed = failScan(scan, error, createTimestampFromString('2025-06-01T10:02:00.000Z'));
    expect(() =>
      failScan(failed, error, createTimestampFromString('2025-06-01T10:03:00.000Z')),
    ).toThrow('Cannot fail a scan in "failed" status');
  });
});

describe('Scan immutability', () => {
  it('does not mutate the original scan on startScan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const originalStatus = scan.status;
    startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    expect(scan.status).toBe(originalStatus);
  });

  it('does not mutate the original scan on completeScan', () => {
    const scan = createScan(
      createScanId('scan_001'),
      makeTarget(),
      createTimestampFromString('2025-06-01T10:00:00.000Z'),
    );
    const running = startScan(scan, createTimestampFromString('2025-06-01T10:01:00.000Z'));
    const originalStatus = running.status;
    completeScan(running, createTimestampFromString('2025-06-01T10:05:00.000Z'));
    expect(running.status).toBe(originalStatus);
  });
});

describe('ScanTarget semantics', () => {
  it('preserves the originally requested url and associated hostname', () => {
    const target: ScanTarget = {
      url: createUrl('https://example.com'),
      hostname: createHostname('example.com'),
    };
    expect(target.url).toBe('https://example.com');
    expect(target.hostname).toBe('example.com');
  });

  it('url and hostname may differ (redirects affect snapshot, not target)', () => {
    const target: ScanTarget = {
      url: createUrl('https://example.com/page'),
      hostname: createHostname('example.com'),
    };
    expect(target.url).not.toBe(target.hostname);
  });
});
