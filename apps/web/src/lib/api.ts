/**
 * API client for the DevLens web application.
 *
 * This module is the only place that calls `fetch` against the internal
 * API. It wraps the HTTP layer with typed responses and structured error
 * handling so that UI components receive plain domain-shaped data and
 * never deal with `Response` objects or status codes directly.
 *
 * The browser consumes the HTTP API only — it never touches the database,
 * the repository, or domain factories.
 */

import type {
  ScansListResponse,
  ScanDetailResponse,
  CreateScanResponse,
  ErrorResponse,
  CreateScanRequest,
} from './types.js';

/** Error thrown when the API returns a non-OK status that is not 404. */
export class ApiError extends Error {
  public readonly status: number;
  public readonly body: ErrorResponse | string;

  constructor(status: number, body: ErrorResponse | string) {
    super(`API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Reads the response body as text and attempts to parse it as JSON.
 * Falls back to the raw text if JSON parsing fails.
 * This avoids the "Body is unusable" error that occurs when calling
 * both `res.json()` and `res.text()` on the same Response.
 */
async function readBody(res: Response): Promise<ErrorResponse | string> {
  const text = await res.text();
  try {
    return JSON.parse(text) as ErrorResponse;
  } catch {
    return text;
  }
}

/**
 * Fetches all scan results from `GET /api/scans`.
 *
 * @returns the list of scan summaries, ordered `createdAt DESC, scanId ASC`
 * @throws {ApiError} if the server returns a non-200 status
 */
export async function fetchScans(): Promise<ScansListResponse> {
  const res = await fetch('/api/scans', { cache: 'no-store' });

  if (!res.ok) {
    throw new ApiError(res.status, await readBody(res));
  }

  return (await res.json()) as ScansListResponse;
}

/**
 * Fetches a single scan result from `GET /api/scans/:id`.
 *
 * @returns the full scan result, or `null` if the scan does not exist (404)
 * @throws {ApiError} if the server returns a non-200/non-404 status
 */
export async function fetchScanById(id: string): Promise<ScanDetailResponse | null> {
  const res = await fetch(`/api/scans/${encodeURIComponent(id)}`, { cache: 'no-store' });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new ApiError(res.status, await readBody(res));
  }

  return (await res.json()) as ScanDetailResponse;
}

/**
 * Extracts a user-facing error message from an API error response body.
 *
 * For 400 responses, the server's validation message is safe to display
 * (it is a user-facing string like "The url must be a valid absolute URL.").
 * For 500 responses, the server already returns a generic message
 * ("An internal error occurred.") — no DB internals are exposed.
 *
 * If the body cannot be parsed as a structured error, a generic fallback
 * message is returned.
 */
export function extractErrorMessage(body: ErrorResponse | string): string {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    if (typeof body.error?.message === 'string') {
      return body.error.message;
    }
  }
  return 'An error occurred. Please try again.';
}

/**
 * Creates a new scan by POSTing to `POST /api/scans`.
 *
 * @param url The target URL to scan.
 * @returns the full scan result (which may have `status: "failed"`).
 * @throws {ApiError} if the server returns a non-200 status (e.g. 400 for
 *   server-side URL validation errors, 500 for infrastructure failures).
 */
export async function createScan(url: string): Promise<CreateScanResponse> {
  const body: CreateScanRequest = { url };
  const res = await fetch('/api/scans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await readBody(res);
    throw new ApiError(res.status, errorBody);
  }

  return (await res.json()) as CreateScanResponse;
}
