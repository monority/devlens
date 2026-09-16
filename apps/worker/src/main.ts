/**
 * Worker logic — the runtime composition layer for `apps/worker`.
 *
 * This module contains two functions:
 *
 * - `formatResult` — a pure, testable function that converts a
 *   `ScanResult` into a human-readable log string.
 * - `main` — the worker entry point that creates a demo scan,
 *   constructs an `HttpCrawler`, delegates execution to `runScan`,
 *   persists the result via `persistResult`, and logs the formatted
 *   result.
 *
 * The worker contains **no** lifecycle logic — no `startScan`,
 * `completeScan`, or `failScan` calls. All lifecycle transitions
 * happen inside `runScan()` (`@devlens/application`).
 */

import { HttpCrawler } from '@devlens/crawler';
import { runScan, persistResult } from '@devlens/application';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import { createProductionDetector } from '@devlens/detectors';
import type { ScanResult } from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestamp,
} from '@devlens/core';
import type { Scan } from '@devlens/core';

// ─── Demo target ───────────────────────────────────────────────────

/**
 * A stable, publicly available URL used for the demo scan.
 *
 * This is intentionally hard-coded (not environment-driven) to keep
 * the worker deterministic and explicit. A real job-processing layer
 * (queue, API input, etc.) would supply the target at runtime — that
 * concern is deferred to a later step.
 */
const DEMO_TARGET_URL = 'https://example.com';

// ─── Result formatting (testable) ──────────────────────────────────

/**
 * Formats a `ScanResult` for console logging.
 *
 * - Completed scans produce a success message.
 * - Failed scans include the error code and message.
 * - Unexpected states (should never occur — `runScan` always returns
 *   `completed` or `failed`) produce a diagnostic message.
 */
export function formatResult(result: ScanResult): string {
  const status = result.scan.status;

  if (status.type === 'completed') {
    return `Scan ${result.scan.id} completed successfully`;
  }

  if (status.type === 'failed') {
    const { code, message } = status.error;
    return `Scan ${result.scan.id} failed (${code}): ${message}`;
  }

  // Unreachable — runScan always returns completed or failed.
  return `Scan ${result.scan.id} in unexpected state: ${status.type}`;
}

// ─── Scan construction ─────────────────────────────────────────────

/**
 * Creates a `Scan` in the `pending` state from the demo target.
 *
 * This is the only place in the worker that constructs a domain object.
 * In a future step, the scan source would be replaced by a queue consumer
 * or API handler — the orchestration logic (`runScan`) would not change.
 */
function createDemoScan(): Scan {
  return createScan(
    createScanId('scan_demo'),
    {
      url: createUrl(DEMO_TARGET_URL),
      hostname: createHostname('example.com'),
    },
    createTimestamp(new Date()),
  );
}

// ─── Entry point ───────────────────────────────────────────────────

/**
 * Executes a single scan end-to-end.
 *
 * Creates a demo scan, constructs an `HttpCrawler`, delegates
 * execution to `runScan()`, persists the result via the PostgreSQL
 * repository, and logs the formatted result.
 *
 * Persistence happens after `runScan` returns and before logging.
 * If persistence fails, the error propagates as an infrastructure
 * error — it is not transformed into a `ScanError` or silently
 * swallowed. The `ScanResult` is already finalized by `runScan`;
 * a persistence failure means the result was not stored, not that
 * the scan itself failed.
 *
 * The worker obtains the database client via `createDatabaseClient`,
 * which reads `DATABASE_URL` from the environment. The worker never
 * imports Drizzle or postgres directly — it interacts with the
 * database solely through the `@devlens/database` abstraction.
 */
export async function main(): Promise<void> {
  const scan = createDemoScan();
  const crawler = new HttpCrawler();
  const db = createDatabaseClient();
  const repository = new PostgresScanResultRepository(db);

  const result = await runScan(scan, crawler, createProductionDetector());
  await persistResult(result, repository);
  console.log(formatResult(result));
}
