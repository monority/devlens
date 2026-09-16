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
import type { SiteSnapshot } from '@devlens/core';
import type { ResourceType } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Pipeline helper ─────────────────────────────────────────────────

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

// ─── Snapshot helpers ─────────────────────────────────────────────────

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

// ─── Tests ───────────────────────────────────────────────────────────

describe('End-to-end pipeline integration', () => {
  const pipeline = makePipeline();

  describe('Scenario A — Next.js (multiple evidence sources)', () => {
    it('produces a single Next.js detection with merged evidence and correct score', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'window.__NEXT_DATA__ = {"props":{}}' },
        ],
        links: [{ rel: 'stylesheet', href: '/_next/static/css/styles.css', content: '<link>' }],
      });

      const detections = pipeline.detect(snapshot);

      // Only one Next.js detection (deduplicated)
      const nextjs = detections.filter((d) => d.technology.id === 'nextjs');
      expect(nextjs).toHaveLength(1);

      // Evidence from multiple sources: meta_tag, script_url, script_content
      const evidenceTypes = nextjs[0]!.evidence.map((e) => e.type);
      expect(evidenceTypes).toContain('meta_tag');
      expect(evidenceTypes).toContain('script_url');
      expect(evidenceTypes).toContain('script_content');

      // Score: base=95 (best from ContentScriptDetector), 3 sources → +10 → 100
      expect(nextjs[0]!.confidence).toBe(100);
    });

    it('produces correct category', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: '__NEXT_DATA__' }],
      });

      const detections = pipeline.detect(snapshot);

      const nextjs = detections.find((d) => d.technology.id === 'nextjs');
      expect(nextjs!.technology.category).toBe('framework');
    });

    it('is deterministic (same result on repeated calls)', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__' },
        ],
      });

      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('Scenario B — WordPress (multiple evidence sources)', () => {
    it('produces a single WordPress detection with merged evidence', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [
          { src: 'https://example.com/wp-content/themes/style.js', content: '' },
          { src: 'https://example.com/wp-includes/js/script.js', content: '' },
        ],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
          {
            url: 'https://example.com/style.css',
            type: 'css',
            content: '.wp-block-group { } --wp--preset--color-primary',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const wordpress = detections.filter((d) => d.technology.id === 'wordpress');
      expect(wordpress).toHaveLength(1);

      // Evidence from: meta_tag, script_url, link, resource
      const evidenceTypes = wordpress[0]!.evidence.map((e) => e.type);
      expect(evidenceTypes).toContain('meta_tag');
      expect(evidenceTypes).toContain('script_url');
      expect(evidenceTypes).toContain('link');
      expect(evidenceTypes).toContain('resource');

      // Score: base=95 (from ResourceDetector CSS --wp--preset--), 4 sources → +10 → 100
      expect(wordpress[0]!.confidence).toBe(100);
    });

    it('score is consistent and capped at 100', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [{ src: 'https://example.com/wp-content/main.js', content: '' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const wordpress = detections.find((d) => d.technology.id === 'wordpress');
      expect(wordpress).toBeDefined();
      expect(wordpress!.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Scenario C — React and Next.js are distinct', () => {
    it('detects React and Next.js as separate technologies with correct IDs', () => {
      const snapshot = makeSnapshot({
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'react-dom' },
          { src: null, content: '__NEXT_DATA__' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const nextjs = detections.find((d) => d.technology.id === 'nextjs');
      const react = detections.find((d) => d.technology.id === 'react');

      expect(nextjs).toBeDefined();
      expect(react).toBeDefined();
      expect(nextjs!.technology.id).not.toBe(react!.technology.id);
    });

    it('React evidence comes only from script_content (no false Next.js merge)', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'react-dom' }],
      });

      const detections = pipeline.detect(snapshot);

      const react = detections.find((d) => d.technology.id === 'react');
      expect(react).toBeDefined();
      expect(react!.evidence[0]!.type).toBe('script_content');
    });
  });

  describe('Scenario D — Shopify (hostname + resource)', () => {
    it('detects Shopify from link tag hostname', () => {
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
      expect(shopify!.technology.name).toBe('Shopify');
      expect(shopify!.technology.category).toBe('ecommerce');
      expect(shopify!.evidence[0]!.type).toBe('link');
    });

    it('detects Shopify from alt CDN hostname', () => {
      const snapshot = makeSnapshot({
        links: [
          { rel: 'stylesheet', href: 'https://shopifycdn.com/files/theme.css', content: '<link>' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const shopify = detections.find((d) => d.technology.id === 'shopify');
      expect(shopify).toBeDefined();
      expect(shopify!.confidence).toBe(95); // single source, no bonus
    });

    it('does not match shopifycdn.com.example.com as Shopify', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://shopifycdn.com.example.com/files/theme.css',
            content: '<link>',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const shopify = detections.find((d) => d.technology.id === 'shopify');
      expect(shopify).toBeUndefined();
    });
  });

  describe('Scenario E — No fingerprint', () => {
    it('returns empty detections for a normal page with no known signatures', () => {
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

    it('does not invent detections from generic URLs', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: 'https://example.com/assets/app.js', content: '' }],
      });

      const detections = pipeline.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('Scenario F — Noise', () => {
    it('does not produce false positives from generic CSS/HTML/JS content', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'description', content: 'Contact us' }],
        scripts: [{ src: null, content: 'const vue = "something"; const react = true;' }],
        links: [{ rel: 'stylesheet', href: '/css/app.css', content: '<link>' }],
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

    it('does not detect Vue from a variable named "vue" in script content', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'const vue = ref(0);' }],
      });

      const detections = pipeline.detect(snapshot);

      const vue = detections.find((d) => d.technology.id === 'vue');
      expect(vue).toBeUndefined();
    });
  });

  describe('Evidence preservation through scoring', () => {
    it('evidence is preserved (not mutated) after scoring', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
      });

      const detections = pipeline.detect(snapshot);

      const wordpress = detections.find((d) => d.technology.id === 'wordpress');
      expect(wordpress).toBeDefined();

      // Each evidence item should be a complete record
      for (const evidence of wordpress!.evidence) {
        expect(evidence.type).toBeDefined();
        expect(typeof evidence.type).toBe('string');
      }
    });

    it('evidence order is deterministic', () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
      });

      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });
});
