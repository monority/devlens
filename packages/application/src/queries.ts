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

import type { ScanResultRepository } from './repository.js';
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
 * (`GET /api/scans?technologyId=<id>`). It reuses {@link listScans} (one
 * repository `list()` call — a single bulk retrieval) and filters the
 * already-loaded results in memory by technology id, rather than issuing a
 * per-scan query (no DB N+1). Only completed scans carry detections by
 * domain-model design, so failed/pending/running scans are naturally
 * excluded by the predicate.
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
): Promise<ScanResult[]> {
  const results = await listScans(repository);
  return results.filter((result) =>
    result.detections.some((detection) => detection.technology.id === technologyId),
  );
}

/**
 * Lists all scan results in deterministic order
 * (`createdAt DESC, scanId ASC`).
 *
 * @param repository — the persistence implementation
 * @returns an array of all scan results, empty if none exist.
 */
export async function listScans(repository: ScanResultRepository): Promise<ScanResult[]> {
  return repository.list();
}
