/**
 * Shared test helpers for crawler tests.
 *
 * These helpers are used by the Step 12 test suites
 * (snapshot-determinism, snapshot-normalization, observation-coverage,
 * and edge-cases tests) to avoid duplicating mock-fetch / handler
 * boilerplate across multiple files.
 */

import { createUrl, createHostname } from '@devlens/core';
import type {
  ScanTarget,
  SiteSnapshot,
  HttpHeader,
  Resource,
  ScriptTag,
  LinkTag,
} from '@devlens/core';

// ─── Mock fetch helpers ────────────────────────────────────────────

/** Handler type for mock fetch. Receives the URL string and fetch init. */
export type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Wraps a handler function as a `typeof fetch` compatible mock. */
export function mockFetch(handler: FetchHandler): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  };
}

/** Creates a mock that returns an HTML response with sensible defaults. */
export function htmlResponse(
  body: string,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

/** Creates a mock Response with arbitrary status and headers. */
export function mockResponse(
  body: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

/** Creates a fetch mock that delays before responding, respecting abort signals. */
export function slowFetch(
  delayMs: number,
  response: Response,
  error: Error = makeAbortError(),
): typeof fetch {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response), delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(error);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };
}

function makeAbortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

// ─── Snapshot constructors ─────────────────────────────────────────

export function makeTarget(url = 'https://example.com', hostname = 'example.com'): ScanTarget {
  return {
    url: createUrl(url),
    hostname: createHostname(hostname),
  };
}

/**
 * Creates a minimal valid SiteSnapshot for unit testing detectors.
 * All fields have sensible defaults; pass overrides to customize.
 */
export function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: '2025-06-01T12:00:00.000Z' as SiteSnapshot['capturedAt'],
    http: {
      statusCode: 200 as SiteSnapshot['http']['statusCode'],
      headers: [{ name: 'content-type', value: 'text/html' }],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
    ...overrides,
  };
}

/**
 * Builds a mock fetch handler that serves the given HTML for the page URL
 * and 404s for robots.txt (to avoid resource observation noise in tests
 * that only care about HTML extraction).
 */
export function pageOnlyFetch(html: string): typeof fetch {
  return mockFetch((url) => {
    if (url.endsWith('/robots.txt')) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
    }
    return htmlResponse(html);
  });
}

/**
 * Compares two snapshots for structural equality, ignoring the
 * `capturedAt` field (which is inherently time-dependent).
 */
export function snapshotEqual(a: SiteSnapshot, b: SiteSnapshot): boolean {
  // Strip the non-deterministic capturedAt field before comparison
  const restA = { ...a, capturedAt: undefined };
  const restB = { ...b, capturedAt: undefined };
  return JSON.stringify(restA) === JSON.stringify(restB);
}

export type { HttpHeader, Resource, ScriptTag, LinkTag };
