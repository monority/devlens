/**
 * Step 10 — Confidence integration tests.
 *
 * Tests the full pipeline (6 detectors → DeduplicatingDetector →
 * ScoringDetector) to verify that confidence scoring and ranking
 * behave correctly end-to-end.
 *
 * Scenarios:
 *  A — Next.js: specific signals dominate generic ones.
 *  B — WordPress: multiple evidence converge correctly.
 *  C — Shopify: ranking and stability.
 *  D — React vs Next.js: specific Next.js signal is not drowned by React.
 *  E — Noise: weak signals don't produce high scores.
 *  F — No fingerprint: no artificial detections.
 */

import { describe, it, expect } from 'vitest';
import {
  CompositeDetector,
  HeaderDetector,
  MetaTagDetector,
  ScriptUrlDetector,
  ContentScriptDetector,
  ResourceDetector,
  LinkDetector,
  DeduplicatingDetector,
  ScoringDetector,
  ConfidenceScorer,
} from './index.js';
import type { Detector } from './detector.js';
import type { SiteSnapshot, ResourceType } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Pipeline ──────────────────────────────────────────────────────

function makePipeline(): Detector {
  return new ScoringDetector(
    new DeduplicatingDetector(
      new CompositeDetector([
        new HeaderDetector(),
        new MetaTagDetector(),
        new ScriptUrlDetector(),
        new ContentScriptDetector(),
        new ResourceDetector(),
        new LinkDetector(),
      ]),
    ),
    new ConfidenceScorer(),
  );
}

// ─── Snapshot helpers ──────────────────────────────────────────────

interface SnapshotOptions {
  headers?: { name: string; value: string }[];
  metaTags?: { name: string; content: string }[];
  scripts?: { src: string | null; content: string }[];
  links?: { rel: string | null; href: string | null; content: string }[];
  resources?: { url: string; type: string; content: string }[];
}

function makeSnapshot(options: SnapshotOptions = {}): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: options.headers ?? [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: options.metaTags ?? [],
      scripts: options.scripts ?? [],
      links: options.links ?? [],
    },
    resources: (options.resources ?? []).map((r) => ({
      url: createUrl(r.url),
      type: r.type as ResourceType,
      size: r.content.length,
      content: r.content,
      httpStatus: createHttpStatus(200),
      contentType: 'text/plain',
    })),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Step 10 — Confidence integration', () => {
  const pipeline = makePipeline();

  describe('Next.js — specific signals dominate generic ones', () => {
    it('produces Next.js with score 100 (base 95 + 3 sources bonus)', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'window.__NEXT_DATA__ = {"props":{}}' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const nextjs = detections.find((d) => d.technology.id === 'nextjs');
      expect(nextjs).toBeDefined();
      expect(nextjs!.confidence).toBe(100);

      // Evidence from 3 independent source types
      const types = nextjs!.evidence.map((e) => e.type);
      expect(types).toContain('script_content'); // __NEXT_DATA__
      expect(types).toContain('script_url'); // _next/
      expect(types).toContain('meta_tag'); // generator
    });

    it('React is NOT detected from a pure Next.js page (no false React)', () => {
      const snapshot = makeSnapshot({
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'window.__NEXT_DATA__ = {}' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const react = detections.find((d) => d.technology.id === 'react');
      expect(react).toBeUndefined();
    });
  });

  describe('WordPress — multiple evidence converge correctly', () => {
    it('produces WordPress with score 100 (base 95 + 4 sources bonus)', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [{ src: 'https://example.com/wp-content/themes/style.js', content: '' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
          {
            url: 'https://example.com/style.css',
            type: 'css',
            content: '--wp--preset--color-primary: #fff',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const wordpress = detections.find((d) => d.technology.id === 'wordpress');
      expect(wordpress).toBeDefined();
      expect(wordpress!.confidence).toBe(100);

      // Evidence from 4 independent source types
      const types = wordpress!.evidence.map((e) => e.type);
      expect(types).toContain('meta_tag');
      expect(types).toContain('script_url');
      expect(types).toContain('link');
      expect(types).toContain('resource');
    });

    it('WordPress evidence converges: higher confidence than React from same page', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [
          { src: null, content: 'react-dom' },
          { src: 'https://example.com/wp-content/main.js', content: '' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const wp = detections.find((d) => d.technology.id === 'wordpress');
      const react = detections.find((d) => d.technology.id === 'react');

      expect(wp).toBeDefined();
      expect(react).toBeDefined();
      // WordPress has 2 sources (script_content + script_url) → base + bonus
      // React has 1 source (script_content only) → base only
      expect(wp!.confidence).toBeGreaterThan(react!.confidence);
    });
  });

  describe('Shopify — ranking and stability', () => {
    it('detects Shopify from CDN hostname with score 95 (single source)', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://cdn.shopify.com/assets/theme.css',
            content: '<link>',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const shopify = detections.find((d) => d.technology.id === 'shopify');
      expect(shopify).toBeDefined();
      expect(shopify!.confidence).toBe(95);
    });

    it('Shopify ranking is stable across repeated runs', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://cdn.shopify.com/assets/theme.css',
            content: '<link>',
          },
          { rel: 'stylesheet', href: 'https://shopifycdn.com/files/theme.css', content: '<link>' },
        ],
      });

      const result1 = JSON.stringify(pipeline.detect(snapshot));
      const result2 = JSON.stringify(pipeline.detect(snapshot));

      expect(result1).toBe(result2);
    });

    it('Shopify does not match subdomain tricks', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://shopifycdn.com.evil.com/files/theme.css',
            content: '<link>',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const shopify = detections.find((d) => d.technology.id === 'shopify');
      expect(shopify).toBeUndefined();
    });
  });

  describe('React vs Next.js — specific signal dominates', () => {
    it('Next.js ranks above React when both are detected', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: null, content: 'react-dom' },
          { src: null, content: 'window.__NEXT_DATA__ = {}' },
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const nextjs = detections.find((d) => d.technology.id === 'nextjs');
      const react = detections.find((d) => d.technology.id === 'react');

      expect(nextjs).toBeDefined();
      expect(react).toBeDefined();
      expect(nextjs!.confidence).toBeGreaterThan(react!.confidence);

      // Check ranking order: Next.js before React
      const ids = detections.map((d) => d.technology.id);
      expect(ids.indexOf('nextjs')).toBeLessThan(ids.indexOf('react'));
    });

    it('a bare React signal (no Next.js fingerprint) does not produce a Next.js detection', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'ReactDOM.render' }],
      });

      const detections = pipeline.detect(snapshot);

      const react = detections.find((d) => d.technology.id === 'react');
      const nextjs = detections.find((d) => d.technology.id === 'nextjs');

      expect(react).toBeDefined();
      expect(nextjs).toBeUndefined();
    });
  });

  describe('Noise — weak/generic signals do not inflate scores', () => {
    it('generic variable names do not trigger framework detections', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'const vue = "something"; const react = true;' }],
      });

      const detections = pipeline.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('generic CSS does not trigger technology detections', () => {
      const snapshot = makeSnapshot({
        resources: [
          {
            url: 'https://example.com/style.css',
            type: 'css',
            content: 'body { margin: 0; padding: 0; } .container { display: flex; }',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('Google Fonts CDN does not create a high-score false positive', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css?family=Roboto',
            content: '<link>',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const googleFonts = detections.find((d) => d.technology.id === 'google-fonts');
      expect(googleFonts).toBeDefined();
      // Single source → no bonus → 90, not inflated
      expect(googleFonts!.confidence).toBe(90);
    });
  });

  describe('No fingerprint — no artificial detections', () => {
    it('normal page with no known signatures returns empty', () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'unknown-server/1.0' }],
        metaTags: [{ name: 'description', content: 'A normal website' }],
        scripts: [
          { src: '/assets/bundle.js', content: '' },
          { src: null, content: 'console.log("hello")' },
        ],
        links: [{ rel: 'stylesheet', href: '/styles/main.css', content: '<link>' }],
      });

      const detections = pipeline.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('generic script URLs do not trigger detections', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: 'https://example.com/assets/app.js', content: '' }],
      });

      const detections = pipeline.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('No confidence threshold (all detections returned)', () => {
    it('returns detections even at the lowest signature confidence (80)', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: 'https://example.com/bootstrap/dist/css/bootstrap.css', content: '' }],
      });

      const detections = pipeline.detect(snapshot);

      const bootstrap = detections.find((d) => d.technology.id === 'bootstrap');
      expect(bootstrap).toBeDefined();
      // base 80, 1 source → no bonus → 80
      expect(bootstrap!.confidence).toBe(80);
    });
  });
});
