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
import { getEvidenceKey } from './evidence-key.js';
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

// ─── Tests ──────────────────────────────────────────────────────────

describe('Step 9 — Integration scenarios', () => {
  const pipeline = makePipeline();

  describe('Scenario A — Next.js (explainable detection)', () => {
    it('produces single Next.js detection with evidence from multiple sources', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: 'window.__NEXT_DATA__ = {"props":{}}' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const nextjs = detections.filter((d) => d.technology.id === 'nextjs');
      expect(nextjs).toHaveLength(1);

      const evidenceTypes = nextjs[0]!.evidence.map((e) => e.type);
      expect(evidenceTypes).toContain('meta_tag');
      expect(evidenceTypes).toContain('script_url');
      expect(evidenceTypes).toContain('script_content');

      // Score: base=95 (ContentScriptDetector), 3 sources → +10 → 100
      expect(nextjs[0]!.confidence).toBe(100);

      // Every evidence item has an explicit type (Invariant B)
      for (const e of nextjs[0]!.evidence) {
        expect(e.type).toBeDefined();
        expect(typeof e.type).toBe('string');
      }
    });

    it('evidence is sorted canonically (type, then content)', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__' },
        ],
      });

      const detections = pipeline.detect(snapshot);
      const nextjs = detections.find((d) => d.technology.id === 'nextjs');

      const keys = nextjs!.evidence.map(getEvidenceKey);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });

    it('deduplicated evidence — no duplicate script_url for same URL', () => {
      const url = 'https://example.com/_next/static/chunks/main.js';
      const snapshot = makeSnapshot({
        scripts: [
          { src: url, content: '' },
          { src: url, content: '' }, // same URL
        ],
      });

      const detections = pipeline.detect(snapshot);
      const nextjs = detections.find((d) => d.technology.id === 'nextjs');

      expect(nextjs).toBeDefined();
      const scriptUrls = nextjs!.evidence.filter((e) => e.type === 'script_url');
      expect(scriptUrls).toHaveLength(1);
    });
  });

  describe('Scenario B — WordPress (explainable detection)', () => {
    it('produces single WordPress detection with evidence from all matching detectors', () => {
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
      const wordpress = detections.filter((d) => d.technology.id === 'wordpress');
      expect(wordpress).toHaveLength(1);

      const evidenceTypes = wordpress[0]!.evidence.map((e) => e.type);
      expect(evidenceTypes).toContain('meta_tag');
      expect(evidenceTypes).toContain('script_url');
      expect(evidenceTypes).toContain('link');
      expect(evidenceTypes).toContain('resource');

      // Score: base=95 (ResourceDetector CSS), 4 sources → +10 → 100
      expect(wordpress[0]!.confidence).toBe(100);

      // No duplicate evidence (each URL appears at most once)
      const keys = wordpress[0]!.evidence.map(getEvidenceKey);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });

    it('all evidence items are sorted canonically', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [{ src: 'https://example.com/wp-content/main.js', content: '' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
        ],
      });

      const detections = pipeline.detect(snapshot);
      const wp = detections.find((d) => d.technology.id === 'wordpress');

      const keys = wp!.evidence.map(getEvidenceKey);
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });
  });

  describe('Scenario C — No fingerprint', () => {
    it('returns empty detections with no artifacts', () => {
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
  });

  describe('Scenario D — Noise (no false positives)', () => {
    it('does not detect Vue from a variable named "vue"', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'const vue = ref(0);' }],
      });

      const detections = pipeline.detect(snapshot);
      const vue = detections.find((d) => d.technology.id === 'vue');
      expect(vue).toBeUndefined();
    });

    it('does not produce false evidence from generic CSS/HTML/JS', () => {
      const snapshot = makeSnapshot({
        scripts: [{ src: null, content: 'const react = "something";' }],
        links: [{ rel: 'stylesheet', href: '/css/app.css', content: '<link>' }],
        resources: [
          {
            url: 'https://example.com/style.css',
            type: 'css',
            content: 'body { margin: 0; } .container { display: flex; }',
          },
        ],
      });

      const detections = pipeline.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Scenario E — Persistence (JSON serialization)', () => {
    it('all evidence types survive JSON round-trip (simulating JSONB)', () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: 'https://example.com/wp-content/themes/style.js', content: '' },
        ],
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

      // Simulate JSONB round-trip (serialize → deserialize)
      const json = JSON.stringify(detections);
      const deserialized = JSON.parse(json) as typeof detections;

      expect(deserialized).toHaveLength(detections.length);

      for (let i = 0; i < detections.length; i++) {
        const original = detections[i]!;
        const parsed = deserialized[i]!;

        expect(parsed.technology.id).toBe(original.technology.id);
        expect(parsed.technology.name).toBe(original.technology.name);
        expect(parsed.technology.category).toBe(original.technology.category);
        expect(parsed.confidence).toBe(Number(original.confidence));
        expect(parsed.evidence).toHaveLength(original.evidence.length);

        // Each evidence item round-trips exactly
        for (let j = 0; j < original.evidence.length; j++) {
          expect(parsed.evidence[j]).toEqual(original.evidence[j]);
          expect(parsed.evidence[j]!.type).toBe(original.evidence[j]!.type);
        }
      }

      // Evidence types are preserved (discriminated union survives JSON)
      for (const d of deserialized) {
        for (const e of d.evidence) {
          expect(e.type).toMatch(
            /^(http_header|meta_tag|script_url|script_content|resource|link|html|javascript_global)$/,
          );
        }
      }
    });

    it('JSON round-trip preserves canonical evidence key ordering', () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      const json = JSON.stringify(detections);
      const deserialized = JSON.parse(json) as typeof detections;

      // Both original and deserialized should have evidence sorted by key
      for (let i = 0; i < detections.length; i++) {
        const originalKeys = detections[i]!.evidence.map(getEvidenceKey);
        const parsedKeys = deserialized[i]!.evidence.map(getEvidenceKey);
        expect(parsedKeys).toEqual(originalKeys);
      }
    });
  });
});
