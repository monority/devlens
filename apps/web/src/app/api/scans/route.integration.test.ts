/**
 * Integration test for POST /api/scans.
 *
 * Requires a live PostgreSQL instance (DATABASE_URL must be set).
 * When DATABASE_URL is absent, the entire suite is skipped via
 * `describe.skip` — this ensures `pnpm test` remains green without
 * a database.
 *
 * The test exercises the full stack:
 *   handleCreateScan
 *     → createScan
 *     → executeScan → runScan
 *     → HttpCrawler (real fetch to example.com)
 *     → PostgresScanResultRepository
 *     → PostgreSQL
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq } from 'drizzle-orm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleCreateScan } from './handler.js';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import { HttpCrawler } from '@devlens/crawler';
import {
  HeaderDetector,
  MetaTagDetector,
  ScriptUrlDetector,
  CompositeDetector,
} from '@devlens/detectors';
import { scans, snapshots } from '@devlens/database';
import type { Database } from '@devlens/database';

const hasDb = process.env.DATABASE_URL !== undefined;
const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../packages/database/drizzle',
);
const integrationDescribe = hasDb ? describe : describe.skip;

// The Drizzle Database type does not expose `$client` in all type-resolution
// paths. We use a minimal cast here to close the connection cleanly.
type DrizzleDb = Database & { $client: { end(): Promise<void> } };

integrationDescribe('POST /api/scans — full integration', () => {
  let db: DrizzleDb;

  beforeAll(async () => {
    db = createDatabaseClient() as unknown as DrizzleDb;
    await migrate(db, { migrationsFolder });
  });

  afterAll(async () => {
    if (db) {
      await db.$client.end();
    }
  });

  beforeEach(async () => {
    await db!.delete(snapshots);
    await db!.delete(scans);
  });

  it('executes a scan against a real URL and persists to PostgreSQL', async () => {
    const result = await handleCreateScan('{"url": "https://example.com"}', {
      crawler: new HttpCrawler({ timeoutMs: 15000 }),
      detector: new CompositeDetector([
        new HeaderDetector(),
        new MetaTagDetector(),
        new ScriptUrlDetector(),
      ]),
      repository: new PostgresScanResultRepository(db),
      generateId: () => 'api_integration_001',
      now: new Date('2025-06-01T12:00:00.000Z'),
    });

    expect(result.status).toBe(200);
    const body = result.body;
    if (!('scan' in body)) {
      throw new Error('Expected scan response body');
    }

    expect(body.scan.status).toBe('completed');
    expect(body.scan.target).toBe('https://example.com/');
    expect(body.scan.hostname).toBe('example.com');
    expect(body.snapshot).not.toBeNull();
    expect(body.snapshot!.http.statusCode).toBe(200);
    expect(body.snapshot!.html.title).toBe('Example Domain');
    expect(body.detections).toEqual([]);

    const scanRows = await db!.select().from(scans).where(eq(scans.id, 'api_integration_001'));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0]!.status).toBe('completed');

    const snapshotRows = await db!
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, 'api_integration_001'));
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0]!.httpStatusCode).toBe(200);

    const headers = snapshotRows[0]!.headers as Array<{ name: string; value: string }>;
    expect(headers.length).toBeGreaterThan(0);
    expect(headers.some((h) => h.name === 'content-type')).toBe(true);
  });

  it('returns 200 with failed scan when target resolves to a blocked host', async () => {
    const result = await handleCreateScan('{"url": "http://localhost:9999"}', {
      crawler: new HttpCrawler({ timeoutMs: 5000 }),
      detector: new CompositeDetector([
        new HeaderDetector(),
        new MetaTagDetector(),
        new ScriptUrlDetector(),
      ]),
      repository: new PostgresScanResultRepository(db),
      generateId: () => 'api_integration_failed',
      now: new Date('2025-06-01T12:00:00.000Z'),
    });

    expect(result.status).toBe(200);
    const body = result.body;
    if (!('scan' in body)) {
      throw new Error('Expected scan response body');
    }

    expect(body.scan.status).toBe('failed');
    expect(body.scan.error).not.toBeNull();
    expect(body.scan.error!.code).toBe('invalid_target');
    expect(body.snapshot).toBeNull();
    expect(body.detections).toEqual([]);

    const scanRows = await db!.select().from(scans).where(eq(scans.id, 'api_integration_failed'));
    expect(scanRows).toHaveLength(1);
    expect(scanRows[0]!.status).toBe('failed');
    expect(scanRows[0]!.errorCode).toBe('invalid_target');

    const snapshotRows = await db!
      .select()
      .from(snapshots)
      .where(eq(snapshots.scanId, 'api_integration_failed'));
    expect(snapshotRows).toHaveLength(0);
  });
});
