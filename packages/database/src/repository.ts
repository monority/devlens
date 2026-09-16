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

import type { ScanResult, ScanResultRepository } from '@devlens/application';
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
  async save(result: ScanResult): Promise<void> {
    this.scans.set(result.scan.id, result.scan);
    if (result.snapshot !== null) {
      this.snapshots.set(result.scan.id, result.snapshot);
      this.detections.set(result.scan.id, [...result.detections]);
    } else {
      this.snapshots.delete(result.scan.id);
      this.detections.delete(result.scan.id);
    }
  }

  /**
   * Retrieves a scan result by its ID.
   *
   * Returns `null` when no scan with the given ID has been persisted.
   * A failed scan (status `failed`) is returned as a normal `ScanResult`
   * with `snapshot: null` — it is NOT treated as "not found".
   */
  async getById(scanId: ScanId): Promise<ScanResult | null> {
    const scan = this.scans.get(scanId);
    if (scan === undefined) {
      return null;
    }
    return this.reconstruct(scan);
  }

  /**
   * Returns all persisted scan results in deterministic order:
   * `createdAt DESC, scanId ASC`.
   *
   * - Scans with the same `createdAt` are tie-broken by `scanId`
   *   ascending, ensuring a stable, reproducible ordering.
   * - Empty repository returns `[]`.
   */
  async list(): Promise<ScanResult[]> {
    return Array.from(this.scans.values())
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
