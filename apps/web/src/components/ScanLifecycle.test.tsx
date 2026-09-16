/**
 * Unit tests for the `ScanLifecycle` client component.
 *
 * `ScanLifecycle` manages polling state via `useEffect` and `useState`.
 * Since `renderToString` from `react-dom/server` does not execute
 * `useEffect`, these tests verify the **initial render** for each scan
 * state — confirming the correct content is shown before any polling
 * occurs.
 *
 * The polling behavior (timer setup, interval cleanup, refetching) is
 * driven by pure helper functions (`isScanning`, `isTerminal`) that are
 * tested separately in `scan-utils.test.ts`, and the API client
 * (`fetchScanById`) is tested in `api.test.ts`.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { ScanLifecycle } from './ScanLifecycle.js';
import type { ScanDetailResponse } from '../lib/types.js';

// Mock the API client so that no real fetch calls happen if useEffect
// were to run (it doesn't during renderToString, but this is defensive).
vi.mock('../lib/api.js', () => ({
  fetchScanById: vi.fn(),
  ApiError: class {
    status: number;
    body: unknown;
    message: string;
    constructor(status: number, body: unknown) {
      this.status = status;
      this.body = body;
      this.message = `API error ${status}`;
    }
  },
  extractErrorMessage: vi.fn(),
  createScan: vi.fn(),
  fetchScans: vi.fn(),
}));

// ─── Test fixtures ───────────────────────────────────────────────────

function makeResult(
  status: string,
  overrides: Partial<ScanDetailResponse> = {},
): ScanDetailResponse {
  const scanBase = {
    id: 'scan_001',
    target: 'https://example.com/',
    hostname: 'example.com',
    createdAt: '2025-06-01T12:00:00.000Z',
    startedAt: null as string | null,
    completedAt: null as string | null,
    failedAt: null as string | null,
    error: null as { code: string; message: string } | null,
  };

  switch (status) {
    case 'pending':
      return {
        scan: { ...scanBase, status: 'pending' },
        snapshot: null,
        detections: [],
        ...overrides,
      };
    case 'running':
      return {
        scan: { ...scanBase, status: 'running', startedAt: '2025-06-01T12:00:01.000Z' },
        snapshot: null,
        detections: [],
        ...overrides,
      };
    case 'completed':
      return {
        scan: { ...scanBase, status: 'completed', completedAt: '2025-06-01T12:00:05.000Z' },
        snapshot: {
          url: 'https://example.com/',
          hostname: 'example.com',
          capturedAt: '2025-06-01T12:00:00.000Z',
          http: { statusCode: 200, contentType: 'text/html', finalUrl: 'https://example.com/' },
          html: { title: 'Example Domain', description: 'An example site' },
        },
        detections: [
          {
            technology: { id: 'nginx', name: 'nginx', category: 'server' },
            confidence: 80,
            evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
          },
        ],
        ...overrides,
      };
    case 'failed':
      return {
        scan: {
          ...scanBase,
          status: 'failed',
          failedAt: '2025-06-01T12:00:05.000Z',
          error: { code: 'timeout', message: 'Request timed out' },
        },
        snapshot: null,
        detections: [],
        ...overrides,
      };
    default:
      throw new Error(`Unknown status: ${status}`);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ScanLifecycle — initial render', () => {
  const scanId = 'scan_001';

  it('renders scan data for a completed scan (no polling indicator)', () => {
    const result = makeResult('completed');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // Shows scan metadata
    expect(cleaned).toContain('https://example.com/');
    expect(cleaned).toContain('Completed');

    // Shows snapshot
    expect(cleaned).toContain('Snapshot');
    expect(cleaned).toContain('Example Domain');

    // Shows detections
    expect(cleaned).toContain('Detections (1)');
    expect(cleaned).toContain('nginx');

    // No polling indicator on initial render
    expect(cleaned).not.toContain('Failed to refresh');
  });

  it('renders failed scan data (error code and message)', () => {
    const result = makeResult('failed');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Failed');
    expect(cleaned).toContain('timeout');
    // Note: the error code is rendered as {error.code}: {error.message}
    expect(cleaned).toContain('Request timed out');
  });

  it('renders pending state — "Queued in progress" with waiting message', () => {
    const result = makeResult('pending');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Queued');
    expect(cleaned).toContain('in progress');
    expect(cleaned).toContain('queued and waiting to start');

    // No snapshot for pending
    expect(cleaned).not.toContain('Snapshot');

    // Detections show pending message
    expect(cleaned).toContain('Detection results will appear after the scan completes.');
  });

  it('renders running state — "Scanning in progress" with started timestamp', () => {
    const result = makeResult('running');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    expect(cleaned).toContain('Scanning');
    expect(cleaned).toContain('in progress');
    expect(cleaned).toContain('currently running');

    // Shows the startedAt timestamp
    expect(cleaned).toContain('2025-06-01T12:00:01.000Z');

    // No snapshot for running
    expect(cleaned).not.toContain('Snapshot');
  });

  it('does not show a refresh error on initial render', () => {
    const result = makeResult('running');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );

    expect(html).not.toContain('Failed to refresh');
  });

  it('initializes with the provided result (hydration-safe)', () => {
    const result = makeResult('completed');
    const html = renderToString(
      React.createElement(ScanLifecycle, { scanId, initialResult: result }),
    );
    const cleaned = html.replace(/<!-- -->/g, '');

    // The initial server-rendered data should match — the scan ID is
    // present from the initial prop, not from a fetch call.
    expect(cleaned).toContain('scan_001');
  });
});
