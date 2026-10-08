/**
 * In-memory implementation of `ScanResultRepository`.
 *
 * This is the default persistence adapter for `apps/worker`. It is used
 * when no production database has been configured. A future step can
 * replace it with a PostgreSQL/Supabase implementation without changing
 * the application layer — only the worker's composition root changes.
 *
 * Not for production use: data is lost when the process exits.
 */

import type {
  ScanResult,
  ScanResultRepository,
  ListScanOptions,
  ScanAggregate,
} from '@devlens/application';
import type { Scan, ScanId, SiteSnapshot, Detection } from '@devlens/core';

/**
 * Stores scan results in a process-local `Map`.
 *
 * - The `Scan` is always persisted, keyed by `scan.id`.
 * - The `SiteSnapshot` is persisted only when present (i.e. on
 *   successful scans), keyed by the same `scan.id`.
 * - The `Detection[]` (detections) are persisted only when a snapshot
 *   is present, keyed by `scan.id`.
 *
 * `getScan`, `getSnapshot`, and `getDetections` are provided so that
 * tests and debug tooling can verify that persistence actually occurred.
 */
export class InMemoryScanResultRepository implements ScanResultRepository {
  private readonly scans: Map<string, Scan> = new Map();
  private readonly snapshots: Map<string, SiteSnapshot> = new Map();
  private readonly detections: Map<string, Detection[]> = new Map();

  /**
   * Persists a completed or failed scan result.
   *
   * - On a completed scan (snapshot !== null): stores the `Scan`,
   *   `SiteSnapshot`, and `Detection[]`.
   * - On a failed scan (snapshot === null): stores the `Scan` and
   *   clears any previously stored snapshot and detections for that
   *   scan ID, so a failed re-attempt does not preserve stale data.
   */
  save(result: ScanResult): Promise<void> {
    this.scans.set(result.scan.id, result.scan);
    if (result.snapshot !== null) {
      this.snapshots.set(result.scan.id, result.snapshot);
      this.detections.set(result.scan.id, [...result.detections]);
    } else {
      this.snapshots.delete(result.scan.id);
      this.detections.delete(result.scan.id);
    }
    return Promise.resolve();
  }

  /**
   * Retrieves a scan result by its ID.
   *
   * Returns `null` when no scan with the given ID has been persisted.
   * A failed scan (status `failed`) is returned as a normal `ScanResult`
   * with `snapshot: null` — it is NOT treated as "not found".
   */
  getById(scanId: ScanId): Promise<ScanResult | null> {
    const scan = this.scans.get(scanId);
    if (scan === undefined) {
      return Promise.resolve(null);
    }
    return Promise.resolve(this.reconstruct(scan));
  }

  /**
   * Returns persisted scan results in deterministic order:
   * `createdAt DESC, scanId ASC`.
   *
   * - Scans with the same `createdAt` are tie-broken by `scanId`
   *   ascending, ensuring a stable, reproducible ordering.
   * - Empty repository returns `[]`.
   *
   * When `technologyId` is provided, the in-memory filter replicates the
   * SQL-side `WHERE EXISTS` behaviour of the PostgreSQL adapter: only
   * scans whose detections include a detection with a matching
   * `technology.id` are returned. Failed/pending/running scans (which
   * have no detections by domain-model design) are naturally excluded.
   *
   * Pagination (`options`): when `options.limit` is set, only rows strictly
   * AFTER the `options.after` cursor are returned (the `(createdAt, scanId)`
   * pair, matching the `createdAt DESC, scanId ASC` ordering), capped at
   * `limit`. An unknown cursor yields an empty page. The API layer fetches
   * `limit + 1` to detect a next page and truncates before returning — one
   * in-memory pass, no per-scan work.
   */
  list(technologyId?: string, options?: ListScanOptions): Promise<ScanResult[]> {
    const results = Array.from(this.scans.values())
      .filter((scan) => {
        if (technologyId === undefined) return true;
        const detections = this.detections.get(scan.id) ?? [];
        return detections.some((d) => d.technology.id === technologyId);
      })
      .sort((a, b) => {
        // createdAt DESC
        if (a.createdAt < b.createdAt) return 1;
        if (a.createdAt > b.createdAt) return -1;
        // scanId ASC (tie-breaker)
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
      })
      .map((scan) => this.reconstruct(scan));

    // Cursor: continue strictly after the (createdAt, scanId) boundary.
    // `createdAt` is a canonical ISO 8601 string ⇒ lexicographic order
    // matches chronological order, so a direct string compare is safe.
    const after = options?.after;
    let page: ScanResult[] = results;
    if (after) {
      const idx = results.findIndex(
        (r) => r.scan.createdAt === after.createdAt && r.scan.id === after.scanId,
      );
      // Unknown/stale cursor ⇒ no row matches ⇒ empty page (no infinite tail).
      page = idx === -1 ? [] : results.slice(idx + 1);
    }
    if (options?.limit !== undefined) {
      page = page.slice(0, options.limit);
    }
    return Promise.resolve(page);
  }

  /**
   * Technology-scoped aggregate rollup for the Step 89 summary.
   *
   * Returns the global `scanCount` and earliest `firstDetectedAt`
   * (lexicographic `MIN` of the canonical ISO `createdAt`) among scans whose
   * detections include the technology. O(n) in-memory; used so the summary's
   * totals / first-detection date stay correct across pages without loading
   * every detection.
   */
  aggregate(technologyId: string): Promise<ScanAggregate> {
    let scanCount = 0;
    let firstDetectedAt: string | null = null;
    for (const scan of this.scans.values()) {
      const detections = this.detections.get(scan.id) ?? [];
      if (detections.some((d) => d.technology.id === technologyId)) {
        scanCount += 1;
        if (firstDetectedAt === null || scan.createdAt < firstDetectedAt) {
          firstDetectedAt = scan.createdAt;
        }
      }
    }
    return Promise.resolve({ scanCount, firstDetectedAt });
  }

  /**
   * Reconstructs a `ScanResult` from the in-memory stores.
   *
   * Given a persisted `Scan`, this pulls the associated snapshot and
   * detections (if any) and assembles a complete `ScanResult`. For
   * failed scans the snapshot and detections maps will be empty, so
   * `snapshot` is `null` and `detections` is `[]`.
   */
  private reconstruct(scan: Scan): ScanResult {
    const snapshot = this.snapshots.get(scan.id) ?? null;
    const detections = this.detections.get(scan.id) ?? [];
    return { scan, snapshot, detections };
  }

  /** Returns the persisted scan for the given ID, or `undefined`. */
  getScan(id: ScanId): Scan | undefined {
    return this.scans.get(id);
  }

  /** Returns the persisted snapshot for the given scan ID, or `undefined`. */
  getSnapshot(scanId: ScanId): SiteSnapshot | undefined {
    return this.snapshots.get(scanId);
  }

  /** Returns the persisted detections for the given scan ID, or `undefined`. */
  getDetections(scanId: ScanId): Detection[] | undefined {
    return this.detections.get(scanId);
  }

  /** Returns the number of persisted scans. */
  count(): number {
    return this.scans.size;
  }

  /** Clears all persisted data (useful for test isolation). */
  clear(): void {
    this.scans.clear();
    this.snapshots.clear();
    this.detections.clear();
  }
}
