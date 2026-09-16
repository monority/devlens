import { describe, it, expect } from 'vitest';
import { ResourceDetector } from './resource-detector.js';
import type { SiteSnapshot, Resource } from '@devlens/core';
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
    type: 'css',
    size: 0,
    content: '',
    httpStatus: createHttpStatus(200),
    contentType: null,
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('ResourceDetector', () => {
  const detector = new ResourceDetector();

  describe('robots.txt detection', () => {
    it('detects WordPress from wp-admin in robots.txt', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'User-agent: *\nDisallow: /wp-admin/\nDisallow: /wp-includes\n',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.technology.name).toBe('WordPress');
      expect(detections[0]!.technology.category).toBe('cms');
      expect(detections[0]!.confidence).toBe(90);
      expect(detections[0]!.evidence[0]!.type).toBe('resource');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/robots.txt',
      });
    });

    it('detects WordPress from wp-includes in robots.txt', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'User-agent: *\nDisallow: /wp-includes\n',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('does not detect when robots.txt has no WordPress patterns', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'User-agent: *\nDisallow: /admin/\nAllow: /public\n',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not match wp-admin pattern in CSS resource type', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '.wp-admin-panel { color: red; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('manifest.json detection', () => {
    it('detects Firebase from gcm_sender_id in manifest', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/manifest.json'),
          type: 'manifest',
          content: JSON.stringify({
            name: 'My Firebase App',
            gcm_sender_id: '1234567890',
            start_url: '/',
          }),
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('firebase');
      expect(detections[0]!.technology.name).toBe('Firebase');
      expect(detections[0]!.technology.category).toBe('service_worker');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!.type).toBe('resource');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/manifest.json',
      });
    });

    it('does not detect when manifest has no gcm_sender_id', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/manifest.json'),
          type: 'manifest',
          content: JSON.stringify({
            name: 'My PWA',
            short_name: 'PWA',
            start_url: '/',
          }),
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does not match gcm_sender_id pattern in CSS resource type', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '/* gcm_sender_id is not in CSS */',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  describe('CSS detection', () => {
    it('detects WordPress from --wp--preset-- in CSS', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/style.css'),
          type: 'css',
          content:
            'body { margin: 0; }\n' +
            '.wp-block-group { display: block; }\n' +
            ':root { --wp--preset--color--black: #000; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      // WordPress detected from the --wp--preset-- signature (confidence 95)
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(95);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/style.css',
      });
    });

    it('detects WordPress from wp-block- in CSS', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/style.css'),
          type: 'css',
          content: '.wp-block-gallery { display: grid; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
    });

    it('detects multiple technologies from different resource types', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'Disallow: /wp-admin/',
        }),
        makeResource({
          url: createUrl('https://example.com/manifest.json'),
          type: 'manifest',
          content: JSON.stringify({ gcm_sender_id: '12345' }),
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(2);
      const techIds = detections.map((d) => d.technology.id);
      expect(techIds).toContain('wordpress');
      expect(techIds).toContain('firebase');
    });
  });

  describe('confidence and evidence merge', () => {
    it('preserves the best confidence when multiple signatures match the same technology', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'Disallow: /wp-admin/',
        }),
        makeResource({
          url: createUrl('https://example.com/style.css'),
          type: 'css',
          content: '--wp--preset--color--black: #000;',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      // Best confidence: CSS --wp--preset-- (95) > robots wp-admin (90)
      expect(detections[0]!.confidence).toBe(95);
      // Evidence merged from both matching signatures
      expect(detections[0]!.evidence).toHaveLength(2);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/robots.txt',
      });
      expect(detections[0]!.evidence[1]!).toMatchObject({
        url: 'https://example.com/style.css',
      });
    });

    it('merges evidence from wp-admin and wp-includes in the same robots.txt', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'Disallow: /wp-admin/\nDisallow: /wp-includes',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
      // Both signatures match the same resource URL → deduplicated to 1 evidence
      expect(detections[0]!.evidence).toHaveLength(1);
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/robots.txt',
      });
    });

    it('selects first signature on confidence ties', () => {
      // wp-admin (90) and wp-includes (90) both match → first wins
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'Disallow: /wp-admin/\nDisallow: /wp-includes',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.confidence).toBe(90);
    });
  });

  describe('false positives (CSS-specific)', () => {
    it('does NOT detect WordPress from CSS containing "WordPress" as a word', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '/* This site is not WordPress */\nbody { color: red; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from CSS containing "wp" alone', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '.wp { display: none; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from "wpblock" (missing hyphen)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '.wpblock-class { margin: 0; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from "wp-content" path in CSS url()', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: 'background: url("/wp-content/themes/style.jpg");',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect from robots.txt content appearing in a CSS comment', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '/* Disallow: /wp-admin */\n.wp-content { color: red; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect WordPress from CSS containing "wp-admin" as a class', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '.wp-admin-panel { display: none; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('does NOT detect Firebase from manifest containing "gcm" without "gcm_sender_id"', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/manifest.json'),
          type: 'manifest',
          content: JSON.stringify({ name: 'gcm-project', start_url: '/' }),
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });
  });

  // ─── Step 11: Tailwind CSS ──────────────────────────────────────

  describe('Tailwind CSS detection', () => {
    it('detects Tailwind CSS from @tailwind directive in CSS', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/tailwind.css'),
          type: 'css',
          content: '@tailwind base;\n@tailwind components;\n@tailwind utilities;',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('tailwind');
      expect(detections[0]!.technology.name).toBe('Tailwind CSS');
      expect(detections[0]!.technology.category).toBe('library');
      expect(detections[0]!.confidence).toBe(85);
      expect(detections[0]!.evidence[0]!.type).toBe('resource');
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/tailwind.css',
      });
    });

    it('does not trigger on CSS containing "tailwind" as a word without @ prefix', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '/* tailwindcss.com */\nbody { margin: 0; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('detects when @tailwind appears in a comment (fingerprint is substring-based)', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/app.css'),
          type: 'css',
          content: '/* @tailwind */\n.custom { color: red; }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('tailwind');
    });
  });

  describe('deduplication', () => {
    it('produces one detection when multiple CSS files match the same signature', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/a.css'),
          type: 'css',
          content: '.wp-block-gallery { }',
        }),
        makeResource({
          url: createUrl('https://example.com/b.css'),
          type: 'css',
          content: '.wp-block-cover { }',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
      expect(detections[0]!.confidence).toBe(90);
      // First matching resource supplies the evidence (find() returns first)
      expect(detections[0]!.evidence[0]!).toMatchObject({
        url: 'https://example.com/a.css',
      });
    });
  });

  describe('edge cases', () => {
    it('returns empty array for no resources', () => {
      const snapshot = makeSnapshot([]);
      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('returns empty array for empty resource content', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: '',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toEqual([]);
    });

    it('detects even when contentType is null', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'Disallow: /wp-admin/',
          contentType: null,
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('is case-insensitive when matching content', () => {
      const snapshot = makeSnapshot([
        makeResource({
          url: createUrl('https://example.com/robots.txt'),
          type: 'robots',
          content: 'DISALLOW: /WP-ADMIN/',
        }),
      ]);

      const detections = detector.detect(snapshot);
      expect(detections).toHaveLength(1);
      expect(detections[0]!.technology.id).toBe('wordpress');
    });

    it('never throws on malformed/empty snapshot', () => {
      const snapshot = makeSnapshot([]);
      expect(() => detector.detect(snapshot)).not.toThrow();
    });
  });
});
