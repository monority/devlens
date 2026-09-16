import { describe, it, expect } from 'vitest';
import type { Crawler } from './crawler.js';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';
import type { ScanTarget, SiteSnapshot } from '@devlens/core';

// ─── Helpers ───────────────────────────────────────────────────────

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
  const base: SiteSnapshot = {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [{ name: 'Content-Type', value: 'text/html' }],
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
  return { ...base, ...overrides };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Crawler interface', () => {
  it('is usable as a contract', () => {
    const crawler: Crawler = {
      crawl: async (): Promise<SiteSnapshot> => makeSnapshot(),
    };
    expect(crawler).toBeDefined();
    expect(typeof crawler.crawl).toBe('function');
  });

  it('crawl accepts a ScanTarget and returns a SiteSnapshot', async () => {
    let receivedTarget: ScanTarget | undefined;
    const crawler: Crawler = {
      crawl: async (target: ScanTarget): Promise<SiteSnapshot> => {
        receivedTarget = target;
        return makeSnapshot();
      },
    };
    const target = makeTarget();
    const result = await crawler.crawl(target);

    expect(receivedTarget).toBe(target);
    expect(result.url).toBe('https://example.com');
    expect(result.hostname).toBe('example.com');
    expect(result.http.statusCode).toBe(200);
    expect(result.html.title).toBe('Example');
  });

  it('crawl throws on failure (application converts to ScanError)', async () => {
    const crawler: Crawler = {
      crawl: async (): Promise<SiteSnapshot> => {
        throw new Error('Network error');
      },
    };
    await expect(crawler.crawl(makeTarget())).rejects.toThrow('Network error');
  });

  it('ScanTarget.url and hostname are distinct concepts', () => {
    const target: ScanTarget = {
      url: createUrl('https://api.example.com/v1'),
      hostname: createHostname('example.com'),
    };
    // url is the full originally-requested target
    expect(target.url).toBe('https://api.example.com/v1');
    // hostname is the associated host (not the full URL)
    expect(target.hostname).toBe('example.com');
    expect(target.hostname).not.toBe(target.url);
  });

  it('ScanTarget.url may differ from SiteSnapshot.url (redirects)', async () => {
    const crawler: Crawler = {
      crawl: async (): Promise<SiteSnapshot> =>
        makeSnapshot({
          url: createUrl('https://example.com/redirected'),
          http: {
            statusCode: createHttpStatus(200),
            headers: [],
            contentType: 'text/html',
            finalUrl: createUrl('https://example.com/redirected'),
          },
        }),
    };
    const target = makeTarget();
    const snapshot = await crawler.crawl(target);

    // The originally requested URL differs from the final observed URL.
    expect(target.url).toBe('https://example.com');
    expect(snapshot.url).toBe('https://example.com/redirected');
    expect(target.url).not.toBe(snapshot.url);
  });

  it('SiteSnapshot is returned as an independent artifact (no scan references)', async () => {
    const crawler: Crawler = {
      crawl: async (): Promise<SiteSnapshot> => makeSnapshot(),
    };
    const snapshot = await crawler.crawl(makeTarget());

    // The snapshot has no reference to a scan or its lifecycle state.
    expect('scanId' in snapshot).toBe(false);
    expect('status' in snapshot).toBe(false);
    expect('createdAt' in snapshot).toBe(false);
  });
});
