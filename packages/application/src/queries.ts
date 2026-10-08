/**
 * Application-layer read operations for scan history.
 *
 * These functions are the application-side counterparts to
 * {@link executeScan} (the write side). They provide a stable interface
 * that the API layer depends on, keeping the database repository behind
 * the `ScanResultRepository` abstraction.
 *
 * Direction:
 *   API → application queries → repository
 * (never: API → database)
 */

import type { ScanResultRepository, ListScanOptions } from './repository.js';
import type { ScanResult } from './orchestrator.js';
import type { ScanId } from '@devlens/core';

/**
 * Retrieves a single scan result by its ID.
 *
 * @param scanId   — the scan identifier
 * @param repository — the persistence implementation
 * @returns the `ScanResult` if found, or `null` if no scan exists with
 *          that ID. A failed scan IS returned as a valid result.
 */
export async function getScan(
  scanId: ScanId,
  repository: ScanResultRepository,
): Promise<ScanResult | null> {
  return repository.getById(scanId);
}

/**
 * Lists scan results whose detections include the given technology.
 *
 * This is the read query backing the technology detail page
 * (`GET /api/scans?technologyId=<id>`). It delegates to
 * {@link listScans} with the technology filter, which pushes the
 * filtering into the repository — a single bulk retrieval filtered at
 * the data layer (PostgreSQL JSONB `EXISTS` / in-memory), rather than
 * issuing a per-scan query (no DB N+1) and without loading all scans
 * into memory only to discard most of them.
 *
 * Only completed scans carry detections by domain-model design, so
 * failed/pending/running scans are naturally excluded by the predicate.
 *
 * @param technologyId — the canonical technology id to match against
 *                       (`Detection.technology.id`)
 * @param repository   — the persistence implementation
 * @returns            matching scan results, in deterministic order
 *                     (`createdAt DESC, scanId ASC`). Empty if none match.
 */
export async function listScansByTechnology(
  technologyId: string,
  repository: ScanResultRepository,
  options?: ListScanOptions,
): Promise<ScanResult[]> {
  return listScans(repository, technologyId, options);
}

/**
 * Lists all scan results in deterministic order
 * (`createdAt DESC, scanId ASC`).
 *
 * When `technologyId` is provided, the filter is pushed to the
 * repository's `list(technologyId)` — the PostgreSQL adapter filters at
 * the SQL level via a JSONB `EXISTS` scan, and the in-memory adapter
 * filters in-memory. This avoids the load-all-then-filter pattern that
 * would transfer every scan/snapshot for an entire table just to
 * discard most of it.
 *
 * @param repository    — the persistence implementation
 * @param technologyId  — when provided, only scans whose detections
 *                        include a detection with this technology id
 *                        are returned
 * @returns an array of scan results, empty if none exist or none match
 *          the technology filter.
 */
export async function listScans(
  repository: ScanResultRepository,
  technologyId?: string,
  options?: ListScanOptions,
): Promise<ScanResult[]> {
  return repository.list(technologyId, options);
}

/**
 * Technology-scoped aggregate rollup backing the Step 89 summary on the
 * technology detail page (`GET /api/scans?technologyId=<id>`).
 *
 * Returns only the cheap, global scalars (`scanCount` + `firstDetectedAt`)
 * needed for totals/first-detection date — never the full detection set — so
 * the summary stays correct across pages without a load-everything query.
 *
 * @param technologyId — the canonical technology id to match against
 * @param repository   — the persistence implementation
 * @returns the technology-scoped scan count and earliest detection timestamp
 */
export async function listScanAggregate(technologyId: string, repository: ScanResultRepository) {
  return repository.aggregate(technologyId);
}
