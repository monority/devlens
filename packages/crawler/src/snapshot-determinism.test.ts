import { describe, it, expect } from 'vitest';
import { extractHtml } from './html-parser.js';
import { HttpCrawler } from './http-crawler.js';
import { makeTarget, mockFetch, htmlResponse, snapshotEqual } from './test-helpers.js';

/**
 * Snapshot Determinism Tests
 *
 * Spec §3: "The same input must produce the same SiteSnapshot."
 *
 * These tests verify that the HTML parser and the crawler produce
 * deterministic output: same input → same (structural) output.
 * The `capturedAt` timestamp is excluded from comparison since it is
 * inherently time-dependent.
 */
describe('snapshot-determinism', () => {
  // ─── HTML parser determinism ───────────────────────────────────────

  describe('extractHtml determinism', () => {
    it('produces identical output for identical HTML input', () => {
      const html =
        '<html><head>' +
        '<title>Test</title>' +
        '<meta name="description" content="A test page">' +
        '<meta name="generator" content="WordPress">' +
        '<script src="/app.js"></script>' +
        '<script>var x = 1;</script>' +
        '<link rel="stylesheet" href="/style.css">' +
        '<link rel="manifest" href="/manifest.json">' +
        '</head></html>';

      const result1 = extractHtml(html);
      const result2 = extractHtml(html);

      expect(result1).toEqual(result2);
    });

    it('preserves script ordering deterministically (document order)', () => {
      const html =
        '<script src="/first.js"></script>' +
        '<script src="/second.js"></script>' +
        '<script src="/third.js"></script>';

      const result1 = extractHtml(html);
      const result2 = extractHtml(html);

      expect(result1.scripts).toEqual(result2.scripts);
      expect(result1.scripts.map((s) => s.src)).toEqual(['/first.js', '/second.js', '/third.js']);
    });

    it('preserves link ordering deterministically (document order)', () => {
      const html =
        '<link rel="stylesheet" href="/a.css">' +
        '<link rel="icon" href="/favicon.ico">' +
        '<link rel="stylesheet" href="/b.css">';

      const result1 = extractHtml(html);
      const result2 = extractHtml(html);

      expect(result1.linkTags).toEqual(result2.linkTags);
      expect(result1.linkTags.map((l) => l.href)).toEqual(['/a.css', '/favicon.ico', '/b.css']);
    });

    it('preserves meta tag ordering deterministically (document order)', () => {
      const html =
        '<meta name="a" content="1">' +
        '<meta name="b" content="2">' +
        '<meta name="c" content="3">';

      const result1 = extractHtml(html);
      const result2 = extractHtml(html);

      expect(result1.metaTags).toEqual(result2.metaTags);
      expect(result1.metaTags.map((m) => m.name)).toEqual(['a', 'b', 'c']);
    });

    it('produces identical output across 100 invocations (stability)', () => {
      const html =
        '<html><head>' +
        '<title>Stable</title>' +
        '<meta name="description" content="Stability test">' +
        '<script src="/app.js"></script>' +
        '<script>window.__NEXT_DATA__ = {};</script>' +
        '<link rel="stylesheet" href="/style.css">' +
        '</head></html>';

      const baseline = extractHtml(html);
      for (let i = 0; i < 99; i++) {
        expect(extractHtml(html)).toEqual(baseline);
      }
    });
  });

  // ─── Crawler determinism ───────────────────────────────────────────

  describe('HttpCrawler determinism', () => {
    it('produces structurally identical snapshots for identical responses', async () => {
      const html =
        '<html><head>' +
        '<title>Determinism</title>' +
        '<meta name="description" content="Testing determinism">' +
        '<meta name="generator" content="WordPress">' +
        '<script src="/wp-content/app.js"></script>' +
        '<script>var config = {"basePath":"/"};</script>' +
        '<link rel="stylesheet" href="/style.css">' +
        '<link rel="manifest" href="/manifest.json">' +
        '</head></html>';

      const handler = (url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /admin', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response(JSON.stringify({ name: 'App' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://example.com/style.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });

      const snapshot1 = await crawler.crawl(makeTarget());
      const snapshot2 = await crawler.crawl(makeTarget());

      // Structural equality (ignoring capturedAt timestamp)
      expect(snapshotEqual(snapshot1, snapshot2)).toBe(true);
    });

    it('produces stable header ordering across crawls', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Headers</title></head></html>', 200, {
          'X-Powered-By': 'PHP',
          Server: 'nginx',
          'X-Custom': 'value',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot1 = await crawler.crawl(makeTarget());
      const snapshot2 = await crawler.crawl(makeTarget());

      // Headers are stored in the order they appear in the response
      const headerNames1 = snapshot1.http.headers.map((h) => h.name);
      const headerNames2 = snapshot2.http.headers.map((h) => h.name);
      expect(headerNames1).toEqual(headerNames2);
      expect(headerNames1.sort()).toEqual(['content-type', 'server', 'x-custom', 'x-powered-by']);
    });

    it('produces stable resource ordering across crawls', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url === 'https://example.com/style.css') {
          return new Response('body { margin: 0; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('{"name":"App"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return htmlResponse(
          '<html><head>' +
            '<link rel="stylesheet" href="/style.css">' +
            '<link rel="manifest" href="/manifest.json">' +
            '<title>Order</title>' +
            '</head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot1 = await crawler.crawl(makeTarget());
      const snapshot2 = await crawler.crawl(makeTarget());

      // Resource ordering is deterministic: robots → manifest → CSS
      const types1 = snapshot1.resources.map((r) => r.type);
      const types2 = snapshot2.resources.map((r) => r.type);
      expect(types1).toEqual(types2);
    });
  });

  // ─── Idempotency of repeated parsing ───────────────────────────────

  describe('idempotent operations', () => {
    it('extracting HTML twice yields no side effects', () => {
      const html =
        '<html><head><title>Test</title><meta name="generator" content="Hugo"></head></html>';
      const result1 = extractHtml(html);
      const result2 = extractHtml(html);

      // Verify deep equality and no shared mutable state
      expect(result1).toEqual(result2);
      expect(result1.metaTags).not.toBe(result2.metaTags); // different array instances
    });
  });
});
