/**
 * Persistence boundary for scan results.
 *
 * The application layer defines the contract it needs (`ScanResultRepository`).
 * Infrastructure implementations (in-memory, PostgreSQL, etc.) satisfy this
 * contract. The application layer never depends directly on a database
 * technology — only on this abstraction.
 *
 * This preserves the Dependency Inversion Principle:
 * the interface lives with the consumer, not the implementation.
 */

import type { ScanResult } from './orchestrator.js';
import type { ScanId } from '@devlens/core';

/**
 * The persistence contract for scan results.
 *
 * Write side:
 * - A single `save` call persists the full {@link ScanResult}:
 *   - On a completed scan: both the `Scan` and the `SiteSnapshot` are persisted.
 *   - On a failed scan: only the `Scan` is persisted (snapshot is `null`).
 *
 * Read side:
 * - `getById` retrieves a single result by scan ID.
 * - `list` returns results in deterministic order: `createdAt DESC, scanId ASC`.
 *   When `technologyId` is provided, only scans whose detections include
 *   that technology are returned — the filter is pushed to the database
 *   (or applied in-memory for the in-memory adapter), avoiding a full
 *   load-all-then-filter round-trip.
 *   - When `options.limit` is omitted, all matching results are returned.
 *   - When `options.limit` is provided, at most `limit` results are returned,
 *     starting after the opaque `options.after` cursor (`createdAt` + `scanId`
 *     tie-break). This is the single bulk retrieval backing cursor pagination
 *     of the technology detail page — one call, one round-trip, no N+1.
 * - `aggregate` returns a cheap, technology-scoped rollup (`COUNT` + earliest
 *   `createdAt`) so the Step 89 summary can show a *global* scan total and
 *   true "first detected" date without loading every scan.
 *
 * The implementation decides whether the two writes (scan + snapshot) are
 * performed atomically or sequentially. The application layer delegates
 * that decision to the infrastructure.
 */

/**
 * Opaque pagination cursor — the `(createdAt, scanId)` position of the last
 * row of the current page, used as the `after` boundary for the next page.
 * Encoded as a base64 JSON string by the API layer; the repository only ever
 * inspects the decoded `{ createdAt, scanId }` pair.
 */
export interface ScanCursor {
  /** `createdAt` (ISO 8601) of the cursor's scan — primary chronological key. */
  readonly createdAt: string;
  /** `scan.id` of the cursor's scan — ascending tie-break for equal timestamps. */
  readonly scanId: string;
}

/**
 * Optional paging parameters for {@link ScanResultRepository.list}.
 * Omitting every field yields the unbounded, fully-filtered result set.
 */
export interface ListScanOptions {
  /** Maximum number of scan results to return. The repository applies this as
   *  a hard `LIMIT`. The API layer fetches `pageSize + 1` to detect a next
   *  page and truncates before returning. */
  readonly limit?: number;
  /** Continue strictly after this `(createdAt, scanId)` cursor (newest-first
   *  ordering: `createdAt DESC, scanId ASC`). `null`/omitted = first page. */
  readonly after?: ScanCursor | null;
}

/**
 * Technology-scoped aggregate rollup (Step 89 summary support).
 * Cheap to compute server-side (index-backed `COUNT` + `MIN(createdAt)`);
 * avoids transferring/loading the full detection set the page only needs for
 * its totals.
 */
export interface ScanAggregate {
  /** Total number of scans (across all pages) whose detections include the
   *  technology. The Step 89 "Scans" counter — a global value, independent of
   *  the current page. */
  readonly scanCount: number;
  /** Earliest `createdAt` among those scans — the true "First detected" date
   *  (`null` when none). Global, independent of the current page. */
  readonly firstDetectedAt: string | null;
}

export interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
  getById(scanId: ScanId): Promise<ScanResult | null>;
  list(technologyId?: string, options?: ListScanOptions): Promise<ScanResult[]>;
  /** Technology-scoped rollup for the Step 89 summary (see {@link ScanAggregate}). */
  aggregate(technologyId: string): Promise<ScanAggregate>;
}

/**
 * Persists a `ScanResult` via the given repository.
 *
 * This is a separate application operation from {@link runScan}. It is kept
 * distinct so that `runScan(scan, crawler)` remains a pure orchestration
 * call, and persistence can be composed independently by the runtime
 * (the worker).
 *
 * Persistence failures are **not** caught or transformed here. They
 * propagate as infrastructure errors — they are not converted into
 * `ScanError`. A persistence failure means the scan result may not have
 * been stored, but the scan lifecycle itself (the domain outcome) is
 * already finalized.
 *
 * @param result     — the completed or failed scan result
 * @param repository — the persistence implementation
 * @throws if the repository's `save` rejects
 */
export async function persistResult(
  result: ScanResult,
  repository: ScanResultRepository,
): Promise<void> {
  await repository.save(result);
}
