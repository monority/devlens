/**
 * Step 64 — Real-world detection audit.
 *
 * Exercises the **real** production pipeline (`createProductionDetector()`,
 * i.e. `CompositeDetector → DeduplicatingDetector → ScoringDetector`) against
 * representative realistic pages and asserts not just *which* technologies are
 * detected, but the **full explainable output**: ranked detection order, exact
 * final confidence (per the scoring formula), and the evidence types that
 * justify each detection.
 *
 * Two of the fixtures ("known limitation" negatives) deliberately lock
 * **documented real-world coverage gaps** (production-framework bundles and
 * GA4-via-Google-Tag-Manager) so that any future detector improvement must
 * consciously update them. These are NOT detector bugs — they are missing
 * signatures — but pinning them makes the audit reproducible.
 *
 * Scoring contract under test (see `detection-scorer.ts`):
 *   base  = best per-signature confidence;
 *   n     = # unique evidence types;
 *   bonus = min(10, max(0, n-1) * 5);
 *   score = min(100, round(base + bonus));
 *   ranking = confidence DESC, then technology.id ASC.
 */

import { describe, it, expect } from 'vitest';
import type { Detection, SiteSnapshot, ResourceType } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';
import { createProductionDetector } from './production-detector.js';

// ─── Snapshot builder (mirrors pipeline.integration.test.ts) ────────────────

interface SnapshotOptions {
  headers?: { name: string; value: string }[];
  metaTags?: { name: string; content: string }[];
  scripts?: { src: string | null; content: string }[];
  links?: { rel: string | null; href: string | null; content: string }[];
  resources?: { url: string; type: ResourceType; content: string }[];
}

function makeSnapshot(parts: SnapshotOptions = {}): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: parts.headers ?? [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example Site',
      description: null,
      metaTags: parts.metaTags ?? [],
      scripts: parts.scripts ?? [],
      links: parts.links ?? [],
    },
    resources: (parts.resources ?? []).map((r) => ({
      url: createUrl(r.url),
      type: r.type,
      size: r.content.length,
      content: r.content,
      httpStatus: createHttpStatus(200),
      contentType: 'text/plain' as string | null,
    })),
  };
}

/** Ordered [technologyId, confidence] for a detection list. */
function ranked(detections: Detection[]): [string, number][] {
  return detections.map((d) => [String(d.technology.id), Number(d.confidence)] as [string, number]);
}

// ─── Audit ───────────────────────────────────────────────────────────────────

describe('Step 64 real-world detection audit', () => {
  const pipeline = createProductionDetector();

  describe('R1 — WordPress blog behind Cloudflare (PHP backend + jQuery)', () => {
    // Realism: Cloudflare terminates TLS (Server: cloudflare), passes through
    // X-Powered-By: PHP, and serves a WordPress 6.4 site that ships jQuery
    // via wp-includes and references wp-content assets. WordPress is observed
    // across FOUR independent evidence modalities (meta_tag, script_url,
    // resource, link) → diversity bonus should push it to 100.
    const snapshot = makeSnapshot({
      headers: [
        { name: 'Server', value: 'cloudflare' },
        { name: 'X-Powered-By', value: 'PHP/8.2' },
        { name: 'content-type', value: 'text/html; charset=utf-8' },
      ],
      metaTags: [{ name: 'generator', content: 'WordPress 6.4.2' }],
      scripts: [
        { src: 'https://example.com/wp-content/themes/twentytwentythree/script.js', content: '' },
        { src: 'https://example.com/wp-includes/js/jquery/jquery.min.js', content: '' },
      ],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://example.com/wp-content/themes/twentytwentythree/style.css',
          content: '<link>',
        },
      ],
      resources: [
        {
          url: 'https://example.com/robots.txt',
          type: 'robots',
          content: 'User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-content/uploads/',
        },
        {
          url: 'https://example.com/style.css',
          type: 'css',
          content: '--wp--preset--color-primary: #000;\n.wp-block-group { }',
        },
      ],
    });

    it('detects the ranked set with exact scores', () => {
      const detections = pipeline.detect(snapshot);
      expect(ranked(detections)).toEqual([
        ['wordpress', 100],
        ['cloudflare', 95],
        ['php', 90],
        ['jquery', 85],
      ]);
    });

    it('explains WordPress with all four evidence modalities', () => {
      const detections = pipeline.detect(snapshot);
      const wp = detections.find((d) => d.technology.id === 'wordpress')!;
      const types = wp.evidence.map((e) => e.type);
      expect(new Set(types)).toEqual(new Set(['meta_tag', 'script_url', 'resource', 'link']));
      // meta_tag + script_url + link + 2 resources (robots + css) = 5 items
      expect(wp.evidence).toHaveLength(5);
    });

    it('is deterministic across repeated runs', () => {
      const a = pipeline.detect(snapshot);
      const b = pipeline.detect(snapshot);
      const c = pipeline.detect(snapshot);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(JSON.stringify(b)).toBe(JSON.stringify(c));
    });
  });

  describe('R2 — Shopify storefront on Cloudflare + Google Fonts + direct GA', () => {
    // Realism: Shopify assets on cdn.shopify.com, Google Fonts stylesheet,
    // and analytics.js loaded directly from google-analytics.com.
    const snapshot = makeSnapshot({
      headers: [{ name: 'Server', value: 'cloudflare' }],
      links: [
        {
          rel: 'stylesheet',
          href: 'https://cdn.shopify.com/s/files/1/theme.css',
          content: '<link>',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css?family=Roboto:wght@400;700',
          content: '<link>',
        },
      ],
      scripts: [{ src: 'https://www.google-analytics.com/analytics.js', content: '' }],
    });

    it('detects the ranked set with exact scores', () => {
      const detections = pipeline.detect(snapshot);
      // cloudflare(95) and shopify(95) tie on score → id-ASC places cloudflare first
      expect(ranked(detections)).toEqual([
        ['cloudflare', 95],
        ['shopify', 95],
        ['google-fonts', 90],
        ['google-analytics', 85],
      ]);
    });

    it('explains each detection with the expected evidence type', () => {
      const detections = pipeline.detect(snapshot);
      const byId = (id: string) => detections.find((d) => d.technology.id === id)!;
      expect(byId('shopify').evidence[0]!.type).toBe('link');
      expect(byId('google-fonts').evidence[0]!.type).toBe('link');
      expect(byId('google-analytics').evidence[0]!.type).toBe('script_url');
    });
  });

  describe('G1 — Known limitation: Angular production build (externalized bundles)', () => {
    // Angular CLI production builds externalize vendor/main CSS+JS and minify
    // inline content to a webpack runtime that contains no `@angular/core` or
    // `platformBrowserDynamic` string literals. There is no Angular URL
    // signature, so this realistic page is NOT detected as Angular.
    // This test pins the current behaviour; a future Angular URL signature
    // must update it.
    const snapshot = makeSnapshot({
      scripts: [
        { src: 'https://example.com/runtime.js', content: '' },
        { src: 'https://example.com/polyfills-es2022.js', content: '' },
        { src: 'https://example.com/main-es2022.js', content: '' },
        {
          src: null,
          content:
            'window.webpackChunkmy_app=window.webpackChunkmy_app||[];__webpack_require__={};/* minified */',
        },
      ],
    });

    it('does NOT detect Angular (no inline marker, no URL signature)', () => {
      const detections = pipeline.detect(snapshot);
      expect(detections.map((d) => d.technology.id)).not.toContain('angular');
    });
  });

  describe('G2 — Known limitation: GA4 via Google Tag Manager only', () => {
    // GA4 is very commonly loaded through GTM
    // (`googletagmanager.com/gtag/js?id=G-...`). The google-analytics
    // signature matches the `google-analytics` substring, which this URL
    // lacks, so GA4-via-GTM is NOT detected. Adding `googletagmanager.com`
    // would false-positive on GTM-only (non-GA) sites. Pinned as a known
    // gap.
    const snapshot = makeSnapshot({
      scripts: [{ src: 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX', content: '' }],
    });

    it('does NOT detect google-analytics from GTM alone', () => {
      const detections = pipeline.detect(snapshot);
      expect(detections.map((d) => d.technology.id)).not.toContain('google-analytics');
      expect(detections).toHaveLength(0);
    });
  });
});
