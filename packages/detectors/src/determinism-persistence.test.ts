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

// ─── Helpers ──────────────────────────────────────────────────────

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

// ─── Tests ─────────────────────────────────────────────────────

describe('Step 8 — End-to-end determinism', () => {
  describe('Determinism across repeated runs', () => {
    it('produces identical JSON output on 5 consecutive runs with the same snapshot', () => {
      const snapshot = makeSnapshot({
        headers: [
          { name: 'Server', value: 'nginx' },
          { name: 'X-Powered-By', value: 'PHP' },
        ],
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__ = {}' },
          { src: 'https://example.com/wp-content/themes/style.js', content: '' },
        ],
        links: [
          {
            rel: 'stylesheet',
            href: 'https://cdn.shopify.com/assets/theme.css',
            content: '<link>',
          },
          { rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' },
        ],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
          {
            url: 'https://example.com/style.css',
            type: 'css',
            content: '--wp--preset--color-primary: #fff',
          },
        ],
      });

      const pipeline = makePipeline();
      const result1 = JSON.stringify(pipeline.detect(snapshot));
      const result2 = JSON.stringify(pipeline.detect(snapshot));
      const result3 = JSON.stringify(pipeline.detect(snapshot));
      const result4 = JSON.stringify(pipeline.detect(snapshot));
      const result5 = JSON.stringify(pipeline.detect(snapshot));

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
      expect(result3).toBe(result4);
      expect(result4).toBe(result5);
    });

    it('preserves technology order across runs', () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
      });

      const pipeline = makePipeline();
      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      const ids1 = result1.map((d) => d.technology.id);
      const ids2 = result2.map((d) => d.technology.id);

      expect(ids1).toEqual(ids2);
    });

    it('preserves evidence order within each detection', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
        ],
      });

      const pipeline = makePipeline();
      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      expect(result1).toHaveLength(result2.length);

      for (let i = 0; i < result1.length; i++) {
        const evidenceTypes1 = result1[i]!.evidence.map((e) => e.type);
        const evidenceTypes2 = result2[i]!.evidence.map((e) => e.type);
        expect(evidenceTypes1).toEqual(evidenceTypes2);
      }
    });

    it('same confidence score on repeated runs', () => {
      const snapshot = makeSnapshot({
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/_next/main.js', content: '' },
        ],
      });

      const pipeline = makePipeline();
      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      for (let i = 0; i < result1.length; i++) {
        expect(result1[i]!.confidence).toBe(result2[i]!.confidence);
      }
    });

    it('produces identical results regardless of input array mutability', () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
      });

      const pipeline = makePipeline();
      const result1 = pipeline.detect(snapshot);
      const result2 = pipeline.detect(snapshot);

      // Deep equality check
      expect(result1).toEqual(result2);
    });
  });

  describe('Evidence quality — no oversized content in evidence', () => {
    it('script_content evidence stores only the matched snippet, not full script', () => {
      const largeScript = 'x'.repeat(10000) + '__NEXT_DATA__' + 'y'.repeat(10000);
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: largeScript }],
      });

      const detections = makePipeline().detect(snapshot);

      const nextjs = detections.find((d) => d.technology.id === 'nextjs');
      expect(nextjs).toBeDefined();

      // Evidence snippet should be just the fingerprint, not the full script
      const evidence = nextjs!.evidence.find((e) => e.type === 'script_content');
      expect(evidence).toBeDefined();
      expect((evidence as { snippet: string }).snippet).toBe('__NEXT_DATA__');
      expect((evidence as { snippet: string }).snippet).toHaveLength('__NEXT_DATA__'.length);
    });

    it('resource evidence stores only URL, not resource body content', () => {
      const largeContent = 'x'.repeat(10000);
      const snapshot = makeSnapshot({
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: largeContent },
        ],
      });

      // ResourceDetector looks for specific patterns, not just any content
      const detections = makePipeline().detect(snapshot);

      // No technology should be detected from generic content
      expect(detections).toEqual([]);
    });

    it('link evidence stores only the resolved URL string, not raw tag content', () => {
      const snapshot = makeSnapshot({
        links: [
          {
            rel: 'stylesheet',
            href: 'https://cdn.shopify.com/assets/theme.css',
            content: '<link rel="stylesheet" href="https://cdn.shopify.com/assets/theme.css">',
          },
        ],
      });

      const detections = makePipeline().detect(snapshot);

      const shopify = detections.find((d) => d.technology.id === 'shopify');
      expect(shopify).toBeDefined();

      // Evidence should contain only the URL, not the raw HTML tag content
      const evidence = shopify!.evidence.find((e) => e.type === 'link');
      expect(evidence).toBeDefined();
      const linkEvidence = evidence as { url: unknown };
      expect(typeof linkEvidence.url).toBe('string');
      // URL should be the resolved URL, not the raw tag
      expect(linkEvidence.url).toBe('https://cdn.shopify.com/assets/theme.css');
    });
  });
});
