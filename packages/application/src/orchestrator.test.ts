import { describe, it, expect } from 'vitest';
import { runScan } from './orchestrator.js';
import type { Crawler } from '@devlens/crawler';
import { CrawlError } from '@devlens/crawler';
import type { Detector } from '@devlens/detectors';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  startScan,
} from '@devlens/core';
import type { Scan, SiteSnapshot, ScanTarget } from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

const FIXED_DATE = new Date('2025-06-01T12:00:00.000Z');

/** A mock Detector that returns an empty array (no detections). */
const mockDetector: Detector = { detect: () => [] };

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
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
  };
}

function makeScan(): Scan {
  return createScan(
    createScanId('scan_001'),
    makeTarget(),
    createTimestampFromString('2025-06-01T11:00:00.000Z'),
  );
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('runScan', () => {
  describe('happy path', () => {
    it('transitions pending → running → completed and returns the snapshot', async () => {
      const scan = makeScan();
      const snapshot = makeSnapshot();
      const crawler: Crawler = { crawl: async () => snapshot };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('completed');
      // completedAt is generated at the real time of completion, not the
      // injected `now`. Verify temporal ordering: createdAt <= completedAt.
      expect(typeof result.scan.status.completedAt).toBe('string');
      expect(new Date(result.scan.status.completedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result.scan.createdAt).getTime(),
      );
      expect(result.snapshot).toBe(snapshot);
    });

    it('passes the scan target to the crawler', async () => {
      let receivedTarget: ScanTarget | undefined;
      const crawler: Crawler = {
        crawl: async (target: ScanTarget) => {
          receivedTarget = target;
          return makeSnapshot();
        },
      };
      const scan = makeScan();

      await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(receivedTarget).toBe(scan.target);
    });

    it('preserves scan identity (id, target, createdAt) in the result', async () => {
      const scan = makeScan();
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.id).toBe(scan.id);
      expect(result.scan.target).toBe(scan.target);
      expect(result.scan.createdAt).toBe(scan.createdAt);
    });

    it('does not mutate the original scan', async () => {
      const scan = makeScan();
      const originalStatus = scan.status;
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(scan.status).toBe(originalStatus);
    });

    it('runs the detector on the snapshot and includes detections in the result', async () => {
      const scan = makeScan();
      const snapshot = makeSnapshot();
      const crawler: Crawler = { crawl: async () => snapshot };
      const expectedDetections = [
        {
          technology: { id: 'react' as never, name: 'React', category: 'frontend' as never },
          confidence: 90 as never,
          evidence: [{ type: 'html' as const, selector: 'meta', snippet: '<meta>' }],
        },
      ];
      const detector: Detector = { detect: (s) => (s === snapshot ? expectedDetections : []) };

      const result = await runScan(scan, crawler, detector, FIXED_DATE);

      expect(result.detections).toEqual(expectedDetections);
    });
  });

  describe('snapshot is a separate artifact', () => {
    it('does not embed the snapshot in ScanStatus', async () => {
      const scan = makeScan();
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('completed');
      // ScanStatus must NOT carry a snapshot — lifecycle ≠ results.
      expect('snapshot' in result.scan.status).toBe(false);
      expect(result.snapshot).not.toBeNull();
      expect(result.detections).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('translates CrawlError to ScanError preserving code and message', async () => {
      const scan = makeScan();
      const error = new CrawlError('timeout', 'Request timed out after 10ms');
      const crawler: Crawler = {
        crawl: async () => {
          throw error;
        },
      };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('failed');
      expect(result.scan.status.error.code).toBe('timeout');
      expect(result.scan.status.error.message).toBe('Request timed out after 10ms');
      // failedAt is generated at the real time of failure, not the injected
      // `now`. Verify temporal ordering: createdAt <= failedAt.
      expect(typeof result.scan.status.failedAt).toBe('string');
      expect(new Date(result.scan.status.failedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(result.scan.createdAt).getTime(),
      );
      expect(result.snapshot).toBeNull();
      expect(result.detections).toEqual([]);
    });

    it('translates all CrawlError codes to ScanError', async () => {
      const codes = ['invalid_target', 'network_error', 'too_large'] as const;
      for (const code of codes) {
        const scan = makeScan();
        const error = new CrawlError(code, `error for ${code}`);
        const crawler: Crawler = {
          crawl: async () => {
            throw error;
          },
        };

        const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

        expect(result.scan.status.type).toBe('failed');
        expect(result.scan.status.error.code).toBe(code);
        expect(result.scan.status.error.message).toBe(`error for ${code}`);
        expect(result.snapshot).toBeNull();
        expect(result.detections).toEqual([]);
      }
    });

    it('wraps generic Error as UNKNOWN_ERROR preserving the message', async () => {
      const scan = makeScan();
      const crawler: Crawler = {
        crawl: async () => {
          throw new Error('DNS resolution failed');
        },
      };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('failed');
      expect(result.scan.status.error.code).toBe('UNKNOWN_ERROR');
      expect(result.scan.status.error.message).toBe('DNS resolution failed');
      expect(result.snapshot).toBeNull();
      expect(result.detections).toEqual([]);
    });

    it('does not mutate the original scan on failure', async () => {
      const scan = makeScan();
      const originalStatus = scan.status;
      const crawler: Crawler = {
        crawl: async () => {
          throw new Error('fail');
        },
      };

      await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(scan.status).toBe(originalStatus);
    });
  });

  describe('detector error', () => {
    it('marks scan as failed when the detector throws (UNKNOWN_ERROR)', async () => {
      const scan = makeScan();
      const snapshot = makeSnapshot();
      const crawler: Crawler = { crawl: async () => snapshot };
      const detector: Detector = {
        detect: () => {
          throw new Error('Detector internal error');
        },
      };

      const result = await runScan(scan, crawler, detector, FIXED_DATE);

      expect(result.scan.status.type).toBe('failed');
      expect(result.scan.status.error.code).toBe('UNKNOWN_ERROR');
      expect(result.scan.status.error.message).toBe('Detector internal error');
      expect(result.snapshot).toBeNull();
      expect(result.detections).toEqual([]);
    });

    it('does not mutate the original scan on detector error', async () => {
      const scan = makeScan();
      const originalStatus = scan.status;
      const crawler: Crawler = { crawl: async () => makeSnapshot() };
      const detector: Detector = {
        detect: () => {
          throw new Error('boom');
        },
      };

      await runScan(scan, crawler, detector, FIXED_DATE);

      expect(scan.status).toBe(originalStatus);
    });
  });

  describe('timestamp ordering', () => {
    const PAST_DATE = new Date('2000-01-01T00:00:00.000Z');

    function makeScanWithPastCreatedAt(): Scan {
      return createScan(
        createScanId('scan_ts_001'),
        makeTarget(),
        createTimestampFromString('1990-01-01T00:00:00.000Z'),
      );
    }

    it('generates completedAt at the real time of completion, not the injected start time', async () => {
      const scan = makeScanWithPastCreatedAt();
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      const result = await runScan(scan, crawler, mockDetector, PAST_DATE);

      expect(result.scan.status.type).toBe('completed');
      // startedAt = PAST_DATE (injected). completedAt = new Date() (actual).
      // If the bug were present, completedAt would EQUAL startedAt.
      expect(new Date(result.scan.status.completedAt).getTime()).toBeGreaterThan(
        new Date(PAST_DATE).getTime(),
      );
    });

    it('generates failedAt at the real time of failure, not the injected start time', async () => {
      const scan = makeScanWithPastCreatedAt();
      const crawler: Crawler = {
        crawl: async () => {
          throw new CrawlError('timeout', 'Request timed out');
        },
      };

      const result = await runScan(scan, crawler, mockDetector, PAST_DATE);

      expect(result.scan.status.type).toBe('failed');
      // startedAt = PAST_DATE (injected). failedAt = new Date() (actual).
      expect(new Date(result.scan.status.failedAt).getTime()).toBeGreaterThan(
        new Date(PAST_DATE).getTime(),
      );
    });

    it('preserves createdAt <= completedAt ordering on success', async () => {
      const scan = makeScan(); // createdAt = 2025-06-01T11:00:00.000Z
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('completed');
      const createdAt = new Date(result.scan.createdAt).getTime();
      const completedAt = new Date(result.scan.status.completedAt).getTime();
      expect(completedAt).toBeGreaterThanOrEqual(createdAt);
    });

    it('preserves createdAt <= failedAt ordering on failure', async () => {
      const scan = makeScan(); // createdAt = 2025-06-01T11:00:00.000Z
      const crawler: Crawler = {
        crawl: async () => {
          throw new Error('DNS resolution failed');
        },
      };

      const result = await runScan(scan, crawler, mockDetector, FIXED_DATE);

      expect(result.scan.status.type).toBe('failed');
      const createdAt = new Date(result.scan.createdAt).getTime();
      const failedAt = new Date(result.scan.status.failedAt).getTime();
      expect(failedAt).toBeGreaterThanOrEqual(createdAt);
    });
  });

  describe('preconditions', () => {
    it('throws when the scan is not in pending state', async () => {
      const scan = makeScan();
      const running = startScan(scan, createTimestampFromString('2025-06-01T11:30:00.000Z'));
      const crawler: Crawler = { crawl: async () => makeSnapshot() };

      await expect(runScan(running, crawler, mockDetector, FIXED_DATE)).rejects.toThrow(
        'Cannot start a scan in "running" status',
      );
    });
  });
});
