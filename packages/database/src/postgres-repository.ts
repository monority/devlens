/**
 * Production PostgreSQL implementation of {@link ScanResultRepository}.
 *
 * This adapter translates domain types (`Scan`, `SiteSnapshot`,
 * `ScanStatus`) into flat PostgreSQL rows and back. It performs all
 * writes inside a single transaction so that a scan and its snapshot
 * are persisted atomically — either both succeed or both roll back.
 *
 * Upsert semantics:
 * - `scans`  : `INSERT … ON CONFLICT (id) DO UPDATE` — repeated saves
 *    of the same scan overwrite the previous row (idempotent).
 * - `snapshots`: same pattern on `scan_id`.
 * - When `snapshot` is `null`, any existing snapshot for that scan
 *    is `DELETE`d inside the same transaction.
 *
 * No Drizzle or SQL types leak above the infrastructure boundary.
 * The application layer talks to this class through the
 * `ScanResultRepository` interface only.
 */

import { eq, desc, asc } from 'drizzle-orm';
import type { Database } from './client.js';
import { scans, snapshots } from './schema.js';
import type { ScanResult, ScanResultRepository } from '@devlens/application';
import type {
  Scan,
  ScanId,
  SiteSnapshot,
  Timestamp,
  Detection,
  Url,
  Hostname,
  HttpStatus,
  MetaTag,
  ScriptTag,
} from '@devlens/core';
import type { HttpHeader, Resource, ScanStatus } from '@devlens/core';

// ---------------------------------------------------------------------------
// Row-type helpers — these are the exact shapes Drizzle expects for INSERT.
// ---------------------------------------------------------------------------

interface ScanRow {
  id: string;
  url: string;
  hostname: string;
  status: string;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface SnapshotRow {
  scanId: string;
  url: string;
  hostname: string;
  capturedAt: Date;
  httpStatusCode: number;
  httpContentType: string;
  httpFinalUrl: string;
  htmlTitle: string;
  htmlDescription: string | null;
  htmlMetaTags: Array<{ name: string; content: string }>;
  htmlScripts: Array<{ src: string | null; content: string }>;
  headers: HttpHeader[];
  resources: Resource[];
  detections: Detection[];
}

// ---------------------------------------------------------------------------
// Mappers: domain → database rows
// ---------------------------------------------------------------------------

/**
 * Convert a domain `Timestamp` (ISO 8601 string) into a `Date`
 * for Drizzle's `timestamp` column, which expects `Date`.
 */
function toDate(timestamp: Timestamp): Date {
  return new Date(timestamp);
}

/**
 * Flatten a {@link Scan} into a row for the `scans` table.
 *
 * `ScanStatus` is a discriminated union; we extract the timestamp
 * and error fields only for the relevant status variant.
 */
function scanToRow(scan: Scan): ScanRow {
  const status: ScanStatus = scan.status;

  let startedAt: Timestamp | null = null;
  let completedAt: Timestamp | null = null;
  let failedAt: Timestamp | null = null;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  switch (status.type) {
    case 'running':
      startedAt = status.startedAt;
      break;
    case 'completed':
      completedAt = status.completedAt;
      break;
    case 'failed':
      failedAt = status.failedAt;
      errorCode = status.error.code;
      errorMessage = status.error.message;
      break;
    // 'pending' leaves all optional columns as null
  }

  return {
    id: scan.id,
    url: scan.target.url,
    hostname: scan.target.hostname,
    status: status.type,
    createdAt: toDate(scan.createdAt),
    startedAt: startedAt !== null ? toDate(startedAt) : null,
    completedAt: completedAt !== null ? toDate(completedAt) : null,
    failedAt: failedAt !== null ? toDate(failedAt) : null,
    errorCode,
    errorMessage,
  };
}

/**
 * Flatten a {@link SiteSnapshot} into a row for the `snapshots` table.
 *
 * `headers` and `resources` are serialized as JSON to `jsonb` columns.
 */
function snapshotToRow(
  scanId: ScanId,
  snapshot: SiteSnapshot,
  detections: readonly Detection[],
): SnapshotRow {
  return {
    scanId: scanId as string,
    url: snapshot.url,
    hostname: snapshot.hostname,
    capturedAt: toDate(snapshot.capturedAt),
    httpStatusCode: snapshot.http.statusCode as number,
    httpContentType: snapshot.http.contentType,
    httpFinalUrl: snapshot.http.finalUrl,
    htmlTitle: snapshot.html.title,
    htmlDescription: snapshot.html.description,
    htmlMetaTags: [...snapshot.html.metaTags],
    htmlScripts: [...snapshot.html.scripts],
    headers: [...snapshot.http.headers],
    resources: [...snapshot.resources],
    detections: [...detections],
  };
}

// ---------------------------------------------------------------------------
// Mappers: database rows → domain
// ---------------------------------------------------------------------------

/**
 * Reconstructs a domain {@link Scan} from a database row.
 *
 * `ScanStatus` (a discriminated union) is rebuilt from the `status`
 * text column and the status-specific timestamp/error columns.
 */
function rowToScan(row: ScanRow): Scan {
  const base = {
    id: row.id as ScanId,
    target: {
      url: row.url as Url,
      hostname: row.hostname as Hostname,
    },
    createdAt: row.createdAt.toISOString() as Timestamp,
  };

  switch (row.status) {
    case 'pending':
      return { ...base, status: { type: 'pending' } as ScanStatus };
    case 'running':
      return {
        ...base,
        status: {
          type: 'running' as const,
          startedAt: row.startedAt!.toISOString() as Timestamp,
        },
      };
    case 'completed':
      return {
        ...base,
        status: {
          type: 'completed' as const,
          completedAt: row.completedAt!.toISOString() as Timestamp,
        },
      };
    case 'failed':
      return {
        ...base,
        status: {
          type: 'failed' as const,
          failedAt: row.failedAt!.toISOString() as Timestamp,
          error: { code: row.errorCode!, message: row.errorMessage! },
        },
      };
    default:
      throw new Error(`Unknown scan status: ${row.status}`);
  }
}

/**
 * Reconstructs a domain {@link SiteSnapshot} (and detections) from a
 * database row. Returns `null` when the row is `undefined`, which happens
 * for failed scans that have no snapshot.
 */
function rowToSnapshot(row: SnapshotRow | undefined | null): {
  snapshot: SiteSnapshot | null;
  detections: Detection[];
} {
  if (row === undefined || row === null) {
    return { snapshot: null, detections: [] };
  }

  return {
    snapshot: {
      url: row.url as Url,
      hostname: row.hostname as Hostname,
      capturedAt: row.capturedAt.toISOString() as Timestamp,
      http: {
        statusCode: row.httpStatusCode as unknown as HttpStatus,
        headers: [...(row.headers as HttpHeader[])],
        contentType: row.httpContentType,
        finalUrl: row.httpFinalUrl as Url,
      },
      html: {
        title: row.htmlTitle,
        description: row.htmlDescription,
        metaTags: [...(row.htmlMetaTags as MetaTag[])],
        scripts: [...(row.htmlScripts as ScriptTag[])],
        links: [], // links were not persisted by the write-side mapper; return empty
      },
      resources: [...(row.resources as Resource[])],
    },
    detections: [...(row.detections as Detection[])],
  };
}

/**
 * Reassembles a complete {@link ScanResult} from a joined scan row +
 * optional snapshot row. The snapshot row is `undefined` or `null` for
 * failed scans (no snapshot was captured).
 */
function rowsToResult(scanRow: ScanRow, snapshotRow: SnapshotRow | undefined | null): ScanResult {
  const { snapshot, detections } = rowToSnapshot(snapshotRow);
  return {
    scan: rowToScan(scanRow),
    snapshot,
    detections,
  };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class PostgresScanResultRepository implements ScanResultRepository {
  constructor(private readonly db: Database) {}

  async save(result: ScanResult): Promise<void> {
    const scanRow = scanToRow(result.scan);

    await this.db.transaction(async (tx) => {
      // Upsert the scan row.
      await tx
        .insert(scans)
        .values(scanRow)
        .onConflictDoUpdate({
          target: scans.id,
          set: {
            url: scanRow.url,
            hostname: scanRow.hostname,
            status: scanRow.status,
            createdAt: scanRow.createdAt,
            startedAt: scanRow.startedAt,
            completedAt: scanRow.completedAt,
            failedAt: scanRow.failedAt,
            errorCode: scanRow.errorCode,
            errorMessage: scanRow.errorMessage,
          },
        });

      // Upsert or delete the snapshot inside the same transaction.
      if (result.snapshot !== null) {
        const snapshotRow = snapshotToRow(result.scan.id, result.snapshot, result.detections);
        await tx
          .insert(snapshots)
          .values(snapshotRow)
          .onConflictDoUpdate({
            target: snapshots.scanId,
            set: {
              url: snapshotRow.url,
              hostname: snapshotRow.hostname,
              capturedAt: snapshotRow.capturedAt,
              httpStatusCode: snapshotRow.httpStatusCode,
              httpContentType: snapshotRow.httpContentType,
              httpFinalUrl: snapshotRow.httpFinalUrl,
              htmlTitle: snapshotRow.htmlTitle,
              htmlDescription: snapshotRow.htmlDescription,
              htmlMetaTags: snapshotRow.htmlMetaTags,
              htmlScripts: snapshotRow.htmlScripts,
              headers: snapshotRow.headers,
              resources: snapshotRow.resources,
              detections: snapshotRow.detections,
            },
          });
      } else {
        await tx.delete(snapshots).where(eq(snapshots.scanId, result.scan.id as string));
      }
    });
  }

  /**
   * Retrieves a scan result by its ID.
   *
   * Returns `null` when no scan with the given ID exists. A failed scan
   * is returned as a normal `ScanResult` with `snapshot: null` — it is
   * NOT treated as "not found".
   */
  async getById(scanId: ScanId): Promise<ScanResult | null> {
    const scanRows = await this.db.select().from(scans).where(eq(scans.id, scanId));

    if (scanRows.length === 0) {
      return null;
    }

    const scanRow = scanRows[0]!;
    const snapshotRows = await this.db.select().from(snapshots).where(eq(snapshots.scanId, scanId));

    const snapshotRow = snapshotRows[0];
    return rowsToResult(scanRow as ScanRow, snapshotRow as SnapshotRow | undefined);
  }

  /**
   * Returns all scan results in deterministic order:
   * `createdAt DESC, scanId ASC`.
   *
   * Uses a left join so that scans without snapshots (failed scans)
   * are included. Empty repository returns `[]`.
   */
  async list(): Promise<ScanResult[]> {
    const rows = await this.db.select().from(scans).orderBy(desc(scans.createdAt), asc(scans.id));

    const results: ScanResult[] = [];
    for (const scanRow of rows) {
      const scanId = scanRow.id as ScanId;
      const snapshotRows = await this.db
        .select()
        .from(snapshots)
        .where(eq(snapshots.scanId, scanId));

      const snapshotRow = snapshotRows[0];
      results.push(rowsToResult(scanRow as ScanRow, snapshotRow as SnapshotRow | undefined));
    }
    return results;
  }
}
