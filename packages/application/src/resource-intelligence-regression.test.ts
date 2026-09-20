/**
 * Step 70 — pipeline regression guard.
 *
 * Proves that enabling the HTTP Resource Intelligence layer does NOT alter
 * the direct (Step-68/69) detections produced by `createProductionDetector()`.
 *
 * Method: crawl the SAME rich, real-world-style HTML twice — once with the
 * resource-intelligence option OFF (the original controlled-observation
 * path: robots + same-origin css + manifest) and once with it ON (the full
 * discover → select → acquire pipeline: scripts, favicons, css, manifest,
 * robots, with provenance fields) — using an identical mock fetch. Run the
 * production detector pipeline over both snapshots and assert the SET of
 * detected technology IDs is identical.
 *
 * This is the invariant Step 70 must preserve: enriching `snapshot.resources`
 * must never create, remove, or alter a direct detection. The new resource
 * kinds (script / favicon / skipped / failed) carry no detector signatures
 * (ResourceDetector only matches `robots`/`css`/`manifest`), and fetched CSS
 * bodies are byte-identical between the two paths, so resource-driven evidence
 * is unchanged.
 */

import { describe, it, expect } from 'vitest';
import { HttpCrawler, DEFAULT_RESOURCE_POLICY } from '@devlens/crawler';
import { createProductionDetector } from '@devlens/detectors';
import { createUrl, createHostname } from '@devlens/core';
import type { ScanTarget, SiteSnapshot } from '@devlens/core';

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function mockFetch(handler: FetchHandler): typeof fetch {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  };
}

function makeTarget(url = 'https://example.com', hostname = 'example.com'): ScanTarget {
  return { url: createUrl(url), hostname: createHostname(hostname) };
}

/** A rich page exercising WordPress, Next.js, React, Shopify, jQuery, GA. */
const RICH_HTML =
  '<!DOCTYPE html><html><head>' +
  '<meta charset="utf-8">' +
  '<meta name="generator" content="WordPress 6.4">' +
  '<meta name="description" content="A real-world site">' +
  '<title>Rich Site</title>' +
  // WordPress-relevant CSS (contains a WP fingerprint).
  '<link rel="stylesheet" href="/wp-content/style.css">' +
  // Shopify CDN stylesheet (cross-origin — Shopify detected via link hostname, not fetched).
  '<link rel="stylesheet" href="https://cdn.shopify.com/assets/theme.css">' +
  // Script URLs (jQuery) — detected via src hostname/path by ScriptUrlDetector.
  '<script src="/wp-includes/js/jquery.js"></script>' +
  // Inline scripts — Next.js + React (ContentScriptDetector).
  '<script>window.__NEXT_DATA__ = {"props":{}};</script>' +
  '<script>react-dom</script>' +
  // Favicon + manifest (Step-70 discoveries).
  '<link rel="icon" href="/favicon.ico">' +
  '<link rel="manifest" href="/manifest.json">' +
  '</head><body><h1>Hi</h1></body></html>';

function richFetch(): FetchHandler {
  return (url) => {
    if (url.endsWith('/robots.txt')) {
      return new Response('User-agent: *\nDisallow: /wp-admin', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    if (url.endsWith('/wp-content/style.css')) {
      return new Response('.wp-block-group { } --wp--preset--color-primary', {
        status: 200,
        headers: { 'Content-Type': 'text/css' },
      });
    }
    if (url === 'https://cdn.shopify.com/assets/theme.css') {
      // Cross-origin — must NOT be fetched under the default (same-origin) policy.
      throw new Error('cross-origin resource must not be fetched');
    }
    if (url.endsWith('/wp-includes/js/jquery.js')) {
      return new Response('jQuery JS', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript' },
      });
    }
    if (url.endsWith('/favicon.ico')) {
      return new Response('ICO-BODY', { status: 200, headers: { 'Content-Type': 'image/x-icon' } });
    }
    if (url.endsWith('/manifest.json')) {
      return new Response('{"name":"Site"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(RICH_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  };
}

function detectionIds(snapshot: SiteSnapshot): string[] {
  return createProductionDetector()
    .detect(snapshot)
    .map((d) => d.technology.id)
    .sort();
}

describe('Step 70 — resource intelligence does not alter direct detections', () => {
  it('ON-crawl detections are identical to OFF-crawl (default) detections', async () => {
    const fetch = mockFetch(richFetch());
    const target = makeTarget();

    const crawlerOff = new HttpCrawler({ fetch });
    const crawlerOn = new HttpCrawler({ fetch, resourceIntelligence: DEFAULT_RESOURCE_POLICY });

    const snapshotOff = await crawlerOff.crawl(target);
    const snapshotOn = await crawlerOn.crawl(target);

    // Sanity: the ON path produced a strictly richer resource set.
    expect(snapshotOn.resources.length).toBeGreaterThan(snapshotOff.resources.length);
    expect(snapshotOn.resources.find((r) => r.type === 'script')).toBeDefined();
    expect(snapshotOn.resources.find((r) => r.type === 'favicon')).toBeDefined();

    // The regression invariant: identical direct detections.
    expect(detectionIds(snapshotOn)).toEqual(detectionIds(snapshotOff));

    // A few technologies we deliberately engineered into RICH_HTML must
    // still be detected with the layer ON.
    const ids = new Set(detectionIds(snapshotOn));
    expect(ids.has('wordpress')).toBe(true);
    expect(ids.has('shopify')).toBe(true);
    expect(ids.has('jquery')).toBe(true);
    // No false-positive detections introduced by fetched script/favicon bodies.
    expect(ids.has('favicon')).toBe(false);
    expect(ids.has('script')).toBe(false);
  });

  it('derived/detected provenance is absent on direct detections (Step 69 compat)', async () => {
    // The ON path adds provenance fields to Resources, but Detection.source
    // stays absent on direct detections (absent ⇒ direct, per Step 69).
    const fetch = mockFetch(richFetch());
    const crawler = new HttpCrawler({ fetch, resourceIntelligence: DEFAULT_RESOURCE_POLICY });
    const snapshot = await crawler.crawl(makeTarget());

    const detections = createProductionDetector().detect(snapshot);
    for (const d of detections) {
      expect(d.source).toBeUndefined();
    }
    // Resources gained the new optional fields.
    for (const r of snapshot.resources) {
      expect(r.acquisitionStatus).toBeDefined();
    }
  });
});
