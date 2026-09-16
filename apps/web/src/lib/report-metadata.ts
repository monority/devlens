/**
 * Pure helpers for generating report metadata (page title, description).
 *
 * These functions are independent of React, HTTP, and database.
 * They produce structured metadata objects from scan data, which the
 * Next.js page layer uses in `generateMetadata()`.
 *
 * Security: no raw internal errors, database IDs, stack traces, or
 * filesystem paths are ever included in the metadata. Only the scan
 * target (already visible in the API response) is used to derive the
 * page title.
 */

import type { Metadata } from 'next';
import type { ScanDetailResponse, ScanResponse } from './types.js';

/**
 * Generates the page title from a scan's target URL.
 *
 * Example: `DevLens — https://example.com/`
 */
export function scanReportTitle(scan: ScanResponse): string {
  return `DevLens — ${scan.target}`;
}

/**
 * Generates the page description for a scan report.
 *
 * Always returns a generic description — no scan-specific data is
 * included to avoid leaking internal details.
 */
export function scanReportDescription(): string {
  return 'Technology scan report from DevLens.';
}

/**
 * Generates metadata for a successfully loaded scan (any status:
 * completed, failed, pending, running).
 *
 * The title is derived from the scan target. The description is generic.
 * Raw error data from failed scans is NOT included.
 */
export function generateReportMetadata(result: ScanDetailResponse): Metadata {
  return {
    title: scanReportTitle(result.scan),
    description: scanReportDescription(),
  };
}

/**
 * Metadata for when a scan is not found (404).
 */
export function notFoundMetadata(): Metadata {
  return {
    title: 'DevLens — Scan Not Found',
    description: 'The requested scan could not be found.',
  };
}

/**
 * Metadata for when the scan cannot be loaded (500 / error).
 */
export function errorMetadata(): Metadata {
  return {
    title: 'DevLens — Error',
    description: 'An error occurred while loading the scan report.',
  };
}

/**
 * Generates metadata based on whether the scan was found.
 *
 * - `result === null` → not-found metadata (scan ID doesn't exist)
 * - `result !== null` → report metadata (scan was found, any status)
 */
export function generateDetailMetadata(result: ScanDetailResponse | null): Metadata {
  if (result === null) {
    return notFoundMetadata();
  }
  return generateReportMetadata(result);
}
