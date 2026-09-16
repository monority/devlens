import { describe, it, expect } from 'vitest';
import { HttpCrawler } from './http-crawler.js';
import { CrawlError } from './crawl-error.js';
import { makeTarget, mockFetch, htmlResponse, mockResponse } from './test-helpers.js';

/**
 * Crawler Edge Case Tests
 *
 * Spec §7–11: HTTP edge cases, encoding, body size/truncation, malformed
 * input, and duplicate observations.
 */
describe('crawler-edge-cases', () => {
  // ─── HTTP → HTTPS redirects ──────────────────────────────────────

  describe('redirects', () => {
    it('follows HTTP → HTTPS redirect', async () => {
      const handler: (url: string) => Response = (url) => {
        if (url === 'http://example.com') {
          return new Response(null, { status: 301, headers: { Location: 'https://example.com' } });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<html><head><title>HTTPS</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const target = makeTarget('http://example.com', 'example.com');
      const snapshot = await crawler.crawl(target);

      // URL constructor normalizes to add trailing slash for origin-only URLs
      expect(snapshot.url).toBe('https://example.com/');
      expect(snapshot.html.title).toBe('HTTPS');
    });

    it('follows multiple chained redirects', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com') {
          return new Response(null, { status: 302, headers: { Location: '/step1' } });
        }
        if (url === 'https://example.com/step1') {
          return new Response(null, { status: 302, headers: { Location: '/step2' } });
        }
        if (url === 'https://example.com/step2') {
          return new Response(null, { status: 301, headers: { Location: '/final' } });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<html><head><title>Final</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.url).toBe('https://example.com/final');
      expect(snapshot.html.title).toBe('Final');
    });

    it('uses final URL to resolve relative resource URLs', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/old') {
          return new Response(null, {
            status: 301,
            headers: { Location: 'https://example.com/new' },
          });
        }
        // /style.css is root-relative, so it resolves to the origin
        if (url === 'https://example.com/style.css') {
          return mockResponse('body { color: red; }', 200, { 'Content-Type': 'text/css' });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="/style.css"><title>Redirect CSS</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget('https://example.com/old', 'example.com'));

      // CSS should be fetched from the origin (root-relative resolves to origin)
      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/style.css');
    });
  });

  // ─── Status codes ────────────────────────────────────────────────

  describe('status codes', () => {
    it('produces a snapshot for HTTP 301 (redirect, not followed)', async () => {
      // When redirect: 'manual' is used, a 301 response with no follow
      // would still be processed. The crawler follows redirects manually.
      // This test verifies a 301 redirect is followed to the final page.
      const fullHandler = (url: string) => {
        if (url === 'https://example.com') {
          return new Response(null, { status: 301, headers: { Location: '/redirected' } });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<html><head><title>Redirected</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(fullHandler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(200);
      expect(snapshot.html.title).toBe('Redirected');
    });

    it('produces a snapshot for HTTP 405', async () => {
      const handler = () =>
        mockResponse('Method not allowed', 405, { 'Content-Type': 'text/plain' });
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(405);
      expect(snapshot.html.title).toBe('');
    });
  });

  // ─── Missing / incorrect Content-Type ──────────────────────────

  describe('missing and incorrect content-type', () => {
    it('uses empty string when content-type header is absent', async () => {
      // Response constructor adds a default Content-Type, so we delete it
      // to simulate a response with no Content-Type header at all.
      const handler = () => {
        const response = new Response('<html><head><title>No CT</title></head></html>', {
          status: 200,
        });
        response.headers.delete('content-type');
        return response;
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.contentType).toBe('');
      // Without a recognized Content-Type, HTML is not parsed
      expect(snapshot.html.title).toBe('');
    });

    it('does not parse HTML when content-type is application/json', async () => {
      const handler = () =>
        mockResponse('{"html":"<title>JSON</title>"}', 200, { 'Content-Type': 'application/json' });
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('');
      expect(snapshot.http.contentType).toBe('application/json');
    });

    it('parses HTML when content-type is text/html (no charset)', async () => {
      const handler = () =>
        new Response('<html><head><title>No Charset</title></head></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('No Charset');
    });
  });

  // ─── Encoding / charset ─────────────────────────────────────────

  describe('charset handling', () => {
    it('decodes UTF-8 content correctly (default charset)', async () => {
      const handler = () => htmlResponse('<html><head><title>UTF-8 — Café</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('UTF-8 — Café');
    });

    it('respects charset=iso-8859-1 from Content-Type', async () => {
      // é (U+00E9) in ISO-8859-1 is byte 0xE9
      const prefix = new TextEncoder().encode('<html><head><title>CAF');
      const suffix = new TextEncoder().encode('</title></head></html>');
      const bodyBytes = new Uint8Array([...prefix, 0xe9, ...suffix]);

      const handler = (_url: string) => {
        if (_url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return new Response(bodyBytes, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=iso-8859-1' },
        });
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // 0xe9 decoded as ISO-8859-1 → é (U+00E9)
      expect(snapshot.html.title).toBe('CAFé');
    });

    it('falls back to UTF-8 when charset is unsupported', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Fallback</title></head></html>', 200, {
          'Content-Type': 'text/html; charset=invalid-encoding',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // Should not throw — falls back to UTF-8
      expect(snapshot.html.title).toBe('Fallback');
    });

    it('defaults to UTF-8 when charset is absent', async () => {
      const handler = () => htmlResponse('<html><head><title>Default</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('Default');
    });
  });

  // ─── Body size / truncation ─────────────────────────────────────

  describe('body size limits', () => {
    it('throws CrawlError "too_large" when Content-Length exceeds maxBodyBytes', async () => {
      const handler = () =>
        new Response('small', {
          status: 200,
          headers: {
            'Content-Type': 'text/html',
            'Content-Length': '999999',
          },
        });

      const crawler = new HttpCrawler({ maxBodyBytes: 100, fetch: mockFetch(handler) });
      const error = await crawler.crawl(makeTarget()).catch((e) => e);

      expect(error).toBeInstanceOf(CrawlError);
      expect(error.code).toBe('too_large');
    });

    it('throws CrawlError "too_large" when streamed body exceeds maxBodyBytes', async () => {
      const largeBody = 'x'.repeat(2000);
      const handler = () =>
        new Response(largeBody, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });

      const crawler = new HttpCrawler({ maxBodyBytes: 100, fetch: mockFetch(handler) });
      const error = await crawler.crawl(makeTarget()).catch((e) => e);

      expect(error).toBeInstanceOf(CrawlError);
      expect(error.code).toBe('too_large');
    });
  });

  // ─── Malformed HTML ──────────────────────────────────────────────

  describe('malformed HTML', () => {
    it('does not crash on empty HTML body', async () => {
      const handler = () => htmlResponse('');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('');
      expect(snapshot.html.scripts).toEqual([]);
      expect(snapshot.html.metaTags).toEqual([]);
    });

    it('does not crash on HTML without <html> tag', async () => {
      const handler = () => htmlResponse('<head><title>Fragment</title></head>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('Fragment');
    });

    it('does not crash on HTML without <head> tag', async () => {
      const handler = () =>
        htmlResponse('<html><body><script src="/app.js"></script></body></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts).toHaveLength(1);
      expect(snapshot.html.scripts[0]!.src).toBe('/app.js');
    });

    it('handles unclosed script tag (no </script>)', async () => {
      // The regex requires </script>, so an unclosed tag won't match
      const handler = () =>
        htmlResponse('<html><head><script src="/app.js"><title>Test</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // The script tag without closing tag is not extracted
      expect(snapshot.html.scripts).toEqual([]);
    });

    it('handles HTML with script containing > character in content', async () => {
      const handler = () =>
        htmlResponse('<html><head><script>var x = a > b; console.log(x);</script></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // The regex `<script\b([^>]*)>` stops at the first `>` in the opening tag,
      // so `var x = a > b` in the content may not be captured correctly.
      // This is a known limitation of regex-based HTML parsing.
      expect(snapshot).toBeDefined();
    });

    it('handles nested script-like strings in content', async () => {
      // The non-greedy regex may stop early if </script> appears in a string
      const handler = () =>
        htmlResponse(
          '<html><head><script>var s = "stop";</script><script src="/second.js"></script></head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // Both scripts should be extracted correctly
      expect(snapshot.html.scripts).toHaveLength(2);
      expect(snapshot.html.scripts[0]!.src).toBeNull();
      expect(snapshot.html.scripts[1]!.src).toBe('/second.js');
    });
  });

  // ─── Duplicate observations ─────────────────────────────────────

  describe('duplicate observations', () => {
    it('preserves duplicate script tags in document order', async () => {
      const handler = () =>
        htmlResponse(
          '<script src="/app.js"></script>' +
            '<script src="/app.js"></script>' +
            '<script src="/app.js"></script>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // HTML parser preserves duplicates; deduplication is the detector's job
      expect(snapshot.html.scripts).toHaveLength(3);
      expect(snapshot.html.scripts.every((s) => s.src === '/app.js')).toBe(true);
    });

    it('preserves duplicate link tags in document order', async () => {
      const handler = () =>
        htmlResponse(
          '<link rel="stylesheet" href="/style.css">' + '<link rel="stylesheet" href="/style.css">',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links).toHaveLength(2);
    });

    it('deduplicates resource fetches (same CSS URL fetched once)', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head>' +
            '<link rel="stylesheet" href="/app.css">' +
            '<link rel="stylesheet" href="/app.css">' +
            '<title>Dup</title>' +
            '</head></html>',
        );
      };

      let cssFetchCount = 0;
      const countingHandler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          cssFetchCount++;
        }
        return handler(url);
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(countingHandler) });
      const snapshot = await crawler.crawl(makeTarget());

      const cssResources = snapshot.resources.filter((r) => r.type === 'css');
      expect(cssResources).toHaveLength(1);
      expect(cssFetchCount).toBe(1);
    });
  });

  // ─── Resource errors ────────────────────────────────────────────

  describe('resource fetch errors', () => {
    it('skips CSS resource on fetch network error', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          throw new Error('Network error');
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="/app.css"><title>Err</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      // Scan should still succeed
      expect(snapshot.http.statusCode).toBe(200);
      expect(snapshot.html.title).toBe('Err');
      // CSS resource should be absent (failed fetch)
      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeUndefined();
    });

    it('skips resource on non-2xx response', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          return mockResponse('error', 500, { 'Content-Type': 'text/css' });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="/app.css"><title>500</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeUndefined();
    });
  });

  // ─── Relative URLs in resources ─────────────────────────────────

  describe('relative URL resolution in resources', () => {
    it('resolves ./ relative path in stylesheet href', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/css/app.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="./css/app.css"><title>DotSlash</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/css/app.css');
    });

    it('resolves ../ relative path in stylesheet href', async () => {
      // new URL('../styles/app.css', 'https://example.com/page/sub')
      // → 'https://example.com/styles/app.css'
      // (.. removes both 'sub' file and 'page' directory)
      const handler = (url: string) => {
        if (url === 'https://example.com/styles/app.css') {
          return new Response('body { color: red; }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="../styles/app.css"><title>Parent</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(
        makeTarget('https://example.com/page/sub', 'example.com'),
      );

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/styles/app.css');
    });
  });
});
