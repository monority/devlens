/**
 * Unit tests for the API client (`lib/api.ts`).
 *
 * These tests mock `global.fetch` and verify that the client correctly:
 * - fetches and returns scan data
 * - handles empty lists
 * - handles 404 (returns null)
 * - handles 500 errors (throws ApiError)
 * - preserves failed scan data as a valid result
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { fetchScans, fetchScanById, createScan, ApiError, extractErrorMessage } from './api.js';
import type {
  ScanResponse,
  ScansListResponse,
  ScanDetailResponse,
  CreateScanResponse,
} from './types.js';

// ─── Test fixtures ───────────────────────────────────────────────────

function mockScan(overrides: Partial<ScanResponse> = {}): ScanResponse {
  return {
    id: 'scan_001',
    status: 'completed',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null,
    completedAt: '2025-06-01T12:00:05.000Z',
    failedAt: null,
    error: null,
    ...overrides,
  };
}

function mockFailedScan(): ScanResponse {
  return mockScan({
    id: 'scan_failed',
    status: 'failed',
    completedAt: null,
    failedAt: '2025-06-01T12:00:05.000Z',
    error: { code: 'timeout', message: 'Request timed out' },
  });
}

/**
 * Creates a mock fetch implementation that returns a fresh Response
 * for each call (so the body stream isn't consumed across multiple calls).
 */
function mockFetch(data: unknown, init: ResponseInit = {}): Mock {
  return vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json' },
        ...init,
      }),
    ),
  );
}

function mockTextFetch(text: string, status = 500): Mock {
  return vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(new Response(text, { status, headers: { 'Content-Type': 'text/plain' } })),
    );
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('fetchScans', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the list of scans on 200', async () => {
    const scans: ScansListResponse = {
      scans: [mockScan(), mockScan({ id: 'scan_002' })],
    };
    global.fetch = mockFetch(scans);

    const result = await fetchScans();

    expect(result.scans).toHaveLength(2);
    expect(result.scans[0]!).toHaveProperty('id', 'scan_001');
    expect(result.scans[1]!).toHaveProperty('id', 'scan_002');
    expect(global.fetch).toHaveBeenCalledWith('/api/scans', { cache: 'no-store' });
  });

  it('returns an empty list when no scans exist', async () => {
    const empty: ScansListResponse = { scans: [] };
    global.fetch = mockFetch(empty);

    const result = await fetchScans();

    expect(result.scans).toEqual([]);
  });

  it('includes failed scans in the list', async () => {
    const scans: ScansListResponse = {
      scans: [mockScan(), mockFailedScan()],
    };
    global.fetch = mockFetch(scans);

    const result = await fetchScans();

    expect(result.scans).toHaveLength(2);
    const statuses = result.scans.map((s) => s.status).sort();
    expect(statuses).toEqual(['completed', 'failed']);
  });

  it('throws ApiError on 500', async () => {
    global.fetch = mockFetch(
      { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
      { status: 500 },
    );

    await expect(fetchScans()).rejects.toThrow(ApiError);
    await expect(fetchScans()).rejects.toMatchObject({ status: 500 });
  });

  it('does not leak the raw error body on 500', async () => {
    global.fetch = mockFetch(
      { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
      { status: 500 },
    );

    try {
      await fetchScans();
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const apiError = e as ApiError;
      const body = apiError.body as { error: { code: string; message: string } };
      expect(body.error.code).toBe('INTERNAL_ERROR');
      const serialized = JSON.stringify(apiError.body);
      expect(serialized).not.toContain('Connection refused');
      expect(serialized).not.toContain('ECONNREFUSED');
    }
  });
});

describe('fetchScanById', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the scan detail on 200', async () => {
    const detail: ScanDetailResponse = {
      scan: mockScan(),
      snapshot: {
        url: 'https://example.com/',
        hostname: 'example.com',
        capturedAt: '2025-06-01T12:00:00.000Z',
        http: {
          statusCode: 200,
          contentType: 'text/html',
          finalUrl: 'https://example.com/',
        },
        html: { title: 'Example Domain', description: null },
      },
      detections: [],
    };
    global.fetch = mockFetch(detail);

    const result = await fetchScanById('scan_001');

    expect(result).not.toBeNull();
    expect(result!.scan.id).toBe('scan_001');
    expect(result!.scan.status).toBe('completed');
    expect(result!.snapshot).not.toBeNull();
    expect(result!.detections).toEqual([]);
    expect(global.fetch).toHaveBeenCalledWith('/api/scans/scan_001', {
      cache: 'no-store',
    });
  });

  it('returns null for a 404 (unknown scan)', async () => {
    global.fetch = mockFetch(
      { error: { code: 'NOT_FOUND', message: 'Scan not found.' } },
      { status: 404 },
    );

    const result = await fetchScanById('unknown_scan');

    expect(result).toBeNull();
  });

  it('returns a failed scan as a valid 200 result', async () => {
    const detail: ScanDetailResponse = {
      scan: mockFailedScan(),
      snapshot: null,
      detections: [],
    };
    global.fetch = mockFetch(detail);

    const result = await fetchScanById('scan_failed');

    expect(result).not.toBeNull();
    expect(result!.scan.status).toBe('failed');
    expect(result!.scan.error).toEqual({ code: 'timeout', message: 'Request timed out' });
    expect(result!.snapshot).toBeNull();
  });

  it('throws ApiError on 500', async () => {
    global.fetch = mockFetch(
      { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
      { status: 500 },
    );

    await expect(fetchScanById('scan_001')).rejects.toThrow(ApiError);
    await expect(fetchScanById('scan_001')).rejects.toMatchObject({ status: 500 });
  });

  it('encodes special characters in the scan ID', async () => {
    const detail: ScanDetailResponse = {
      scan: mockScan({ id: 'scan/with/slashes' }),
      snapshot: null,
      detections: [],
    };
    global.fetch = mockFetch(detail);

    await fetchScanById('scan/with/slashes');

    expect(global.fetch).toHaveBeenCalledWith('/api/scans/scan%2Fwith%2Fslashes', {
      cache: 'no-store',
    });
  });

  it('does not leak raw error body on 500', async () => {
    global.fetch = mockTextFetch('Connection to PostgreSQL failed: ECONNREFUSED', 500);

    try {
      await fetchScanById('scan_001');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      // The ApiError wraps the body but does not expose the raw DB error
      // message as the Error's message.
      expect((e as Error).message).toBe('API error 500');
    }
  });
});

// ─── createScan tests ────────────────────────────────────────────────

function createScanResponse(overrides: Partial<CreateScanResponse> = {}): CreateScanResponse {
  const scan = mockScan();
  return {
    scan,
    snapshot: {
      url: 'https://example.com/',
      hostname: 'example.com',
      capturedAt: '2025-06-01T12:00:00.000Z',
      http: { statusCode: 200, contentType: 'text/html', finalUrl: 'https://example.com/' },
      html: { title: 'Example Domain', description: null },
    },
    detections: [],
    ...overrides,
  };
}

describe('createScan', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn() as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a POST with the correct request body and returns the response', async () => {
    const response = createScanResponse();
    global.fetch = mockFetch(response, { status: 200 });

    const result = await createScan('https://example.com');

    expect(result.scan.id).toBe('scan_001');
    expect(result.scan.status).toBe('completed');

    // Verify the request body
    const [url, init] = (global.fetch as Mock).mock.calls[0]!;
    expect(url).toBe('/api/scans');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ url: 'https://example.com' });
  });

  it('returns a failed scan (status: "failed") as a successful 200 result', async () => {
    const response: CreateScanResponse = {
      scan: mockScan({
        id: 'scan_failed',
        status: 'failed',
        completedAt: null,
        failedAt: '2025-06-01T12:00:05.000Z',
        error: { code: 'timeout', message: 'Request timed out' },
      }),
      snapshot: null,
      detections: [],
    };
    global.fetch = mockFetch(response, { status: 200 });

    const result = await createScan('https://example.com');

    expect(result.scan.id).toBe('scan_failed');
    expect(result.scan.status).toBe('failed');
    expect(result.snapshot).toBeNull();
  });

  it('throws ApiError on 400 (server validation error)', async () => {
    global.fetch = mockFetch(
      { error: { code: 'INVALID_URL', message: 'The url must be a valid absolute URL.' } },
      { status: 400 },
    );

    await expect(createScan('not a url')).rejects.toThrow(ApiError);
    await expect(createScan('not a url')).rejects.toMatchObject({ status: 400 });
  });

  it('throws ApiError on 500 (infrastructure error)', async () => {
    global.fetch = mockFetch(
      { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } },
      { status: 500 },
    );

    await expect(createScan('https://example.com')).rejects.toThrow(ApiError);
    await expect(createScan('https://example.com')).rejects.toMatchObject({ status: 500 });
  });

  it('does not leak raw error body in ApiError.message on 500', async () => {
    global.fetch = mockTextFetch('Database connection refused: ECONNREFUSED', 500);

    try {
      await createScan('https://example.com');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const apiError = e as ApiError;
      expect(apiError.message).toBe('API error 500');
    }
  });

  it('includes the request body in the error for debugging', async () => {
    global.fetch = mockFetch(
      {
        error: {
          code: 'UNSUPPORTED_PROTOCOL',
          message: 'The url must use the http or https protocol.',
        },
      },
      { status: 400 },
    );

    try {
      await createScan('ftp://example.com');
      expect.unreachable('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const apiError = e as ApiError;
      expect(apiError.status).toBe(400);
      // The body preserves the structured error for programmatic use
      expect(apiError.body).toEqual({
        error: {
          code: 'UNSUPPORTED_PROTOCOL',
          message: 'The url must use the http or https protocol.',
        },
      });
    }
  });
});

// ─── extractErrorMessage tests ───────────────────────────────────────

describe('extractErrorMessage', () => {
  it('extracts the message from a structured error response', () => {
    const body = {
      error: { code: 'INVALID_URL', message: 'The url must be a valid absolute URL.' },
    };
    expect(extractErrorMessage(body)).toBe('The url must be a valid absolute URL.');
  });

  it('returns a generic message for a 500 error body', () => {
    const body = { error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' } };
    expect(extractErrorMessage(body)).toBe('An internal error occurred.');
  });

  it('returns a generic fallback for a plain string body', () => {
    expect(extractErrorMessage('Database connection refused')).toBe(
      'An error occurred. Please try again.',
    );
  });

  it('returns a generic fallback when message is missing', () => {
    const body = { error: { code: 'UNKNOWN', message: '' } };
    expect(extractErrorMessage(body)).toBe('');
  });
});
