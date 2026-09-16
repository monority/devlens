import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryScanResultRepository } from './repository.js';
import { snapshots } from './schema.js';
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
import { executeScan } from '@devlens/application';
import type { SiteSnapshot, Scan, ScanTarget, ResourceType } from '@devlens/core';
import {
  createScan,
  createScanId,
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
  startScan,
  completeScan,
  createTimestamp,
} from '@devlens/core';
import type { Crawler } from '@devlens/crawler';

// ─── Helpers ──────────────────────────────────────────────────────

function makePipeline() {
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

function makeCompletedScan(): Scan {
  const pending = createScan(
    createScanId('scan_roundtrip'),
    makeTarget(),
    createTimestamp(new Date('2025-06-01T11:00:00.000Z')),
  );
  const running = startScan(pending, createTimestamp(new Date('2025-06-01T11:01:00.000Z')));
  return completeScan(running, createTimestamp(new Date('2025-06-01T11:02:00.000Z')));
}

// ─── Tests ─────────────────────────────────────────────────────

describe('Step 8 — Persistence round-trip', () => {
  let repo: InMemoryScanResultRepository;

  beforeEach(() => {
    repo = new InMemoryScanResultRepository();
  });

  describe('ScanResult → save → get → comparison', () => {
    it('preserves technology id, name, category, confidence, and evidence', async () => {
      const pipeline = makePipeline();
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        ],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
        ],
      });

      const detections = pipeline.detect(snapshot);
      const scan = makeCompletedScan();

      await repo.save({ scan, snapshot, detections });

      // Verify scan persisted
      const storedScan = repo.getScan(scan.id);
      expect(storedScan).toBe(scan);
      expect(storedScan!.status.type).toBe('completed');

      // Verify snapshot persisted
      const storedSnapshot = repo.getSnapshot(scan.id);
      expect(storedSnapshot).toBeDefined();
      expect(storedSnapshot!.url).toBe(snapshot.url);

      // Verify detections persisted and match exactly
      const storedDetections = repo.getDetections(scan.id);
      expect(storedDetections).toBeDefined();
      expect(storedDetections).toHaveLength(detections.length);

      for (let i = 0; i < detections.length; i++) {
        const original = detections[i]!;
        const stored = storedDetections![i]!;

        expect(stored.technology.id).toBe(original.technology.id);
        expect(stored.technology.name).toBe(original.technology.name);
        expect(stored.technology.category).toBe(original.technology.category);
        expect(stored.confidence).toBe(original.confidence);
        expect(stored.evidence).toHaveLength(original.evidence.length);

        // Evidence order preserved
        for (let j = 0; j < original.evidence.length; j++) {
          expect(stored.evidence[j]).toEqual(original.evidence[j]);
        }
      }
    });

    it('round-trips correctly via executeScan (full application layer)', async () => {
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
      });

      const crawler: Crawler = { crawl: async () => snapshot };
      const detector = makePipeline();

      const result = await executeScan(
        createScan(
          createScanId('scan_exec'),
          makeTarget(),
          createTimestamp(new Date('2025-06-01T11:00:00.000Z')),
        ),
        crawler,
        detector,
        repo,
        new Date('2025-06-01T12:00:00.000Z'),
      );

      // Verify persistence
      const storedScan = repo.getScan(result.scan.id);
      expect(storedScan).toBeDefined();
      expect(storedScan!.status.type).toBe('completed');

      const storedSnapshot = repo.getSnapshot(result.scan.id);
      expect(storedSnapshot).toBeDefined();

      const storedDetections = repo.getDetections(result.scan.id);
      expect(storedDetections).toBeDefined();
      expect(storedDetections).toHaveLength(result.detections.length);

      for (let i = 0; i < result.detections.length; i++) {
        const original = result.detections[i]!;
        const stored = storedDetections![i]!;
        expect(stored.technology.id).toBe(original.technology.id);
        expect(stored.technology.name).toBe(original.technology.name);
        expect(stored.technology.category).toBe(original.technology.category);
        expect(stored.confidence).toBe(original.confidence);
      }
    });
  });

  describe('JSONB serialization semantics (simulated)', () => {
    it('JSON round-trip preserves all detection fields', () => {
      const pipeline = makePipeline();
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
        resources: [
          { url: 'https://example.com/robots.txt', type: 'robots', content: 'Disallow: /wp-admin' },
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

        for (let j = 0; j < original.evidence.length; j++) {
          expect(parsed.evidence[j]).toEqual(original.evidence[j]);
        }
      }
    });

    it('JSON round-trip preserves evidence types (discriminated union)', () => {
      const pipeline = makePipeline();
      const snapshot = makeSnapshot({
        headers: [{ name: 'Server', value: 'nginx' }],
        metaTags: [{ name: 'generator', content: 'WordPress' }],
        scripts: [
          { src: null, content: '__NEXT_DATA__' },
          { src: 'https://example.com/wp-content/main.js', content: '' },
        ],
        links: [{ rel: 'stylesheet', href: '/wp-content/style.css', content: '<link>' }],
      });

      const detections = pipeline.detect(snapshot);

      const json = JSON.stringify(detections);
      const deserialized = JSON.parse(json) as Array<{ evidence: Array<{ type: string }> }>;

      for (const detection of deserialized) {
        for (const evidence of detection.evidence) {
          expect(typeof evidence.type).toBe('string');
          expect(evidence.type).toMatch(
            /^(http_header|meta_tag|script_url|script_content|resource|link|html|javascript_global)$/,
          );
        }
      }
    });
  });

  describe('Schema verification', () => {
    it('snapshots table defines a detections jsonb column', () => {
      expect(snapshots.detections).toBeDefined();
    });
  });
});
