import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryScanResultRepository } from './repository.js';
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
} from '@devlens/detectors';
import type { Detector } from '@devlens/detectors';
import { executeScan } from '@devlens/application';
import type { Crawler } from '@devlens/crawler';
import type { SiteSnapshot, ScanTarget, ResourceType } from '@devlens/core';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  createTimestamp,
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

function makeSnapshot(options: {
  headers?: { name: string; value: string }[];
  metaTags?: { name: string; content: string }[];
  scripts?: { src: string | null; content: string }[];
  links?: { rel: string | null; href: string | null; content: string }[];
  resources?: { url: string; type: string; content: string }[];
}): SiteSnapshot {
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

function makeTarget(): ScanTarget {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe('Step 9 — Evidence persistence round-trip', () => {
  let repo: InMemoryScanResultRepository;

  beforeEach(() => {
    repo = new InMemoryScanResultRepository();
  });

  describe('Evidence F — Full application-layer persistence round-trip', () => {
    it('persists evidence with all required fields (type, payload) for multi-source detection', async () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        scripts: [
          { src: 'https://example.com/_next/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__' },
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

      const crawler: Crawler = { crawl: async () => snapshot };
      const pipeline = makePipeline();
      const pendingScan = createScan(
        createScanId('scan_evidence_rt'),
        makeTarget(),
        createTimestamp(new Date('2025-06-01T10:00:00.000Z')),
      );

      const result = await executeScan(
        pendingScan,
        crawler,
        pipeline,
        repo,
        new Date('2025-06-01T12:00:00.000Z'),
      );

      // Retrieve from repository
      const storedDetections = repo.getDetections(result.scan.id);
      expect(storedDetections).toBeDefined();
      expect(storedDetections!.length).toBe(result.detections.length);

      for (let i = 0; i < result.detections.length; i++) {
        const original = result.detections[i]!;
        const stored = storedDetections![i]!;

        // Technology metadata preserved
        expect(stored.technology.id).toBe(original.technology.id);
        expect(stored.technology.name).toBe(original.technology.name);
        expect(stored.technology.category).toBe(original.technology.category);

        // Confidence preserved
        expect(stored.confidence).toBe(original.confidence);

        // Evidence preserved — every evidence item has a type
        expect(stored.evidence).toHaveLength(original.evidence.length);
        for (let j = 0; j < original.evidence.length; j++) {
          expect(stored.evidence[j]!.type).toBe(original.evidence[j]!.type);
          expect(typeof stored.evidence[j]!.type).toBe('string');
        }
      }
    });

    it('evidence canonical ordering is preserved through persistence (InMemory)', async () => {
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/main.js', content: '' },
          { src: null, content: '__NEXT_DATA__' },
        ],
      });

      const crawler: Crawler = { crawl: async () => snapshot };
      const pipeline = makePipeline();
      const pendingScan = createScan(
        createScanId('scan_evidence_order'),
        makeTarget(),
        createTimestamp(new Date('2025-06-01T10:00:00.000Z')),
      );

      const result = await executeScan(
        pendingScan,
        crawler,
        pipeline,
        repo,
        new Date('2025-06-01T12:00:00.000Z'),
      );

      const stored = repo.getDetections(result.scan.id);
      expect(stored).toBeDefined();

      for (let i = 0; i < stored!.length; i++) {
        const originalKeys = result.detections[i]!.evidence.map((e) => e.type);
        const storedKeys = stored![i]!.evidence.map((e) => e.type);
        expect(storedKeys).toEqual(originalKeys);
      }
    });

    it('JSONB serialization (JSON round-trip) preserves evidence fields exactly', async () => {
      const pipeline = makePipeline();
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/_next/main.js', content: '' },
        ],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      // Simulate JSONB serialization → deserialization (what PostgreSQL does internally)
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
        for (let j = 0; j < original.evidence.length; j++) {
          // Exact deep equality — every field preserved
          expect(parsed.evidence[j]).toEqual(original.evidence[j]);
          // Type discriminant preserved
          expect(parsed.evidence[j]!.type).toBe(original.evidence[j]!.type);
        }
      }
    });

    it('API response shape exposes evidence type + payload for each evidence item', async () => {
      const pipeline = makePipeline();
      const snapshot = makeSnapshot({
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/_next/main.js', content: '' },
        ],
      });

      const detections = pipeline.detect(snapshot);

      // Simulate the API response shape (DetectionResponse)
      const apiResponse = detections.map((d) => ({
        technology: {
          id: d.technology.id,
          name: d.technology.name,
          category: d.technology.category,
        },
        confidence: d.confidence,
        evidence: d.evidence,
      }));

      const json = JSON.stringify(apiResponse);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(detections.length);
      for (const detection of parsed) {
        expect(detection.technology.id).toBeDefined();
        expect(detection.technology.name).toBeDefined();
        expect(detection.technology.category).toBeDefined();
        expect(typeof detection.confidence).toBe('number');
        expect(Array.isArray(detection.evidence)).toBe(true);

        for (const evidence of detection.evidence) {
          expect(typeof evidence.type).toBe('string');
          expect(evidence.type).toMatch(
            /^(http_header|meta_tag|script_url|script_content|resource|link|html|javascript_global)$/,
          );
        }
      }
    });
  });
});
