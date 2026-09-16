import { describe, it, expect } from 'vitest';
import { HttpCrawler } from './http-crawler.js';
import { CrawlError } from './crawl-error.js';
import { isResourceUrlAllowed } from './ssrf-guard.js';
import { createUrl, createHostname } from '@devlens/core';
import type { ScanTarget } from '@devlens/core';

// ─── Helpers ───────────────────────────────────────────────────────

function makeTarget(url = 'https://example.com', hostname = 'example.com'): ScanTarget {
  return {
    url: createUrl(url),
    hostname: createHostname(hostname),
  };
}

/** Creates a Response wrapping the given HTML with sensible defaults. */
function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...headers },
  });
}

/** Creates a Response with arbitrary content type. */
function mockResponse(
  body: string,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(body, { status, headers });
}

/** Handler type for mock fetch. Receives the URL string and fetch init. */
type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Wraps a handler function as a `typeof fetch` compatible mock. */
function mockFetch(handler: FetchHandler): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  };
}

/** Creates a fetch mock that delays before responding, respecting abort signals. */
function slowFetch(delayMs: number, response: Response): typeof fetch {
  return async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const signal = init?.signal;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(response), delayMs);

      const onAbort = () => {
        clearTimeout(timer);
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      };

      signal?.addEventListener('abort', onAbort, { once: true });
    });
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('HttpCrawler', () => {
  describe('basic HTML extraction', () => {
    it('extracts title and meta description from an HTML response', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(
          '<html>\n<head>\n  <title>DevLens</title>\n  <meta name="description" content="Website analysis">\n</head>\n<body>Hello</body>\n</html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(200);
      expect(snapshot.html.title).toBe('DevLens');
      expect(snapshot.html.description).toBe('Website analysis');
      expect(snapshot.http.finalUrl).toBe('https://example.com');
      expect(snapshot.resources).toEqual([]);
    });

    it('returns empty title when no <title> tag is present', async () => {
      const handler: FetchHandler = () =>
        htmlResponse('<html><head></head><body>No title here</body></html>');

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('');
    });

    it('returns null description when no meta description is present', async () => {
      const handler: FetchHandler = () =>
        htmlResponse(
          '<html><head><title>DevLens</title></head><body>Has title but no description</body></html>',
        );

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('DevLens');
      expect(snapshot.html.description).toBe(null);
    });

    it('extracts meta description regardless of attribute order', async () => {
      const handler: FetchHandler = () =>
        htmlResponse(
          '<html><head><title>DevLens</title><meta content="Swapped attribute order" name="description"></head></html>',
        );

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.description).toBe('Swapped attribute order');
    });

    it('extracts meta description from uppercase HTML tags', async () => {
      const handler: FetchHandler = () =>
        htmlResponse(
          '<HTML><HEAD><META NAME="DESCRIPTION" CONTENT="Uppercase HTML tags"></HEAD></HTML>',
        );

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.description).toBe('Uppercase HTML tags');
    });
  });

  describe('redirects', () => {
    it('follows redirects and sets finalUrl to the destination', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/redirected' },
          });
        }
        return htmlResponse('<html><head><title>Redirected</title></head></html>', 200);
      };

      const target = makeTarget('https://example.com');
      const originalUrl = target.url;
      const originalHostname = target.hostname;

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(target);

      // ScanTarget is NOT mutated
      expect(target.url).toBe(originalUrl);
      expect(target.hostname).toBe(originalHostname);

      // Final URL reflects the redirect destination
      expect(snapshot.url).toBe('https://example.com/redirected');
      expect(snapshot.http.finalUrl).toBe('https://example.com/redirected');
      expect(snapshot.http.finalUrl).not.toBe('https://example.com');
      expect(snapshot.html.title).toBe('Redirected');
    });
  });

  describe('HTTP error responses (valid observations)', () => {
    it('produces a valid snapshot for HTTP 404', async () => {
      const handler: FetchHandler = () =>
        mockResponse('Not found', 404, { 'Content-Type': 'text/plain' });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(404);
      expect(snapshot.html.title).toBe('');
      expect(snapshot.html.description).toBe(null);
      expect(snapshot.http.contentType).toBe('text/plain');
    });

    it('produces a valid snapshot for HTTP 500', async () => {
      const handler: FetchHandler = () =>
        mockResponse('Internal Server Error', 500, { 'Content-Type': 'text/plain' });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(500);
      expect(snapshot.html.title).toBe('');
      expect(snapshot.html.description).toBe(null);
    });
  });

  describe('network errors', () => {
    it('throws CrawlError with code "network_error" on fetch failure', async () => {
      const handler: FetchHandler = () => {
        throw new TypeError('Failed to fetch: connection refused');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const error = await crawler.crawl(makeTarget()).catch((e) => e);

      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'network_error');
    });
  });

  describe('timeout', () => {
    it('throws CrawlError with code "timeout" when the request exceeds the timeout', async () => {
      const response = htmlResponse('<html><head><title>Delayed</title></head></html>');

      const crawler = new HttpCrawler({
        timeoutMs: 50,
        fetch: slowFetch(5000, response),
      });

      const error = await crawler.crawl(makeTarget()).catch((e) => e);
      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'timeout');
    });

    it('respects a custom timeout configuration', async () => {
      const response = htmlResponse('<html></html>');

      // 10ms timeout — the 5000ms delay fetch should always be interrupted
      const crawler = new HttpCrawler({
        timeoutMs: 10,
        fetch: slowFetch(5000, response),
      });

      const start = Date.now();
      const error = await crawler.crawl(makeTarget()).catch((e) => e);
      const elapsed = Date.now() - start;

      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'timeout');
      // Should abort within a reasonable window of the configured timeout
      expect(elapsed).toBeLessThan(500);
    });
  });

  describe('body size limit', () => {
    it('rejects response when Content-Length exceeds maxBodyBytes', async () => {
      const response = new Response('small body', {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Length': '999999',
        },
      });

      const crawler = new HttpCrawler({
        maxBodyBytes: 100,
        fetch: mockFetch(() => response),
      });

      const error = await crawler.crawl(makeTarget()).catch((e) => e);
      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'too_large');
    });

    it('rejects response when streamed body exceeds maxBodyBytes', async () => {
      // Response without Content-Length header — forces streaming read
      const largeBody = 'x'.repeat(2000);
      const response = new Response(largeBody, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });

      const crawler = new HttpCrawler({
        maxBodyBytes: 100,
        fetch: mockFetch(() => response),
      });

      const error = await crawler.crawl(makeTarget()).catch((e) => e);
      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'too_large');
    });

    it('respects a custom maxBodyBytes configuration', async () => {
      const response = new Response('x'.repeat(500), {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Content-Length': '500',
        },
      });

      const crawler = new HttpCrawler({
        maxBodyBytes: 1000,
        fetch: mockFetch(() => response),
      });

      const snapshot = await crawler.crawl(makeTarget());
      expect(snapshot.http.statusCode).toBe(200);
    });
  });

  describe('non-HTML responses', () => {
    it('does not parse HTML for application/json and returns default values', async () => {
      const handler: FetchHandler = () =>
        mockResponse('{"key":"value"}', 200, { 'Content-Type': 'application/json' });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('');
      expect(snapshot.html.description).toBe(null);
      expect(snapshot.http.contentType).toBe('application/json');
    });

    it('normalizes content-type with charset for HTML detection', async () => {
      const handler: FetchHandler = () =>
        mockResponse('<html><head><title>Charset Test</title></head></html>', 200, {
          'Content-Type': 'text/html; charset=utf-8',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('Charset Test');
    });
  });

  describe('headers', () => {
    it('converts response headers to domain HttpHeader structures', async () => {
      const handler: FetchHandler = () =>
        mockResponse('<html><head><title>Headers Test</title></head></html>', 200, {
          'Content-Type': 'text/html',
          'X-Powered-By': 'DevLens',
          'Set-Cookie': 'session=abc123',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const headerMap = new Map(
        snapshot.http.headers.map((h) => [h.name, h.value] as [string, string]),
      );
      expect(headerMap.get('content-type')).toBe('text/html');
      expect(headerMap.get('x-powered-by')).toBe('DevLens');
      expect(headerMap.get('set-cookie')).toBe('session=abc123');

      // No native Headers object should leak into the domain
      expect(snapshot.http.headers).not.toBeInstanceOf(Headers);
    });
  });

  describe('user-agent', () => {
    it('sends the configured User-Agent header', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      let callCount = 0;

      const handler: FetchHandler = (_url, init) => {
        callCount++;
        // Capture headers only from the first call (the main page fetch).
        // The crawler also fetches robots.txt and CSS after the main page,
        // which use different Accept headers.
        if (callCount === 1) {
          capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        }
        return htmlResponse('<html><head><title>UA Test</title></head></html>');
      };

      const crawler = new HttpCrawler({
        userAgent: 'MyCustomAgent/1.0',
        fetch: mockFetch(handler),
      });

      await crawler.crawl(makeTarget());

      expect(capturedHeaders?.['User-Agent']).toBe('MyCustomAgent/1.0');
      expect(capturedHeaders?.['Accept']).toBe('text/html,application/xhtml+xml');
    });

    it('uses the default User-Agent when not configured', async () => {
      let capturedHeaders: Record<string, string> | undefined;
      let callCount = 0;

      const handler: FetchHandler = (_url, init) => {
        callCount++;
        if (callCount === 1) {
          capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
        }
        return htmlResponse('<html></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      await crawler.crawl(makeTarget());

      expect(capturedHeaders?.['User-Agent']).toBe('DevLens/0.1 (+https://devlens.local)');
    });
  });

  describe('invalid target / SSRF', () => {
    it('rejects requests to localhost with CrawlError "invalid_target"', async () => {
      const handler: FetchHandler = () => {
        throw new Error('Should not have been called');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const error = await crawler
        .crawl(makeTarget('http://localhost', 'localhost'))
        .catch((e) => e);

      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'invalid_target');
    });

    it('rejects redirects to localhost with CrawlError "invalid_target"', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:8080/admin' },
          });
        }
        throw new Error('Should not reach redirect target');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const error = await crawler.crawl(makeTarget()).catch((e) => e);

      expect(error).toBeInstanceOf(CrawlError);
      expect(error).toHaveProperty('code', 'invalid_target');
    });
  });

  describe('ScanTarget immutability', () => {
    it('does not mutate the ScanTarget passed to crawl()', async () => {
      const handler: FetchHandler = () =>
        htmlResponse('<html><head><title>Test</title></head></html>');

      const target = makeTarget('https://example.com', 'example.com');
      const originalUrl = target.url;
      const originalHostname = target.hostname;

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      await crawler.crawl(target);

      expect(target.url).toBe(originalUrl);
      expect(target.hostname).toBe(originalHostname);
    });
  });

  // ─── Resource observation (Step 6H) tests 10–23 ───────────────────

  describe('resource observation (Step 6H)', () => {
    it('fetches same-origin CSS (test #10)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        return htmlResponse('<html><head><link rel="stylesheet" href="/app.css"></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(1);
      expect(cssResources[0]!.url).toBe('https://example.com/app.css');
    });

    it('fetches robots.txt (test #11)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /admin', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><title>Robots Test</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
      expect(robotsResources[0]!.url).toBe('https://example.com/robots.txt');
    });

    it('fetches manifest (test #12)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/manifest.json') {
          return new Response('{"name": "MyApp"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return htmlResponse(
          '<html><head><link rel="manifest" href="/manifest.json"></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const manifestResources = snapshot.resources.filter((r) => r.type === 'manifest');
      expect(manifestResources).toHaveLength(1);
      expect(manifestResources[0]!.url).toBe('https://example.com/manifest.json');
    });

    it('stores resource content, status, and content-type (test #13)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response('body { color: blue; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        return htmlResponse('<html><head><link rel="stylesheet" href="/app.css"></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(1);
      expect(cssResources[0]!.content).toBe('body { color: blue; }');
      expect(cssResources[0]!.httpStatus).toBe(200);
      expect(cssResources[0]!.contentType).toBe('text/css');
      expect(cssResources[0]!.size).toBeGreaterThan(0);
    });

    it('ignores failed resources (non-2xx response) (test #14)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><link rel="stylesheet" href="/app.css"></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.resources).toEqual([]);
    });

    it('ignores unsupported protocols in resource URLs (test #15)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(
          '<html><head>' +
            '<link rel="stylesheet" href="javascript:alert(1)">' +
            '<link rel="stylesheet" href="data:text/css,body{color:red}">' +
            '<link rel="stylesheet" href="blob:https://example.com/uuid">' +
            '</head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
      // robots.txt should still be fetched
      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
    });

    it('rejects cross-origin stylesheet (test #16)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        // Handler should never be called for the cross-origin URL
        if (url.startsWith('https://cdn.other.com')) {
          throw new Error('Should not fetch cross-origin URL');
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="https://cdn.other.com/app.css"></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
    });

    it('respects MAX_CSS_RESOURCES (default 5) (test #17)', async () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/s1.css">' +
        '<link rel="stylesheet" href="/s2.css">' +
        '<link rel="stylesheet" href="/s3.css">' +
        '<link rel="stylesheet" href="/s4.css">' +
        '<link rel="stylesheet" href="/s5.css">' +
        '<link rel="stylesheet" href="/s6.css">' +
        '</head></html>';

      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.match(/^https:\/\/example\.com\/s\d+\.css$/)) {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(5);
    });

    it('respects MAX_RESOURCE_BYTES limit (test #18)', async () => {
      const cssContent = 'x'.repeat(1000);
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response(cssContent, {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><link rel="stylesheet" href="/app.css"></head></html>');
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        maxResourceBytes: 100,
      });
      const snapshot = await crawler.crawl(makeTarget());

      // CSS resource exceeds the byte limit — should be skipped
      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
      // robots.txt is within the limit — should still be stored
      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
    });

    it('deduplicates resource URLs (test #19)', async () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/app.css">' +
        '<link rel="stylesheet" href="/app.css">' +
        '</head></html>';

      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(1);
    });

    it('handles resource timeout without failing scan (test #20)', async () => {
      const html = '<html><head><link rel="stylesheet" href="/app.css"></head></html>';
      const handler: FetchHandler = (url, init) => {
        const signal = init?.signal;

        if (url === 'https://example.com/app.css') {
          // Deliberately slow — will be aborted by the crawl timeout
          return new Promise<Response>((resolve, reject) => {
            const timer = setTimeout(() => {
              resolve(
                new Response('body { color: red; }', {
                  status: 200,
                  headers: { 'Content-Type': 'text/css' },
                }),
              );
            }, 5000);
            signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                const error = new Error('The operation was aborted');
                error.name = 'AbortError';
                reject(error);
              },
              { once: true },
            );
          });
        }

        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }

        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({
        timeoutMs: 50,
        fetch: mockFetch(handler),
      });
      const snapshot = await crawler.crawl(makeTarget());

      // Scan succeeds — robots.txt was fetched before the timeout fired
      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
      // CSS resource was abandoned due to timeout
      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
    });

    it('handles missing robots.txt (404) (test #21)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><title>No Robots</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(0);
      // Scan should still succeed
      expect(snapshot.html.title).toBe('No Robots');
    });

    it('handles missing manifest (404) (test #22)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(
          '<html><head><link rel="manifest" href="/manifest.json"></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const manifestResources = snapshot.resources.filter((r) => r.type === 'manifest');
      expect(manifestResources).toHaveLength(0);
      // robots.txt should still be fetched
      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
    });

    it('handles pages with no CSS links (test #23)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><title>No CSS</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
      // robots.txt should still be fetched
      const robotsResources = snapshot.resources.filter((r) => r.type === 'robots');
      expect(robotsResources).toHaveLength(1);
    });
  });

  // ─── Resource security (Step 6H) tests 27–29 ──────────────────────

  describe('resource security (Step 6H)', () => {
    it('cross-origin stylesheet rejected by isResourceUrlAllowed (test #27)', () => {
      expect(isResourceUrlAllowed('https://cdn.other.com/app.css', 'example.com')).toBe(false);
    });

    it('redirect to another origin rejected (test #28)', async () => {
      const handler: FetchHandler = (url) => {
        if (url === 'https://example.com/app.css') {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://cdn.other.com/app.css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse('<html><head><link rel="stylesheet" href="/app.css"></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(0);
    });

    it('rejects data/javascript/blob URL schemes (test #29)', () => {
      expect(isResourceUrlAllowed('data:text/css,body{color:red}', 'example.com')).toBe(false);
      expect(isResourceUrlAllowed('javascript:alert(1)', 'example.com')).toBe(false);
      expect(isResourceUrlAllowed('blob:https://example.com/uuid', 'example.com')).toBe(false);
    });
  });
});
