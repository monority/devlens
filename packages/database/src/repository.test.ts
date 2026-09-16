import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryScanResultRepository } from './repository.js';
import { snapshots } from './schema.js';
import type { Scan, SiteSnapshot, ScanTarget, ScanId, Resource, Detection } from '@devlens/core';
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

// ─── Test helpers ───────────────────────────────────────────────────

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  const base: SiteSnapshot = {
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
  return { ...base, ...overrides };
}

function makeScan(id: string = 'scan_001'): Scan {
  return createScan(
    createScanId(id),
    makeTarget(),
    createTimestampFromString('2025-06-01T11:00:00.000Z'),
  );
}

function makeCompletedScan(id: string = 'scan_001'): Scan {
  const pending = makeScan(id);
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return completeScan(running, createTimestampFromString('2025-06-01T11:02:00.000Z'));
}

function makeFailedScan(id: string = 'scan_001'): Scan {
  const pending = makeScan(id);
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return failScan(
    running,
    { code: 'timeout', message: 'Request timed out' },
    createTimestampFromString('2025-06-01T11:02:00.000Z'),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('InMemoryScanResultRepository', () => {
  let repo: InMemoryScanResultRepository;

  beforeEach(() => {
    repo = new InMemoryScanResultRepository();
  });

  describe('save', () => {
    it('persists a completed scan and its snapshot', async () => {
      const scan = makeCompletedScan();
      const snapshot = makeSnapshot();

      await repo.save({ scan, snapshot, detections: [] });

      expect(repo.getScan(scan.id)).toBe(scan);
      expect(repo.getSnapshot(scan.id)).toBe(snapshot);
      expect(repo.getDetections(scan.id)).toEqual([]);
      expect(repo.count()).toBe(1);
    });

    it('persists a failed scan without a snapshot', async () => {
      const scan = makeFailedScan();

      await repo.save({ scan, snapshot: null, detections: [] });

      expect(repo.getScan(scan.id)).toBe(scan);
      expect(repo.getSnapshot(scan.id)).toBeUndefined();
      expect(repo.count()).toBe(1);
    });

    it('overwrites when the same scan ID is saved again', async () => {
      const scanId: ScanId = createScanId('scan_001');

      // First: completed scan with snapshot
      const completedScan = makeCompletedScan();
      const snapshot = makeSnapshot();
      await repo.save({ scan: completedScan, snapshot, detections: [] });
      expect(repo.getSnapshot(scanId)).toBe(snapshot);
      expect(repo.getDetections(scanId)).toEqual([]);

      // Second: failed scan (same ID), no snapshot
      const failedScan = makeFailedScan();
      await repo.save({ scan: failedScan, snapshot: null, detections: [] });
      expect(repo.getScan(scanId)).toBe(failedScan);
      expect(repo.getSnapshot(scanId)).toBeUndefined();
      expect(repo.getDetections(scanId)).toBeUndefined();
    });

    it('persists multiple scans independently', async () => {
      const scan1 = makeScan('scan_001');
      const scan2 = makeScan('scan_002');

      await repo.save({ scan: scan1, snapshot: null, detections: [] });
      await repo.save({ scan: scan2, snapshot: null, detections: [] });

      expect(repo.getScan(createScanId('scan_001'))).toBe(scan1);
      expect(repo.getScan(createScanId('scan_002'))).toBe(scan2);
      expect(repo.count()).toBe(2);
    });
  });

  describe('idempotence', () => {
    it('is idempotent: saving the same successful result twice does not duplicate or corrupt', async () => {
      const scan = makeCompletedScan();
      const snapshot = makeSnapshot();
      const detections: Detection[] = [];
      const result = { scan, snapshot, detections };

      await repo.save(result);
      await repo.save(result);

      expect(repo.count()).toBe(1);
      expect(repo.getScan(scan.id)).toBe(scan);
      expect(repo.getSnapshot(scan.id)).toBe(snapshot);
      expect(repo.getDetections(scan.id)).toEqual([]);
    });

    it('is idempotent: saving the same failed result twice does not duplicate or corrupt', async () => {
      const scan = makeFailedScan();
      const result = { scan, snapshot: null, detections: [] as Detection[] };

      await repo.save(result);
      await repo.save(result);

      expect(repo.count()).toBe(1);
      expect(repo.getScan(scan.id)).toBe(scan);
      expect(repo.getSnapshot(scan.id)).toBeUndefined();
      expect(repo.getDetections(scan.id)).toBeUndefined();
    });

    it('does not leave stale snapshot or detections from a previous completed scan', async () => {
      const scanId: ScanId = createScanId('scan_001');

      // First: completed scan with snapshot
      const completedScan = makeCompletedScan();
      const snapshot = makeSnapshot();
      await repo.save({ scan: completedScan, snapshot, detections: [] });
      expect(repo.getSnapshot(scanId)).toBe(snapshot);

      // Second: failed scan (same ID) — stale data should be cleared
      const failedScan = makeFailedScan();
      await repo.save({ scan: failedScan, snapshot: null, detections: [] });
      expect(repo.getSnapshot(scanId)).toBeUndefined();
      expect(repo.getDetections(scanId)).toBeUndefined();

      // Third: re-save the completed scan — stale data should be restored
      await repo.save({ scan: completedScan, snapshot, detections: [] });
      expect(repo.getSnapshot(scanId)).toBe(snapshot);
    });
  });

  describe('clear', () => {
    it('removes all persisted data', async () => {
      const scan = makeCompletedScan();
      await repo.save({ scan, snapshot: makeSnapshot(), detections: [] });
      expect(repo.count()).toBe(1);

      repo.clear();
      expect(repo.count()).toBe(0);
      expect(repo.getScan(scan.id)).toBeUndefined();
      expect(repo.getSnapshot(scan.id)).toBeUndefined();
      expect(repo.getDetections(scan.id)).toBeUndefined();
    });
  });

  // ── Step 6H persistence tests ─────────────────────────────────────

  describe('resources persistence (Step 6H)', () => {
    it('snapshots table defines a resources jsonb column (test #24)', () => {
      // The resources column was introduced in the initial migration
      // and stores SiteSnapshot.resources as JSONB.
      expect(snapshots.resources).toBeDefined();
    });

    it('snapshotToRow includes resources in the row mapping (test #25)', async () => {
      const resource: Resource = {
        url: createUrl('https://example.com/robots.txt'),
        type: 'robots',
        size: 42,
        content: 'User-agent: *\nDisallow: /admin',
        httpStatus: createHttpStatus(200),
        contentType: 'text/plain',
      };
      const snapshot = makeSnapshot({ resources: [resource] });
      const scan = makeCompletedScan();

      await repo.save({ scan, snapshot, detections: [] });

      const stored = repo.getSnapshot(scan.id);
      expect(stored).toBeDefined();
      // The in-memory repository stores the snapshot directly; the
      // production (Drizzle) path maps resources via snapshotToRow
      // which includes `resources: [...snapshot.resources]` as JSONB.
      expect(stored!.resources).toHaveLength(1);
      expect(stored!.resources[0]).toEqual(resource);
    });

    it('repository round-trip preserves resource data (test #26)', async () => {
      const resources: Resource[] = [
        {
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          size: 42,
          content: 'User-agent: *\nDisallow: /admin',
          httpStatus: createHttpStatus(200),
          contentType: 'text/plain',
        },
        {
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          size: 28,
          content: 'body { color: red; }',
          httpStatus: createHttpStatus(200),
          contentType: 'text/css',
        },
        {
          url: createUrl('https://example.com/manifest.json'),
          type: 'manifest',
          size: 18,
          content: '{"name": "MyApp"}',
          httpStatus: createHttpStatus(200),
          contentType: 'application/json',
        },
      ];
      const snapshot = makeSnapshot({ resources });
      const scan = makeCompletedScan();

      await repo.save({ scan, snapshot, detections: [] });

      const stored = repo.getSnapshot(scan.id);
      expect(stored).toBeDefined();
      expect(stored!.resources).toHaveLength(3);
      expect(stored!.resources).toEqual(resources);
    });
  });

  // ── Step 21 read contract tests ───────────────────────────────────

  describe('getById (Step 21)', () => {
    it('returns a completed scan with its snapshot', async () => {
      const scan = makeCompletedScan();
      const snapshot = makeSnapshot();

      await repo.save({ scan, snapshot, detections: [] });

      const result = await repo.getById(scan.id);
      expect(result).not.toBeNull();
      expect(result!.scan).toEqual(scan);
      expect(result!.snapshot).toEqual(snapshot);
      expect(result!.detections).toEqual([]);
    });

    it('returns a failed scan with null snapshot and empty detections', async () => {
      const scan = makeFailedScan();

      await repo.save({ scan, snapshot: null, detections: [] });

      const result = await repo.getById(scan.id);
      expect(result).not.toBeNull();
      expect(result!.scan).toEqual(scan);
      expect(result!.snapshot).toBeNull();
      expect(result!.detections).toEqual([]);
    });

    it('returns null for an unknown scan ID', async () => {
      const result = await repo.getById(createScanId('does_not_exist'));
      expect(result).toBeNull();
    });

    it('returns null when the repository is empty', async () => {
      const result = await repo.getById(createScanId('any_id'));
      expect(result).toBeNull();
    });

    it('reconstructs a scan after re-saving as failed (stale data cleared)', async () => {
      const scanId: ScanId = createScanId('scan_001');

      // Save completed first
      const completedScan = makeCompletedScan();
      const snapshot = makeSnapshot();
      await repo.save({ scan: completedScan, snapshot, detections: [] });

      // Overwrite with failed
      const failedScan = makeFailedScan();
      await repo.save({ scan: failedScan, snapshot: null, detections: [] });

      const result = await repo.getById(scanId);
      expect(result).not.toBeNull();
      expect(result!.scan).toEqual(failedScan);
      expect(result!.snapshot).toBeNull();
      expect(result!.detections).toEqual([]);
    });
  });

  describe('list (Step 21)', () => {
    it('returns an empty array when no scans are persisted', async () => {
      const results = await repo.list();
      expect(results).toEqual([]);
    });

    it('returns a single completed scan', async () => {
      const scan = makeCompletedScan();
      const snapshot = makeSnapshot();
      await repo.save({ scan, snapshot, detections: [] });

      const results = await repo.list();
      expect(results).toHaveLength(1);
      expect(results[0]!.scan).toEqual(scan);
      expect(results[0]!.snapshot).toEqual(snapshot);
    });

    it('returns multiple scans in deterministic order (createdAt DESC, scanId ASC)', async () => {
      // Same createdAt for all — tie-breaker is scanId ASC
      const scanA = createScan(
        createScanId('scan_001'),
        makeTarget(),
        createTimestampFromString('2025-06-01T11:00:00.000Z'),
      );
      const scanB = createScan(
        createScanId('scan_002'),
        makeTarget(),
        createTimestampFromString('2025-06-01T11:00:00.000Z'),
      );
      const scanC = createScan(
        createScanId('scan_003'),
        makeTarget(),
        createTimestampFromString('2025-06-01T11:00:00.000Z'),
      );

      await repo.save({ scan: scanA, snapshot: null, detections: [] });
      await repo.save({ scan: scanB, snapshot: null, detections: [] });
      await repo.save({ scan: scanC, snapshot: null, detections: [] });

      const results = await repo.list();
      const ids = results.map((r) => r.scan.id);
      // Same createdAt → scanId ASC
      expect(ids).toEqual(['scan_001', 'scan_002', 'scan_003']);
    });

    it('orders by createdAt DESC with scanId ASC tie-breaker', async () => {
      const scanLate = createScan(
        createScanId('scan_late'),
        makeTarget(),
        createTimestampFromString('2025-06-01T12:00:00.000Z'),
      );
      const scanEarly = createScan(
        createScanId('scan_early'),
        makeTarget(),
        createTimestampFromString('2025-06-01T11:00:00.000Z'),
      );
      const scanSameAsEarly = createScan(
        createScanId('scan_earlier'),
        makeTarget(),
        createTimestampFromString('2025-06-01T11:00:00.000Z'),
      );

      await repo.save({ scan: scanEarly, snapshot: null, detections: [] });
      await repo.save({ scan: scanLate, snapshot: null, detections: [] });
      await repo.save({ scan: scanSameAsEarly, snapshot: null, detections: [] });

      const results = await repo.list();
      const ids = results.map((r) => r.scan.id);
      // createdAt DESC: scan_late first, then the two with same createdAt
      // are tie-broken by scanId ASC: 'scan_early' < 'scan_earlier'
      // ('i' at position 9 < 'y')
      expect(ids).toEqual(['scan_late', 'scan_earlier', 'scan_early']);
    });

    it('includes both completed and failed scans', async () => {
      const completedScan = makeCompletedScan('scan_completed');
      const failedScan = makeFailedScan('scan_failed');
      await repo.save({ scan: completedScan, snapshot: makeSnapshot(), detections: [] });
      await repo.save({ scan: failedScan, snapshot: null, detections: [] });

      const results = await repo.list();
      expect(results).toHaveLength(2);
      const statuses = results.map((r) => r.scan.status.type).sort();
      expect(statuses).toEqual(['completed', 'failed']);
    });
  });
});
