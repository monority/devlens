import { describe, it, expect } from 'vitest';
import { MetaTagDetector } from './meta-tag-detector.js';
import type { SiteSnapshot } from '@devlens/core';
import {
  createUrl,
  createHostname,
  createTimestampFromString,
  createHttpStatus,
} from '@devlens/core';

// ─── Test helpers ───────────────────────────────────────────────────

function makeSnapshot(metaTags: Array<{ name: string; content: string }> = []): SiteSnapshot {
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
      metaTags,
      scripts: [],
      links: [],
    },
    resources: [],
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('MetaTagDetector', () => {
  const detector = new MetaTagDetector();

  describe('generator meta tag signatures', () => {
    it('detects WordPress from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress 6.4.2' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.technology.name).toBe('WordPress');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!.type).toBe('meta_tag');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'WordPress 6.4.2',
      });
    });

    it('detects Hugo from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Hugo 0.121.1' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('hugo');
      expect(detections[0]!.technology.name).toBe('Hugo');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Hugo 0.121.1',
      });
    });

    it('detects Jekyll from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Jekyll 4.3.1' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('jekyll');
      expect(detections[0]!.technology.name).toBe('Jekyll');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Jekyll 4.3.1',
      });
    });

    it('detects Ghost from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Ghost 5.0' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('ghost');
      expect(detections[0]!.technology.name).toBe('Ghost');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Ghost 5.0',
      });
    });

    it('detects Next.js from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Next.js' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nextjs');
      expect(detections[0]!.technology.name).toBe('Next.js');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Next.js',
      });
    });

    it('detects Gatsby from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Gatsby' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('gatsby');
      expect(detections[0]!.technology.name).toBe('Gatsby');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Gatsby',
      });
    });

    it('detects Nuxt.js from generator meta tag', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Nuxt.js' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('nuxtjs');
      expect(detections[0]!.technology.name).toBe('Nuxt.js');
      expect(detections[0]!.technology.category).toBe('framework');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        name: 'generator',
        content: 'Nuxt.js',
      });
    });
  });

  describe('case-insensitive meta tag name matching', () => {
    it('matches "generator" (lowercase) meta tag name', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress 6.4' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('matches "GENERATOR" (uppercase) meta tag name', () => {
      const snapshot = makeSnapshot([{ name: 'GENERATOR', content: 'WordPress 6.4' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('matches "Generator" (capitalized) meta tag name', () => {
      const snapshot = makeSnapshot([{ name: 'Generator', content: 'WordPress 6.4' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });
  });

  describe('case-insensitive content matching', () => {
    it('detects WordPress from lowercase "wordpress" in content', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'wordpress 6.4' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });

    it('detects Hugo from mixed-case "Hugo" in content', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'HUGO 0.121' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('hugo');
    });

    it('detects Next.js from "next.js" with exact casing', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Next.js' }]);
      expect(detector.detect(snapshot)).toHaveLength(1);
    });
  });

  describe('multiple meta tags producing multiple detections', () => {
    it('detects multiple technologies from separate meta tags', () => {
      // Each meta tag has a different name — only "generator" triggers
      // detections, but we verify the detector correctly iterates.
      const snapshot = makeSnapshot([
        { name: 'description', content: 'My blog' },
        { name: 'generator', content: 'WordPress 6.4' },
        { name: 'viewport', content: 'width=device-width' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('detects WordPress and Next.js from multiple generator meta tags', () => {
      const snapshot = makeSnapshot([
        { name: 'generator', content: 'WordPress 6.4' },
        { name: 'generator', content: 'Next.js' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(2);
      expect(detections.map((d) => d.technology.id).sort()).toEqual(['nextjs', 'wordpress']);
    });
  });

  describe('deduplication', () => {
    it('does not produce duplicate detections for the same technology', () => {
      const snapshot = makeSnapshot([
        { name: 'generator', content: 'WordPress 6.4' },
        { name: 'generator', content: 'WordPress 5.9' },
      ]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      const wordpressDetections = detections.filter((d) => d.technology.id === 'wordpress');
      expect(wordpressDetections).toHaveLength(1);
    });
  });

  describe('no matches', () => {
    it('returns empty array when meta tags are missing', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array for unrelated meta tags', () => {
      const snapshot = makeSnapshot([
        { name: 'description', content: 'A blog about cats' },
        { name: 'viewport', content: 'width=device-width' },
        { name: 'theme-color', content: '#ffffff' },
      ]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array when generator meta tag has unknown content', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'SomeUnknownCMS/1.0' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not match non-generator meta tags containing "WordPress"', () => {
      // "WordPress" appearing in a different meta tag should not trigger detection
      const snapshot = makeSnapshot([{ name: 'description', content: 'Built with WordPress' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('edge cases', () => {
    it('handles empty meta tag content gracefully', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: '' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('handles meta tag content with whitespace only', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: '   ' }]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('Domain contract conformance', () => {
    it('produces Detection objects that conform to @devlens/core contracts', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress 6.4' }]);
      const detections = detector.detect(snapshot);

      expect(detections).toHaveLength(1);
      const d = detections[0]!;

      // Technology has required fields
      expect(d.technology.id).toBe('wordpress');
      expect(d.technology.name).toBe('WordPress');
      expect(d.technology.category).toBe('cms');

      // Confidence is in [0, 100]
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(100);

      // Evidence is a non-empty array with type discriminant
      expect(d.evidence).toHaveLength(1);
      expect(d.evidence[0]!.type).toBe('meta_tag');

      // Evidence has name and content
      const evidence = d.evidence[0]!;
      if (evidence.type === 'meta_tag') {
        expect(evidence.name).toBe('generator');
        expect(evidence.content).toBe('WordPress 6.4');
      }
    });
  });

  describe('version extraction', () => {
    it('extracts the WordPress version from the generator meta content', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress 6.4.2' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('6.4.2');
    });

    it('extracts a short WordPress version', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress 6.4' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBe('6.4');
    });

    it('does not extract a version for Hugo (no version rule)', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Hugo 0.121.1' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });

    it('does not extract a version for Next.js when the generator has no version', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'Next.js' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.version).toBeNull();
    });

    it('yields null version when generator content has no version number', () => {
      const snapshot = makeSnapshot([{ name: 'generator', content: 'WordPress' }]);
      const d = detector.detect(snapshot)[0]!;
      expect(d.technology.id).toBe('wordpress');
      expect(d.version).toBeNull();
    });
  });
});
