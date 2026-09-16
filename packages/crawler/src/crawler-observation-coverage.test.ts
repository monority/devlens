import { describe, it, expect } from 'vitest';
import { HttpCrawler } from './http-crawler.js';
import { makeTarget, mockFetch, htmlResponse, mockResponse } from './test-helpers.js';

/**
 * Crawler Observation Coverage Tests
 *
 * Spec §2: "Build an Observation Coverage Matrix covering all observations
 * produced by the crawler."
 *
 * Each test verifies that a specific observation surface is correctly
 * produced in the SiteSnapshot. This maps directly to the coverage matrix
 * in docs/Step12-report.md.
 */
describe('crawler-observation-coverage', () => {
  // ─── HTTP headers ──────────────────────────────────────────────
  // Surface: HTTP response headers
  // Producer: HttpCrawler (via convertHeaders)
  // Normalized: yes (lowercase names)
  // Consumers: HeaderDetector

  describe('HTTP headers observation', () => {
    it('captures all response headers with lowercase names', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>Headers</title></head></html>', 200, {
          'Content-Type': 'text/html',
          Server: 'nginx/1.21',
          'X-Powered-By': 'PHP/8.2',
          'X-Frame-Options': 'DENY',
        });

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const headerMap = new Map(
        snapshot.http.headers.map((h) => [h.name, h.value] as [string, string]),
      );
      expect(headerMap.get('server')).toBe('nginx/1.21');
      expect(headerMap.get('x-powered-by')).toBe('PHP/8.2');
      expect(headerMap.get('x-frame-options')).toBe('DENY');
      expect(headerMap.get('content-type')).toBe('text/html');
    });

    it('produces HttpHeader[] not a native Headers object', async () => {
      const handler = () => htmlResponse('<html><head></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(Array.isArray(snapshot.http.headers)).toBe(true);
      expect(snapshot.http.headers).not.toBeInstanceOf(Headers);
      expect(snapshot.http.headers[0]!.name).toBe('content-type');
    });
  });

  // ─── HTTP status code ──────────────────────────────────────────
  // Surface: HTTP status code
  // Producer: HttpCrawler (response.status)
  // Normalized: yes (createHttpStatus validation)

  describe('HTTP status code observation', () => {
    it('captures the HTTP status code from the response', async () => {
      const handler = () => htmlResponse('<html></html>', 200);
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(200);
    });

    it('captures non-2xx status codes as valid observations', async () => {
      const handler = () => mockResponse('Not found', 404, { 'Content-Type': 'text/plain' });
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(404);
    });

    it('captures 500 status codes as valid observations', async () => {
      const handler = () => mockResponse('Server error', 500, { 'Content-Type': 'text/plain' });
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.statusCode).toBe(500);
    });
  });

  // ─── Content-Type ──────────────────────────────────────────────
  // Surface: Content-Type header
  // Producer: HttpCrawler (response.headers.get('content-type'))
  // Normalized: no (raw value stored)

  describe('content-type observation', () => {
    it('stores the raw Content-Type header value', async () => {
      const handler = () =>
        htmlResponse('<html></html>', 200, { 'Content-Type': 'text/html; charset=utf-8' });
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.contentType).toBe('text/html; charset=utf-8');
    });

    it('uses empty string when Content-Type is absent', async () => {
      // Response constructor adds a default Content-Type, so we delete it
      // to simulate a response with no Content-Type header at all.
      const handler = () => {
        const response = new Response('<html></html>', { status: 200 });
        response.headers.delete('content-type');
        return response;
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.contentType).toBe('');
    });
  });

  // ─── Final URL (after redirects) ───────────────────────────────
  // Surface: finalUrl
  // Producer: HttpCrawler (resolved after manual redirect following)

  describe('finalUrl observation', () => {
    it('captures the final URL after redirects', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com') {
          return new Response(null, { status: 301, headers: { Location: '/moved' } });
        }
        return htmlResponse('<html><head><title>Moved</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.finalUrl).toBe('https://example.com/moved');
      expect(snapshot.url).toBe('https://example.com/moved');
    });

    it('captures the original URL when no redirect occurs', async () => {
      const handler = () => htmlResponse('<html><head><title>Home</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.http.finalUrl).toBe('https://example.com');
      expect(snapshot.url).toBe('https://example.com');
    });
  });

  // ─── HTML: title ───────────────────────────────────────────────
  // Surface: html.title
  // Producer: http-parser.ts (extractTitle)
  // Consumers: none directly (metadata)

  describe('HTML title observation', () => {
    it('extracts the page title', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>My Page Title</title></head><body></body></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('My Page Title');
    });

    it('returns empty string when no title is present', async () => {
      const handler = () => htmlResponse('<html><head></head><body></body></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('');
    });

    it('trims whitespace from title', async () => {
      const handler = () =>
        htmlResponse('<html><head><title>\n  Spaced Title  \n</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.title).toBe('Spaced Title');
    });
  });

  // ─── HTML: description ─────────────────────────────────────────
  // Surface: html.description
  // Producer: http-parser.ts (extractDescription)
  // Consumers: none directly (metadata)

  describe('HTML description observation', () => {
    it('extracts meta description content', async () => {
      const handler = () =>
        htmlResponse(
          '<html><head><meta name="description" content="A website analysis tool"></head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.description).toBe('A website analysis tool');
    });

    it('returns null when no description meta tag is present', async () => {
      const handler = () => htmlResponse('<html><head><title>Page</title></head></html>');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.description).toBeNull();
    });
  });

  // ─── HTML: meta tags ───────────────────────────────────────────
  // Surface: html.metaTags
  // Producer: http-parser.ts (extractMetaTags)
  // Consumers: MetaTagDetector

  describe('HTML meta tags observation', () => {
    it('extracts all meta tags with name and content', async () => {
      const handler = () =>
        htmlResponse(
          '<html><head>' +
            '<meta name="description" content="A blog">' +
            '<meta name="generator" content="WordPress 6.4">' +
            '<meta name="viewport" content="width=device-width">' +
            '</head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.metaTags).toHaveLength(3);
      expect(snapshot.html.metaTags[0]!.name).toBe('description');
      expect(snapshot.html.metaTags[1]!.name).toBe('generator');
      expect(snapshot.html.metaTags[1]!.content).toBe('WordPress 6.4');
      expect(snapshot.html.metaTags[2]!.name).toBe('viewport');
    });

    it('skips meta tags without name attribute', async () => {
      const handler = () =>
        htmlResponse('<meta content="no-name"><meta name="generator" content="Ghost">');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.metaTags).toHaveLength(1);
      expect(snapshot.html.metaTags[0]!.name).toBe('generator');
    });

    it('skips meta tags without content attribute', async () => {
      const handler = () => htmlResponse('<meta name="generator">');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.metaTags).toEqual([]);
    });
  });

  // ─── HTML: scripts ─────────────────────────────────────────────
  // Surface: html.scripts
  // Producer: http-parser.ts (extractScripts)
  // Consumers: ScriptUrlDetector, ContentScriptDetector

  describe('HTML scripts observation', () => {
    it('extracts external scripts with src', async () => {
      const handler = () =>
        htmlResponse(
          '<html><head>' +
            '<script src="/app.js"></script>' +
            '<script src="https://cdn.example.com/lib.js"></script>' +
            '</head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts).toHaveLength(2);
      expect(snapshot.html.scripts[0]!.src).toBe('/app.js');
      expect(snapshot.html.scripts[0]!.content).toBe('');
      expect(snapshot.html.scripts[1]!.src).toBe('https://cdn.example.com/lib.js');
    });

    it('extracts inline scripts with src=null and content', async () => {
      const handler = () =>
        htmlResponse(
          '<html><head>' + '<script>__NEXT_DATA__ = { "props": {} };</script>' + '</head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.scripts).toHaveLength(1);
      expect(snapshot.html.scripts[0]!.src).toBeNull();
      expect(snapshot.html.scripts[0]!.content).toBe('__NEXT_DATA__ = { "props": {} };');
    });
  });

  // ─── HTML: links ───────────────────────────────────────────────
  // Surface: html.links
  // Producer: http-parser.ts (extractLinkTags)
  // Consumers: LinkDetector

  describe('HTML links observation', () => {
    it('extracts link tags with rel and href', async () => {
      const handler = () =>
        htmlResponse(
          '<html><head>' +
            '<link rel="stylesheet" href="/style.css">' +
            '<link rel="icon" href="/favicon.ico">' +
            '<link rel="canonical" href="https://example.com/canonical">' +
            '</head></html>',
        );
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links).toHaveLength(3);
      expect(snapshot.html.links[0]!.rel).toBe('stylesheet');
      expect(snapshot.html.links[0]!.href).toBe('/style.css');
      expect(snapshot.html.links[1]!.rel).toBe('icon');
      expect(snapshot.html.links[1]!.href).toBe('/favicon.ico');
    });

    it('includes links without href (href=null)', async () => {
      const handler = () => htmlResponse('<link rel="stylesheet">');
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.html.links).toHaveLength(1);
      expect(snapshot.html.links[0]!.href).toBeNull();
      expect(snapshot.html.links[0]!.rel).toBe('stylesheet');
    });
  });

  // ─── Resources: robots.txt ─────────────────────────────────────
  // Surface: resources (type='robots')
  // Producer: HttpCrawler.fetchResource
  // Consumers: ResourceDetector

  describe('robots.txt resource observation', () => {
    it('fetches and stores robots.txt content', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /admin\nAllow: /public', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<html><head><title>Robots</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const robots = snapshot.resources.find((r) => r.type === 'robots');
      expect(robots).toBeDefined();
      expect(robots!.url).toBe('https://example.com/robots.txt');
      expect(robots!.content).toBe('User-agent: *\nDisallow: /admin\nAllow: /public');
      expect(robots!.httpStatus).toBe(200);
      expect(robots!.contentType).toBe('text/plain');
      expect(robots!.size).toBe(robots!.content.length);
    });

    it('accepts text/html Content-Type for robots.txt', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/robots.txt') {
          return new Response('User-agent: *\nDisallow: /', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse('<html><head><title>Robots</title></head></html>');
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const robots = snapshot.resources.find((r) => r.type === 'robots');
      expect(robots).toBeDefined();
      expect(robots!.contentType).toBe('text/html');
    });
  });

  // ─── Resources: manifest.json ──────────────────────────────────
  // Surface: resources (type='manifest')
  // Producer: HttpCrawler.fetchResource
  // Consumers: ResourceDetector

  describe('manifest.json resource observation', () => {
    it('fetches and stores manifest.json content', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/manifest.json') {
          return new Response('{"name":"MyApp","short_name":"App","start_url":"/"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="manifest" href="/manifest.json"><title>Manifest</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const manifest = snapshot.resources.find((r) => r.type === 'manifest');
      expect(manifest).toBeDefined();
      expect(manifest!.url).toBe('https://example.com/manifest.json');
      expect(manifest!.httpStatus).toBe(200);
      expect(manifest!.contentType).toBe('application/json');
    });
  });

  // ─── Resources: CSS ────────────────────────────────────────────
  // Surface: resources (type='css')
  // Producer: HttpCrawler.fetchResource
  // Consumers: ResourceDetector

  describe('CSS resource observation', () => {
    it('fetches and stores CSS content from same-origin stylesheets', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          return new Response('body { color: red; }\n@tailwind base;', {
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
          '<html><head><link rel="stylesheet" href="/app.css"><title>CSS</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/app.css');
      expect(css!.content).toBe('body { color: red; }\n@tailwind base;');
      expect(css!.httpStatus).toBe(200);
      expect(css!.contentType).toBe('text/css');
      expect(css!.size).toBeGreaterThan(0);
    });

    it('accepts application/css Content-Type for CSS resources', async () => {
      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          return mockResponse('body { margin: 0; }', 200, {
            'Content-Type': 'application/css',
          });
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="/app.css"><title>ACSS</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.contentType).toBe('application/css');
    });

    it('rejects cross-origin CSS (same-origin policy)', async () => {
      const handler = (url: string) => {
        if (url === 'https://cdn.other.com/style.css') {
          throw new Error('Should not fetch cross-origin URL');
        }
        if (url === 'https://example.com/robots.txt') {
          return new Response('Not found', { status: 404 });
        }
        if (url === 'https://example.com/manifest.json') {
          return new Response('Not found', { status: 404 });
        }
        return htmlResponse(
          '<html><head><link rel="stylesheet" href="https://cdn.other.com/style.css"><title>XCSS</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeUndefined();
    });
  });

  // ─── Resource: size and content ─────────────────────────────────

  describe('resource size accuracy', () => {
    it('reports size as byte count, not character count', async () => {
      // "é" is 1 UTF-16 code unit but 2 UTF-8 bytes
      const cssContent = 'body { color: ré; }';
      const cssBytes = Buffer.byteLength(cssContent, 'utf-8');

      const handler = (url: string) => {
        if (url === 'https://example.com/app.css') {
          return new Response(cssContent, {
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
          '<html><head><link rel="stylesheet" href="/app.css"><title>Size</title></head></html>',
        );
      };

      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.size).toBe(cssBytes); // bytes, not string length
      expect(css!.content).toBe(cssContent);
    });
  });
});
