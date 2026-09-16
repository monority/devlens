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
 * - `list` returns all results in deterministic order: `createdAt DESC, scanId ASC`.
 *
 * The implementation decides whether the two writes (scan + snapshot) are
 * performed atomically or sequentially. The application layer delegates
 * that decision to the infrastructure.
 */
export interface ScanResultRepository {
  save(result: ScanResult): Promise<void>;
  getById(scanId: ScanId): Promise<ScanResult | null>;
  list(): Promise<ScanResult[]>;
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
