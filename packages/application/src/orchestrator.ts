/**
 * Scan orchestration — the application layer that bridges the domain
 * lifecycle (`@devlens/core`) and the crawler (`@devlens/crawler`).
 *
 * Architecture:
 *
 * ```text
 * Scan (pending)
 *    ↓ startScan
 * Scan (running)
 *    ↓ crawler.crawl(target)
 * SiteSnapshot (or CrawlError)
 *    ↓ completeScan / failScan
 * Scan (completed) / Scan (failed) + SiteSnapshot | null
 * ```
 *
 * This module contains **no** HTTP, browser, or persistence logic.
 * It only orchestrates: it calls domain lifecycle factories and the
 * crawler's `crawl()` method. The crawler implementation is injected,
 * making this layer fully testable without network access.
 *
 * HTTP 4xx/5xx responses are valid observations (SiteSnapshot is
 * returned). Only `CrawlError` (network failure, timeout, body too
 * large, SSRF-blocked target) causes the scan to fail.
 *
 * The `SiteSnapshot` is returned as a separate artifact alongside the
 * updated `Scan`. It is **not** embedded in `ScanStatus` — preserving
 * the separation between lifecycle and results established in the
 * domain model.
 */

import type { Crawler } from '@devlens/crawler';
import { CrawlError } from '@devlens/crawler';
import type { Scan, SiteSnapshot, ScanError, Timestamp, Detection } from '@devlens/core';
import { createTimestamp, startScan, completeScan, failScan } from '@devlens/core';
import type { Detector } from '@devlens/detectors';

// ─── Result ────────────────────────────────────────────────────────

/**
 * The result of orchestrating a scan.
 *
 * - `scan` — the updated scan in its new terminal state (`completed`
 *   or `failed`).
 * - `snapshot` — the `SiteSnapshot` produced by the crawler, or `null`
 *   if the scan failed before a snapshot could be produced.
 *
 * The snapshot is returned separately from the scan. It is NOT embedded
 * in `ScanStatus` — see the domain model's "Scan lifecycle ≠ scan
 * results" principle.
 */
export interface ScanResult {
  readonly scan: Scan;
  readonly snapshot: SiteSnapshot | null;
  readonly detections: readonly Detection[];
}

// ─── Error translation ─────────────────────────────────────────────

/**
 * Translates a raw error from the crawler into a domain `ScanError`.
 *
 * - `CrawlError` preserves its `code` and `message` — these are
 *   meaningful, structured error categories (timeout, network_error,
 *   too_large, invalid_target).
 * - Generic `Error` instances get `code: 'UNKNOWN_ERROR'` with their
 *   message preserved.
 * - Any other thrown value gets a generic message.
 */
function toScanError(error: unknown): ScanError {
  if (error instanceof CrawlError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    return { code: 'UNKNOWN_ERROR', message: error.message };
  }
  return { code: 'UNKNOWN_ERROR', message: 'An unknown error occurred' };
}

// ─── Orchestration ─────────────────────────────────────────────────

/**
 * Orchestrates a scan lifecycle.
 *
 * 1. Transitions the scan from `pending` → `running` (via `startScan`).
 * 2. Calls `crawler.crawl(target)` to produce a `SiteSnapshot`.
 * 3. On success: transitions `running` → `completed` (via `completeScan`),
 *    runs `detector.detect(snapshot)` to produce technology detections,
 *    and returns the snapshot and detections as separate artifacts.
 * 4. On failure: translates the error to a `ScanError`, transitions
 *    `running` → `failed` (via `failScan`), and returns `snapshot: null`
 *    and `detections: []`.
 *
 * The `scan` argument must be in `pending` state — `startScan` will
 * throw if it is not.
 *
 * @param scan     — the scan to run (must be in `pending` state)
 * @param crawler  — the crawler implementation to use
 * @param detector — the detector implementation to use (injected for testability)
 * @param now      — the start timestamp (used for `startedAt`). The
 *                   completion/failure timestamp is generated fresh at
 *                   the actual moment of completion/failure so that
 *                   `startedAt <= completedAt` / `startedAt <= failedAt`.
 * @returns a `ScanResult` with the updated scan, an optional snapshot,
 *          and an array of detections
 */
export async function runScan(
  scan: Scan,
  crawler: Crawler,
  detector: Detector,
  now: Date = new Date(),
): Promise<ScanResult> {
  const startTimestamp: Timestamp = createTimestamp(now);

  // pending → running
  const runningScan = startScan(scan, startTimestamp);

  try {
    // Crawl the target — this may throw CrawlError (network, timeout,
    // body-too-large, SSRF) or a generic Error.
    const snapshot = await crawler.crawl(runningScan.target);

    // running → completed — use the real time of completion, not the
    // injected `now`, so that completedAt reflects when the scan
    // actually finished (createdAt ≤ startedAt ≤ completedAt).
    const completeTimestamp: Timestamp = createTimestamp(new Date());
    const completedScan = completeScan(runningScan, completeTimestamp);

    // Run technology detection on the captured snapshot
    const detections = detector.detect(snapshot);

    return { scan: completedScan, snapshot, detections };
  } catch (error) {
    // running → failed — use the real time of failure.
    const scanError: ScanError = toScanError(error);
    const failTimestamp: Timestamp = createTimestamp(new Date());
    const failedScan = failScan(runningScan, scanError, failTimestamp);

    return { scan: failedScan, snapshot: null, detections: [] };
  }
}
