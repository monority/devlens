/**
 * GET /api/scans/:id — retrieve a single scan result by ID.
 *
 * Architecture: this route is a thin HTTP adapter. It delegates to the
 * pure `handleGetScanById` handler in `../handler.js`. The route's only
 * job is to:
 *
 *   1. Extract the `id` from the URL path parameter.
 *   2. Construct real dependencies (PostgresScanResultRepository).
 *   3. Call handleGetScanById(id, deps).
 *   4. Return a NextResponse.json(...) with the appropriate status.
 *
 * - 200: scan found (including `failed` scans — failure is a terminal
 *   state, not "not found").
 * - 404: no scan exists with the given ID.
 * - 500: infrastructure failure (repository error, etc.) — no DB
 *   internals are leaked to the client.
 *
 * See docs/architecture/api.md for the full API contract.
 */

import { NextResponse } from 'next/server';
import { handleGetScanById } from '../handler';
import { createDatabaseClient, PostgresScanResultRepository } from '@devlens/database';
import type { HandleGetOptions } from '../handler';

/** Constructs the real dependencies for the GET handler. */
function createDependencies(): HandleGetOptions {
  return {
    repository: new PostgresScanResultRepository(createDatabaseClient()),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const result = await handleGetScanById(id, createDependencies());
  return NextResponse.json(result.body, { status: result.status });
}
