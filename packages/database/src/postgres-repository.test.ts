/**
 * Integration tests for PostgresScanResultRepository.
 *
 * These tests require a live PostgreSQL instance (DATABASE_URL must be
 * set in the environment). When DATABASE_URL is absent, the entire
 * suite is skipped via `describe.skip` — this ensures `pnpm test`
 * remains green without a database and does not silently fall back to
 * an in-memory adapter (the production adapter is never exercised
 * against the wrong backing store).
 *
 * Run with a database:
 *   set DATABASE_URL=postgresql://user:pass@localhost:5432/devlens
 *   pnpm test
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { createDatabaseClient, PostgresScanResultRepository } from './index.js';
import { scans, snapshots } from './schema.js';
import type { Database } from './client.js';
import { persistResult } from '@devlens/application';
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
import type {
  ScanTarget,
  SiteSnapshot,
  ScanError,
  HttpHeader,
  Resource,
  Detection,
} from '@devlens/core';

// ─── Test data helpers ─────────────────────────────────────────────

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
      headers: [
        { name: 'content-type', value: 'text/html; charset=utf-8' },
        { name: 'server', value: 'ECS (dcb/7F84)' },
      ],
      contentType: 'text/html; charset=utf-8',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example Domain',
      description: 'This domain is for use in illustrative examples.',
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [
      {
        url: createUrl('https://example.com/style.css'),
        type: 'stylesheet',
        size: 1234,
        content: 'body { color: red; }',
        httpStatus: createHttpStatus(200),
        contentType: 'text/css',
      },
      {
        url: createUrl('https://example.com/script.js'),
        type: 'script',
        size: 5678,
        content: '',
        httpStatus: createHttpStatus(200),
        contentType: null,
      },
      {
        url: createUrl('https://example.com/logo.png'),
        type: 'image',
        size: null,
        content: '',
        httpStatus: createHttpStatus(200),
        contentType: null,
      },
    ],
  };
}

function makeCompletedResult(id: string = 'scan_001'): ScanResult {
  const pending = createScan(
    createScanId(id),
    makeTarget(),
    createTimestampFromString('2025-06-01T11:00:00.000Z'),
  );
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  const completed = completeScan(running, createTimestampFromString('2025-06-01T11:02:00.000Z'));
  return { scan: completed, snapshot: makeSnapshot(), detections: [] };
}

function makeFailedResult(
  id: string = 'scan_001',
  error: ScanError = { code: 'timeout', message: 'Request timed out after 10ms' },
): ScanResult {
  const pending = createScan(
    createScanId(id),
    makeTarget(),
    createTimestampFromString('2025-06-01T11:00:00.000Z'),
  );
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  const failed = failScan(running, error, createTimestampFromString('2025-06-01T11:02:00.000Z'));
  return { scan: failed, snapshot: null, detections: [] };
}

// ─── Integration tests ─────────────────────────────────────────────

const hasDb = process.env.DATABASE_URL !== undefined;

// Compute the migration folder relative to this test file's location.
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

// When DATABASE_URL is absent, skip the entire suite.
const integrationDescribe = hasDb ? describe : describe.skip;

integrationDescribe('PostgresScanResultRepository — PostgreSQL integration', () => {
  let db: Database;
  let repo: PostgresScanResultRepository;

  beforeAll(async () => {
    db = createDatabaseClient();
    await migrate(db, { migrationsFolder });
    repo = new PostgresScanResultRepository(db);
  });

  afterAll(async () => {
    if (db) {
      await db.$client.end();
    }
  });

  beforeEach(async () => {
    await db.delete(snapshots);
    await db.delete(scans);
  });

  it('persists a completed scan with its snapshot', async () => {
    const result = makeCompletedResult('scan_completed');
    await persistResult(result, repo);

    const scanRows = await db.select().from(scans).where(eq(scans.id, result.scan.id));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0].status).toBe('completed');
    expect(scanRows[0].url).toBe('https://example.com');
    expect(scanRows[0].hostname).toBe('example.com');
    expect(scanRows[0].completedAt).toBeDefined();
    expect(scanRows[0].failedAt).toBeNull();

    const snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, result.scan.id));
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].htmlTitle).toBe('Example Domain');
    expect(snapshotRows[0].htmlDescription).toBe(
      'This domain is for use in illustrative examples.',
    );
    expect(snapshotRows[0].httpStatusCode).toBe(200);
  });

  it('persists a failed scan without a snapshot', async () => {
    const result = makeFailedResult('scan_failed');
    await persistResult(result, repo);

    const scanRows = await db.select().from(scans).where(eq(scans.id, result.scan.id));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0].status).toBe('failed');
    expect(scanRows[0].errorCode).toBe('timeout');
    expect(scanRows[0].errorMessage).toBe('Request timed out after 10ms');
    expect(scanRows[0].failedAt).toBeDefined();

    const snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, result.scan.id));
    expect(snapshotRows).toHaveLength(0);
  });

  it('stores snapshot with the correct scan_id foreign key', async () => {
    const result = makeCompletedResult('scan_fk');
    await persistResult(result, repo);

    const snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, result.scan.id));
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].scanId).toBe(result.scan.id);
  });

  it('upserts are idempotent — saving twice produces no duplicates', async () => {
    const result = makeCompletedResult('scan_idempotent');
    await persistResult(result, repo);
    await persistResult(result, repo);

    const scanRows = await db.select().from(scans).where(eq(scans.id, result.scan.id));
    expect(scanRows).toHaveLength(1);

    const snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, result.scan.id));
    expect(snapshotRows).toHaveLength(1);
  });

  it('deletes the existing snapshot when re-saving the same scan as failed', async () => {
    const completedResult = makeCompletedResult('scan_transition');
    await persistResult(completedResult, repo);

    let snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, completedResult.scan.id));
    expect(snapshotRows).toHaveLength(1);

    // Transition the same scan to failed — same ID, no snapshot
    const failedResult: ScanResult = {
      scan: failScan(
        startScan(
          createScan(
            createScanId('scan_transition'),
            makeTarget(),
            createTimestampFromString('2025-06-01T11:00:00.000Z'),
          ),
          createTimestampFromString('2025-06-01T11:01:00.000Z'),
        ),
        { code: 'error', message: 'something went wrong' },
        createTimestampFromString('2025-06-01T11:03:00.000Z'),
      ),
      snapshot: null,
      detections: [],
    };
    await persistResult(failedResult, repo);

    // Snapshot should be deleted
    snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, failedResult.scan.id));
    expect(snapshotRows).toHaveLength(0);

    // Scan should be updated to failed status
    const scanRows = await db.select().from(scans).where(eq(scans.id, failedResult.scan.id));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0].status).toBe('failed');
    expect(scanRows[0].errorCode).toBe('error');
  });

  it('preserves headers and resources as JSONB', async () => {
    const result = makeCompletedResult('scan_jsonb');
    await persistResult(result, repo);

    const snapshotRows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, result.scan.id));
    expect(snapshotRows).toHaveLength(1);

    const headers = snapshotRows[0].headers as Array<HttpHeader>;
    expect(headers).toEqual([
      { name: 'content-type', value: 'text/html; charset=utf-8' },
      { name: 'server', value: 'ECS (dcb/7F84)' },
    ]);

    const resources = snapshotRows[0].resources as Array<Resource>;
    expect(resources).toEqual([
      {
        url: 'https://example.com/style.css',
        type: 'stylesheet',
        size: 1234,
        content: 'body { color: red; }',
        httpStatus: 200,
        contentType: 'text/css',
      },
      {
        url: 'https://example.com/script.js',
        type: 'script',
        size: 5678,
        content: '',
        httpStatus: 200,
        contentType: null,
      },
      {
        url: 'https://example.com/logo.png',
        type: 'image',
        size: null,
        content: '',
        httpStatus: 200,
        contentType: null,
      },
    ]);

    // Detections are persisted alongside the snapshot
    expect(snapshotRows[0].detections).toEqual([]);
  });

  it('propagates database errors as infrastructure failures', async () => {
    // Construct a client pointed at an unreachable port to force a
    // connection-level failure — distinct from a domain ScanError.
    const badDb = createDatabaseClient('postgresql://localhost:1/nonexistent');
    const badRepo = new PostgresScanResultRepository(badDb);
    const result = makeCompletedResult('scan_error');

    await expect(persistResult(result, badRepo)).rejects.toThrow();

    try {
      await badDb.$client.end();
    } catch {
      // connection may already be closed
    }
  });

  // ── Step 21 read contract tests ───────────────────────────────────

  describe('getById (Step 21)', () => {
    it('returns a completed scan with its snapshot', async () => {
      const result = makeCompletedResult('scan_get_by_id_completed');
      await persistResult(result, repo);

      const fetched = await repo.getById(result.scan.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.scan).toEqual(result.scan);
      expect(fetched!.snapshot).toEqual(result.snapshot);
      expect(fetched!.detections).toEqual([]);
    });

    it('returns a failed scan with null snapshot', async () => {
      const result = makeFailedResult('scan_get_by_id_failed');
      await persistResult(result, repo);

      const fetched = await repo.getById(result.scan.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.scan.status.type).toBe('failed');
      expect(fetched!.scan.status.error).toEqual(result.scan.status.error);
      expect(fetched!.snapshot).toBeNull();
      expect(fetched!.detections).toEqual([]);
    });

    it('returns null for an unknown scan ID', async () => {
      const fetched = await repo.getById(createScanId('unknown_scan'));
      expect(fetched).toBeNull();
    });

    it('returns null when the table is empty', async () => {
      const fetched = await repo.getById(createScanId('any_id'));
      expect(fetched).toBeNull();
    });
  });

  describe('list (Step 21)', () => {
    it('returns an empty array when no scans are persisted', async () => {
      const results = await repo.list();
      expect(results).toEqual([]);
    });

    it('returns a single completed scan', async () => {
      const result = makeCompletedResult('scan_list_single');
      await persistResult(result, repo);

      const results = await repo.list();
      expect(results).toHaveLength(1);
      expect(results[0]!.scan).toEqual(result.scan);
      expect(results[0]!.snapshot).toEqual(result.snapshot);
    });

    it('returns scans in deterministic order (createdAt DESC, scanId ASC)', async () => {
      // Three scans with the same createdAt → tie-breaker is scanId ASC
      const r1 = makeCompletedResult('scan_a');
      const r2 = makeCompletedResult('scan_b');
      const r3 = makeCompletedResult('scan_c');

      // Persist in non-deterministic order
      await persistResult(r2, repo);
      await persistResult(r3, repo);
      await persistResult(r1, repo);

      const results = await repo.list();
      const ids = results.map((r) => r.scan.id);
      expect(ids).toEqual(['scan_a', 'scan_b', 'scan_c']);
    });

    it('includes both completed and failed scans', async () => {
      const completed = makeCompletedResult('scan_mixed_completed');
      const failed = makeFailedResult('scan_mixed_failed');
      await persistResult(completed, repo);
      await persistResult(failed, repo);

      const results = await repo.list();
      expect(results).toHaveLength(2);
      const statuses = results.map((r) => r.scan.status.type).sort();
      expect(statuses).toEqual(['completed', 'failed']);
    });

    it('preserves detections in the retrieved result', async () => {
      const result = makeCompletedResult('scan_list_detections');
      const detection: Detection = {
        technology: { id: 'nginx' as never, name: 'nginx', category: 'server' as never },
        confidence: 80 as never,
        evidence: [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }],
      };
      await repo.save({ ...result, detections: [detection] });

      const results = await repo.list();
      expect(results).toHaveLength(1);
      expect(results[0]!.detections).toHaveLength(1);
      expect(results[0]!.detections[0]).toEqual(detection);
    });
  });
});
