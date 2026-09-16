import { describe, it, expect, vi } from 'vitest';
import { handleCreateScan, type HandleCreateScanOptions } from './handler.js';
import type { ScanResultRepository, ScanResult } from '@devlens/application';
import type { Crawler } from '@devlens/crawler';
import type { Detector } from '@devlens/detectors';
import { CrawlError } from '@devlens/crawler';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';
import type { SiteSnapshot } from '@devlens/core';

// ─── Test fixtures ───────────────────────────────────────────────────

const FIXED_DATE = new Date('2025-06-01T12:00:00.000Z');

/** A mock Detector that returns an empty array (no detections). */
const mockDetector: Detector = { detect: () => [] };

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com/'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com/'),
    },
    html: {
      title: 'Example Domain',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

function makeOptions(
  crawler: Crawler,
  repository: ScanResultRepository,
  overrides: Partial<HandleCreateScanOptions> = {},
): HandleCreateScanOptions {
  return {
    crawler,
    detector: mockDetector,
    repository,
    generateId: () => 'scan_test_001',
    now: FIXED_DATE,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('POST /api/scans — request validation', () => {
  const noopCrawler: Crawler = { crawl: vi.fn() };
  const noopRepo: ScanResultRepository = {
    save: vi.fn().mockResolvedValue(undefined),
    getById: vi.fn(),
    list: vi.fn(),
  };

  it('returns 400 for malformed JSON', async () => {
    const result = await handleCreateScan('not json', makeOptions(noopCrawler, noopRepo));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({
      error: { code: 'MALFORMED_JSON', message: 'Request body must be valid JSON.' },
    });
  });

  it('returns 400 for missing url field', async () => {
    const result = await handleCreateScan('{"foo": "bar"}', makeOptions(noopCrawler, noopRepo));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'MISSING_URL' } });
  });

  it('returns 400 for non-string url', async () => {
    const result = await handleCreateScan('{"url": 123}', makeOptions(noopCrawler, noopRepo));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'INVALID_URL_TYPE' } });
  });

  it('returns 400 for empty url', async () => {
    const result = await handleCreateScan('{"url": ""}', makeOptions(noopCrawler, noopRepo));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'EMPTY_URL' } });
  });

  it('returns 400 for malformed URL', async () => {
    const result = await handleCreateScan(
      '{"url": "not a url"}',
      makeOptions(noopCrawler, noopRepo),
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'INVALID_URL' } });
  });

  it('rejects ftp:// scheme', async () => {
    const result = await handleCreateScan(
      '{"url": "ftp://example.com/file"}',
      makeOptions(noopCrawler, noopRepo),
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'UNSUPPORTED_PROTOCOL' } });
  });

  it('rejects file:// scheme', async () => {
    const result = await handleCreateScan(
      '{"url": "file:///etc/passwd"}',
      makeOptions(noopCrawler, noopRepo),
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'UNSUPPORTED_PROTOCOL' } });
  });

  it('returns 400 for whitespace-only url', async () => {
    const result = await handleCreateScan('{"url": "   "}', makeOptions(noopCrawler, noopRepo));
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'EMPTY_URL' } });
  });

  it('rejects javascript: scheme', async () => {
    const result = await handleCreateScan(
      JSON.stringify({ url: 'javascript:alert(1)' }),
      makeOptions(noopCrawler, noopRepo),
    );
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ error: { code: 'UNSUPPORTED_PROTOCOL' } });
  });
});

describe('POST /api/scans — successful execution', () => {
  it('returns 200 with scan, snapshot, and detections for a completed scan', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository),
    );

    expect(result.status).toBe(200);

    // Verify crawler received the correct target
    expect(crawler.crawl).toHaveBeenCalledTimes(1);
    expect(crawler.crawl).toHaveBeenCalledWith({
      url: 'https://example.com/',
      hostname: 'example.com',
    });

    // Verify result was persisted
    expect(repository.save).toHaveBeenCalledTimes(1);
    const savedResult = (repository.save as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as ScanResult;
    expect(savedResult.scan.status.type).toBe('completed');
    expect(savedResult.snapshot).toBe(snapshot);
    expect(savedResult.detections).toEqual([]);

    // Verify response shape (no DB row fields)
    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.scan).toMatchObject({
        id: 'scan_test_001',
        status: 'completed',
        target: 'https://example.com/',
        hostname: 'example.com',
        createdAt: '2025-06-01T12:00:00.000Z',
      });
      // completedAt is generated at the real time of completion, not the
      // injected `now`. Verify temporal ordering: createdAt <= completedAt.
      expect(body.scan.completedAt).not.toBeNull();
      expect(new Date(body.scan.completedAt as string).getTime()).toBeGreaterThanOrEqual(
        new Date(body.scan.createdAt).getTime(),
      );
      expect(body.scan.startedAt).toBeNull();
      expect(body.scan.failedAt).toBeNull();
      expect(body.scan.error).toBeNull();

      expect(body.snapshot).toMatchObject({
        url: 'https://example.com/',
        hostname: 'example.com',
        capturedAt: '2025-06-01T12:00:00.000Z',
        http: {
          statusCode: 200,
          contentType: 'text/html',
          finalUrl: 'https://example.com/',
        },
        html: {
          title: 'Example Domain',
          description: null,
        },
      });

      expect(body.detections).toEqual([]);
    }
  });

  it('preserves HTTPS URL exactly', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com/path"}',
      makeOptions(crawler, repository),
    );

    expect(result.status).toBe(200);
    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.scan.target).toBe('https://example.com/path');
      expect(body.scan.hostname).toBe('example.com');
    }
  });

  it('ignores unexpected fields in the request body', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com", "foo": "bar", "extra": 123}',
      makeOptions(crawler, repository),
    );

    // Unexpected fields should be silently ignored
    expect(result.status).toBe(200);
  });

  it('serializes all evidence types correctly in the response', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };
    const detector: Detector = {
      detect: () => [
        {
          technology: {
            id: 'multi-tech' as never,
            name: 'MultiTech',
            category: 'full-stack' as never,
          },
          confidence: 95 as never,
          evidence: [
            { type: 'html' as const, selector: 'meta#tech', snippet: '<meta>' },
            { type: 'http_header' as const, name: 'X-Tech', value: 'yes' },
            { type: 'script_url' as const, url: 'https://cdn.example.com/tech.js' as never },
            { type: 'script_content' as const, snippet: 'window.MultiTech =' },
            { type: 'meta_tag' as const, name: 'generator', content: 'MultiTech 1.0' },
            { type: 'javascript_global' as const, globalName: 'MultiTech' },
            { type: 'resource' as const, url: 'https://cdn.example.com/logo.png' as never },
            { type: 'link' as const, url: 'https://cdn.example.com/style.css' as never },
          ],
        },
      ],
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository, { detector }),
    );

    expect(result.status).toBe(200);
    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.detections).toHaveLength(1);
      const detection = body.detections[0]!;
      expect(detection.technology).toEqual({
        id: 'multi-tech',
        name: 'MultiTech',
        category: 'full-stack',
      });
      expect(detection.confidence).toBe(95);
      expect(detection.evidence).toEqual([
        { type: 'html', selector: 'meta#tech', snippet: '<meta>' },
        { type: 'http_header', name: 'X-Tech', value: 'yes' },
        { type: 'script_url', url: 'https://cdn.example.com/tech.js' },
        { type: 'script_content', snippet: 'window.MultiTech =' },
        { type: 'meta_tag', name: 'generator', content: 'MultiTech 1.0' },
        { type: 'javascript_global', globalName: 'MultiTech' },
        { type: 'resource', url: 'https://cdn.example.com/logo.png' },
        { type: 'link', url: 'https://cdn.example.com/style.css' },
      ]);
    }
  });

  it('response has exact shape with no extra fields', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository),
    );

    expect(result.status).toBe(200);
    const body = result.body;
    if ('scan' in body) {
      // Top-level keys: only "scan", "snapshot", "detections"
      expect(Object.keys(body).sort()).toEqual(['detections', 'scan', 'snapshot']);

      // scan keys: only the documented fields (camelCase, no snake_case)
      const scanKeys = Object.keys(body.scan).sort();
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

      // snapshot keys: only the documented fields
      expect(body.snapshot).not.toBeNull();
      const snapshotKeys = Object.keys(body.snapshot!).sort();
      expect(snapshotKeys).toEqual(['capturedAt', 'hostname', 'html', 'http', 'url']);

      // http keys: only statusCode, contentType, finalUrl
      const httpKeys = Object.keys(body.snapshot!.http).sort();
      expect(httpKeys).toEqual(['contentType', 'finalUrl', 'statusCode']);

      // html keys: only title, description
      const htmlKeys = Object.keys(body.snapshot!.html).sort();
      expect(htmlKeys).toEqual(['description', 'title']);

      // Error object: no extra fields
      expect(result.body).not.toHaveProperty('stack');
      expect(result.body).not.toHaveProperty('message');
    }
  });

  it('includes detectors results in the response when the detector finds something', async () => {
    const snapshot = makeSnapshot();
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(snapshot) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };
    const detector: Detector = {
      detect: () => [
        {
          technology: { id: 'nginx' as never, name: 'nginx', category: 'server' as never },
          confidence: 80 as never,
          evidence: [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }],
        },
      ],
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository, { detector }),
    );

    expect(result.status).toBe(200);
    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.detections).toEqual([
        {
          technology: { id: 'nginx', name: 'nginx', category: 'server' },
          confidence: 80,
          evidence: [{ type: 'http_header', name: 'Server', value: 'nginx' }],
        },
      ]);
    }
  });
});

describe('POST /api/scans — domain failure (crawler error)', () => {
  it('returns 200 with failed scan when crawler throws CrawlError', async () => {
    const crawler: Crawler = {
      crawl: vi.fn().mockRejectedValue(new CrawlError('timeout', 'Request timed out after 10s')),
    };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository),
    );

    // A failed scan is a domain outcome, NOT an infrastructure failure
    expect(result.status).toBe(200);

    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.scan.status).toBe('failed');
      expect(body.scan.error).toEqual({ code: 'timeout', message: 'Request timed out after 10s' });
      // failedAt is generated at the real time of failure, not the injected
      // `now`. Verify temporal ordering: createdAt <= failedAt.
      expect(body.scan.failedAt).not.toBeNull();
      expect(new Date(body.scan.failedAt as string).getTime()).toBeGreaterThanOrEqual(
        new Date(body.scan.createdAt).getTime(),
      );
      expect(body.snapshot).toBeNull();
      expect(body.detections).toEqual([]);
    }

    // Failed scan is still persisted
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('returns 200 with failed scan when crawler throws generic Error', async () => {
    const crawler: Crawler = {
      crawl: vi.fn().mockRejectedValue(new Error('DNS resolution failed')),
    };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository),
    );

    expect(result.status).toBe(200);
    type Resp = typeof result.body;
    const body = result.body as Resp;
    if ('scan' in body) {
      expect(body.scan.status).toBe('failed');
      expect(body.scan.error).toMatchObject({
        code: 'UNKNOWN_ERROR',
        message: 'DNS resolution failed',
      });
      expect(body.detections).toEqual([]);
    }
  });
});

describe('POST /api/scans — infrastructure failure (persistence)', () => {
  it('returns 500 when persistence fails', async () => {
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(makeSnapshot()) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockRejectedValue(new Error('Connection refused')),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository),
    );

    // Persistence failure is an infrastructure error, NOT a domain failure
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
    });

    // Verify error details are NOT leaked
    expect(JSON.stringify(result.body)).not.toContain('Connection refused');
  });

  it('returns 500 when scan ID generation produces an invalid ID', async () => {
    const crawler: Crawler = { crawl: vi.fn().mockResolvedValue(makeSnapshot()) };
    const repository: ScanResultRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
      list: vi.fn(),
    };

    const result = await handleCreateScan(
      '{"url": "https://example.com"}',
      makeOptions(crawler, repository, { generateId: () => '' }),
    );
    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({
      error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.' },
    });
  });
});
