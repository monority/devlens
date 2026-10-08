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

import { describe, it, expect, vi } from 'vitest';
import { handleGetScans, handleGetScanById, handleGetScansByTechnology } from './handler.js';
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

// Canonical keys of ScanSummary (GET /api/scans list response shape).
// Extracted to avoid duplicating this 9-element array across tests.
const SCAN_SUMMARY_KEYS = [
  'completedAt',
  'createdAt',
  'error',
  'failedAt',
  'hostname',
  'id',
  'startedAt',
  'status',
  'target',
].sort();

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

function makeDetectionFor(id: string, confidence = 80): Detection {
  return {
    technology: { id: id as never, name: id, category: 'server' as never },
    confidence: confidence as never,
    evidence: [{ type: 'http_header' as const, name: 'Server', value: id }],
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

        const scanKeys = Object.keys(response.body.scan).sort();
        expect(scanKeys).toEqual(SCAN_SUMMARY_KEYS);

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

        // Step 80 — provenance is derived at response-mapping time on every
        // directly-observed detection (the GET path maps through the same
        // `detectionToResponse`, so it must carry provenance too).
        expect(detection).toHaveProperty('provenance');
        expect(detection!.provenance).toEqual({
          evidenceCount: 2,
          evidenceTypes: ['http_header', 'meta_tag'],
          strongestEvidenceType: 'http_header',
        });
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
      const repo: { list: (technologyId?: string) => Promise<never> } = {
        list: () => Promise.reject(new Error('Connection refused')),
      };
      const response = await handleGetScans({ repository: repo as never });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      });
    });

    it('does not leak the database error message in the 500 response', async () => {
      const repo: { list: (technologyId?: string) => Promise<never> } = {
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

    it('does not pass raw Error objects to console.error on repository failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const repo: { getById: () => Promise<never> } = {
          getById: () => Promise.reject(new Error('Connection to PostgreSQL failed: ECONNREFUSED')),
        };
        const response = await handleGetScanById('scan_001', {
          repository: repo as never,
        });

        expect(response.status).toBe(500);
        // console.error should receive a sanitized string, not the raw Error
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const loggedValue = consoleSpy.mock.calls[0]![1];
        expect(loggedValue).not.toBeInstanceOf(Error);
        expect(typeof loggedValue).toBe('string');
        // The sanitized string must contain the error name + message but not
        // expose infrastructure connection details like ECONNREFUSED.
        expect(loggedValue).toContain('Error:');
        expect(loggedValue).toContain('Connection to PostgreSQL failed: ECONNREFUSED');
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('sanitizes console.error for list-scans repository failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const repo: { list: (technologyId?: string) => Promise<never> } = {
          list: () => Promise.reject(new Error('Database connection lost')),
        };
        const response = await handleGetScans({ repository: repo as never });

        expect(response.status).toBe(500);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const loggedValue = consoleSpy.mock.calls[0]![1];
        expect(loggedValue).not.toBeInstanceOf(Error);
        expect(typeof loggedValue).toBe('string');
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});

// ─── GET /api/scans?technologyId=<id> (technology detail page boundary) ─

describe('GET /api/scans?technologyId — handler', () => {
  describe('GET scans by technology', () => {
    it('returns 200 with empty list for an empty repository', async () => {
      const repo = new InMemoryScanResultRepository();
      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body).toEqual({
          scans: [],
          nextCursor: null,
          hasMore: false,
          summary: { scanCount: 0, firstDetectedAt: null },
        });
      }
    });

    it('returns 200 with empty list when technologyId is blank', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_a'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });
      const response = await handleGetScansByTechnology('   ', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body).toEqual({
          scans: [],
          nextCursor: null,
          hasMore: false,
          summary: { scanCount: 0, firstDetectedAt: null },
        });
      }
    });

    it('returns 200 with empty list when no scan detected the technology', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_1'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('react')],
      });

      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans).toEqual([]);
      }
    });

    it('returns 200 with only the scans that detected the technology', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_a', '2025-06-01T11:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });
      await repo.save({
        scan: makeCompletedScan('scan_b', '2025-06-02T12:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('react')],
      });

      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans).toHaveLength(1);
        expect(response.body.scans[0]!.scan.id).toBe('scan_a');
        expect(response.body.scans[0]!.detections).toHaveLength(1);
        expect(response.body.scans[0]!.detections[0]!.technology.id).toBe('nginx');
      }
    });

    it('preserves repository ordering (createdAt DESC, scanId ASC) for matching scans', async () => {
      const repo = new InMemoryScanResultRepository();
      // Saved in non-sorted order.
      await repo.save({
        scan: makeCompletedScan('scan_c', '2025-06-01T11:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });
      await repo.save({
        scan: makeCompletedScan('scan_a', '2025-06-01T12:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });
      await repo.save({
        scan: makeCompletedScan('scan_b', '2025-06-01T11:00:00.000Z'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });

      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        const ids = response.body.scans.map((s) => s.scan.id);
        expect(ids).toEqual(['scan_a', 'scan_b', 'scan_c']);
      }
    });

    it('naturally excludes failed scans (they carry no detections)', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_completed'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });
      await repo.save({
        scan: makeFailedScan('scan_failed'),
        snapshot: null,
        detections: [],
      });

      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans.map((s) => s.scan.id)).toEqual(['scan_completed']);
      }
    });

    it('response shape exposes only {scan, detections} per item — no DB internals', async () => {
      const repo = new InMemoryScanResultRepository();
      await repo.save({
        scan: makeCompletedScan('scan_shape'),
        snapshot: makeSnapshot(),
        detections: [makeDetectionFor('nginx')],
      });

      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        // Top-level: pagination envelope + global summary
        expect(Object.keys(response.body).sort()).toEqual([
          'hasMore',
          'nextCursor',
          'scans',
          'summary',
        ]);
        // Per item: only "scan" and "detections" — no snapshot / coverage / quality
        const item = response.body.scans[0]!;
        expect(Object.keys(item).sort()).toEqual(['detections', 'scan']);
        const scanKeys = Object.keys(item.scan).sort();
        expect(scanKeys).toEqual(SCAN_SUMMARY_KEYS);
        // `detections` carry the raw domain Detection fields (the page maps
        // them to DetectionResponse via detectionToResponse) — no explanation /
        // provenance / integrity bloat on the wire.
        const det = item.detections[0]!;
        expect(det.technology.id).toBe('nginx');
        expect(det.confidence).toBe(80);
        expect(det.evidence).toHaveLength(1);
        expect(det).not.toHaveProperty('explanation');
        expect(det).not.toHaveProperty('provenance');
        expect(det).not.toHaveProperty('integrity');
      }
    });
  });

  describe('pagination', () => {
    // Builds a repo with 6 scans that all detect `nginx`, at distinct
    // timestamps so ordering (createdAt DESC, scanId ASC) is deterministic:
    // newest first => scan_6 … scan_1; earliest (firstDetectedAt) = scan_1.
    function makePaginatedRepo(): InMemoryScanResultRepository {
      const repo = new InMemoryScanResultRepository();
      const dates = [
        '2025-06-01T01:00:00.000Z',
        '2025-06-02T02:00:00.000Z',
        '2025-06-03T03:00:00.000Z',
        '2025-06-04T04:00:00.000Z',
        '2025-06-05T05:00:00.000Z',
        '2025-06-06T06:00:00.000Z',
      ];
      for (let i = 0; i < dates.length; i++) {
        repo.save({
          scan: makeCompletedScan(`scan_${i + 1}`, dates[i]),
          snapshot: makeSnapshot(),
          detections: [makeDetectionFor('nginx')],
        });
      }
      return repo;
    }

    it('returns the first page with hasMore + nextCursor and a global summary', async () => {
      const repo = makePaginatedRepo();
      const response = await handleGetScansByTechnology('nginx', { repository: repo, limit: '3' });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans.map((s) => s.scan.id)).toEqual(['scan_6', 'scan_5', 'scan_4']);
        expect(response.body.hasMore).toBe(true);
        expect(response.body.nextCursor).not.toBeNull();
        expect(typeof response.body.nextCursor).toBe('string');
        // Global aggregate is independent of the page slice.
        expect(response.body.summary).toEqual({
          scanCount: 6,
          firstDetectedAt: '2025-06-01T01:00:00.000Z',
        });
      }
    });

    it('continues from nextCursor onto the second page in deterministic order', async () => {
      const repo = makePaginatedRepo();
      const first = await handleGetScansByTechnology('nginx', { repository: repo, limit: '3' });
      expect(first.status).toBe(200);
      if (first.status === 200) {
        expect(first.body.nextCursor).not.toBeNull();
        const second = await handleGetScansByTechnology('nginx', {
          repository: repo,
          limit: '3',
          cursor: first.body.nextCursor!,
        });
        expect(second.status).toBe(200);
        if (second.status === 200) {
          expect(second.body.scans.map((s) => s.scan.id)).toEqual(['scan_3', 'scan_2', 'scan_1']);
          expect(second.body.hasMore).toBe(false);
          expect(second.body.nextCursor).toBeNull();
        }
      }
    });

    it('returns a global summary independent of the page (page 2)', async () => {
      const repo = makePaginatedRepo();
      const first = await handleGetScansByTechnology('nginx', { repository: repo, limit: '3' });
      expect(first.status).toBe(200);
      if (first.status === 200) {
        const second = await handleGetScansByTechnology('nginx', {
          repository: repo,
          limit: '3',
          cursor: first.body.nextCursor!,
        });
        expect(second.status).toBe(200);
        if (second.status === 200) {
          expect(second.body.summary.scanCount).toBe(6);
          expect(second.body.summary.firstDetectedAt).toBe('2025-06-01T01:00:00.000Z');
        }
      }
    });

    it('returns the full list (no hasMore/nextCursor) when paging is absent (backward compatible)', async () => {
      const repo = makePaginatedRepo();
      const response = await handleGetScansByTechnology('nginx', { repository: repo });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans.map((s) => s.scan.id)).toEqual([
          'scan_6',
          'scan_5',
          'scan_4',
          'scan_3',
          'scan_2',
          'scan_1',
        ]);
        expect(response.body.hasMore).toBe(false);
        expect(response.body.nextCursor).toBeNull();
        expect(response.body.summary.scanCount).toBe(6);
      }
    });

    it('clamps an oversized limit to MAX_PAGE_SIZE (200)', async () => {
      // 201 scans all detecting `nginx` (fixed createdAt; scanId ASC ordering).
      const repo = new InMemoryScanResultRepository();
      for (let i = 0; i < 201; i++) {
        await repo.save({
          scan: makeCompletedScan(`scan_${i + 1}`),
          snapshot: makeSnapshot(),
          detections: [makeDetectionFor('nginx')],
        });
      }

      const response = await handleGetScansByTechnology('nginx', {
        repository: repo,
        limit: '300',
      });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        // Without the clamp, limit 300 would fetch all 201 => hasMore false.
        // Clamped to 200 => fetch 201 => first page of 200 with a next page.
        expect(response.body.scans).toHaveLength(200);
        expect(response.body.hasMore).toBe(true);
        expect(response.body.nextCursor).not.toBeNull();
        expect(response.body.summary.scanCount).toBe(201);
      }
    });

    it('clamps limit=0 to a minimum of 1', async () => {
      const repo = makePaginatedRepo();
      const response = await handleGetScansByTechnology('nginx', { repository: repo, limit: '0' });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        expect(response.body.scans).toHaveLength(1);
        expect(response.body.scans[0]!.scan.id).toBe('scan_6');
        expect(response.body.hasMore).toBe(true);
      }
    });

    it('falls back to the default page size for a non-numeric limit', async () => {
      const repo = makePaginatedRepo();
      const response = await handleGetScansByTechnology('nginx', {
        repository: repo,
        limit: 'abc',
      });

      expect(response.status).toBe(200);
      if (response.status === 200) {
        // 6 scans < DEFAULT_PAGE_SIZE (50) => all returned, no next page.
        expect(response.body.scans).toHaveLength(6);
        expect(response.body.hasMore).toBe(false);
        expect(response.body.nextCursor).toBeNull();
      }
    });
  });

  describe('error handling', () => {
    it('returns 500 when the repository throws on list', async () => {
      const repo: { list: (technologyId?: string) => Promise<never> } = {
        list: () => Promise.reject(new Error('Connection refused')),
      };
      const response = await handleGetScansByTechnology('nginx', { repository: repo as never });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
      });
    });

    it('does not leak the database error message in the 500 response', async () => {
      const repo: { list: (technologyId?: string) => Promise<never> } = {
        list: () => Promise.reject(new Error('Connection to PostgreSQL failed: ECONNREFUSED')),
      };
      const response = await handleGetScansByTechnology('nginx', { repository: repo as never });

      expect(response.status).toBe(500);
      expect(JSON.stringify(response.body)).not.toContain('Connection to PostgreSQL');
      expect(JSON.stringify(response.body)).not.toContain('ECONNREFUSED');
    });

    it('sanitizes console.error for repository failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const repo: { list: (technologyId?: string) => Promise<never> } = {
          list: () => Promise.reject(new Error('Connection to PostgreSQL failed: ECONNREFUSED')),
        };
        const response = await handleGetScansByTechnology('nginx', { repository: repo as never });

        expect(response.status).toBe(500);
        expect(consoleSpy).toHaveBeenCalledTimes(1);
        const loggedValue = consoleSpy.mock.calls[0]![1];
        expect(loggedValue).not.toBeInstanceOf(Error);
        expect(typeof loggedValue).toBe('string');
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });
});
