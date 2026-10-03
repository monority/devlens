/**
 * Pure handler logic for POST /api/scans.
 *
 * This module is separated from `route.ts` so that the Next.js route
 * handler (which Next.js strictly type-checks for valid route exports)
 * only exports `POST`. All validation, domain-construction, and
 * application-delegation logic lives here in a pure, testable form
 * with zero Next.js dependencies.
 */

import { executeScan, getScan, listScans, listScansByTechnology } from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestamp,
  getObservationCoverage,
} from '@devlens/core';
import type { ScanResult } from '@devlens/application';
import type { Crawler } from '@devlens/crawler';
import type { ScanResultRepository } from '@devlens/application';
import type { Scan, ObservationCoverage, ScanResultQualitySummary } from '@devlens/core';
import type { Detector } from '@devlens/detectors';
import type {
  DetectionResponse,
  TechnologyScanSummary,
  TechnologyScansResponse,
} from '../../../lib/types.js';
import { detectionToResponse } from '../../../lib/detection-to-response';
import { scanResultToSummary } from '../../../lib/scan-data';
import { getScanResultQuality } from '../../../lib/scan-result-quality';

// ─── Response types ──────────────────────────────────────────────────

/**
 * JSON response body for a successful scan execution.
 * Based strictly on domain types — no database row fields exposed.
 */
export interface CreateScanResponse {
  scan: {
    id: string;
    status: string;
    target: string;
    hostname: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    failedAt: string | null;
    error: { code: string; message: string } | null;
  };
  snapshot: {
    url: string;
    hostname: string;
    capturedAt: string;
    http: {
      statusCode: number;
      contentType: string;
      finalUrl: string;
    };
    html: {
      title: string;
      description: string | null;
    };
  } | null;
  /**
   * Observation coverage / blind-spot intelligence (Step 78 §9 #2).
   * Always computed server-side from the full domain snapshot (before it
   * is stripped into the `SnapshotResponse` above) — an absent snapshot
   * yields an empty, all-`not_observed` coverage.
   */
  observationCoverage: ObservationCoverage;
  /**
   * Scan-level result-quality summary (Step 79). Computed server-side from
   * the already-derived detection signal quality (Step 76) and observation
   * coverage (Step 78) — no detection/scoring/coverage logic is recomputed.
   * Optional for forward compatibility; always present for scans served by
   * this handler.
   */
  resultQuality?: ScanResultQualitySummary;
  detections: DetectionResponse[];
}

/**
 * JSON response body for an error (HTTP 400 or 500).
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Discriminated union so TypeScript can narrow `body` by `status`.
 */
export type HandleCreateScanResult =
  | { status: 400; body: ErrorResponse }
  | { status: 200; body: CreateScanResponse }
  | { status: 500; body: ErrorResponse };

/**
 * JSON response body for GET /api/scans.
 * Contains a list of scan summaries, each in the same shape as a POST
 * response's `scan` field — no database internals are exposed.
 */
export interface ListScansResponse {
  scans: ScanSummaryResponse[];
}

/**
 * A compact summary of a scan, suitable for listing.
 * Reuses the exact same field set as the POST `scan` response so that
 * GET-by-ID and GET-list remain consistent (Section 9 — response contract).
 */
export type ScanSummaryResponse = CreateScanResponse['scan'];

/**
 * Discriminated union so TypeScript can narrow `body` by `status`.
 */
export type HandleGetScansResult =
  { status: 200; body: ListScansResponse } | { status: 500; body: ErrorResponse };

/**
 * Result for `GET /api/scans?technologyId=<id>` — the bulk, technology-scoped
 * scan listing that backs the technology detail page (F-001 boundary fix).
 *
 * - 200: the scans that detected the given technology (may be empty).
 * - 500: infrastructure failure (repository error, etc.).
 */
export type HandleGetScansByTechnologyResult =
  { status: 200; body: TechnologyScansResponse } | { status: 500; body: ErrorResponse };

/**
 * Discriminated union for GET /api/scans/:id.
 *
 * - 200: scan found (including `failed` scans — a failed scan is NOT
 *   a not-found; it is a valid, retrievable result).
 * - 404: no scan exists with the given ID.
 * - 500: infrastructure failure (repository error, etc.).
 */
export type HandleGetScanByIdResult =
  | { status: 200; body: CreateScanResponse }
  | { status: 404; body: ErrorResponse }
  | { status: 500; body: ErrorResponse };

// ─── URL validation ──────────────────────────────────────────────────

/**
 * Validates that the raw string is an absolute http: or https: URL.
 * Throws a structured error object (not an Error instance) for the
 * caller to convert to a 400 response.
 */
function validateUrl(rawUrl: string): URL {
  if (rawUrl.trim() === '') {
    throw { code: 'EMPTY_URL' as const, message: 'The url field must not be empty.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw { code: 'INVALID_URL' as const, message: 'The url must be a valid absolute URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw {
      code: 'UNSUPPORTED_PROTOCOL' as const,
      message: 'The url must use the http or https protocol.',
    };
  }

  return parsed;
}

// ─── Response conversion ─────────────────────────────────────────────

/**
 * Converts a domain `ScanResult` into the HTTP response shape.
 * Does not expose any database row structure.
 */
function resultToResponse(result: ScanResult): CreateScanResponse {
  const { scan, snapshot, detections } = result;
  const status = scan.status;

  // Derived server-side from the full domain snapshot (Step 78). Computed on
  // the whole resource set before the snapshot is stripped to its
  // `SnapshotResponse` shape — no acquisition logic is duplicated here.
  const observationCoverage = getObservationCoverage(snapshot);

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

  const detectionResponses = detections.map((d) => detectionToResponse(d));
  // Step 79 — result quality reuses the signal quality already attached to
  // each `DetectionResponse` (by `detectionToResponse` → `getDetectionExplainability`)
  // and the observation coverage computed above. No detection/scoring/coverage
  // logic is recomputed here.
  const resultQuality = getScanResultQuality({
    detections: detectionResponses,
    observationCoverage,
  });

  return {
    scan: {
      id: scan.id,
      status: status.type,
      target: scan.target.url,
      hostname: scan.target.hostname,
      createdAt: scan.createdAt,
      startedAt,
      completedAt,
      failedAt,
      error,
    },
    snapshot: snapshot
      ? {
          url: snapshot.url,
          hostname: snapshot.hostname,
          capturedAt: snapshot.capturedAt,
          http: {
            statusCode: snapshot.http.statusCode,
            contentType: snapshot.http.contentType,
            finalUrl: snapshot.http.finalUrl,
          },
          html: {
            title: snapshot.html.title,
            description: snapshot.html.description,
          },
        }
      : null,
    observationCoverage,
    detections: detectionResponses,
    resultQuality,
  };
}

// ─── Error logging helper ────────────────────────────────────────────

/**
 * Extracts a safe, minimal representation of an error for server-side
 * logging. Never passes the full error object to `console.error` —
 * raw error objects may carry infrastructure details (e.g. PostgreSQL
 * connection strings embedded in driver error properties) that should
 * not appear in server logs.
 *
 * Logs only the error name and message, plus any stable application
 * context provided by the caller.
 */
function toLoggableError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

// ─── Request handler (pure, testable without Next.js runtime) ────────

/**
 * Dependencies injected for testability.
 */
export interface HandleCreateScanOptions {
  crawler: Crawler;
  detector: Detector;
  repository: ScanResultRepository;
  generateId: () => string;
  now: Date;
}

/**
 * Handles the Create Scan use case without any Next.js types.
 *
 * Returns a structured result containing the HTTP status and response body.
 * Crawler/domain failures are returned as 200 with the failed scan in the body.
 * Infrastructure failures (persistence errors) are returned as 500.
 */
export async function handleCreateScan(
  body: string,
  options: HandleCreateScanOptions,
): Promise<HandleCreateScanResult> {
  // ── 1. Parse JSON ──────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return {
      status: 400,
      body: { error: { code: 'MALFORMED_JSON', message: 'Request body must be valid JSON.' } },
    };
  }

  // ── 2. Validate structure ───────────────────────────────────────
  if (typeof parsed !== 'object' || parsed === null || !('url' in parsed)) {
    return {
      status: 400,
      body: {
        error: { code: 'MISSING_URL', message: 'The request body must contain a "url" field.' },
      },
    };
  }

  // ── 3. Validate URL type ────────────────────────────────────────
  const rawUrl = (parsed as { url: unknown }).url;
  if (typeof rawUrl !== 'string') {
    return {
      status: 400,
      body: { error: { code: 'INVALID_URL_TYPE', message: 'The "url" field must be a string.' } },
    };
  }

  // ── 4. Validate URL scheme ──────────────────────────────────────
  let parsedUrl: URL;
  try {
    parsedUrl = validateUrl(rawUrl);
  } catch (e) {
    const err = e as { code: string; message: string };
    return {
      status: 400,
      body: { error: { code: err.code, message: err.message } },
    };
  }

  // ── 5. Construct domain Scan + execute + persist ────────────────
  // Scan construction is inside the try block so that any unexpected
  // error (e.g. invalid ID generation) is caught and returned as 500,
  // not leaked to the caller.
  try {
    const scan: Scan = createScan(
      createScanId(options.generateId()),
      {
        url: createUrl(parsedUrl.href),
        hostname: createHostname(parsedUrl.hostname),
      },
      createTimestamp(options.now),
    );

    const result = await executeScan(
      scan,
      options.crawler,
      options.detector,
      options.repository,
      options.now,
    );
    return { status: 200, body: resultToResponse(result) };
  } catch (error) {
    // Any error reaching here is an infrastructure failure (persistence,
    // unexpected). Domain scan failures are handled inside runScan —
    // they produce a failed ScanResult that is persisted normally.
    console.error('Scan execution or persistence failed:', toLoggableError(error));
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
    };
  }
}

// ─── GET request handlers (pure, testable without Next.js runtime) ─

/**
 * Dependencies for read handlers.
 */
export interface HandleGetOptions {
  repository: ScanResultRepository;
}

/**
 * Handles GET /api/scans — lists all scan results.
 *
 * Returns all persisted scans in deterministic order
 * (`createdAt DESC, scanId ASC`), each represented in the same shape
 * as the POST response (Section 9 — response contract). An empty
 * list yields `{ scans: [] }` with HTTP 200.
 *
 * Repository errors are returned as 500 with a generic error message
 * — no database internals are leaked (Section 14 — security/exposure).
 */
export async function handleGetScans(options: HandleGetOptions): Promise<HandleGetScansResult> {
  try {
    const results = await listScans(options.repository);
    return {
      status: 200,
      body: { scans: results.map((r) => resultToResponse(r).scan) },
    };
  } catch (error) {
    console.error('Failed to list scans:', toLoggableError(error));
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
    };
  }
}

/**
 * Projects a domain `ScanResult` onto the technology detail page's minimal
 * shape: the lean scan summary + the scan's raw detections (the page maps
 * them to `DetectionResponse` through its existing presentation pipeline).
 */
function resultToTechnologyScanSummary(result: ScanResult): TechnologyScanSummary {
  return {
    scan: scanResultToSummary(result),
    detections: [...result.detections],
  };
}

/**
 * Handles `GET /api/scans?technologyId=<technologyId>` — the bulk,
 * technology-scoped scan listing backing the technology detail page
 * (F-001: the page no longer reads PostgreSQL directly).
 *
 * A single `listScansByTechnology` call (itself one repository `list()` call)
 * retrieves every scan whose detections include the given technology, then
 * each result is reduced to the lean `{ scan, detections }` projection the
 * page renders. Because only completed scans carry detections by
 * domain-model design, non-completed scans are naturally excluded by the
 * technology predicate — no per-scan DB round-trip and no HTTP N+1.
 *
 * - An empty/absent `technologyId` yields `{ scans: [] }` with HTTP 200 —
 *   never a 404 (a technology with no detected scans is a valid, empty view;
 *   unknown technology *ids* are handled upstream by the page's
 *   `getTechnologyById` → `notFound()`).
 * - Repository errors are returned as 500 with a generic message — no
 *   database internals are leaked.
 */
export async function handleGetScansByTechnology(
  technologyId: string,
  options: HandleGetOptions,
): Promise<HandleGetScansByTechnologyResult> {
  if (technologyId.trim() === '') {
    return { status: 200, body: { scans: [] } };
  }
  try {
    const results = await listScansByTechnology(technologyId, options.repository);
    return {
      status: 200,
      body: { scans: results.map((r) => resultToTechnologyScanSummary(r)) },
    };
  } catch (error) {
    console.error('Failed to list scans by technology:', toLoggableError(error));
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
    };
  }
}

/**
 * Handles GET /api/scans/:id — retrieves a single scan by ID.
 *
 * - If the scan exists (including `failed` status), returns 200 with
 *   the full scan result in the same shape as the POST response.
 * - If no scan exists with that ID, returns 404 with a structured
 *   not-found error.
 * - If the repository throws, returns 500 with a generic error message
 *   — no database internals are leaked.
 *
 * The `scanId` is passed through directly. If it is empty, a 404 is
 * returned immediately (no repository call needed).
 */
export async function handleGetScanById(
  scanId: string,
  options: HandleGetOptions,
): Promise<HandleGetScanByIdResult> {
  if (scanId.trim() === '') {
    return {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'Scan not found.' } },
    };
  }

  try {
    const result = await getScan(createScanId(scanId), options.repository);

    if (result === null) {
      return {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Scan not found.' } },
      };
    }

    return { status: 200, body: resultToResponse(result) };
  } catch (error) {
    console.error('Failed to retrieve scan:', toLoggableError(error));
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
    };
  }
}
