import { describe, it, expect } from 'vitest';
import { ResourceContentDetector } from './resource-content-detector.js';
import type { SiteSnapshot, Resource, Detection } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(resources: Resource[]): SiteSnapshot {
  return {
    url: createUrl('https://example.com'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com'),
    },
    html: { title: 'Example', description: null, metaTags: [], scripts: [], links: [] },
    resources,
  };
}

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    url: createUrl('https://example.com/'),
    type: 'script',
    size: 0,
    content: '',
    httpStatus: createHttpStatus(200),
    contentType: null,
    ...overrides,
  } as Resource;
}

/** A pretty (non-minified) Angular bundle containing two fingerprints. */
function angularPrettyBundle(): string {
  return [
    "import { Component, NgModule } from '@angular/core';",
    "import { BrowserModule } from '@angular/platform-browser';",
    '',
    '@Component({',
    '  selector: "app-root",',
    '  template: "Hello Angular",',
    '})',
    'export class AppComponent {',
    '  // The Ivy renderer writes __ng_context__ onto host elements at runtime.',
    '  ngAfterViewInit() { /* __ng_context__ populated by the framework */ }',
    '}',
    '',
    '@NgModule({ declarations: [AppComponent], imports: [BrowserModule], bootstrap: [AppComponent] })',
    'export class AppModule {}',
  ].join('\n');
}

/** A minified Angular bundle — import specifiers survive minification as string literals;
 *  property-name accesses like __ng_context__ are not mangled by default. */
function angularMinifiedBundle(): string {
  return `import{n as t,e as r,o as n}from"@angular/core";import{i as a}from"@angular/platform-browser";t(()=>{n.__ng_context__=[1,2,3];const o=t();a(n,o)});`;
}

describe('ResourceContentDetector', () => {
  const detector = new ResourceContentDetector();

  // ─── Angular ───────────────────────────────────────────────

  describe('Angular resource-content detection', () => {
    it('detects Angular from @angular/core in a fetched JS bundle (pretty)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: angularPrettyBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('angular');
      expect(detections[0]!.technology.name).toBe('Angular');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!.type).toBe('resource_content');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/main.js',
        resourceType: 'script',
        match: '@angular/core',
      });
    });

    it('detects Angular from a minified bundle (@angular/core + __ng_context__)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/static/js/main.abcdef.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('angular');
      // Best confidence wins (@angular/core = 95)
      expect(detections[0]!.confidence).toBe(95);
      // Both signatures matched → merged evidence (distinct `match` keys)
      expect(detections[0]!.evidence).toHaveLength(2);
      const matches = detections[0]!.evidence.map((e) => e.match);
      expect(matches).toContain('@angular/core');
      expect(matches).toContain('__ng_context__');
    });

    it('evidence snippet is bounded and contains the match (§10/§11)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: 'x'.repeat(2000) + '@angular/core' + 'y'.repeat(2000),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const [detection] = detector.detect(snapshot);
      const evidence = detection!.evidence[0]!;
      expect(evidence.type).toBe('resource_content');
      expect(evidence.match).toBe('@angular/core');
      expect(evidence.snippet).toContain('@angular/core');
      // Snippet is bounded — never the full bundle.
      expect(evidence.snippet.length).toBeLessThanOrEqual(120);
    });
  });

  // ─── Vue / Svelte / Astro ──────────────────────────────────

  describe('Vue resource-content detection', () => {
    it('detects Vue.js from @vue/runtime-dom in a Vue 3 ESM bundle', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/assets/index-*.js'),
          type: 'script',
          content: `import{n as r}from"@vue/runtime-dom";const t=r({});t.mount("#app");`,
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('vue');
      expect(detections[0]!.confidence).toBe(92);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'resource_content',
        resourceType: 'script',
        match: '@vue/runtime-dom',
      });
    });

    it('is case-insensitive when matching', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.js'),
          type: 'script',
          content: `IMPORT{N AS R}FROM"@VUE/RUNTIME-DOM"`,
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('vue');
    });
  });

  describe('Svelte resource-content detection', () => {
    it('detects Svelte from svelte/internal in a Svelte 4 bundle', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/bundle.js'),
          type: 'script',
          content: `import{t as s,i as r}from"svelte/internal";s(t,r);init();`,
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('svelte');
      expect(detections[0]!.confidence).toBe(90);
    });
  });

  describe('Astro resource-content detection', () => {
    it('detects Astro from __astro in a hydration bundle', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/astro/client/entry.js'),
          type: 'script',
          content: `window.__astro={fetch(){},hydrate(){}};customElements.define("astro-island",class extends HTMLElement{});`,
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('astro');
      expect(detections[0]!.confidence).toBe(92);
      const matches = detections[0]!.evidence.map((e) => e.match);
      expect(matches).toContain('__astro');
    });
  });

  // ─── §7: no naive/generic string hunting ───────────────────

  describe('negative: does not match generic tokens (§7)', () => {
    it('does NOT detect Angular from a bundle that only mentions "angular" as a word', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.js'),
          type: 'script',
          content: 'const framework = "angular"; const version = 16;',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does NOT detect Vue from a bundle that only mentions "vue" as a variable', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.js'),
          type: 'script',
          content: 'const vue = true; const component = { template: "<div/>" };',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does NOT detect Svelte from a bundle that only mentions "svelte"', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.js'),
          type: 'script',
          content: 'import svelte from "svelte";',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does NOT detect Astro from a bundle that only mentions "astro" as a word', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.js'),
          type: 'script',
          content: 'const astro = "build tool";',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does NOT match a script signature against the wrong resource type (css)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/style.css'),
          type: 'css',
          content: '/* @angular/core appears only in CSS comments, not JS bodies */',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does NOT match react-dom / react-runtime (not a Step-71 signature)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/react-bundle.js'),
          type: 'script',
          content: 'import{createRoot}from"react-dom";import{react}from"react";',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });
  });

  // ─── §11: budgets / partial bodies ─────────────────────────

  describe('partial bodies and acquisition status (§11)', () => {
    it('ignores resources with an empty body (failed/skipped/discovered)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/missing.js'),
          type: 'script',
          content: '',
          acquisitionStatus: 'failed' as const,
          failureReason: 'timeout',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('ignores resources with no acquisitionStatus but an empty body', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/missing.js'),
          type: 'script',
          content: '',
        }),
      ]);
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('only analyzes fetched resources (content present)', () => {
      // One skipped (empty) + one fetched (with body) → only the fetched matches.
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/skipped.js'),
          type: 'script',
          content: '',
          acquisitionStatus: 'skipped' as const,
          failureReason: 'beyond budget',
        }),
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.evidence[0]!.url).toBe('https://example.com/main.js');
    });
  });

  // ─── §12: order-independence + §13: determinism ────────────

  describe('determinism and order-independence (§12, §13)', () => {
    it('picks the lexicographically smallest resource URL regardless of order (§12)', () => {
      const b1 = angularMinifiedBundle();
      const rA = makeResource({
        url: createUrl('https://example.com/b.js'),
        type: 'script',
        content: b1,
        acquisitionStatus: 'fetched' as const,
      });
      const rB = makeResource({
        url: createUrl('https://example.com/a.js'),
        type: 'script',
        content: b1,
        acquisitionStatus: 'fetched' as const,
      });

      const forward = detector.detect(makeSnapshot([rA, rB]));
      const reversed = detector.detect(makeSnapshot([rB, rA]));

      expect(forward).toEqual(reversed);
      // The smallest URL (a.js) is chosen deterministically as the evidence source.
      expect(forward[0]!.evidence.every((e) => e.url === 'https://example.com/a.js')).toBe(true);
    });

    it('run 1 === run 2 === run 3 (determinism, §13)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);
      const d1: Detection[] = detector.detect(snapshot);
      const d2: Detection[] = detector.detect(snapshot);
      const d3: Detection[] = detector.detect(snapshot);
      expect(d1).toEqual(d2);
      expect(d2).toEqual(d3);
    });
  });

  // ─── Merge / dedup within a technology ────────────────────

  describe('evidence merge and per-scan deduplication', () => {
    it('deduplicates identical evidence across runs but keeps distinct signals', () => {
      // Single bundle matching both Angular signatures.
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const a = detector.detect(snapshot);
      const b = detector.detect(snapshot);

      // Same detection set every time (no duplicate techs, no duplicate evidence).
      expect(a).toEqual(b);
      expect(a).toHaveLength(1);
      expect(a[0]!.evidence).toHaveLength(2);
      // The two evidence items are distinct (different `match`), so both are kept.
      expect(new Set(a[0]!.evidence.map((e) => e.match)).size).toBe(2);
    });

    it('produces one detection when several Angular bundles match', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/b.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
        makeResource({
          url: createUrl('https://example.com/a.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('angular');
      expect(detections[0]!.confidence).toBe(95);
      // Two distinct signatures (match values) → two evidence items, both from the smallest URL.
      expect(detections[0]!.evidence).toHaveLength(2);
      expect(detections[0]!.evidence.every((e) => e.url === 'https://example.com/a.js')).toBe(true);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────

  describe('edge cases', () => {
    it('returns [] for no resources', () => {
      expect(detector.detect(makeSnapshot([]))).toEqual([]);
    });

    it('never throws on a malformed/empty snapshot', () => {
      expect(() => detector.detect(makeSnapshot([]))).not.toThrow();
    });

    it('never throws when a resource body is huge (bounded snippet)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/big.js'),
          type: 'script',
          content: `/*${'a'.repeat(5_000_000)}*/` + '@angular/core' + '/*padding*/',
          acquisitionStatus: 'fetched' as const,
        }),
      ]);
      const [detection] = detector.detect(snapshot);
      expect(detection!.evidence[0]!.snippet.length).toBeLessThanOrEqual(120);
    });

    it('produces a resource_content evidence type (distinct from resource)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/main.js'),
          type: 'script',
          content: angularMinifiedBundle(),
          acquisitionStatus: 'fetched' as const,
        }),
      ]);
      const [detection] = detector.detect(snapshot);
      expect(detection!.evidence.every((e) => e.type === 'resource_content')).toBe(true);
    });
  });
});
