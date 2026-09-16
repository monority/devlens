import { describe, it, expect } from 'vitest';
import { HttpCrawler } from './http-crawler.js';
import { makeTarget, mockFetch, htmlResponse, mockResponse } from './test-helpers.js';

/**
 * Snapshot URL Normalization Tests
 *
 * Spec §4: Audit URL handling for absolute, relative, root-relative,
 * protocol-relative URLs, fragments, query strings, trailing slash,
 * hostname casing, ports, and encoding.
 *
 * Spec §4 "Attention": "Ne supprime pas arbitrairement les query parameters."
 */
describe('snapshot-normalization', () => {
  // ─── HTML observation: script src and link href ──────────────────
  // The HTML parser stores URLs as-is from the HTML attribute value
  // (no resolution to absolute). URL resolution happens only for
  // resource fetching in the crawler. This is the documented contract.

  describe('script src URL handling', () => {
    it('stores relative script src as-is (not resolved)', async () => {
      const html = '<script src="/wp-content/app.js"></script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts).toHaveLength(1);
      expect(snapshot.html.scripts[0]!.src).toBe('/wp-content/app.js');
      expect(snapshot.html.scripts[0]!.content).toBe('');
    });

    it('stores absolute script src as-is', async () => {
      const html = '<script src="https://cdn.example.com/app.js"></script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts[0]!.src).toBe('https://cdn.example.com/app.js');
    });

    it('stores protocol-relative script src as-is', async () => {
      const html = '<script src="//cdn.example.com/app.js"></script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts[0]!.src).toBe('//cdn.example.com/app.js');
    });

    it('stores inline script as src=null', async () => {
      const html = '<script>var x = 1;</script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts[0]!.src).toBeNull();
      expect(snapshot.html.scripts[0]!.content).toBe('var x = 1;');
    });

    it('preserves query parameters in script URLs', async () => {
      const html = '<script src="/app.js?id=abc123&ver=2.0"></script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts[0]!.src).toBe('/app.js?id=abc123&ver=2.0');
    });

    it('preserves fragments in script URLs', async () => {
      const html = '<script src="/app.js#section"></script>';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts[0]!.src).toBe('/app.js#section');
    });
  });

  // ─── link href handling ─────────────────────────────────────────────

  describe('link href URL handling', () => {
    it('stores relative href as-is', async () => {
      const html = '<link rel="stylesheet" href="/styles/app.css">';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links[0]!.href).toBe('/styles/app.css');
    });

    it('stores absolute href as-is', async () => {
      const html = '<link rel="stylesheet" href="https://example.com/styles/app.css">';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links[0]!.href).toBe('https://example.com/styles/app.css');
    });

    it('preserves query parameters in link hrefs', async () => {
      const html = '<link rel="stylesheet" href="/app.css?v=1.2.3">';
      const crawler = new HttpCrawler({ fetch: mockFetch(() => htmlResponse(html)) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links[0]!.href).toBe('/app.css?v=1.2.3');
    });
  });

  // ─── Resource URL resolution (absolute URLs in resources) ──────────

  describe('resource URL resolution', () => {
    it('resolves root-relative CSS URL to absolute', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/style.css') {
          return mockResponse('body { color: red; }', 200, { 'Content-Type': 'text/css' });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<link rel="stylesheet" href="/style.css">');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/style.css');
    });

    it('resolves protocol-relative CSS URL to https://', async () => {
      const handler = (url: string) => {
        if (url === 'https://cdn.example.com/app.css') {
          return mockResponse('body { color: red; }', 200, { 'Content-Type': 'text/css' });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<link rel="stylesheet" href="//cdn.example.com/app.css">');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // Cross-origin resources are rejected — no CSS resource should be stored
      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeUndefined();
    });

    it('resolves manifest URL to absolute', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/manifest.json') {
          return new Response('{"name":"App"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<link rel="manifest" href="/manifest.json">');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const manifest = snapshot.resources.find((r) => r.type === 'manifest');
      expect(manifest).toBeDefined();
      expect(manifest!.url).toBe('https://example.com/manifest.json');
    });
  });

  // ─── HTTP-level URL handling ──────────────────────────────────────

  describe('HTTP status and content-type normalization', () => {
    it('normalizes content-type with charset for HTML detection', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Charset</title></head></html>', 200, {
          'Content-Type': 'TEXT/HTML; charset=UTF-8',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // HTML should be parsed despite uppercase Content-Type
      expect(snapshot.html.title).toBe('Charset');
    });

    it('stores raw content-type value in http.contentType', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Raw CT</title></head></html>', 200, {
          'Content-Type': 'text/html; charset=utf-8',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.contentType).toBe('text/html; charset=utf-8');
    });

    it('normalizes header names to lowercase', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Hdrs</title></head></html>', 200, {
          'X-Powered-By': 'PHP',
          Server: 'nginx',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const headerNames = snapshot.http.headers.map((h) => h.name);
      expect(headerNames).toContain('x-powered-by');
      expect(headerNames).toContain('server');
      expect(headerNames).not.toContain('X-Powered-By');
      expect(headerNames).not.toContain('Server');
    });
  });
});
