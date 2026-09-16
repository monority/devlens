import { describe, it, expect } from 'vitest';
import { LinkDetector } from './link-detector.js';
import type { SiteSnapshot, LinkTag } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(links: LinkTag[]): SiteSnapshot {
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
      links,
    },
    resources: [],
  };
}

function makeLinkTag(href: string | null, rel: string | null = 'stylesheet'): LinkTag {
  const attrParts: string[] = [];
  if (rel !== null) attrParts.push(`rel="${rel}"`);
  if (href !== null) attrParts.push(`href="${href}"`);
  return {
    rel,
    href,
    content: `<link ${attrParts.join(' ')}>`,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('LinkDetector', () => {
  const detector = new LinkDetector();

  describe('WordPress detection (path-segment signatures)', () => {
    it('detects WordPress from /wp-content/ path segment', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/themes/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.technology.name).toBe('WordPress');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!.type).toBe('link');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'link',
      });
    });

    it('detects WordPress from /wp-includes/ path segment', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp-includes/js/file.js')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('detects WordPress from /wp-json/ path segment', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp-json/wp/v2/posts')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('detects WordPress from relative wp-content URL resolved against page URL', () => {
      const snapshot = makeSnapshot([makeLinkTag('/wp-content/themes/style.css')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        type: 'link',
      });
    });

    it('detects WordPress from wp-content as first path segment', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp-content/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('detects WordPress from wp-content as middle path segment', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/themes/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });
  });

  describe('Shopify detection (hostname signatures)', () => {
    it('detects Shopify from cdn.shopify.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://cdn.shopify.com/s/files/1.js')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
      expect(detections[0]!.technology.name).toBe('Shopify');
      expect(detections[0]!.technology.category).toBe('ecommerce');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!.type).toBe('link');
    });

    it('detects Shopify from shopifycdn.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://shopifycdn.com/files/theme.css')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
      expect(detections[0]!.confidence).toBe(95);
    });

    it('detects Shopify from protocol-relative //cdn.shopify.com URL', () => {
      const snapshot = makeSnapshot([makeLinkTag('//cdn.shopify.com/s/files/1.js')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
    });
  });

  describe('Google Fonts detection (hostname signature)', () => {
    it('detects Google Fonts from fonts.googleapis.com', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://fonts.googleapis.com/css?family=Roboto'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('google-fonts');
      expect(detections[0]!.technology.name).toBe('Google Fonts');
      expect(detections[0]!.technology.category).toBe('fonts');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!.type).toBe('link');
    });
  });

  describe('false positives (should NOT match)', () => {
    it('does NOT detect WordPress from /my-wp-content/', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/my-wp-content/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from /wp-content-like/', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp-content-like/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from /wp/', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from /wpblock- (missing hyphen segment)', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wpblock-gallery/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Shopify from shopify (no .com, no match)', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://shopify/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Shopify from shopifycdn (missing .com)', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://shopifycdn/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Shopify from shopifycdn.com.example.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://shopifycdn.com.example.com/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Shopify from myshopify.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://myshopify.com/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Shopify from cdn.shopify.com.example.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://cdn.shopify.com.example.com/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Google Fonts from fonts.googleapis.com.example.com', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://fonts.googleapis.com.example.com/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect from a URL that just contains "wp-content" in query', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/search?q=wp-content')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect from a URL that just contains "shopify" in path', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/shopify/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('confidence and evidence merge', () => {
    it('produces one detection when multiple link tags match the same technology', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/themes/style.css'),
        makeLinkTag('https://example.com/wp-includes/js/file.js'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
      // Both signatures match → evidence merged from both
      expect(detections[0]!.evidence).toHaveLength(2);
    });

    it('selects first signature on confidence ties (wp-content before wp-includes)', () => {
      // wp-content and wp-includes both match → confidence 90, first wins
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/style.css'),
        makeLinkTag('https://example.com/wp-includes/script.js'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.confidence).toBe(90);
    });

    it('removes exact-duplicate evidence (same URL matching two signatures)', () => {
      const snapshot = makeSnapshot([
        // Single URL that matches both wp-content and wp-includes segments
        makeLinkTag('https://example.com/wp-content/wp-includes/file.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      // Both signatures match the same URL → deduplicated to 1 evidence
      expect(detections[0]!.evidence).toHaveLength(1);
    });

    it('detects multiple technologies in the same snapshot', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/style.css'),
        makeLinkTag('https://cdn.shopify.com/theme.css'),
        makeLinkTag('https://fonts.googleapis.com/css?family=Inter'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(3);

      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('wordpress');
      expect(techIds).toContain('shopify');
      expect(techIds).toContain('google-fonts');
    });

    it('detects Shopify from multiple CDN hostnames in one snapshot (merged)', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://cdn.shopify.com/s/files/1.js'),
        makeLinkTag('https://shopifycdn.com/s/files/2.js'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
      expect(detections[0]!.confidence).toBe(95);
      // Both signatures match → evidence merged from both
      expect(detections[0]!.evidence).toHaveLength(2);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when links array is empty', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('ignores link tags with href = null', () => {
      const snapshot = makeSnapshot([
        { rel: 'stylesheet', href: null, content: '<link rel="stylesheet">' },
        makeLinkTag('https://example.com/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('ignores link tags with empty href', () => {
      const snapshot = makeSnapshot([
        { rel: 'stylesheet', href: '', content: '<link rel="stylesheet" href="">' },
        makeLinkTag('https://example.com/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('ignores link tags with whitespace-only href', () => {
      const snapshot = makeSnapshot([
        { rel: 'stylesheet', href: '   ', content: '<link rel="stylesheet" href="   ">' },
        makeLinkTag('https://example.com/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles link tags with rel = null', () => {
      const snapshot = makeSnapshot([
        {
          rel: null,
          href: 'https://example.com/wp-content/style.css',
          content: '<link href="/wp-content/style.css">',
        },
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles link tags with unknown rel', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/style.css', 'prefetch'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles link tags with rel containing "stylesheet" among other tokens', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/style.css', 'stylesheet preload'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles relative URL without leading slash', () => {
      const snapshot = makeSnapshot([makeLinkTag('wp-content/themes/style.css')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles protocol-relative URL for Shopify', () => {
      const snapshot = makeSnapshot([makeLinkTag('//cdn.shopify.com/s/files/1.js')]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('shopify');
    });

    it('does not throw on malformed href', () => {
      const snapshot = makeSnapshot([
        { rel: 'stylesheet', href: 'not-a-url', content: '<link href="not-a-url">' },
        makeLinkTag('https://example.com/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('handles duplicate identical link tags', () => {
      const snapshot = makeSnapshot([
        makeLinkTag('https://example.com/wp-content/style.css'),
        makeLinkTag('https://example.com/wp-content/style.css'),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      // Both links are identical → deduplicated to 1 evidence
      expect(detections[0]!.evidence).toHaveLength(1);
    });

    it('never throws on empty link list', () => {
      const snapshot = makeSnapshot([]);
      expect(() => detector.detect(snapshot)).not.toThrow();
    });

    it('never throws on link tags with invalid URLs', () => {
      const snapshot = makeSnapshot([
        { rel: 'stylesheet', href: '%%invalid%%', content: '<link>' },
        { rel: 'icon', href: 'http://[::1]:namedPort/', content: '<link>' },
      ]);

      expect(() => detector.detect(snapshot)).not.toThrow();
      expect(detector.detect(snapshot)).toEqual([]);
    });

    it('does not detect WordPress from href containing "wp" alone', () => {
      const snapshot = makeSnapshot([makeLinkTag('https://example.com/wp/')]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });
});
