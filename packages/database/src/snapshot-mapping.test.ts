/**
 * Always-on (no database required) regression tests for the PostgreSQL
 * persistence mappers: `snapshotToRow` and `rowToSnapshot`.
 *
 * Step 63 — Phase 4 ("Persistence round-trip"): the postgres repository
 * previously dropped `SiteSnapshot.html.links` on write (no `html_links`
 * column) and hard-coded `links: []` on read-back. These tests pin the
 * invariant that every field of a `SiteSnapshot` round-trips faithfully
 * through the row mappers — including `links`, which was the defect.
 *
 * These tests exercise the pure, deterministic mapper functions directly
 * (no Drizzle / postgres / I/O), so they run in the default vitest
 * configuration alongside the rest of the suite. The complementary
 * database-backed round-trip is covered in `postgres-repository.test.ts`
 * (which requires DATABASE_URL and is skipped without it).
 */

import { describe, it, expect } from 'vitest';
import {
  createUrl,
  createHostname,
  createHttpStatus,
  createTimestampFromString,
  createTechnologyVersion,
} from '@devlens/core';
import { snapshotToRow, rowToSnapshot } from './postgres-repository.js';
import type { Detection, LinkTag, MetaTag, Resource, ScriptTag, SiteSnapshot } from '@devlens/core';

function makeSnapshot(): SiteSnapshot {
  return {
    url: createUrl('https://example.com/'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [
        { name: 'content-type', value: 'text/html; charset=utf-8' },
        { name: 'server', value: 'nginx' },
      ],
      contentType: 'text/html; charset=utf-8',
      finalUrl: createUrl('https://example.com/'),
    },
    html: {
      title: 'Example Domain',
      description: 'An example page.',
      metaTags: [
        { name: 'description', content: 'An example page.' },
        { name: 'generator', content: 'DevLens' },
      ] as MetaTag[],
      scripts: [
        { src: 'https://cdn.example.com/app.js', content: '' },
        { src: null, content: 'window.foo = 1;' },
      ] as ScriptTag[],
      links: [
        { rel: 'stylesheet', href: 'https://cdn.example.com/style.css', content: '<link>' },
        { rel: null, href: '/other', content: '<link rel=alternate>' },
        { rel: 'icon', href: null, content: '<link rel=icon>' },
      ] as LinkTag[],
    },
    resources: [
      {
        url: createUrl('https://example.com/style.css'),
        type: 'stylesheet',
        size: 1234,
        content: 'body { color: red; }',
        httpStatus: createHttpStatus(200),
        contentType: 'text/css',
      },
    ] as Resource[],
  };
}

function makeDetections(): Detection[] {
  return [
    {
      technology: { id: 'nginx' as never, name: 'nginx', category: 'server' as never },
      confidence: 80 as never,
      evidence: [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }],
    },
  ];
}

describe('PostgresScanResultRepository — snapshot mapper round-trip (no DB)', () => {
  it('persists and reconstructs html.links (the Step 63 Phase 4 defect)', () => {
    const snapshot = makeSnapshot();
    const links = snapshot.html.links;

    const row = snapshotToRow('scan_links_roundtrip' as never, snapshot, []);

    // Write-side mapper MUST carry links into the row.
    expect(row.htmlLinks).toEqual(links);

    const { snapshot: reconstructed } = rowToSnapshot(row);
    // Read-side mapper MUST reconstruct the exact links (not an empty array).
    expect(reconstructed).not.toBeNull();
    expect(reconstructed!.html.links).toEqual(links);
  });

  it('round-trips the entire snapshot and detections losslessly', () => {
    const snapshot = makeSnapshot();
    const detections = makeDetections();

    const row = snapshotToRow('scan_full_roundtrip' as never, snapshot, detections);
    const { snapshot: reconstructed, detections: reconstructedDetections } = rowToSnapshot(row);

    expect(reconstructed).toEqual(snapshot);
    expect(reconstructedDetections).toEqual(detections);
  });

  it('reconstructs undefined snapshot row as null + empty detections', () => {
    const { snapshot, detections } = rowToSnapshot(undefined);

    expect(snapshot).toBeNull();
    expect(detections).toEqual([]);
  });

  describe('detection version round-trip (no DB required)', () => {
    it('round-trips a versioned detection through snapshotToRow → rowToSnapshot', () => {
      const versionedDetection = {
        technology: { id: 'nginx' as never, name: 'nginx', category: 'server' as never },
        confidence: 95 as never,
        evidence: [{ type: 'http_header' as const, name: 'Server', value: 'nginx/1.21.6' }],
        version: createTechnologyVersion('1.21.6'),
      };

      const row = snapshotToRow('scan_version_roundtrip' as never, makeSnapshot(), [
        versionedDetection,
      ]);
      const { detections: reconstructed } = rowToSnapshot(row);

      expect(reconstructed).toHaveLength(1);
      expect(reconstructed[0]!.version).toBe('1.21.6');
    });

    it('reconstructs legacy rows that lack a version field (forward compatible)', () => {
      // `makeDetections()` returns detections WITHOUT a `version` key —
      // this simulates rows persisted by the pre-Step-67 repository.
      const row = snapshotToRow('scan_legacy_version' as never, makeSnapshot(), makeDetections());
      const { detections: reconstructed } = rowToSnapshot(row);

      expect(reconstructed).toHaveLength(1);
      // No crash, no fabricated version — the legacy field is simply absent.
      expect(reconstructed[0]!.version).toBeUndefined();
    });
  });

  // ─── Step 69 — relationship fields survive the jsonb round-trip ───────
  // `snapshots.detections` is stored as `jsonb` and round-trips the entire
  // `Detection[]` object; the new optional Step-69 fields (source,
  // derivedFrom, relationshipConflicts) must therefore persist transparently
  // with no schema migration and no row-mapper changes.
  describe('Step 69 — relationship detection round-trip (no DB required)', () => {
    it('round-trips a relationship-derived detection', () => {
      const derived: Detection = {
        technology: { id: 'react' as never, name: 'React', category: 'framework' as never },
        confidence: 0 as never,
        evidence: [],
        version: null,
        source: 'relationship',
        derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
      };

      const row = snapshotToRow('scan_derived' as never, makeSnapshot(), [derived]);
      const { detections: reconstructed } = rowToSnapshot(row);

      expect(reconstructed).toEqual([derived]);
      expect(reconstructed[0]!.source).toBe('relationship');
      expect(reconstructed[0]!.derivedFrom).toEqual([
        { source: 'nextjs', sourceName: 'Next.js', type: 'implies' },
      ]);
    });

    it('round-trips a direct detection carrying a relationship conflict', () => {
      const conflicted: Detection = {
        technology: {
          id: 'woocommerce' as never,
          name: 'WooCommerce',
          category: 'ecommerce' as never,
        },
        confidence: 85 as never,
        evidence: [{ type: 'http_header' as const, name: 'Server', value: 'nginx' }],
        version: null,
        relationshipConflicts: [
          { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
        ],
      };

      const row = snapshotToRow('scan_conflict' as never, makeSnapshot(), [conflicted]);
      const { detections: reconstructed } = rowToSnapshot(row);

      expect(reconstructed).toEqual([conflicted]);
      expect(reconstructed[0]!.relationshipConflicts).toEqual([
        { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
      ]);
    });

    it('round-trips a mixed set (direct + derived + conflicted) losslessly', () => {
      const direct: Detection = {
        technology: { id: 'nextjs' as never, name: 'Next.js', category: 'framework' as never },
        confidence: 95 as never,
        evidence: [{ type: 'meta_tag' as const, name: 'generator', content: 'Next.js' }],
        version: null,
      };
      const derived: Detection = {
        technology: { id: 'react' as never, name: 'React', category: 'framework' as never },
        confidence: 0 as never,
        evidence: [],
        version: null,
        source: 'relationship',
        derivedFrom: [{ source: 'nextjs', sourceName: 'Next.js', type: 'implies' }],
      };

      const row = snapshotToRow('scan_mixed' as never, makeSnapshot(), [direct, derived]);
      const { detections: reconstructed } = rowToSnapshot(row);

      expect(reconstructed).toEqual([direct, derived]);
    });
  });
});
