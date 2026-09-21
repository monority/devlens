/**
 * Pure handler logic for POST /api/scans.
 *
 * This module is separated from `route.ts` so that the Next.js route
 * handler (which Next.js strictly type-checks for valid route exports)
 * only exports `POST`. All validation, domain-construction, and
 * application-delegation logic lives here in a pure, testable form
 * with zero Next.js dependencies.
 */

import { executeScan, getScan, listScans } from '@devlens/application';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestamp,
} from '@devlens/core';
import type { ScanResult } from '@devlens/application';
import type { Crawler } from '@devlens/crawler';
import type { ScanResultRepository } from '@devlens/application';
import type { Scan } from '@devlens/core';
import type { Detector } from '@devlens/detectors';
import type { DetectionResponse } from '../../../lib/types.js';
import { detectionToResponse } from '../../../lib/detection-to-response';

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
    detections: detections.map((d) => detectionToResponse(d)),
  };
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
    console.error('Scan execution or persistence failed:', error);
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
    console.error('Failed to list scans:', error);
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
    const result = await getScan(scanId as never, options.repository);

    if (result === null) {
      return {
        status: 404,
        body: { error: { code: 'NOT_FOUND', message: 'Scan not found.' } },
      };
    }

    return { status: 200, body: resultToResponse(result) };
  } catch (error) {
    console.error('Failed to retrieve scan:', error);
    return {
      status: 500,
      body: { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
    };
  }
}
