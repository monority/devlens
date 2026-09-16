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
import { handleCreateScan, handleGetScans } from './handler';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import { HttpCrawler } from '@devlens/crawler';
import { createProductionDetector } from '@devlens/detectors';
import type { HandleCreateScanOptions, HandleGetOptions } from './handler';

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
  const body = await request.text();
  const result = await handleCreateScan(body, createDependencies());
  return NextResponse.json(result.body, { status: result.status });
}

/**
 * GET /api/scans — lists all scan results in deterministic order
 * (`createdAt DESC, scanId ASC`).
 */
export async function GET(): Promise<NextResponse> {
  const result = await handleGetScans(createGetDependencies());
  return NextResponse.json(result.body, { status: result.status });
}
