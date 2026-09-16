/**
 * Application-level use case that composes scan execution and persistence.
 *
 * This is the single entry point that web and worker runtimes can share:
 * it takes a pending `Scan`, runs it through the crawler, and persists
 * the resulting `ScanResult` via the provided repository.
 *
 * Lifecycle:
 * 1. `runScan` transitions pending → running → completed|failed
 * 2. `persistResult` writes the outcome to the repository
 *
 * Error semantics:
 * - Crawler failures are caught inside `runScan` and converted to a
 *   `failed` scan result — they are domain outcomes, NOT infra errors.
 * - Persistence failures propagate as infrastructure errors — they are
 *   NOT caught or transformed here.
 *
 * @param scan       — the scan to execute (must be in `pending` state)
 * @param crawler    — the crawler implementation
 * @param repository — the persistence implementation
 * @param now        — start timestamp (used for `startedAt`; completion/failure
 *                     timestamps are generated at the real time of completion)
 * @returns the finalized `ScanResult` (persisted)
 */

import type { Crawler } from '@devlens/crawler';
import type { Detector } from '@devlens/detectors';
import type { Scan } from '@devlens/core';
import { runScan } from './orchestrator.js';
import { persistResult } from './repository.js';
import type { ScanResult } from './orchestrator.js';
import type { ScanResultRepository } from './repository.js';

export async function executeScan(
  scan: Scan,
  crawler: Crawler,
  detector: Detector,
  repository: ScanResultRepository,
  now: Date = new Date(),
): Promise<ScanResult> {
  const result = await runScan(scan, crawler, detector, now);
  await persistResult(result, repository);
  return result;
}
