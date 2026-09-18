/**
 * Server-side data-access helpers for scan results.
 *
 * This module bridges the web application's technology-detail page to the
 * existing scan persistence layer (`@devlens/application` + `@devlens/database`).
 *
 * It reuses the existing `listScans` application-layer query — the same one
 * used by the `GET /api/scans` route handler — to fetch ALL persisted scan
 * results (including their detections) in a single database round-trip. This
 * avoids an N+1 pattern: rather than fetching scan summaries via the API and
 * then round-tripping per-scan for detail, we read the full results once.
 *
 * The conversion `scanResultToSummary` mirrors the mapping performed by
 * `resultToResponse` in the API handler, producing the same `ScanSummary`
 * shape that the UI consumes.
 *
 * Only completed scans carry detections (by domain-model design — the
 * in-memory and PostgreSQL repositories store detections only when a
 * snapshot exists). Therefore a scan appears in a technology's detection
 * list only when that technology is actually present in its detections.
 */

import { listScans } from '@devlens/application';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import type { ScanResult } from '@devlens/application';
import type { ScanSummary } from './types.js';

/**
 * Fetches all persisted scan results with full detection data.
 *
 * Uses the same repository construction as the API route handlers
 * (`apps/web/src/app/api/scans/route.ts`). Reuses the existing
 * `listScans` query from `@devlens/application` — no new query,
 * no new database table, no new API endpoint.
 *
 * @returns All scan results in deterministic order (`createdAt DESC, scanId ASC`)
 */
export async function getAllScanResults(): Promise<ScanResult[]> {
  const repository = new PostgresScanResultRepository(createDatabaseClient());
  return listScans(repository);
}

/**
 * Converts a domain `ScanResult` into the UI `ScanSummary` shape.
 *
 * This mirrors the mapping in `apps/web/src/app/api/scans/handler.ts`
 * (`resultToResponse`), producing the same flat response that the
 * existing API returns. It is kept here so the technology detail page
 * can reuse `ScanCard` and other UI components that expect `ScanSummary`.
 *
 * The `detections` field is intentionally NOT included — the caller
 * filters on the domain `ScanResult` before calling this function.
 */
export function scanResultToSummary(result: ScanResult): ScanSummary {
  const { scan } = result;
  const status = scan.status;

  let startedAt: string | null = null;
  let completedAt: string | null = null;
  let failedAt: string | null = null;
  let error: { code: string; message: string } | null = null;

  switch (status.type) {
    case 'running':
      startedAt = status.startedAt;
      break;
    case 'completed':
      completedAt = status.completedAt;
      break;
    case 'failed':
      failedAt = status.failedAt;
      error = { code: status.error.code, message: status.error.message };
      break;
    case 'pending':
      break;
  }

  return {
    id: scan.id,
    status: status.type,
    target: scan.target.url,
    hostname: scan.target.hostname,
    createdAt: scan.createdAt,
    startedAt,
    completedAt,
    failedAt,
    error,
  };
}
