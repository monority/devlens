import { describe, it, expect } from 'vitest';
import { ScriptUrlDetector } from './script-url-detector.js';
import type { SiteSnapshot, ScriptTag } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(scripts: Array<ScriptTag> = []): SiteSnapshot {
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
      scripts,
      links: [],
    },
    resources: [],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ScriptUrlDetector', () => {
  const detector = new ScriptUrlDetector();

  describe('WordPress URL signatures', () => {
    it('detects WordPress from wp-content URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/wp-content/themes/twentytwentythree/style.css', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.technology.name).toBe('WordPress');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!.type).toBe('script_url');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/wp-content/themes/twentytwentythree/style.css',
      });
    });

    it('detects WordPress from wp-includes URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/wp-includes/js/wp-embed.min.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/wp-includes/js/wp-embed.min.js',
      });
    });
  });

  describe('Next.js URL signature', () => {
    it('detects Next.js from /_next/ URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_next/static/chunks/main-abc123.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[0]!.technology.name).toBe('Next.js');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/_next/static/chunks/main-abc123.js',
      });
    });
  });

  describe('Nuxt.js URL signature', () => {
    it('detects Nuxt.js from /_nuxt/ URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_nuxt/entry-abc123.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nuxtjs');
      expect(detections[0]!.technology.name).toBe('Nuxt.js');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(90);
    });
  });

  describe('Gatsby URL signature', () => {
    it('detects Gatsby from gatsby URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/gatsby-browser-abc123.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('gatsby');
      expect(detections[0]!.technology.name).toBe('Gatsby');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(85);
    });
  });

  describe('jQuery URL signature', () => {
    it('detects jQuery from jquery URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://code.jquery.com/jquery-3.7.1.min.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('jquery');
      expect(detections[0]!.technology.name).toBe('jQuery');
      expect(detections[0]!.technology.category).toBe('library');
      expect(detections[0]!.confidence).toBe(85);
    });
  });

  describe('Bootstrap URL signature', () => {
    it('detects Bootstrap from bootstrap URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/bootstrap.bundle.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('bootstrap');
      expect(detections[0]!.technology.name).toBe('Bootstrap');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(80);
    });
  });

  describe('Lodash URL signature', () => {
    it('detects Lodash from lodash URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('lodash');
      expect(detections[0]!.technology.name).toBe('Lodash');
      expect(detections[0]!.technology.category).toBe('library');
      expect(detections[0]!.confidence).toBe(80);
    });
  });

  describe('case-insensitive matching', () => {
    it('matches WordPress URL with uppercase WP-CONTENT', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/WP-CONTENT/themes/style.css',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('matches Next.js URL with uppercase _NEXT', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_NEXT/static/chunks/main.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
    });
  });

  describe('multiple script URLs', () => {
    it('detects multiple technologies from different script URLs', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
        {
          src: 'https://code.jquery.com/jquery-3.7.1.min.js',
          content: '',
        },
        {
          src: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(3);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[1]!.technology.id).toBe('jquery');
      expect(detections[2]!.technology.id).toBe('lodash');
    });

    it('detects WordPress once when both wp-content and wp-includes appear', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/wp-content/themes/style.css', content: '' },
        {
          src: 'https://example.com/wp-includes/js/script.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      // Evidence uses the first matching script (wp-content) due to ordering
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/wp-content/themes/style.css',
      });
    });
  });

  describe('no-match cases', () => {
    it('returns [] when no script URLs match any signature', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/assets/main.js', content: '' },
        { src: 'https://example.com/assets/vendor.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('returns [] when scripts array is empty', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('returns [] when all scripts are inline (null src)', () => {
      const snapshot = makeSnapshot([
        { src: null, content: 'console.log("hello")' },
        { src: null, content: 'var x = 1;' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('false-positive cases (must NOT trigger)', () => {
    it('does not trigger on generic .js bundle URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/js/bundle.12345.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on /node_modules/react/ URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/node_modules/react/umd/react.production.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });

    it('does not trigger on /node_modules/vue/ URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/node_modules/vue/dist/vue.global.prod.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles a mix of inline and external scripts', () => {
      const snapshot = makeSnapshot([
        { src: null, content: 'var inline = true;' },
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
    });

    it('handles script tag with empty src', () => {
      const snapshot = makeSnapshot([
        { src: '', content: '' },
        { src: 'https://example.com/jquery-3.7.1.min.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('jquery');
    });
  });

  describe('domain contract', () => {
    it('produces ScriptUrlEvidence with correct structure', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections[0]!.evidence).toHaveLength(1);
      expect(detections[0]!.evidence[0]!.type).toBe('script_url');
    });
  });

  // ─── Step 11: New technology signatures ──────────────────────────
  // Each new technology has a positive test (URL contains fingerprint →
  // detected) and a negative test (fingerprint absent → not detected).

  describe('WooCommerce URL signature', () => {
    it('detects WooCommerce from woocommerce script URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/wp-content/plugins/woocommerce/assets/js/frontend/cart.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      // The URL contains both "woocommerce" and "wp-content"
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('woocommerce');
      expect(detections.find((d) => d.technology.id === 'woocommerce')!.confidence).toBe(85);
      expect(detections.find((d) => d.technology.id === 'woocommerce')!.evidence[0]!).toMatchObject(
        {
          type: 'script_url',
        },
      );
    });

    it('does not detect WooCommerce from generic plugin URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/wp-content/plugins/seo/seo.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      // WordPress WILL be detected (wp-content), but WooCommerce must NOT
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).not.toContain('woocommerce');
    });
  });

  describe('Google Analytics URL signature', () => {
    it('detects Google Analytics from google-analytics URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://www.google-analytics.com/analytics.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('google-analytics');
      expect(detections[0]!.technology.name).toBe('Google Analytics');
      expect(detections[0]!.technology.category).toBe('analytics');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!.type).toBe('script_url');
    });

    it('does not trigger on a generic analytics library URL', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://example.com/js/analytics-tracker.min.js',
          content: '',
        },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toEqual([]);
    });
  });

  describe('version extraction', () => {
    it('extracts the jQuery version from the script URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://code.jquery.com/jquery-3.7.1.min.js', content: '' },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('3.7.1');
    });

    it('extracts a two-part jQuery version', () => {
      const snapshot = makeSnapshot([
        { src: 'https://code.jquery.com/jquery-3.4.1.js', content: '' },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('3.4.1');
    });

    it('extracts the Lodash version from an `@`-style CDN URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js', content: '' },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('4.17.21');
    });

    it('extracts the Lodash version from a slash-style URL', () => {
      const snapshot = makeSnapshot([
        { src: 'https://cdn.example.com/lodash/4.17.21/lodash.min.js', content: '' },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('4.17.21');
    });

    it('yields null version when jQuery has no version in the URL', () => {
      const snapshot = makeSnapshot([{ src: 'https://example.com/jquery.min.js', content: '' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.technology.id).toBe('jquery');
      expect(d.version).toBeNull();
    });

    it('does not extract a version for Bootstrap (no version rule)', () => {
      const snapshot = makeSnapshot([
        {
          src: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/bootstrap.bundle.min.js',
          content: '',
        },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });

    it('does not extract a version for Next.js (no version rule)', () => {
      const snapshot = makeSnapshot([
        { src: 'https://example.com/_next/static/chunks/main.js', content: '' },
      ]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });
  });
});
