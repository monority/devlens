/**
 * Unit tests for the GET /api/scans and GET /api/scans/:id handler logic.
 *
 * These tests exercise the pure handler functions (`handleGetScans` and
 * `handleGetScanById`) using an in-memory repository, without any Next.js
 * runtime or database dependency. They cover:
 *
 * - GET by ID: existing completed scan, existing failed scan, unknown scan,
 *   response shape, evidence serialization, date serialization.
 * - GET list: empty database, one scan, multiple scans, deterministic order,
 *   completed + failed scans, response shape.
 * - Error handling: repository error → 500, no database error leakage.
 */

import { describe, it, expect } from 'vitest';
import { handleGetScans, handleGetScanById } from './handler.js';
import { InMemoryScanResultRepository } from '@devlens/database';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  startScan,
  completeScan,
  failScan,
  createHttpStatus,
} from '@devlens/core';
import type { Scan, SiteSnapshot, Detection } from '@devlens/core';

// ─── Test fixtures ───────────────────────────────────────────────────

const FIXED_DATE = '2025-06-01T12:00:00.000Z';

function makeTarget() {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

function makeScan(id: string, createdAt: string = FIXED_DATE): Scan {
  return createScan(createScanId(id), makeTarget(), createTimestampFromString(createdAt));
}

function makeCompletedScan(id: string, createdAt: string = FIXED_DATE): Scan {
  const pending = makeScan(id, createdAt);
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return completeScan(running, createTimestampFromString('2025-06-01T11:02:00.000Z'));
}

function makeFailedScan(id: string, createdAt: string = FIXED_DATE): Scan {
  const pending = makeScan(id, createdAt);
  const running = startScan(pending, createTimestampFromString('2025-06-01T11:01:00.000Z'));
  return failScan(
    running,
    { code: 'timeout', message: 'Request timed out' },
    createTimestampFromString('2025-06-01T11:02:00.000Z'),
  );
}

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [
        { name: 'content-type', value: 'text/html; charset=utf-8' },
        { name: 'server', value: 'nginx' },
      ],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example Domain',
      description: 'This domain is for example',
      metaTags: [{ name: 'generator', content: 'TestCMS 1.0' }],
      scripts: [{ src: 'https://example.com/app.js', content: '' }],
      links: [{ rel: 'stylesheet', href: '/style.css', content: '<link>' }],
    },
    resources: [],
  };
}

function makeDetection(): Detection {
  return {
    technology: { id: 'nginx' as never, name: 'nginx', category: 'server' as never },
    confidence: 80 as never,
    evidence: [
      { type: 'http_header' as const, name: 'Server', value: 'nginx' },
      { type: 'meta_tag' as const, name: 'generator', content: 'TestCMS 1.0' },
    ],
  };
}

// ─── GET /api/scans/:id ──────────────────────────────────────────────

describe('GET /api/scans/:id — handler', () => {
  describe('GET by ID', () => {
    it('returns 200 with scan details for an existing completed scan', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeCompletedScan('scan_completed');
      const snapshot = makeSnapshot();
      const result = { scan, snapshot, detections: [] };
      await repo.save(result);

      const response = await handleGetScanById('scan_completed', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200 && 'scan' in response.body) {
        expect(response.body.scan.id).toBe('scan_completed');
        expect(response.body.scan.status).toBe('completed');
        expect(response.body.scan.target).toBe('https://example.com');
        expect(response.body.scan.hostname).toBe('example.com');
        expect(response.body.scan.createdAt).toBe('2025-06-01T12:00:00.000Z');
        expect(response.body.scan.startedAt).toBeNull();
        expect(response.body.scan.completedAt).not.toBeNull();
        expect(response.body.scan.failedAt).toBeNull();
        expect(response.body.scan.error).toBeNull();
        expect(response.body.snapshot).not.toBeNull();
        expect(response.body.snapshot!.http.statusCode).toBe(200);
        expect(response.body.detections).toEqual([]);
      }
    });

    it('returns 200 with failed scan for an existing failed scan', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeFailedScan('scan_failed');
      await repo.save({ scan, snapshot: null, detections: [] });

      const response = await handleGetScanById('scan_failed', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200 && 'scan' in response.body) {
        expect(response.body.scan.status).toBe('failed');
        expect(response.body.scan.error).toEqual({
          code: 'timeout',
          message: 'Request timed out',
        });
        expect(response.body.scan.failedAt).not.toBeNull();
        expect(response.body.scan.completedAt).toBeNull();
        expect(response.body.snapshot).toBeNull();
        expect(response.body.detections).toEqual([]);
      }
    });

    it('returns 404 for an unknown scan ID', async () => {
      const repo = new InMemoryScanResultRepository();
      const response = await handleGetScanById('unknown_scan', { repository: repo });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        error: { code: 'NOT_FOUND', message: 'Scan not found.' },
      });
    });

    it('returns 404 when the repository is empty', async () => {
      const repo = new InMemoryScanResultRepository();
      const response = await handleGetScanById('any_id', { repository: repo });

      expect(response.status).toBe(404);
    });

    it('returns 404 for an empty scan ID', async () => {
      const repo = new InMemoryScanResultRepository();
      const response = await handleGetScanById('', { repository: repo });

      expect(response.status).toBe(404);
    });
  });

  describe('response shape', () => {
    it('exposes only documented fields — no DB internals', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeCompletedScan('scan_shape');
      const snapshot = makeSnapshot();
      await repo.save({ scan, snapshot, detections: [makeDetection()] });

      const response = await handleGetScanById('scan_shape', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200 && 'scan' in response.body) {
        // Top-level keys: only "scan", "snapshot", "observationCoverage", "resultQuality", "detections"
        expect(Object.keys(response.body).sort()).toEqual([
          'detections',
          'observationCoverage',
          'resultQuality',
          'scan',
          'snapshot',
        ]);

        // scan keys: only documented camelCase fields (no snake_case)
        const scanKeys = Object.keys(response.body.scan).sort();
        expect(scanKeys).toEqual(
          [
            'completedAt',
            'createdAt',
            'error',
            'failedAt',
            'hostname',
            'id',
            'startedAt',
            'status',
            'target',
          ].sort(),
        );

        // snapshot keys
        expect(response.body.snapshot).not.toBeNull();
        const snapshotKeys = Object.keys(response.body.snapshot!).sort();
        expect(snapshotKeys).toEqual(['capturedAt', 'hostname', 'html', 'http', 'url']);

        // http keys
        const httpKeys = Object.keys(response.body.snapshot!.http).sort();
        expect(httpKeys).toEqual(['contentType', 'finalUrl', 'statusCode']);

        // html keys: only title, description (matches POST response shape)
        const htmlKeys = Object.keys(response.body.snapshot!.html).sort();
        expect(htmlKeys).toEqual(['description', 'title']);
      }
    });

    it('serializes evidence correctly in the response', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeCompletedScan('scan_evidence');
      await repo.save({ scan, snapshot: makeSnapshot(), detections: [makeDetection()] });

      const response = await handleGetScanById('scan_evidence', { repository: repo });

      if (response.status === 200 && 'detections' in response.body) {
        expect(response.body.detections).toHaveLength(1);
        const detection = response.body.detections[0];
        expect(detection!.evidence).toEqual([
          { type: 'http_header', name: 'Server', value: 'nginx' },
          { type: 'meta_tag', name: 'generator', content: 'TestCMS 1.0' },
        ]);
      }
    });

    it('serializes dates as ISO strings', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeCompletedScan('scan_dates');
      await repo.save({ scan, snapshot: makeSnapshot(), detections: [] });

      const response = await handleGetScanById('scan_dates', { repository: repo });

      if (response.status === 200 && 'scan' in response.body) {
        // All date fields should be valid ISO strings or null
        expect(response.body.scan.createdAt).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
        );
        expect(response.body.scan.completedAt).toMatch(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
        );
        expect(response.body.scan.startedAt).toBeNull();
        expect(response.body.scan.failedAt).toBeNull();
      }
    });
  });
});

// ─── GET /api/scans (list) ───────────────────────────────────────────

describe('GET /api/scans — handler', () => {
  describe('GET list', () => {
    it('returns 200 with empty list when no scans exist', async () => {
      const repo = new InMemoryScanResultRepository();
      const response = await handleGetScans({ repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body).toEqual({ scans: [] });
      }
    });

    it('returns 200 with a single scan', async () => {
      const repo = new InMemoryScanResultRepository();
      const scan = makeCompletedScan('scan_one');
      await repo.save({ scan, snapshot: makeSnapshot(), detections: [] });

      const response = await handleGetScans({ repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans).toHaveLength(1);
        expect(response.body.scans[0]!.id).toBe('scan_one');
        expect(response.body.scans[0]!.status).toBe('completed');
      }
    });

    it('returns 200 with multiple scans in deterministic order', async () => {
      const repo = new InMemoryScanResultRepository();

      // Save in non-sorted order to verify the repository sorts
      await repo.save({
        scan: makeCompletedScan('scan_c', '2025-06-01T11:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [],
      });
      await repo.save({
        scan: makeCompletedScan('scan_a', '2025-06-01T12:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [],
      });
      await repo.save({
        scan: makeCompletedScan('scan_b', '2025-06-01T11:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [],
      });

      const response = await handleGetScans({ repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        // scan_a (12:00) first, then scan_b and scan_c (same time, sorted by id ASC)
        const ids = response.body.scans.map((s) => s.id);
        expect(ids).toEqual(['scan_a', 'scan_b', 'scan_c']);
      }
    });

    it('includes both completed and failed scans', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_completed_1'),
        snapshot: makeSnapshot(),
        detections: [],
      });
      await repo.save({
        scan: makeFailedScan('scan_failed_1'),
        snapshot: null,
        detections: [],
      });

      const response = await handleGetScans({ repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans).toHaveLength(2);
        const statuses = response.body.scans.map((s) => s.status).sort();
        expect(statuses).toEqual(['completed', 'failed']);
      }
    });

    it('response shape has scans array with only documented summary fields', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_shape'),
        snapshot: makeSnapshot(),
        detections: [],
      });

      const response = await handleGetScans({ repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        // Top-level: only "scans"
        expect(Object.keys(response.body).sort()).toEqual(['scans']);
        const scanKeys = Object.keys(response.body.scans[0]!).sort();
        expect(scanKeys).toEqual(
          [
            'completedAt',
            'createdAt',
            'error',
            'failedAt',
            'hostname',
            'id',
            'startedAt',
            'status',
            'target',
          ].sort(),
        );
      }
    });
  });

  describe('error handling', () => {
    it('returns 500 when the repository throws on list', async () => {
      const repo: { list: () => Promise<never> } = {
        list: () => Promise.reject(new Error('Connection refused')),
      };
      const response = await handleGetScans({ repository: repo as never });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      });
    });

    it('does not leak the database error message in the 500 response', async () => {
      const repo: { list: () => Promise<never> } = {
        list: () => Promise.reject(new Error('Connection to PostgreSQL failed: ECONNREFUSED')),
      };
      const response = await handleGetScans({ repository: repo as never });

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('Connection to PostgreSQL');
      expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    });

    it('returns 500 when the repository throws on getById', async () => {
      const repo: { getById: () => Promise<never> } = {
        getById: () => Promise.reject(new Error('Database connection lost')),
      };
      const response = await handleGetScanById('scan_001', { repository: repo as never });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      });
    });

    it('does not leak the database error in getById 500 response', async () => {
      const repo: { getById: () => Promise<never> } = {
        getById: () => Promise.reject(new Error('Database connection lost')),
      };
      const response = await handleGetScanById('scan_001', { repository: repo as never });

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('Database connection lost');
    });
  });
});
