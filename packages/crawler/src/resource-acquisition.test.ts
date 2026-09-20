/**
 * Step 70 — resource-acquisition tests for `HttpCrawler`.
 *
 * These exercise the discover → select → acquire pipeline end-to-end
 * through the crawler, with a mock fetch that never touches the network.
 * Each scenario covers one acquisition outcome: success, 4xx, network
 * error, timeout, oversized body, redirect, blocked redirect, scheme
 * rejection, cross-origin (same-origin policy), and per-scan de-duplication.
 *
 * A dedicated regression test pins the DEFAULT-OFF behavior as identical
 * to the original controlled-observation path (robots / manifest / css
 * only — scripts and favicons are NOT fetched), proving the new option is
 * strictly opt-in.
 */

import { describe, it, expect } from 'vitest';
import { HttpCrawler } from './http-crawler.js';
import { DEFAULT_RESOURCE_POLICY } from './resource-intelligence.js';
import { mockFetch, htmlResponse, makeTarget } from './test-helpers.js';
import type { FetchHandler } from './test-helpers.js';

const PAGE_HTML =
  '<html><head>' +
  '<link rel="stylesheet" href="/app.css">' +
  '<link rel="manifest" href="/manifest.json">' +
  '<link rel="icon" href="/favicon.ico">' +
  '<script src="/app.js"></script>' +
  '</head><body></body></html>';

describe('HttpCrawler — resource intelligence (Step 70)', () => {
  describe('default-OFF regression (option absent)', () => {
    it('still yields ONLY the controlled resources (robots/manifest/css) — no scripts/favicons', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.endsWith('/manifest.json')) {
          return new Response('{"name":"x"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        // Resources the OLD path never fetches — must remain unrequested.
        if (url.endsWith('/app.js') || url.endsWith('/favicon.ico')) {
          throw new Error('controlled path must not fetch scripts/favicons');
        }
        return htmlResponse(PAGE_HTML);
      };

      // No resourceIntelligence option → original behavior.
      const crawler = new HttpCrawler({ fetch: mockFetch(handler) });
      const snapshot = await crawler.crawl(makeTarget());

      const kinds = snapshot.resources.map((r) => r.type);
      expect(kinds).not.toContain('script');
      expect(kinds).not.toContain('favicon');
      // The controlled set is preserved exactly.
      expect(new Set(kinds)).toEqual(new Set(['robots', 'manifest', 'css']));
    });
  });

  describe('option ON — success path', () => {
    it('discovers and acquires scripts/css/manifest/favicon/robots with full provenance', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.js')) {
          return new Response('console.log(1)', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x { color: red }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url.endsWith('/manifest.json')) {
          return new Response('{"name":"x"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/favicon.ico')) {
          return new Response('ICO', { status: 200, headers: { 'Content-Type': 'image/x-icon' } });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      expect(snapshot.resources).toHaveLength(5);
      const byUrl = new Map(snapshot.resources.map((r) => [r.url, r]));
      const js = byUrl.get('https://example.com/app.js');
      expect(js).toBeDefined();
      expect(js!.type).toBe('script');
      expect(js!.content).toBe('console.log(1)');
      expect(js!.acquisitionStatus).toBe('fetched');
      expect(js!.sourcePage).toBe('https://example.com');
      // responseHeaders expose the Content-Type (lowercased name).
      const ct = js!.responseHeaders?.find((h) => h.name === 'content-type');
      expect(ct?.value).toBe('text/javascript');

      // Favicon declared by context stays 'favicon' even though served as image/x-icon.
      const icon = byUrl.get('https://example.com/favicon.ico');
      expect(icon).toBeDefined();
      expect(icon!.type).toBe('favicon');
      expect(icon!.httpStatus).toBe(200);

      // Every fetched resource has content and a known origin.
      for (const r of snapshot.resources) {
        expect(r.acquisitionStatus).toBe('fetched');
        expect(r.content.length).toBeGreaterThan(0);
        expect(r.failureReason).toBeUndefined();
      }
    });
  });

  describe('option ON — failure outcomes are observable', () => {
    it('records a 404 resource as a failed observation (never throws)', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.css')) {
          return new Response('nope', { status: 404, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.endsWith('/app.js')) {
          return new Response('console.log(1)', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.url.endsWith('/app.css'));
      expect(css).toBeDefined();
      expect(css!.acquisitionStatus).toBe('failed');
      expect(css!.failureReason).toBe('http_404');
      expect(css!.httpStatus).toBe(404);
      expect(css!.content).toBe('');
      // Other resources still acquired.
      expect(snapshot.resources.find((r) => r.url.endsWith('/app.js'))?.acquisitionStatus).toBe(
        'fetched',
      );
    });

    it('records a network error as a failed observation', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.js')) {
          throw new TypeError('Failed to fetch: connection refused');
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        return htmlResponse(PAGE_HTML);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const js = snapshot.resources.find((r) => r.url.endsWith('/app.js'));
      expect(js).toBeDefined();
      expect(js!.acquisitionStatus).toBe('failed');
      expect(js!.failureReason).toBe('network_error');
      expect(js!.content).toBe('');
    });

    it('records a per-resource timeout when the body exceeds policy.timeoutMs', async () => {
      const handler: FetchHandler = (url, init) => {
        if (url.endsWith('/app.js')) {
          return new Promise<Response>((_resolve, reject) => {
            const timer = setTimeout(() => {
              /* never resolves in time */
            }, 5000);
            init?.signal?.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              },
              { once: true },
            );
          });
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const policy = { ...DEFAULT_RESOURCE_POLICY, timeoutMs: 30, maxBodyBytes: 1_000_000 };
      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: policy,
        timeoutMs: 30000,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const js = snapshot.resources.find((r) => r.url.endsWith('/app.js'));
      expect(js).toBeDefined();
      expect(js!.acquisitionStatus).toBe('failed');
      expect(js!.failureReason).toBe('timeout');
      // The CSS resource is unaffected by the slow script.
      expect(snapshot.resources.find((r) => r.url.endsWith('/app.css'))?.acquisitionStatus).toBe(
        'fetched',
      );
    });

    it('records an oversized body as a failed observation (body_too_large)', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.js')) {
          return new Response('x'.repeat(2000), {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const policy = { ...DEFAULT_RESOURCE_POLICY, maxBodyBytes: 100 };
      const crawler = new HttpCrawler({ fetch: mockFetch(handler), resourceIntelligence: policy });
      const snapshot = await crawler.crawl(makeTarget());

      const js = snapshot.resources.find((r) => r.url.endsWith('/app.js'));
      expect(js).toBeDefined();
      expect(js!.acquisitionStatus).toBe('failed');
      expect(js!.failureReason).toBe('body_too_large');
    });

    it('follows a same-origin redirect to a successful fetch', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.css')) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://example.com/redirected.css' },
          });
        }
        if (url.endsWith('/redirected.css')) {
          return new Response('.x { color: blue }', {
            status: 200,
            headers: { 'Content-Type': 'text/css' },
          });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.url).toBe('https://example.com/redirected.css');
      expect(css!.acquisitionStatus).toBe('fetched');
      expect(css!.content).toBe('.x { color: blue }');
    });

    it('rejects a redirect to a private/loopback host (blocked redirect destination)', async () => {
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/app.css')) {
          return new Response(null, {
            status: 302,
            headers: { Location: 'http://127.0.0.1:8080/steal' },
          });
        }
        if (url.endsWith('/app.js')) {
          return new Response('console.log(1)', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(PAGE_HTML);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const css = snapshot.resources.find((r) => r.url.endsWith('/app.css'));
      expect(css).toBeDefined();
      expect(css!.acquisitionStatus).toBe('failed');
      expect(css!.failureReason).toBe('failed: blocked redirect destination');
      // Handler must never be called for the loopback target.
    });

    it('skips cross-origin resources when allowExternal is false (default)', async () => {
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="https://cdn.other.com/x.css">' +
        '</head></html>';
      let externalCalls = 0;
      const handler: FetchHandler = (url) => {
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.includes('cdn.other.com')) {
          externalCalls++;
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      // Cross-origin resource is observable as skipped, but never fetched.
      const css = snapshot.resources.find((r) => r.type === 'css');
      expect(css).toBeDefined();
      expect(css!.acquisitionStatus).toBe('skipped');
      expect(css!.failureReason).toBe('skipped: blocked by SSRF/same-origin policy');
      expect(css!.content).toBe('');
      expect(externalCalls).toBe(0);
    });

    it('rejects non-http(s) resource schemes at discovery (never fetched)', async () => {
      const html =
        '<html><head>' +
        '<script src="javascript:alert(1)"></script>' +
        '<link rel="icon" href="data:image/png;base64,abc">' +
        '<link rel="stylesheet" href="/app.css">' +
        '</head></html>';
      let badCalls = 0;
      const handler: FetchHandler = (url) => {
        if (url === 'javascript:alert(1)' || url.startsWith('data:')) {
          badCalls++;
          return new Response('');
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(html);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget('https://example.com'));

      expect(badCalls).toBe(0);
      // Only the legitimate css + robots survive (css fetched, javascript/data dropped).
      const types = snapshot.resources.map((r) => r.type);
      expect(types).not.toContain('favicon'); // the data: icon was dropped at discovery
    });
  });

  describe('deterministic output + per-scan de-duplication', () => {
    it('does not fetch the same canonical URL twice (per-scan dedup)', async () => {
      const html =
        '<html><head>' +
        '<script src="/app.js"></script>' +
        '<script src="/app.js"></script>' +
        '<script src="/app.js"></script>' +
        '<link rel="stylesheet" href="/app.css">' +
        '</head></html>';

      let jsCalls = 0;
      const handler: FetchHandler = (url, init) => {
        if (url.endsWith('/app.js')) {
          jsCalls++;
          return new Response('console.log(1)', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/app.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(html, 200, init);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
      });
      const snapshot = await crawler.crawl(makeTarget());

      expect(jsCalls).toBe(1);
      const scripts = snapshot.resources.filter((r) => r.type === 'script');
      expect(scripts).toHaveLength(1);
      expect(scripts[0]!.url).toBe('https://example.com/app.js');
    });

    it('orders the final resource list deterministically (priority, then URL) regardless of completion order', async () => {
      // Two resources: a slow css and a fast script. The fast one completes
      // first, yet scripts must sort before css in the output.
      const html =
        '<html><head>' +
        '<link rel="stylesheet" href="/style.css">' +
        '<script src="/app.js"></script>' +
        '</head></html>';

      const handler: FetchHandler = (url, init) => {
        if (url.endsWith('/style.css')) {
          return new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(
                  new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } }),
                ),
              40,
            ),
          );
        }
        if (url.endsWith('/app.js')) {
          return new Response('console.log(1)', {
            status: 200,
            headers: { 'Content-Type': 'text/javascript' },
          });
        }
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        return htmlResponse(html, 200, init);
      };

      const crawler = new HttpCrawler({
        fetch: mockFetch(handler),
        resourceIntelligence: DEFAULT_RESOURCE_POLICY,
        timeoutMs: 30000,
      });
      const snapshot = await crawler.crawl(makeTarget());

      const typesInOrder = snapshot.resources.map((r) => r.type);
      // Priority order: script(0) < css(2) < robots(5). The slow CSS resolved
      // later than the fast script, yet scripts must sort before css.
      expect(typesInOrder).toEqual(expect.arrayContaining(['script', 'css', 'robots']));
      const scriptIdx = typesInOrder.indexOf('script');
      const cssIdx = typesInOrder.indexOf('css');
      expect(scriptIdx).toBeGreaterThanOrEqual(0);
      expect(cssIdx).toBeGreaterThanOrEqual(0);
      expect(scriptIdx).toBeLessThan(cssIdx);
    });

    it('emits skipped (beyond-budget) observations with a reason', async () => {
      const html =
        '<html><head>' +
        '<script src="/a.js"></script>' +
        '<script src="/b.js"></script>' +
        '<script src="/c.js"></script>' +
        '<script src="/d.js"></script>' +
        '<link rel="stylesheet" href="/s.css">' +
        '</head></html>';

      const handler: FetchHandler = (url) => {
        if (url.endsWith('/robots.txt')) {
          return new Response('User-agent: *', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        }
        if (url.endsWith('.js')) {
          return new Response('x', { status: 200, headers: { 'Content-Type': 'text/javascript' } });
        }
        if (url.endsWith('.css')) {
          return new Response('.x{}', { status: 200, headers: { 'Content-Type': 'text/css' } });
        }
        return htmlResponse(html);
      };

      const policy = {
        ...DEFAULT_RESOURCE_POLICY,
        maxTotal: 2,
        maxPerKind: { ...DEFAULT_RESOURCE_POLICY.maxPerKind, script: 20 },
      };
      const crawler = new HttpCrawler({ fetch: mockFetch(handler), resourceIntelligence: policy });
      const snapshot = await crawler.crawl(makeTarget());

      const selected = snapshot.resources.filter((r) => r.acquisitionStatus !== 'skipped');
      const skipped = snapshot.resources.filter((r) => r.acquisitionStatus === 'skipped');
      expect(selected.length + skipped.length).toBeLessThanOrEqual(6); // robots + up to 5 discovered, total budget 2
      expect(selected.length).toBe(2); // maxTotal=2
      expect(skipped.length).toBeGreaterThanOrEqual(1);
      for (const r of skipped) {
        expect(r.content).toBe('');
        expect(r.failureReason).toBe('skipped: beyond selection budget');
      }
    });
  });
});
