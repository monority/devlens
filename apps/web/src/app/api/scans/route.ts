/**
 * /api/scans — HTTP entrypoint for scan creation and retrieval.
 *
 * Architecture: this route is a thin HTTP adapter. It delegates all
 * validation, domain construction, and execution to the pure handler
 * in `handler.ts`. The route's only job is to:
 *
 *   1. Read the request body (for POST).
 *   2. Construct real dependencies (HttpCrawler, PostgresScanResultRepository).
 *   3. Call the appropriate handler function.
 *   4. Return a NextResponse.json(...) with the appropriate status.
 *
 * Business logic (scan lifecycle, crawling, persistence mapping) lives
 * in the application layer — not here.
 *
 * SSRF: The HTTP layer validates the URL scheme (http/https only) via
 * the handler. Host-level SSRF protection (localhost, private IPs,
 * link-local, redirects) is enforced by HttpCrawler.crawl() via
 * isBlockedHostname.
 * See docs/architecture/api.md for the full SSRF threat model.
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleCreateScan, handleGetScans, handleGetScansByTechnology } from './handler';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import { HttpCrawler } from '@devlens/crawler';
import { createProductionDetector } from '@devlens/detectors';
import type { HandleCreateScanOptions, HandleGetOptions } from './handler';
import { rateLimitedResponse } from '@/lib/rate-limiter';

/**
 * Applies API-only security headers to a response:
 * - `X-Robots-Tag: noindex` prevents search engines from indexing API endpoints.
 * - `X-Content-Type-Options: nosniff` prevents MIME sniffing on JSON responses.
 * - `Cache-Control: no-store` prevents caching of potentially sensitive scan data.
 */
function withApiHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  return response;
}

/** Constructs the real dependencies for the POST handler. */
function createDependencies(): HandleCreateScanOptions {
  return {
    crawler: new HttpCrawler(),
    detector: createProductionDetector(),
    repository: new PostgresScanResultRepository(createDatabaseClient()),
    generateId: () => crypto.randomUUID(),
    now: new Date(),
  };
}

/** Constructs the real dependencies for the GET handlers. */
function createGetDependencies(): HandleGetOptions {
  return {
    repository: new PostgresScanResultRepository(createDatabaseClient()),
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Rate limit: 10 scan creations per minute per IP (crawling is expensive).
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const limited = rateLimitedResponse('scan', ip);
  if (limited) return limited;

  const body = await request.text();
  const result = await handleCreateScan(body, createDependencies());
  return withApiHeaders(NextResponse.json(result.body, { status: result.status }));
}

/**
 * GET /api/scans — lists all scan results in deterministic order
 * (`createdAt DESC, scanId ASC`).
 *
 * Rate limit: 60 reads per minute per IP.
 *
 * When the `technologyId` query parameter is present, the request is routed to
 * the technology-scoped bulk handler (`handleGetScansByTechnology`) which
 * returns only the scans that detected the given technology — the single
 * data source for the technology detail page (F-001 boundary fix). Otherwise
 * the full scan list is returned.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  const limited = rateLimitedResponse('read', ip);
  if (limited) return limited;

  const technologyId = request.nextUrl.searchParams.get('technologyId');
  if (technologyId !== null) {
    const result = await handleGetScansByTechnology(technologyId, createGetDependencies());
    return withApiHeaders(NextResponse.json(result.body, { status: result.status }));
  }
  const result = await handleGetScans(createGetDependencies());
  return withApiHeaders(NextResponse.json(result.body, { status: result.status }));
}
