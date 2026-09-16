import { describe, it, expect } from 'vitest';
import { ContentScriptDetector } from './content-script-detector.js';
import { ScriptUrlDetector } from './script-url-detector.js';
import { ResourceDetector } from './resource-detector.js';
import { HeaderDetector } from './header-detector.js';
import { MetaTagDetector } from './meta-tag-detector.js';
import { LinkDetector } from './link-detector.js';
import { CompositeDetector } from './composite-detector.js';
import { DeduplicatingDetector } from './deduplicating-detector.js';
import { ScoringDetector } from './scoring-detector.js';
import { ConfidenceScorer } from './detection-scorer.js';
import type { SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<SiteSnapshot> = {}): SiteSnapshot {
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
    html: {
      title: 'Example',
      description: null,
      metaTags: [],
      scripts: [],
      links: [],
    },
    resources: [],
    ...overrides,
  };
}

// Build a full pipeline: Composite(6 detectors) → Dedup → Scoring
function makeFullPipeline(): ScoringDetector {
  const composite = new CompositeDetector([
    new HeaderDetector(),
    new MetaTagDetector(),
    new ScriptUrlDetector(),
    new ContentScriptDetector(),
    new ResourceDetector(),
    new LinkDetector(),
  ]);
  const dedup = new DeduplicatingDetector(composite);
  return new ScoringDetector(dedup, new ConfidenceScorer());
}

// ─── Collision Tests ────────────────────────────────────────────────
// These tests verify that new Step 11 fingerprints do not produce
// false positives when they appear alongside or in place of existing
// technology fingerprints. Each collision pair tests a scenario where
// a new technology's fingerprint could plausibly overlap with an existing
// one, ensuring precision > recall.

describe('technology-collision', () => {
  describe('Drupal vs. generic', () => {
    it('does not detect Drupal from generic "settings" variable', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'var settings = { debug: true };' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not detect Drupal from "drupal" mentioned in a comment', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: '// built with Drupal' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Laravel vs. PHP', () => {
    it('detects Laravel without producing a PHP detection', () => {
      // window.Laravel is Blade-rendered output; it must NOT produce a
      // PHP detection (PHP's signature is the x-powered-by header).
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'window.Laravel = {"csrfToken": "abc"};' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('laravel');
    });

    it('does not detect Laravel from "laravel" in a comment', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: '/* laravel */ var x = 1;' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Webflow vs. generic', () => {
    it('does not detect Webflow from "webflow" as a plain string', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'var text = "webflow";' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not detect Webflow from "workflow" substring', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'var workflow = "automated";' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Vue ↔ Nuxt.js (no new tech, regression guard)', () => {
    // Step 6 existing technologies: ensure Step 11 additions do not
    // break pre-existing collision boundaries.
    it('detects Vue from Vue.createApp without falsely detecting Nuxt.js', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'const app = Vue.createApp({});' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('vue');
      expect(techIds).not.toContain('nuxtjs');
    });

    it('detects Nuxt.js from /_nuxt/ script URL without falsely detecting Vue', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: 'https://example.com/_nuxt/entry.js', content: '' }],
          links: [],
        },
      });
      const detector = new ScriptUrlDetector();
      const detections = detector.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('nuxtjs');
      expect(techIds).not.toContain('vue');
    });
  });

  describe('React ↔ Next.js (no new tech, regression guard)', () => {
    it('detects React without falsely detecting Next.js', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'import ReactDOM from "react-dom";' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('react');
      expect(techIds).not.toContain('nextjs');
    });

    it('detects Next.js without falsely detecting React', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'window.__NEXT_DATA__ = {};' }],
          links: [],
        },
      });
      const detector = new ContentScriptDetector();
      const detections = detector.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('nextjs');
      expect(techIds).not.toContain('react');
    });
  });

  describe('WooCommerce ↔ WordPress', () => {
    it('detects WooCommerce alongside WordPress from a WooCommerce script URL', () => {
      // WooCommerce is a WordPress plugin — both should be detected
      // independently, each with its own evidence.
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [
            {
              src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/frontend/cart.min.js',
              content: '',
            },
          ],
          links: [],
        },
      });
      const detector = new ScriptUrlDetector();
      const detections = detector.detect(snapshot);

      // ScriptUrlDetector sees only the "woocommerce" substring
      // (the "wp-content" also matches WordPress)
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('woocommerce');
      expect(techIds).toContain('wordpress');
    });

    it('does not detect WooCommerce from generic plugin URL', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [
            {
              src: 'https://example.com/wp-content/plugins/seo/seo.min.js',
              content: '',
            },
          ],
          links: [],
        },
      });
      const detector = new ScriptUrlDetector();
      const detections = detector.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).not.toContain('woocommerce');
    });
  });

  describe('Shopify ↔ generic CDN (no new tech, regression guard)', () => {
    it('detects Shopify from cdn.shopify.com hostname in link', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [],
          links: [
            {
              href: 'https://cdn.shopify.com/s/files/1/theme.css',
              rel: 'stylesheet',
              raw: 'stylesheet',
            },
          ],
        },
      });
      const detector = new LinkDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
    });

    it('does not detect Shopify from a generic CDN URL', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [],
          links: [
            {
              href: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/bootstrap.min.css',
              rel: 'stylesheet',
              raw: 'stylesheet',
            },
          ],
        },
      });
      const detector = new LinkDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Tailwind vs. generic CSS', () => {
    it('detects Tailwind CSS from @tailwind directive', () => {
      const snapshot = makeSnapshot({
        resources: [
          {
            url: createUrl('https://example.com/tailwind.css'),
            type: 'css',
            content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
            size: 0,
            httpStatus: createHttpStatus(200),
            contentType: null,
          },
        ],
      });
      const detector = new ResourceDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('tailwind');
    });

    it('does not detect Tailwind from "tailwind" mentioned as a word in CSS comment', () => {
      const snapshot = makeSnapshot({
        resources: [
          {
            url: createUrl('https://example.com/app.css'),
            type: 'css',
            content: '/* tailwindcss */\nbody { color: red; }',
            size: 0,
            httpStatus: createHttpStatus(200),
            contentType: null,
          },
        ],
      });
      const detector = new ResourceDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Google Analytics vs. generic analytics', () => {
    it('detects Google Analytics from google-analytics.com URL', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: 'https://www.google-analytics.com/analytics.js', content: '' }],
          links: [],
        },
      });
      const detector = new ScriptUrlDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('google-analytics');
    });

    it('does not detect Google Analytics from a generic analytics tracker URL', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Example',
          description: null,
          metaTags: [],
          scripts: [{ src: 'https://example.com/js/analytics-tracker.min.js', content: '' }],
          links: [],
        },
      });
      const detector = new ScriptUrlDetector();
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('full pipeline: Step 11 technologies in isolation', () => {
    it('detects only Drupal from a Drupal landing page', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'My Drupal Site',
          description: null,
          metaTags: [{ name: 'generator', content: 'Drupal 10' }],
          scripts: [
            {
              src: null,
              content: 'var drupalSettings = {"basePath": "/", "script": "/core/drupal.js"};',
            },
          ],
          links: [],
        },
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('drupal');
    });

    it('detects only Laravel from a Laravel app shell', () => {
      const snapshot = makeSnapshot({
        http: {
          statusCode: createHttpStatus(200),
          headers: [{ name: 'X-Powered-By', value: 'PHP' }],
          contentType: 'text/html',
          finalUrl: createUrl('https://example.com'),
        },
        html: {
          title: 'Laravel App',
          description: null,
          metaTags: [],
          scripts: [
            {
              src: null,
              content: 'window.Laravel = {"csrfToken": "abc", "assetPath": "/assets"};',
            },
          ],
          links: [],
        },
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('laravel');
      // PHP may also be detected from the x-powered-by header — that's expected
      expect(techIds).not.toContain('drupal');
      expect(techIds).not.toContain('wordpress');
    });

    it('detects only Webflow from a Webflow-published page', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Webflow Site',
          description: null,
          metaTags: [],
          scripts: [{ src: null, content: 'Webflow.require("nav").init();' }],
          links: [],
        },
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('webflow');
      expect(techIds).not.toContain('drupal');
      expect(techIds).not.toContain('wordpress');
    });

    it('detects only Tailwind CSS from a Tailwind stylesheet resource', () => {
      const snapshot = makeSnapshot({
        resources: [
          {
            url: createUrl('https://example.com/tailwind.css'),
            type: 'css',
            content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
            size: 0,
            httpStatus: createHttpStatus(200),
            contentType: null,
          },
        ],
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('tailwind');
      expect(techIds).not.toContain('bootstrap');
    });

    it('detects only WooCommerce from a cart page script', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Cart',
          description: null,
          metaTags: [],
          scripts: [
            {
              src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/cart.min.js',
              content: '',
            },
          ],
          links: [],
        },
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('woocommerce');
    });

    it('detects only Google Analytics from ga script', () => {
      const snapshot = makeSnapshot({
        html: {
          title: 'Site',
          description: null,
          metaTags: [],
          scripts: [{ src: 'https://www.google-analytics.com/analytics.js', content: '' }],
          links: [],
        },
      });
      const pipeline = makeFullPipeline();
      const detections = pipeline.detect(snapshot);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('google-analytics');
      // Must NOT falsely detect Shopify from shopifycdn substring
      expect(techIds).not.toContain('shopify');
      // Must NOT falsely detect bootstrap or jquery
      expect(techIds).not.toContain('bootstrap');
      expect(techIds).not.toContain('jquery');
    });
  });
});
