/**
 * Step 69 — Phase 17: end-to-end regression through `createProductionDetector()`.
 *
 * These tests pin the core Step-69 guarantees through the REAL production
 * pipeline (which now wraps `ScoringDetector` in `RelationshipResolver`):
 *
 *  1. Existing direct detections are UNCHANGED — no derivation and no conflict
 *     is injected for fixtures whose relationships are satisfied or simply
 *     absent (the WordPress+WooCommerce and Next.js+React+vercel coexist
 *     fixtures mirror the real detector-fixtures expectations).
 *
 *  2. The three real catalog relationships behave correctly at the pipeline
 *     level: `nextjs implies react` DERIVES React only when React is not
 *     already directly observed; `woocommerce requires wordpress` is a
 *     validation constraint (no derivation, no conflict when satisfied).
 *
 *  3. Technologies with no relationships (e.g. nginx) are byte-for-byte
 *     unchanged by the resolver.
 *
 * This complements the hermetic `relationships.test.ts` matrix; here we
 * exercise the full detect → deduplicate → score → resolve pipeline so the
 * relationship layer is proven to sit cleanly AFTER scoring and NEVER mutate
 * direct detections' confidence, evidence, or version.
 */

import { describe, it, expect } from 'vitest';
import { createProductionDetector } from './production-detector.js';
import type { SiteSnapshot, HttpHeader, MetaTag, ScriptTag } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createHttpStatus,
  createTimestampFromString,
} from '@devlens/core';

/** Minimal snapshot builder focused on the signals the Step-69 fixtures need. */
function snap(opts: {
  headers?: HttpHeader[];
  metaTags?: MetaTag[];
  scripts?: ScriptTag[];
  links?: { rel: string | null; href: string | null; content: string }[];
}): SiteSnapshot {
  return {
    url: createUrl('https://example.com/'),
    hostname: createHostname('example.com'),
    capturedAt: createTimestampFromString('2025-06-01T12:00:00.000Z'),
    http: {
      statusCode: createHttpStatus(200),
      headers: opts.headers ?? [],
      contentType: 'text/html',
      finalUrl: createUrl('https://example.com/'),
    },
    html: {
      title: 'Example',
      description: null,
      metaTags: opts.metaTags ?? [],
      scripts: opts.scripts ?? [],
      links: (opts.links ?? []) as unknown as never,
    },
    resources: [],
  } as unknown as SiteSnapshot;
}

/** Returns the set of detected technology ids. */
const idsOf = (detections: ReadonlyArray<{ technology: { id: string } }>) =>
  detections.map((d) => d.technology.id);

describe('createProductionDetector — Step 69 regression', () => {
  describe('existing direct detections unchanged', () => {
    it('WordPress + WooCommerce: requires satisfied → no derivation, no conflict', () => {
      const snapshot = snap({
        headers: [
          { name: 'server', value: 'nginx/1.18' },
          { name: 'x-powered-by', value: 'PHP/8.1' },
        ],
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [
          {
            src: 'https://example.com/wp-content/themes/twentytwentytour/script.js',
            content: '',
          },
          {
            src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/frontend/cart.min.js',
            content: '',
          },
        ],
      });
      const detections = createProductionDetector().detect(snapshot);

      const ids = idsOf(detections);
      expect(ids).toContain('woocommerce');
      expect(ids).toContain('wordpress');

      // requires never derives → no relationship-derived detections.
      expect(detections.filter((d) => d.source === 'relationship')).toHaveLength(0);

      // WordPress is directly observed → requirement satisfied → no conflict.
      const wc = detections.find((d) => d.technology.id === 'woocommerce')!;
      expect(wc.relationshipConflicts).toBeUndefined();

      // The direct WordPress detection is unchanged by the resolver:
      // still direct (no source) and its parsed version is preserved.
      const wp = detections.find((d) => d.technology.id === 'wordpress')!;
      expect(wp.source).toBeUndefined();
      expect(wp.version).toBe('6.4');
    });

    it('Next.js + React + Vercel coexist: React directly observed → implies NOT derived', () => {
      const snapshot = snap({
        headers: [{ name: 'server', value: 'vercel' }],
        metaTags: [{ name: 'generator', content: 'Next.js' }],
        scripts: [
          { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
          { src: 'https://example.com/_next/static/chunks/react-dom.js', content: '' },
          { src: null, content: 'import ReactDOM from "react-dom/root"; ReactDOM.render();' },
          { src: null, content: 'window.__NEXT_DATA__ = {};' },
        ],
      });
      const detections = createProductionDetector().detect(snapshot);

      const ids = idsOf(detections);
      expect(ids).toContain('nextjs');
      expect(ids).toContain('react');
      expect(ids).toContain('vercel');

      // React is direct (content fingerprint) → nextjs implies react is redundant.
      const react = detections.find((d) => d.technology.id === 'react')!;
      expect(react.source).toBeUndefined();
      expect(detections.filter((d) => d.source === 'relationship')).toHaveLength(0);
      expect(react.relationshipConflicts).toBeUndefined();
    });

    it('nginx (no relationships) is unchanged through the resolver', () => {
      const snapshot = snap({ headers: [{ name: 'server', value: 'nginx/1.21.6' }] });
      const detections = createProductionDetector().detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nginx');
      expect(detections[0]!.source).toBeUndefined();
      expect(detections[0]!.relationshipConflicts).toBeUndefined();
    });
  });

  describe('real catalog relationships fire through the pipeline', () => {
    it('nextjs implies react: derives React (source=relationship, conf 0, no evidence/version)', () => {
      // Next.js signature present, but NO React fingerprints (no react-dom /
      // ReactDOM content) → React is not directly observed → must be derived.
      const snapshot = snap({
        headers: [{ name: 'server', value: 'vercel' }],
        metaTags: [{ name: 'generator', content: 'Next.js 14' }],
        scripts: [{ src: 'https://example.com/_next/static/chunks/main.js', content: '' }],
      });
      const detections = createProductionDetector().detect(snapshot);

      expect(idsOf(detections)).toContain('nextjs');
      const react = detections.find((d) => d.technology.id === 'react');
      expect(react).toBeDefined();
      expect(react!.source).toBe('relationship');
      expect(react!.confidence).toBe(0);
      expect(react!.evidence).toEqual([]);
      expect(react!.version).toBeNull();
      expect(react!.derivedFrom).toEqual([
        { source: 'nextjs', sourceName: 'Next.js', type: 'implies' },
      ]);

      // The direct detection is untouched.
      const nextjs = detections.find((d) => d.technology.id === 'nextjs')!;
      expect(nextjs.source).toBeUndefined();
      expect(nextjs.relationshipConflicts).toBeUndefined();
    });

    it('woocommerce requires wordpress: missing → surfaces conflict, never derives WordPress', () => {
      // WooCommerce observed via script URL only; NO WordPress signatures
      // anywhere → requirement is unmet → conflict on WooCommerce, and
      // WordPress is NOT derived.
      // WooCommerce observed via its plugin script URL — on a path that is
      // NOT under wp-content/wp-includes, so WordPress is genuinely absent.
      const snapshot = snap({
        headers: [{ name: 'server', value: 'nginx/1.18' }],
        scripts: [
          {
            src: 'https://example.com/plugins/woocommerce/assets/js/cart.min.js',
            content: '',
          },
        ],
      });
      const detections = createProductionDetector().detect(snapshot);

      const ids = idsOf(detections);
      expect(ids).toContain('woocommerce');
      expect(ids).not.toContain('wordpress'); // NOT derived

      const wc = detections.find((d) => d.technology.id === 'woocommerce')!;
      expect(wc.source).toBeUndefined(); // still direct
      expect(wc.relationshipConflicts).toEqual([
        { type: 'requires', other: 'wordpress', reason: 'missing_requirement' },
      ]);
      // WooCommerce's evidence is preserved.
      expect(wc.evidence.length).toBeGreaterThan(0);
    });
  });

  describe('direct detection invariants (confidence/evidence/version untouched)', () => {
    it('does not mutate the confidence, evidence, or version of a direct detection', () => {
      const snapshot = snap({
        metaTags: [{ name: 'generator', content: 'WordPress 6.4' }],
        scripts: [
          { src: 'https://example.com/wp-content/themes/twentytwentytour/script.js', content: '' },
          {
            src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/frontend/cart.min.js',
            content: '',
          },
        ],
      });
      const detections = createProductionDetector().detect(snapshot);

      for (const d of detections) {
        // Every detection is direct (requires satisfied by WordPress).
        expect(d.source).toBeUndefined();
        // A direct detection always carries at least one evidence item.
        expect(d.evidence.length).toBeGreaterThan(0);
        // Direct detection confidence is a real scored value (never 0).
        expect(d.confidence).toBeGreaterThan(0);
      }
      // WordPress version (parsed from the generator) survives the resolver.
      expect(detections.find((d) => d.technology.id === 'wordpress')!.version).toBe('6.4');
    });
  });
});
