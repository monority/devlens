/**
 * Pure scan-result presentation mapper (no data access).
 *
 * Converts a domain `ScanResult` into the flat UI `ScanSummary` shape that the
 * API serves (see `ScanResponse` / `ScanSummary` in `types.ts`).
 *
 * The technology detail page (`app/technologies/[id]/page.tsx`) no longer
 * reads the persistence layer directly (F-001 boundary fix): it fetches its
 * scan data through the `GET /api/scans?technologyId=...` endpoint (`lib/api.ts`),
 * which loads scans in a single bulk call through the application layer and
 * the repository abstraction. This module is consumed by the API handler to
 * build the lean scan summary projection, so the page and the API share one
 * mapper and one scan-summary shape.
 *
 * The conversion `scanResultToSummary` mirrors the scan mapping performed by
 * `resultToResponse` in the API handler (`app/api/scans/handler.ts`),
 * producing the same flat response the UI consumes.
 */

import type { ScanResult } from '@devlens/application';
import type { ScanSummary } from './types.js';

/**
 * Converts a domain `ScanResult` into the UI `ScanSummary` shape.
 *
 * This mirrors the scan mapping in `apps/web/src/app/api/scans/handler.ts`
 * (`resultToResponse`), producing the same flat response that the existing
 * API returns. It is shared by the API handler (for the technology-scoped
 * endpoint) so the technology detail page and `GET /api/scans` use one
 * consistent scan-summary projection.
 *
 * The `detections` field is intentionally NOT included — the caller supplies
 * detections only where needed (e.g. the technology endpoint attaches the
 * scan's detections via a separate field).
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
