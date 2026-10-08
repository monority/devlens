/**
 * Pure handler logic for POST /api/scans.
 *
 * This module is separated from `route.ts` so that the Next.js route
 * handler (which Next.js strictly type-checks for valid route exports)
 * only exports `POST`. All validation, domain-construction, and
 * application-delegation logic lives here in a pure, testable form
 * with zero Next.js dependencies.
 */

import {
  executeScan,
  getScan,
  listScans,
  listScansByTechnology,
  listScanAggregate,
} from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestamp,
  getObservationCoverage,
} from '@devlens/core';
import type { ScanResult, ListScanOptions, ScanCursor } from '@devlens/application';
import type { Crawler } from '@devlens/crawler';
import type { ScanResultRepository } from '@devlens/application';
import type { Scan, ObservationCoverage, ScanResultQualitySummary } from '@devlens/core';
import type { Detector } from '@devlens/detectors';
import type {
  DetectionResponse,
  TechnologyScanSummary,
  TechnologyScansResponse,
  TechnologyScanAggregate,
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

  // Reject pathologically long URLs to prevent DoS. RFC 9110 recommends
  // servers accept at least 8 KiB; browsers typically cap at ~2 KiB.
  // We accept up to 8 KiB (8192 chars) — generous for any legitimate URL.
  if (rawUrl.length > 8192) {
    throw {
      code: 'URL_TOO_LONG' as const,
      message: 'The url must not exceed 8192 characters.',
    };
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
 * Options for {@link handleGetScansByTechnology} — extends the shared GET
 * dependencies with the technology-scoped paging parameters parsed from the
 * request URL (`limit`/`cursor` arrive as strings, decoded by the handler).
 */
export interface HandleGetScansByTechnologyOptions extends HandleGetOptions {
  /** `limit` query param — undefined when absent (no page cap ⇒ load-all). */
  limit?: string | null;
  /** Opaque base64 `cursor` query param — undefined when absent (first page). */
  cursor?: string | null;
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

/** Default page size for the technology detail page's scan listing. */
const DEFAULT_PAGE_SIZE = 50;
/** Hard cap on the page size requested by the client. */
const MAX_PAGE_SIZE = 200;

/** Empty aggregate returned when no scan matches (blank id / empty set). */
const emptyAggregate: TechnologyScanAggregate = { scanCount: 0, firstDetectedAt: null };

/**
 * Parses the `limit` query-param string into a clamped page size.
 * - `undefined`/`null`  → `undefined` (no page cap ⇒ load-all path).
 * - non-numeric/NaN    → `DEFAULT_PAGE_SIZE`.
 * - otherwise          → clamped to `[1, MAX_PAGE_SIZE]`.
 */
function parsePageSize(raw: string | null | undefined): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_PAGE_SIZE, Math.trunc(n)));
}

/**
 * Decodes an opaque base64 cursor into a `{ createdAt, scanId }` pair.
 * Returns `null` for malformed cursors — the caller treats `null` as "start
 * from the beginning", so a corrupt/invalid cursor degrades to the first
 * page rather than failing the request.
 */
function decodeCursor(cursor: string): ScanCursor | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64').toString('utf8'),
    ) as Partial<ScanCursor>;
    if (typeof parsed.createdAt === 'string' && typeof parsed.scanId === 'string') {
      return { createdAt: parsed.createdAt, scanId: parsed.scanId };
    }
  } catch {
    // malformed cursor ⇒ treat as first page
  }
  return null;
}

/**
 * Encodes a `(createdAt, scanId)` position into the opaque base64 cursor
 * format expected by the API. The page reads this back from the response as
 * `nextCursor` and hands it to the next request, never interpreting it.
 */
function encodeCursor(createdAt: string, scanId: string): string {
  return Buffer.from(JSON.stringify({ createdAt, scanId }), 'utf8').toString('base64');
}

/**
 * Handles `GET /api/scans?technologyId=<technologyId>` — the bulk,
 * technology-scoped scan listing backing the technology detail page
 * (F-001: the page no longer reads PostgreSQL directly).
 *
 * A single `listScansByTechnology` call (itself one repository `list()`
 * call) retrieves the scans whose detections include the given technology,
 * then each result is reduced to the lean `{ scan, detections }` projection
 * the page renders. Because only completed scans carry detections by
 * domain-model design, non-completed scans are naturally excluded by the
 * technology predicate — no per-scan DB round-trip and no HTTP N+1.
 *
 * Pagination (Step 97 §4 → implemented): when `limit` or `cursor` is
 * supplied, the fetch is bounded — the repository applies a `(createdAt,
 * scanId)` cursor `WHERE` + `LIMIT`. To detect a next page without a
 * separate `COUNT` query, the handler fetches `pageSize + 1` rows and
 * truncates; `nextCursor` is derived from the last row of the returned page.
 *
 * The Step 89 summary needs *global* totals (`scanCount`, `firstDetectedAt`)
 * that are correct regardless of the current page — these cannot come from a
 * single page, so a cheap `COUNT` + `MIN(createdAt)` aggregate
 * (`listScanAggregate`) is fetched alongside the page. `lastDetectedAt` /
 * `latestConfidence` need no aggregate: the newest scan is always the first
 * row of page 1, which the client already holds.
 *
 * - An empty/absent `technologyId` yields an empty page with HTTP 200 — never
 *   a 404 (a technology with no detected scans is a valid, empty view;
 *   unknown technology *ids* are handled upstream by the page's
 *   `getTechnologyById` → `notFound()`).
 * - Repository errors are returned as 500 with a generic message — no
 *   database internals are leaked.
 */
export async function handleGetScansByTechnology(
  technologyId: string,
  options: HandleGetScansByTechnologyOptions,
): Promise<HandleGetScansByTechnologyResult> {
  if (technologyId.trim() === '') {
    return {
      status: 200,
      body: { scans: [], nextCursor: null, hasMore: false, summary: emptyAggregate },
    };
  }

  try {
    const pageSize = parsePageSize(options.limit);
    const after = options.cursor ? decodeCursor(options.cursor) : null;
    const usePaging = pageSize !== undefined || after !== null;

    // Fetch one extra row when paging so `hasMore` is computable without a
    // second round-trip; otherwise load the full (filtered) set.
    const listOptions: ListScanOptions | undefined = usePaging
      ? { limit: (pageSize ?? DEFAULT_PAGE_SIZE) + 1, after: after ?? null }
      : undefined;

    const [results, aggregate] = await Promise.all([
      listScansByTechnology(technologyId, options.repository, listOptions),
      listScanAggregate(technologyId, options.repository),
    ]);

    let scans: ScanResult[];
    let nextCursor: string | null = null;
    let hasMore = false;

    if (usePaging) {
      const page = pageSize ?? DEFAULT_PAGE_SIZE;
      hasMore = results.length > page;
      scans = results.slice(0, page);
      const last = scans[scans.length - 1];
      nextCursor = hasMore && last ? encodeCursor(last.scan.createdAt, last.scan.id) : null;
    } else {
      scans = results;
    }

    return {
      status: 200,
      body: {
        scans: scans.map((r) => resultToTechnologyScanSummary(r)),
        nextCursor,
        hasMore,
        summary: {
          scanCount: aggregate.scanCount,
          firstDetectedAt: aggregate.firstDetectedAt,
        },
      },
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
