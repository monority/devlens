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
 * Lists all scan results in deterministic order
 * (`createdAt DESC, scanId ASC`).
 *
 * @param repository — the persistence implementation
 * @returns an array of all scan results, empty if none exist.
 */
export async function listScans(repository: ScanResultRepository): Promise<ScanResult[]> {
  return repository.list();
}
